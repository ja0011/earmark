// Natural voiceover for the demo video (ElevenLabs eleven_v4, one continuous take per voice).
// Usage: node video/voiceover/make-voiceover.mjs   -> video/voiceover/earmark-voiceover-<voice>.mp3 + .srt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../..');
const KEY = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m)?.[1]?.trim();
if (!KEY) throw new Error('ELEVENLABS_API_KEY missing in .env');

export const SCRIPT = [
  'You send someone money for something that matters… and it gets spent on something else.',
  'Earmark fixes that. It locks money to one item, at one store, for one person.',
  "Just type who it's for and what it should buy. Check the details — and lock it in.",
  "They get a notification, head to the store, and check out with their gift. Try to buy something else? It won't let you. Buy the right thing — and the change goes straight to them.",
  "For stores, it's a button at checkout and a small signer on their server. They get paid instantly, at their real price.",
  "And it's not just gifts. Donate to a shelter, and know it buys blankets. Send groceries to family. Give your team a learning budget.",
  "If it's never used, the money comes back.",
  'Earmark. Money with a purpose.',
];
const VOICES = { chris: 'iP95p4xoKVk53GoZ742B', jessica: 'cgSgspJ2msm6clMCkdW9' };
const MODEL = process.env.TTS_MODEL || 'eleven_v4';

const srtTime = (s) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

for (const [name, id] of Object.entries(VOICES)) {
  const text = SCRIPT.join('\n\n');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}/with-timestamps?output_format=mp3_44100_192`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true } }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  const j = await res.json();
  fs.writeFileSync(path.join(DIR, `earmark-voiceover-${name}.mp3`), Buffer.from(j.audio_base64, 'base64'));
  // Captions: one cue per script line, timed from the character alignment.
  const a = j.normalized_alignment ?? j.alignment;
  const chars = a.characters.join('');
  let from = 0;
  const cues = SCRIPT.map((line, i) => {
    const start = chars.indexOf(line.slice(0, 12), from);
    const end = start + line.length - 1;
    from = end;
    return `${i + 1}\n${srtTime(a.character_start_times_seconds[Math.max(0, start)])} --> ${srtTime(a.character_end_times_seconds[Math.min(end, a.character_end_times_seconds.length - 1)])}\n${line}\n`;
  });
  fs.writeFileSync(path.join(DIR, `earmark-voiceover-${name}.srt`), cues.join('\n'));
  console.log(`${name}: done (${MODEL})`);
}
