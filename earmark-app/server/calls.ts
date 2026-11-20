// The reminder call: ElevenLabs Agents over a Twilio number imported into ElevenLabs.
import { getAddress } from 'viem';
import { AGENT_ENABLED, CALLS_ENABLED, DEMO_RECEIVER_PHONE, ELEVENLABS_AGENT_ID, ELEVENLABS_API_KEY, ELEVENLABS_PHONE_NUMBER_ID, tryDeployment } from './config';
import { db, save, uid, type PurchaseRequest } from './db';
import { allGifts, readGift, type ChainGift } from './chain';
import { contactByAddress, itemFor, shortItem, usdShort } from './directory';
import { broadcastTo } from './sse';
import { LANGS, daysPhrase, languageOf, notifyLocal, reminderEnglish, translate, type Lang } from './i18n';
import { speak, VOICES } from './voice';

export const daysLeft = (expiry: bigint | number) => Math.max(0, Math.ceil((Number(expiry) * 1000 - Date.now()) / 86_400_000));

/** The reminder line for this gift, in English, plus the receiver's language. */
async function reminderParts(gift: ChainGift) {
  const receiver = contactByAddress(gift.receiver);
  const item = await itemFor(gift.store, gift.itemId);
  const v = { name: (receiver?.name ?? 'there').replace(/\s*\(.*\)$/, ''), amount: usdShort(gift.amount), item: shortItem(item?.name ?? 'gift'), days: daysLeft(gift.expiry) };
  return { v, itemName: (item?.name ?? 'gift').toLowerCase(), english: reminderEnglish(v) };
}

/** The reminder line in `lang` (translated by Claude, cached; English if translation is off). */
export async function reminderLine(gift: ChainGift, lang: Lang) {
  const { english } = await reminderParts(gift);
  const [line] = lang === 'en' ? [english] : await translate([english], lang);
  return line;
}

/** The recorded reminder: the same voice as the landing-page sample, speaking the receiver's language. */
export async function reminderAudio(gift: ChainGift, lang: Lang) {
  return speak(await reminderLine(gift, lang), { lang, speaker: 'Earmark', voice: VOICES.earmark });
}

/** The agent's dynamic variables for this gift. */
export async function callVariables(gift: ChainGift, channel: 'phone' | 'browser') {
  const { v, itemName } = await reminderParts(gift);
  const lang = languageOf(gift.receiver);
  return {
    receiver_name: v.name,
    amount: v.amount,
    item: itemName,
    days_left: v.days <= 0 ? 'less than a day' : daysPhrase(v.days),
    gift_id: gift.id.toString(),
    channel,
    language_name: LANGS[lang].name,
  };
}

/** Per-call agent overrides: speak the receiver's language from the first word. */
export async function callOverrides(gift: ChainGift) {
  const lang = languageOf(gift.receiver);
  if (lang === 'en') return undefined;
  return { agent: { language: lang, firstMessage: await reminderLine(gift, lang) } };
}

/** Browser call: a short-lived conversation token (WebRTC) or signed URL (WebSocket). The API key stays here. */
export async function browserSession(gift: ChainGift) {
  if (!AGENT_ENABLED) return null;
  const dynamicVariables = await callVariables(gift, 'browser');
  const overrides = await callOverrides(gift);
  const headers = { 'xi-api-key': ELEVENLABS_API_KEY };
  const q = `agent_id=${encodeURIComponent(ELEVENLABS_AGENT_ID)}`;
  const t = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?${q}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (t.ok) {
    const j = (await t.json()) as { token: string };
    return { conversationToken: j.token, dynamicVariables, overrides };
  }
  const s = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${q}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!s.ok) {
    console.warn('[calls] could not start a browser session', t.status, s.status);
    throw Object.assign(new Error('The call could not start. Try again in a minute.'), { status: 502 });
  }
  const j = (await s.json()) as { signed_url: string };
  return { signedUrl: j.signed_url, dynamicVariables, overrides };
}

export async function placeCall(gift: ChainGift, reason: 'now' | '7d' | '4d') {
  const receiver = contactByAddress(gift.receiver);
  const to = receiver?.phone || DEMO_RECEIVER_PHONE;
  if (!CALLS_ENABLED) {
    return AGENT_ENABLED
      ? { mode: 'browser' as const, message: 'Phone calls are not set up yet, so Earmark will call you here in the browser.' }
      : { mode: 'demo' as const, message: 'The call is in demo mode. Playing the recorded sample.' };
  }
  if (!to) return { mode: AGENT_ENABLED ? ('browser' as const) : ('demo' as const), message: 'No phone number on file, so Earmark will call you here in the browser.' };
  const body = {
    agent_id: ELEVENLABS_AGENT_ID,
    agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
    to_number: to,
    conversation_initiation_client_data: {
      dynamic_variables: await callVariables(gift, 'phone'),
      conversation_config_override: await callOverrides(gift).then((o) => (o ? { agent: { language: o.agent.language, first_message: o.agent.firstMessage } } : undefined)),
    },
  };
  const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || json.success === false) {
    console.warn('[calls] outbound call failed', res.status, json?.message ?? json?.detail);
    throw Object.assign(new Error('The call could not be placed. Try again in a minute.'), { status: 502 });
  }
  console.log(`[calls] ${reason} call placed for gift ${gift.id}`);
  return { mode: 'live' as const, conversationId: json.conversation_id as string | undefined, callSid: json.callSid as string | undefined, message: `Calling ${receiver?.name ?? 'you'} now.` };
}

/** At 7 days and 4 days before expiry, at most once each. */
export async function reminderSweep() {
  if (!tryDeployment()) return;
  const gifts = await allGifts().catch(() => []);
  for (const g of gifts) {
    if (g.status !== 1) continue;
    const left = (Number(g.expiry) * 1000 - Date.now()) / 86_400_000;
    if (left <= 0) continue;
    const id = g.id.toString();
    const r = (db.reminders[id] ??= {});
    let reason: '7d' | '4d' | null = null;
    if (left <= 4 && !r.d4) {
      reason = '4d';
      r.d4 = Date.now();
      r.d7 ??= Date.now();
    } else if (left <= 7 && left > 4 && !r.d7) {
      reason = '7d';
      r.d7 = Date.now();
    }
    if (!reason) continue;
    save();
    if (!CALLS_ENABLED) {
      await inAppReminder(g, reason).catch((e) => console.warn('[calls] in-app reminder failed:', e.message));
      continue;
    }
    await placeCall(g, reason).catch((e) => console.warn('[calls]', e.message));
  }
}

/** No phone set up: the reminder arrives in the app as a recorded message from Earmark, in the receiver's language. */
export async function inAppReminder(g: ChainGift, reason: '7d' | '4d') {
  const id = g.id.toString();
  const lang = languageOf(g.receiver);
  const { v } = await reminderParts(g);
  // Make the recording now, so it plays the moment they open it.
  await reminderAudio(g, lang).catch(() => {});
  const n = await notifyLocal(getAddress(g.receiver), `Earmark left you a message: ${daysPhrase(v.days)} left on your ${v.item} gift.`, { giftId: id, kind: 'Reminder' });
  broadcastTo(g.receiver, 'reminder', { giftId: id, reason, notificationId: n.id });
  console.log(`[calls] gift ${id} is at ${reason}: in-app reminder sent (${lang})`);
}

export function startReminders() {
  setTimeout(() => reminderSweep().catch(() => {}), 30_000);
  setInterval(() => reminderSweep().catch(() => {}), 15 * 60_000);
}

export async function createPurchaseRequest(giftIdRaw: unknown, source: PurchaseRequest['source']) {
  const giftId = String(giftIdRaw ?? '').replace(/[^0-9]/g, '');
  if (!giftId) throw Object.assign(new Error('gift_id is required'), { status: 400 });
  const gift = await readGift(BigInt(giftId), true);
  if (!gift) throw Object.assign(new Error('That gift does not exist.'), { status: 404 });
  if (gift.status !== 1) throw Object.assign(new Error('That gift is no longer locked.'), { status: 409 });
  const existing = db.purchaseRequests.find((p) => p.giftId === giftId && p.status === 'pending');
  const item = await itemFor(gift.store, gift.itemId);
  if (existing) return { request: existing, item };
  const request: PurchaseRequest = { id: uid(), giftId, receiver: getAddress(gift.receiver), status: 'pending', source, createdAt: Date.now() };
  db.purchaseRequests.push(request);
  save();
  await notifyLocal(request.receiver, `Earmark is ready to buy the ${(item?.name ?? 'item').toLowerCase()}. Confirm it on your gift page.`, { giftId, kind: 'PurchaseRequest' });
  broadcastTo(request.receiver, 'purchase-request', request);
  return { request, item };
}
