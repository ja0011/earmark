/**
 * Imports the Twilio number into ElevenLabs and writes ELEVENLABS_PHONE_NUMBER_ID into earmark-app/.env and the root .env.
 * Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (E.164). Assigns it to ELEVENLABS_AGENT_ID if set.
 *   npm run elevenlabs:import-twilio
 */
import { resolve } from 'node:path';
import { setEnv, xi } from './env-file';

const APP_ENV = resolve(import.meta.dirname, '../../.env');
const ROOT_ENV = resolve(import.meta.dirname, '../../../.env');

async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const phone = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!sid || !token || !phone) throw new Error('Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in .env first.');
  if (process.env.ELEVENLABS_PHONE_NUMBER_ID?.trim()) {
    console.log('ELEVENLABS_PHONE_NUMBER_ID is already set; nothing to import.');
    return;
  }
  const r = await xi<{ phone_number_id: string }>('/v1/convai/phone-numbers', {
    method: 'POST',
    body: JSON.stringify({ provider: 'twilio', label: 'Earmark reminders', phone_number: phone, sid, token }),
  });
  const id = r.phone_number_id;
  const agent = process.env.ELEVENLABS_AGENT_ID?.trim();
  if (agent) {
    await xi(`/v1/convai/phone-numbers/${id}`, { method: 'PATCH', body: JSON.stringify({ agent_id: agent }) }).catch((e) =>
      console.warn('imported, but could not assign the agent to the number (outbound calls pass agent_id anyway):', (e as Error).message),
    );
  }
  setEnv(APP_ENV, 'ELEVENLABS_PHONE_NUMBER_ID', id);
  setEnv(ROOT_ENV, 'ELEVENLABS_PHONE_NUMBER_ID', id);
  console.log(`ELEVENLABS_PHONE_NUMBER_ID written to earmark-app/.env and the root .env (${id}). Restart the server.`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
