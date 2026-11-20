// ElevenLabs voice for the site: text-to-speech with word timings (reminders, sender notes) and
// speech-to-text (voice replies). Generated audio is cached in server/data/audio, so each line is paid for once.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ELEVENLABS_API_KEY } from './config';
import { DATA_DIR } from './db';
import { LANGS, type Lang } from './i18n';

export const AUDIO_DIR = resolve(DATA_DIR, 'audio');
const TTS_MODEL = (process.env.ELEVENLABS_TTS_MODEL ?? '').trim() || 'eleven_multilingual_v2';
const STT_MODEL = (process.env.ELEVENLABS_STT_MODEL ?? '').trim() || 'scribe_v1';

/** Earmark speaks as the same voice as the landing-page sample; people's notes use their own voice. */
export const VOICES = {
  earmark: 'EXAVITQu4vr4xnSDxMaL', // Sarah
  maya: 'cgSgspJ2msm6clMCkdW9', // Jessica
  alex: 'TX3LPaxmHKxFdv7VOQHJ', // Liam
} as const;
export const voiceFor = (name?: string | null) => VOICES[(name ?? '').toLowerCase() as keyof typeof VOICES] ?? VOICES.maya;

export type Word = { text: string; start: number; end: number };
export type CallScript = { duration: number; joiner: string; lines: { speaker: string; text: string; start: number; end: number; words: Word[] }[] };
export type Spoken = { audioUrl: string | null; script: CallScript };

export const VOICE_ENABLED = Boolean(ELEVENLABS_API_KEY);

const r3 = (n: number) => Math.round(n * 1000) / 1000;
// Han, kana, Hangul: no spaces between words, so each character is its own timing unit.
const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;
const PUNCT = /[，。！？、；：,.!?;:「」“”…]/;

/** Character alignment -> word timings (punctuation stays attached, e.g. "Alex,"). Ported from scripts/assets/make-call-audio.mjs. */
export function wordsFromAlignment(a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  const push = () => cur && (words.push(cur), (cur = null));
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      push();
      continue;
    }
    if (CJK.test(ch)) {
      push();
      words.push({ text: ch, start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] });
      continue;
    }
    if (PUNCT.test(ch) && !cur && words.length) {
      words[words.length - 1].text += ch;
      words[words.length - 1].end = a.character_end_times_seconds[i];
      continue;
    }
    if (!cur) cur = { text: '', start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    cur.text += ch;
    cur.end = a.character_end_times_seconds[i];
  }
  push();
  return words.map((w) => ({ text: w.text, start: r3(w.start), end: r3(w.end) }));
}

/** Even timings, for when ElevenLabs is off: the transcript still types, with no audio. */
export function estimatedScript(text: string, speaker: string, lang: Lang): CallScript {
  const joiner = ' ';
  const parts = joiner ? text.split(/\s+/) : [...text];
  let t = 0.3;
  const words = parts.map((w) => {
    const d = joiner ? 0.16 + w.length * 0.045 : 0.22;
    const word = { text: w, start: r3(t), end: r3(t + d) };
    t += d + (joiner ? 0.04 : 0);
    return word;
  });
  return { duration: r3(t + 0.4), joiner, lines: [{ speaker, text, start: 0.3, end: r3(t), words }] };
}

const inflight = new Map<string, Promise<Spoken>>();

/** Text -> cached mp3 + word-timed script. Falls back to an estimated script (no audio) if ElevenLabs is off or fails. */
export function speak(text: string, opts: { lang: Lang; speaker: string; voice?: string }): Promise<Spoken> {
  const voice = opts.voice ?? VOICES.earmark;
  const id = createHash('sha256').update(`${TTS_MODEL}|${voice}|${opts.lang}|${opts.speaker}|${text}`).digest('hex').slice(0, 24);
  const mp3 = resolve(AUDIO_DIR, `${id}.mp3`);
  const json = resolve(AUDIO_DIR, `${id}.json`);
  if (existsSync(mp3) && existsSync(json)) return Promise.resolve({ audioUrl: `/api/audio/${id}.mp3`, script: JSON.parse(readFileSync(json, 'utf8')) });
  if (!VOICE_ENABLED) return Promise.resolve({ audioUrl: null, script: estimatedScript(text, opts.speaker, opts.lang) });
  const running = inflight.get(id);
  if (running) return running;
  const job = (async (): Promise<Spoken> => {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL, // multilingual: the language comes from the text itself
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = (await res.json()) as { audio_base64: string; alignment?: Parameters<typeof wordsFromAlignment>[0]; normalized_alignment?: Parameters<typeof wordsFromAlignment>[0] };
      const align = j.alignment ?? j.normalized_alignment;
      const words = align ? wordsFromAlignment(align) : [];
      if (!words.length) throw new Error('ElevenLabs returned no timings');
      const script: CallScript = {
        duration: r3(words[words.length - 1].end + 0.4),
        joiner: ' ',
        lines: [{ speaker: opts.speaker, text, start: words[0].start, end: words[words.length - 1].end, words }],
      };
      mkdirSync(AUDIO_DIR, { recursive: true });
      writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
      writeFileSync(json, JSON.stringify(script));
      return { audioUrl: `/api/audio/${id}.mp3`, script };
    } catch (e) {
      console.warn('[voice]', (e as Error).message);
      return { audioUrl: null, script: estimatedScript(text, opts.speaker, opts.lang) };
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, job);
  return job;
}

// Scribe returns ISO 639-3 codes.
const FROM_ISO3: Record<string, Lang> = { eng: 'en', spa: 'es' };

/** ElevenLabs Speech-to-Text (Scribe): audio in any language -> text + detected language. */
export async function transcribe(audio: Buffer, mime: string, hint?: Lang): Promise<{ text: string; lang: Lang | null }> {
  if (!VOICE_ENABLED) throw Object.assign(new Error('Voice replies need ElevenLabs (ELEVENLABS_API_KEY).'), { status: 503, code: 'NO_VOICE' });
  const form = new FormData();
  form.append('model_id', STT_MODEL);
  if (hint && hint !== 'en') form.append('language_code', hint);
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `reply.${mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'}`);
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    console.warn('[voice] speech-to-text failed', res.status, (await res.text()).slice(0, 200));
    throw Object.assign(new Error("Couldn't hear that. Try again a little closer to the microphone."), { status: 502, code: 'STT_FAILED' });
  }
  const j = (await res.json()) as { text?: string; language_code?: string };
  const code = (j.language_code ?? '').toLowerCase();
  const lang = FROM_ISO3[code] ?? ((code in LANGS ? code : null) as Lang | null);
  return { text: (j.text ?? '').trim(), lang };
}
