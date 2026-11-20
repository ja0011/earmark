/**
 * Creates (or updates, if ELEVENLABS_AGENT_ID is set) the "Earmark reminder" ElevenLabs agent and its two tools,
 * then writes ELEVENLABS_AGENT_ID into earmark-app/.env and the repo root .env.
 *   npm run elevenlabs:agent
 */
import { resolve } from 'node:path';
import { setEnv, xi } from './env-file';

const APP_ENV = resolve(import.meta.dirname, '../../.env');
const ROOT_ENV = resolve(import.meta.dirname, '../../../.env');
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // same voice as the recorded sample on the landing page
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');

export const FIRST_MESSAGE = 'Hey {{receiver_name}}, your {{amount}} {{item}} gift expires in {{days_left}}. Want me to buy it for you?';

export const PROMPT = `You are Earmark, calling {{receiver_name}} about a locked gift: {{amount}} that can only buy a {{item}}, gift number {{gift_id}}. It expires in {{days_left}}; unused, it goes back to the sender.
Always speak {{language_name}}, the language they chose in Earmark. If they answer in another language, switch to theirs.
Ask if they want you to buy the {{item}} now.
If they say yes: request the purchase with gift_id "{{gift_id}}". This call's channel is "{{channel}}": if it is "phone", use request_purchase; if it is "browser", use request_purchase_in_app. Use exactly one tool, once.
After the tool returns, tell them to approve it in the Earmark app with their passkey. Never say the purchase is done or paid; it only happens after they approve.
If they say no or later, say it's still there until it expires, and say goodbye.
You cannot change the item, store, amount or person. Never ask for card numbers, passwords or codes. Keep every reply to one or two short sentences.`;

const giftIdParam = {
  type: 'object',
  description: 'The gift to buy.',
  properties: { gift_id: { type: 'string', description: 'The gift number. Always the value of {{gift_id}}.' } },
  required: ['gift_id'],
};

const headers: Record<string, string> = {};
if (process.env.ELEVENLABS_TOOL_SECRET) headers['x-earmark-tool-secret'] = process.env.ELEVENLABS_TOOL_SECRET;

const TOOLS = [
  {
    type: 'webhook',
    name: 'request_purchase',
    description: 'Phone calls only. Ask Earmark to buy the gift item. Call only after the person clearly says yes.',
    api_schema: {
      url: `${PUBLIC_API_URL || 'https://earmark.invalid'}/api/agent/purchase-request`,
      method: 'POST',
      request_headers: headers,
      request_body_schema: giftIdParam,
    },
  },
  {
    type: 'client',
    name: 'request_purchase_in_app',
    description: 'Browser calls only. Ask Earmark to buy the gift item. Call only after the person clearly says yes.',
    expects_response: true,
    parameters: giftIdParam,
  },
];

async function upsertTool(cfg: (typeof TOOLS)[number], existing: { id: string; name: string }[]): Promise<string> {
  const found = existing.find((t) => t.name === cfg.name);
  if (found) {
    await xi(`/v1/convai/tools/${found.id}`, { method: 'PATCH', body: JSON.stringify({ tool_config: cfg }) });
    console.log(`tool ${cfg.name}: updated`);
    return found.id;
  }
  const r = await xi<{ id: string }>('/v1/convai/tools', { method: 'POST', body: JSON.stringify({ tool_config: cfg }) });
  console.log(`tool ${cfg.name}: created`);
  return r.id;
}

async function listTools(): Promise<{ id: string; name: string }[]> {
  try {
    const r = await xi<{ tools?: { id: string; tool_config?: { name?: string } }[] }>('/v1/convai/tools');
    return (r.tools ?? []).map((t) => ({ id: t.id, name: t.tool_config?.name ?? '' }));
  } catch (e) {
    console.warn('could not list tools, creating new ones:', (e as Error).message);
    return [];
  }
}

async function main() {
  if (!PUBLIC_API_URL) console.warn('PUBLIC_API_URL is empty: the phone tool points at a placeholder. Set it to your public tunnel URL and run this again.');
  const existing = await listTools();
  const toolIds = [];
  for (const t of TOOLS) toolIds.push(await upsertTool(t, existing));

  const body = {
    name: 'Earmark reminder',
    tags: ['earmark'],
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: 'en',
        dynamic_variables: {
          dynamic_variable_placeholders: {
            receiver_name: 'Alex',
            amount: '$45',
            item: 'shovel',
            days_left: 'four days',
            gift_id: '1',
            channel: 'browser',
            language_name: 'English',
          },
        },
        prompt: { prompt: PROMPT, tool_ids: toolIds },
      },
      // The model stays the account default (multilingual); the receiver's language is set per call via overrides.
      tts: { voice_id: VOICE_ID },
      conversation: { max_duration_seconds: 120 },
      // The languages a receiver can pick in Earmark (server/i18n.ts). Each call sets its language + first message via overrides.
      language_presets: Object.fromEntries(['es'].map((code) => [code, { overrides: { agent: { language: code } } }])),
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { first_message: true, language: true, prompt: { prompt: true } },
          tts: { voice_id: true },
        },
      },
    },
  };

  let agentId = process.env.ELEVENLABS_AGENT_ID?.trim();
  if (agentId) {
    await xi(`/v1/convai/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify(body) });
    console.log('agent: updated');
  } else {
    const r = await xi<{ agent_id: string }>('/v1/convai/agents/create', { method: 'POST', body: JSON.stringify(body) });
    agentId = r.agent_id;
    console.log('agent: created');
  }
  setEnv(APP_ENV, 'ELEVENLABS_AGENT_ID', agentId);
  setEnv(ROOT_ENV, 'ELEVENLABS_AGENT_ID', agentId);
  console.log(`ELEVENLABS_AGENT_ID written to earmark-app/.env and the root .env (${agentId})`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
