// Languages the receiver can pick, and Claude-backed translation of the few dynamic strings
// (reminder lines, sender notes, voice replies). UI strings are hand-written in src/i18n.
import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODEL, ANTHROPIC_API_KEY } from './config';
import type { Address } from 'viem';
import { db, save, type Notification } from './db';
import { contactByAddress } from './directory';
import { notify } from './sse';

export const LANGS = {
  en: { name: 'English', native: 'English' },
  es: { name: 'Spanish', native: 'Español' },
} as const;
export type Lang = keyof typeof LANGS;

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in LANGS;
export const asLang = (v: unknown): Lang => (isLang(v) ? v : 'en');

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 }) : null;

const SYSTEM = `You translate short messages for Earmark, an app where someone locks money for one item at one store for a family member.
Translate each input string into the target language so it sounds natural when read aloud to a family member.
Keep names, dollar amounts and numbers exactly as written. Keep the tone warm and plain. Do not add anything.
Some inputs are pieces of a web page (headings, buttons, labels, sentence fragments): translate them as UI text, keep them about as short,
keep ALL CAPS as all caps, and keep leading or trailing spaces and punctuation. Never translate the names Earmark, Hartwell Supply, Arc, USDC,
MetaMask, ElevenLabs, QuickNode, Maya or Alex.
Return one translation per input, in the same order.`;

/** Translates texts into `to`. Cached; returns the originals when Claude is off or the call fails. */
export async function translate(texts: string[], to: Lang, from: Lang | 'auto' = 'en'): Promise<string[]> {
  if (!texts.length || to === from) return texts;
  const key = (t: string) => `${from}>${to}:${t}`;
  const all = [...new Set(texts.filter((t) => t.trim() && !db.translations[key(t)]))];
  // Small batches: long pages in scripts like Devanagari use many tokens per word.
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += 25) batches.push(all.slice(i, i + 25));
  if (client) await Promise.all(batches.map((b) => translateBatch(b, to, from, key)));
  return texts.map((t) => db.translations[key(t)] ?? t);
}

async function translateBatch(missing: string[], to: Lang, from: Lang | 'auto', key: (t: string) => string) {
  {
    try {
      const response = await client!.beta.messages.create({
        model: AGENT_MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Source language: ${from === 'auto' ? 'detect it' : LANGS[from].name}\nTarget language: ${LANGS[to].name}\nInputs (JSON): ${JSON.stringify(missing)}`,
          },
        ],
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: { translations: { type: 'array', items: { type: 'string' } } },
              required: ['translations'],
              additionalProperties: false,
            },
          },
        },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (response.stop_reason !== 'refusal') {
        const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? '';
        const out = (JSON.parse(text) as { translations: string[] }).translations;
        if (!Array.isArray(out) || out.length !== missing.length) console.warn(`[i18n] ${to}: got ${out?.length} translations for ${missing.length} inputs (stop: ${response.stop_reason})`);
        else {
          missing.forEach((m, i) => typeof out[i] === 'string' && out[i].trim() && (db.translations[key(m)] = out[i].trim()));
          save();
        }
      }
    } catch (e) {
      console.warn('[i18n] translation failed, using the original:', (e as Error).message);
    }
  }
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "1 day", "four days", "12 days" */
export function daysPhrase(n: number) {
  if (n === 1) return 'one day';
  return `${n <= 10 ? NUMBER_WORDS[n] : n} days`;
}

/** The reminder line in English (the source for every other language). */
export function reminderEnglish(v: { name: string; amount: string; item: string; days: number }) {
  if (v.days <= 0) return `Hey ${v.name}, your ${v.amount} ${v.item} gift expires today. Want me to buy it for you?`;
  return `Hey ${v.name}, your ${v.amount} ${v.item} gift expires in ${daysPhrase(v.days)}. Want me to buy it for you?`;
}

/** The person's chosen language (English if unset). */
export const languageOf = (address?: string): Lang => asLang(contactByAddress(address)?.language);

/** notify(), in the person's own language. */
export async function notifyLocal(address: Address, english: string, extra: Partial<Notification> = {}) {
  const lang = languageOf(address);
  const [text] = lang === 'en' ? [english] : await translate([english], lang);
  return notify(address, text, extra);
}
