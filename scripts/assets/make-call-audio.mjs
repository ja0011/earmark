#!/usr/bin/env node
// Generates the landing-page call sample (brief section 6) with ElevenLabs TTS "with-timestamps".
//   node scripts/assets/make-call-audio.mjs
// Needs ELEVENLABS_API_KEY in the repo-root .env (never printed). Optional overrides in .env:
//   ELEVENLABS_AGENT_VOICE_ID (default "Sarah", warm female), ELEVENLABS_ALEX_VOICE_ID (default "Liam", young male),
//   ELEVENLABS_TTS_MODEL (default eleven_multilingual_v2), CALL_GAP_SECONDS (default 0.6).
// Writes earmark-app/public/media/call/call.mp3 and call.json:
//   { duration, lines: [{ speaker: "Earmark"|"Alex", text, start, end, words: [{ text, start, end }] }] }
// Raw per-line outputs go to assets-src/call/. Afterwards it refreshes manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'assets-src/call');
const OUT = path.join(ROOT, 'earmark-app/public/media/call');

export const LINES = [
  { speaker: 'Earmark', text: 'Hey Alex, your $45 shovel gift expires in four days. Want me to buy it for you?', voiceEnv: 'ELEVENLABS_AGENT_VOICE_ID', defaultVoice: 'EXAVITQu4vr4xnSDxMaL' /* Sarah */, settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 1.0 } },
  { speaker: 'Alex', text: 'Yeah, do it.', voiceEnv: 'ELEVENLABS_ALEX_VOICE_ID', defaultVoice: 'TX3LPaxmHKxFdv7VOQHJ' /* Liam */, settings: { stability: 0.45, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true, speed: 1.0 } },
];

function readEnv() {
  const file = path.join(ROOT, '.env');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Character alignment -> word timings (punctuation stays attached, e.g. "Alex,"). */
export function wordsFromAlignment(alignment, offset = 0) {
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = alignment;
  const words = [];
  let cur = null;
  for (let i = 0; i < ch.length; i++) {
    if (/\s/.test(ch[i])) { if (cur) { words.push(cur); cur = null; } continue; }
    if (!cur) cur = { text: '', start: st[i], end: en[i] };
    cur.text += ch[i];
    cur.end = en[i];
  }
  if (cur) words.push(cur);
  return words.map((w) => ({ text: w.text, start: r3(w.start + offset), end: r3(w.end + offset) }));
}

function probeDuration(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

async function tts(key, voiceId, model, line, prev, next) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: line.text, model_id: model, voice_settings: line.settings, previous_text: prev, next_text: next }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for ${line.speaker} (voice ${voiceId}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function main() {
  const env = { ...readEnv(), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('ELEVENLABS_') || k === 'CALL_GAP_SECONDS')) };
  const key = env.ELEVENLABS_API_KEY;
  if (!key) {
    console.log('ELEVENLABS_API_KEY is empty in .env; nothing generated. Add the key and re-run.');
    return;
  }
  const model = env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2';
  const gap = parseFloat(env.CALL_GAP_SECONDS || '0.6');
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const parts = [];
  for (let i = 0; i < LINES.length; i++) {
    const line = LINES[i];
    const voice = env[line.voiceEnv] || line.defaultVoice;
    const r = await tts(key, voice, model, line, i > 0 ? LINES[i - 1].text : undefined, LINES[i + 1]?.text);
    const mp3 = path.join(RAW, `line-${i + 1}-${line.speaker.toLowerCase()}.mp3`);
    fs.writeFileSync(mp3, Buffer.from(r.audio_base64, 'base64'));
    fs.writeFileSync(mp3.replace(/\.mp3$/, '.json'), JSON.stringify({ voice, model, alignment: r.alignment, normalized_alignment: r.normalized_alignment }, null, 2));
    parts.push({ line, mp3, alignment: r.alignment, duration: probeDuration(mp3) });
    console.log(`${line.speaker}: ${parts.at(-1).duration.toFixed(2)}s (voice ${voice})`);
  }

  // concat: line1, gap, line2, gap, ... as mono 44.1k mp3 (one silence input per gap)
  const args = ['-v', 'error', '-y'];
  parts.forEach((p) => args.push('-i', p.mp3));
  for (let i = 0; i < parts.length - 1; i++) args.push('-f', 'lavfi', '-t', String(gap), '-i', 'anullsrc=r=44100:cl=mono');
  const norm = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono';
  const filters = [];
  const seq = [];
  parts.forEach((_, i) => {
    filters.push(`[${i}:a]${norm}[a${i}]`);
    seq.push(`[a${i}]`);
    if (i < parts.length - 1) {
      filters.push(`[${parts.length + i}:a]${norm}[s${i}]`);
      seq.push(`[s${i}]`);
    }
  });
  filters.push(`${seq.join('')}concat=n=${seq.length}:v=0:a=1[out]`);
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', path.join(OUT, 'call.mp3'));
  execFileSync('ffmpeg', args, { stdio: 'inherit' });

  let offset = 0;
  const lines = parts.map((p, i) => {
    const words = wordsFromAlignment(p.alignment, offset);
    const entry = { speaker: p.line.speaker, text: p.line.text, start: words[0].start, end: words.at(-1).end, words };
    offset += p.duration + (i < parts.length - 1 ? gap : 0);
    return entry;
  });
  const duration = r3(probeDuration(path.join(OUT, 'call.mp3')));
  fs.writeFileSync(path.join(OUT, 'call.json'), JSON.stringify({ duration, lines }, null, 2));
  console.log(`call.mp3 ${duration}s, call.json written`);
  try {
    execFileSync('python3', ['-I', path.join(ROOT, 'scripts/assets/build_manifest.py')], { stdio: 'inherit' });
  } catch { console.warn('manifest refresh failed; run scripts/assets/build_manifest.py'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
