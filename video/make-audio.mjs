#!/usr/bin/env node
// Voice, music and sound effects for the Earmark demo video (ElevenLabs).
//   node video/make-audio.mjs            # generate what is missing, then rebuild video/voice.json
//   node video/make-audio.mjs --force    # regenerate everything (costs ElevenLabs credits)
// Needs ELEVENLABS_API_KEY in the repo-root .env (read from the file, never printed).
// Writes video/audio/line-N.mp3 (+ .json alignment), music.mp3, sfx-*.mp3 and video/voice.json:
//   { duration, lines: [{ text, start, end, words: [{ text, start, end }] }] }
// The lines are laid out on the video timeline here (lead-in + gaps); render.mjs places them at those times.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VIDEO = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(VIDEO, '..');
const AUDIO = path.join(VIDEO, 'audio');
const FORCE = process.argv.includes('--force');

export const LINES = [
  'You send money for something that matters. It gets spent on something else.',
  'Earmark locks money to one item, at one store, for one person.',
  'Gifts that become what you meant. Donations that buy exactly what a shelter needs. Groceries for family. Budgets for your team.',
  "Type who it's for and what it should buy. Lock it with Face ID. It can only be spent on that, and the change goes to them.",
  "For stores, it's one button at checkout and a signer on the server. Get paid instantly, at your real price, only for the item the money was meant for.",
  'Every gift has its own fingerprint. Earmark even calls to remind you. And if it\'s never used, the money goes back.',
  'Earmark. Money with a purpose.',
];
// Silence BEFORE each line on the video timeline (seconds). Line 1 gets a short lead-in; the
// gaps give each scene a breath before its voice starts.
const GAPS = [0.6, 1.2, 1.0, 1.0, 2.6, 1.2, 1.2];
const END_HOLD = 3.2; // end card holds after the last word

const VOICE = 'EXAVITQu4vr4xnSDxMaL';
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 1.0 };

const SFX = {
  tick: { text: 'a single soft receipt printer tick, quiet thermal printer feed click, close and clean, no music', duration_seconds: 0.6 },
  lock: { text: 'a satisfying small metal lock click snapping shut, crisp and soft, single click, no reverb', duration_seconds: 0.6 },
  coin: { text: 'a light single coin clink dropping onto a small pile of coins, bright and gentle', duration_seconds: 1.0 },
};
const MUSIC_PROMPT = 'Soft modern minimal piano and plucked synth, warm, optimistic, gentle steady pulse, no vocals, instrumental, product demo underscore, 60 seconds, ends softly.';

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const r3 = (n) => Math.round(n * 1000) / 1000;
const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

function wordsFromAlignment(a, offset) {
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = a;
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

async function post(key, url, body, label) {
  const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for ${label}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function main() {
  const key = readEnv().ELEVENLABS_API_KEY;
  fs.mkdirSync(AUDIO, { recursive: true });
  const need = (f) => FORCE || !fs.existsSync(f);
  if (!key && [...LINES.keys()].some((i) => need(path.join(AUDIO, `line-${i + 1}.mp3`)))) throw new Error('ELEVENLABS_API_KEY missing in .env');

  // 1. Voice, one request per line (previous/next text keeps the intonation continuous).
  for (let i = 0; i < LINES.length; i++) {
    const mp3 = path.join(AUDIO, `line-${i + 1}.mp3`);
    if (!need(mp3)) continue;
    const res = await post(key, `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`,
      { text: LINES[i], model_id: MODEL, voice_settings: SETTINGS, previous_text: LINES[i - 1], next_text: LINES[i + 1] }, `line ${i + 1}`);
    const r = await res.json();
    fs.writeFileSync(mp3, Buffer.from(r.audio_base64, 'base64'));
    fs.writeFileSync(mp3.replace(/\.mp3$/, '.json'), JSON.stringify({ voice: VOICE, model: MODEL, alignment: r.alignment }, null, 1));
    console.log(`line ${i + 1}: ${probe(mp3).toFixed(2)}s`);
  }

  // 2. Sound effects.
  for (const [name, body] of Object.entries(SFX)) {
    const f = path.join(AUDIO, `sfx-${name}.mp3`);
    if (!need(f)) continue;
    try {
      const res = await post(key, 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { ...body, prompt_influence: 0.6 }, `sfx ${name}`);
      fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      console.log(`sfx ${name}: ${probe(f).toFixed(2)}s`);
    } catch (e) { console.warn(`sfx ${name} skipped: ${e.message}`); }
  }

  // 3. Music (skipped quietly if the plan does not include it).
  const music = path.join(AUDIO, 'music.mp3');
  if (need(music)) {
    try {
      const res = await post(key, 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
        { prompt: MUSIC_PROMPT, music_length_ms: 62000, model_id: 'music_v1', force_instrumental: true }, 'music');
      fs.writeFileSync(music, Buffer.from(await res.arrayBuffer()));
      console.log(`music: ${probe(music).toFixed(2)}s`);
    } catch (e) { console.warn(`music skipped: ${e.message}`); }
  }

  // 4. Lay the lines out on the video timeline.
  let t = 0;
  const lines = LINES.map((text, i) => {
    const file = path.join(AUDIO, `line-${i + 1}.mp3`);
    const { alignment } = JSON.parse(fs.readFileSync(file.replace(/\.mp3$/, '.json'), 'utf8'));
    t += GAPS[i];
    const at = r3(t);
    const words = wordsFromAlignment(alignment, at);
    const dur = probe(file);
    t += dur;
    return { text, file: path.relative(VIDEO, file), at, start: words[0].start, end: words.at(-1).end, words };
  });
  const duration = r3(lines.at(-1).end + END_HOLD);
  fs.writeFileSync(path.join(VIDEO, 'voice.json'), JSON.stringify({ duration, lines }, null, 1));
  // Same data as a script so stage.html can load it from file:// (fetch is blocked there).
  fs.writeFileSync(path.join(VIDEO, 'voice.js'), `window.VOICE = ${JSON.stringify({ duration, lines })};\n`);
  console.log(`voice.json: ${lines.map((l) => `${l.start.toFixed(2)}-${l.end.toFixed(2)}`).join('  ')}  total ${duration}s`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
