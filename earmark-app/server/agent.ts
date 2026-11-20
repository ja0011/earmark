// The send agent: turns "Send Alex $45 for a snow shovel at Hartwell Supply." into a gift the sender reviews.
// Claude (tool use) when ANTHROPIC_API_KEY is set; a deterministic parser otherwise, so the demo never breaks.
import Anthropic from '@anthropic-ai/sdk';
import { encodeAbiParameters, keccak256, zeroAddress, type Address, type Hex } from 'viem';
import { parseUsdc, formatUsdc } from 'earmark-plugin';
import { AGENT_MODEL, ANTHROPIC_API_KEY } from './config';
import { nextGiftId } from './chain';
import { catalogFor, contactByName, publicContact, storeByName, type CatalogItem } from './directory';
import { db } from './db';

export class AgentError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Draft = { receiverName: string; storeName: string; itemQuery: string; amountUsd: string };

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 }) : null;

const SYSTEM = `You are the Earmark send agent. Earmark locks money so it can only be spent on one item, at one store, by one person.
The user describes a gift in plain words. Use the tools to find the receiver in the user's contacts, the store, and the exact catalogue item.
Then call propose_gift exactly once with what you found. Use the receiver and store names as the tools returned them and the item's sku.
amount_usd is the amount the user wants to send, as a decimal string like "45.00". If the user gives no amount, use the item's price.
Never invent contacts, stores or items. If something cannot be found, call propose_gift anyway with your best match and say what is missing in "problem".`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'lookup_contact',
    description: "Find a person in the sender's contacts by first name. Returns their name and wallet address, or not_found.",
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'First name, e.g. "Alex"' } }, required: ['name'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'lookup_store',
    description: 'Find a store that accepts Earmark gifts by name. Returns the store name, address and website, or not_found.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Store name, e.g. "Hartwell Supply"' } }, required: ['name'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'lookup_item',
    description: "Search a store's Earmark catalogue (its /earmark/catalog). Returns matching items with sku, name, item id and price in USD.",
    input_schema: {
      type: 'object',
      properties: { store: { type: 'string', description: 'Store name as returned by lookup_store' }, query: { type: 'string', description: 'What to buy, e.g. "snow shovel"' } },
      required: ['store', 'query'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'propose_gift',
    description: 'Submit the gift for the sender to review. Call this once, last.',
    input_schema: {
      type: 'object',
      properties: {
        receiver_name: { type: 'string' },
        store_name: { type: 'string' },
        sku: { type: 'string' },
        amount_usd: { type: 'string' },
        problem: { type: 'string', description: 'Empty if everything was found' },
      },
      required: ['receiver_name', 'store_name', 'sku', 'amount_usd', 'problem'],
      additionalProperties: false,
    },
    strict: true,
  },
];

function matchItems(items: CatalogItem[], query: string): CatalogItem[] {
  const words = query.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'for', 'and', 'some', 'new'].includes(w));
  const scored = items
    .map((i) => {
      const hay = `${i.name} ${i.sku}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) || hay.includes(w.replace(/s$/, '')) ? 1 : 0), 0);
      return { i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.i);
}

async function runTool(name: string, input: Record<string, string>): Promise<string> {
  if (name === 'lookup_contact') {
    const c = contactByName(input.name ?? '');
    return JSON.stringify(c ? publicContact(c) : { not_found: true, known: [...new Set(db.contacts.map((x) => x.name))] });
  }
  if (name === 'lookup_store') {
    const s = await storeByName(input.name ?? '');
    return JSON.stringify(s ? { name: s.name, address: s.store, website: s.website } : { not_found: true, known: db.stores.map((x) => x.name) });
  }
  if (name === 'lookup_item') {
    const s = await storeByName(input.store ?? '');
    if (!s) return JSON.stringify({ not_found: true, reason: 'store not found' });
    const items = await catalogFor(s);
    const hits = matchItems(items, input.query ?? '');
    return JSON.stringify({ items: (hits.length ? hits : items).slice(0, 6).map((i) => ({ sku: i.sku, name: i.name, itemId: i.itemId, priceUsd: i.priceUsd })) });
  }
  return JSON.stringify({ error: 'unknown tool' });
}

async function draftWithClaude(text: string): Promise<Draft> {
  if (!client) throw new Error('no client');
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: text }];
  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages.create({
      model: AGENT_MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      tools: TOOLS,
      messages,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') throw new Error('refused');
    messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
    if (response.stop_reason === 'pause_turn') continue;
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    const proposal = uses.find((u) => u.name === 'propose_gift');
    if (proposal) {
      const p = proposal.input as Record<string, string>;
      return { receiverName: p.receiver_name, storeName: p.store_name, itemQuery: p.sku, amountUsd: p.amount_usd };
    }
    if (!uses.length) break;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      try {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: await runTool(u.name, u.input as Record<string, string>) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: (e as Error).message, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('agent did not propose a gift');
}

/** Deterministic fallback: "Send Alex $45 for a snow shovel at Hartwell Supply." */
export function draftWithRules(text: string, knownNames: string[] = []): Draft {
  const t = text.replace(/\s+/g, ' ').trim();
  const known = knownNames.find((n) => new RegExp(`\\b${n.replace(/[^a-z]/gi, '')}\\b`, 'i').test(t));
  const amount = t.match(/\$\s?(\d+(?:\.\d{1,2})?)/)?.[1] ?? t.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars|usd|usdc)/i)?.[1] ?? '';
  const receiver =
    known ??
    t.match(/\b(?:send|give|gift)\s+([A-Z][a-z]+)/i)?.[1] ??
    t.match(/\bfor\s+([A-Z][a-z]+)\b(?!\s+shovel)/)?.[1] ??
    t.match(/\bto\s+([A-Z][a-z]+)/)?.[1] ??
    '';
  const store = t.match(/\b(?:at|from)\s+([A-Za-z][\w'&\s-]+?)(?:[.!?,]|$)/i)?.[1]?.trim() ?? '';
  const item =
    t.match(/\bfor\s+(?:(?:a|an|the|some)\s+)?([a-z][a-z\s-]+?)\s+(?:at|from)\b/i)?.[1]?.trim() ??
    t.match(/\b(?:buy|get)\s+(?:(?:a|an|the|some)\s+)?([a-z][a-z\s-]+?)(?:\s+(?:at|from)\b|[.!?,]|$)/i)?.[1]?.trim() ??
    '';
  return { receiverName: receiver, storeName: store || 'Hartwell Supply', itemQuery: item, amountUsd: amount };
}

export function fingerprintOf(sender: Address, receiver: Address, store: Address, itemId: Hex, amount: bigint, expiry: bigint, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'uint256' }],
      [sender, receiver, store, itemId, amount, expiry, nonce],
    ),
  );
}

const names = () => [...new Set(db.contacts.map((c) => c.name))];

export async function parseGift(text: string, sender?: Address) {
  if (!text?.trim()) throw new AgentError(400, 'EMPTY', "Tell me who it's for and what it should buy.");
  let draft: Draft;
  let source: 'claude' | 'rules' = 'rules';
  if (client) {
    try {
      draft = await draftWithClaude(text.slice(0, 600));
      source = 'claude';
    } catch (e) {
      console.warn('[agent] Claude unavailable, using the rules parser:', (e as Error).message);
      draft = draftWithRules(text, names());
    }
  } else {
    draft = draftWithRules(text, names());
  }

  // Everything below is resolved from Earmark's own records. The model only picks names.
  const contact = contactByName(draft.receiverName);
  if (!contact) {
    throw new AgentError(422, 'NO_CONTACT', draft.receiverName ? `I can't find ${draft.receiverName} in your contacts yet. Ask them to open Earmark and sign in once.` : "Who's it for? Try a name, like Alex.");
  }
  const store = await storeByName(draft.storeName);
  if (!store) throw new AgentError(422, 'NO_STORE', `${draft.storeName} doesn't take Earmark gifts yet.`);
  const items = await catalogFor(store).catch(() => {
    throw new AgentError(502, 'CATALOG_DOWN', `I can't reach ${store.name}'s catalogue right now.`);
  });
  const item = items.find((i) => i.sku === draft.itemQuery) ?? matchItems(items, draft.itemQuery)[0] ?? matchItems(items, text)[0];
  if (!item) throw new AgentError(422, 'NO_ITEM', `${store.name} doesn't list ${draft.itemQuery || 'that'} for Earmark.`);

  const price = BigInt(item.price);
  let amount: bigint;
  try {
    amount = draft.amountUsd ? parseUsdc(draft.amountUsd) : price;
  } catch {
    amount = price;
  }
  if (amount < price) throw new AgentError(422, 'TOO_LOW', `${formatUsdc(amount)} doesn't cover the ${item.name.toLowerCase()} (${formatUsdc(price)}).`);
  if (amount > 1_000_000_000n) throw new AgentError(422, 'TOO_HIGH', 'Keep testnet gifts under $1,000.');

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
  const nonce = await nextGiftId().catch(() => 0n);
  const fingerprintPreview = fingerprintOf(sender ?? zeroAddress, contact.address, store.store, item.itemId, amount, expiry, nonce);

  return {
    receiver: { name: contact.name, address: contact.address },
    store: { name: store.name, address: store.store, website: store.website },
    item: { sku: item.sku, itemId: item.itemId, name: item.name, price: item.price, priceUsd: item.priceUsd, image: item.image ?? item.sku },
    amount: amount.toString(),
    expiry: Number(expiry),
    fingerprintPreview,
    nonce: nonce.toString(),
    source,
  };
}
