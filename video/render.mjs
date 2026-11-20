#!/usr/bin/env node
// Renders stage.html frame by frame in headless Chromium and encodes video/earmark-demo.mp4
// (1920x1080, 30 fps, H.264 yuv420p, AAC, +faststart) with the voice, music and sound effects mixed in.
//   node video/render.mjs                    # full render
//   node video/render.mjs --stills 3,12.5    # just PNG stills at those seconds (into the frames dir)
// Frames go to $FRAMES_DIR (default: <os tmp>/earmark-video-frames). Needs ffmpeg with libx264.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const VIDEO = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = process.env.FRAMES_DIR || path.join(os.tmpdir(), 'earmark-video-frames');
const FPS = 30;
const WORKERS = Number(process.env.WORKERS || 4);
const OUT = path.join(VIDEO, 'earmark-demo.mp4');
const SRT = path.join(VIDEO, 'earmark-demo-captions.srt');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

fs.mkdirSync(FRAMES, { recursive: true });
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });

async function openStage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('stage error:', e.message));
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.error('stage:', m.text()); });
  await page.goto(pathToFileURL(path.join(VIDEO, 'stage.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.ready);
  await page.waitForTimeout(300);
  return page;
}
const seek = (page, t) => page.evaluate((x) => window.seek(x), t);

const stills = arg('--stills');
if (stills) {
  const page = await openStage();
  // render forward so every tween initialises in order
  const times = stills.split(',').map(Number).sort((a, b) => a - b);
  let prev = 0;
  for (const t of times) {
    await page.evaluate(([from, end]) => { for (let x = from; x < end; x += 0.05) window.seek(x); }, [prev, t]);
    prev = t;
    await seek(page, t);
    const f = path.join(FRAMES, `still-${t.toFixed(2)}.png`);
    await page.screenshot({ path: f });
    log('still', f);
  }
  await browser.close();
  process.exit(0);
}

// ---- 1. frames
const probe = await openStage();
const { duration, cues, captions } = await probe.evaluate(() => ({ duration: window.DURATION, cues: window.CUES, captions: window.CAPTIONS }));
await probe.close();
const N = Math.round(duration * FPS);
for (const f of fs.readdirSync(FRAMES)) if (/^f\d+\.jpg$/.test(f)) fs.rmSync(path.join(FRAMES, f));
log(`rendering ${N} frames (${duration}s) with ${WORKERS} workers into ${FRAMES}`);
let done = 0;
await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
  const a = Math.floor((N * w) / WORKERS), b = Math.floor((N * (w + 1)) / WORKERS);
  const page = await openStage();
  // walk the timeline up to this worker's first frame so every tween initialises in order
  await page.evaluate((end) => { for (let t = 0; t < end; t += 0.05) window.seek(t); }, a / FPS);
  for (let i = a; i < b; i++) {
    await seek(page, i / FPS);
    await page.screenshot({ path: path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
    if (++done % 150 === 0) log(`${done}/${N}`);
  }
  await page.close();
}));
await browser.close();

// ---- 2. captions (.srt)
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync(SRT, captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));

// ---- 3. audio: voice lines at their times, music ~18 dB under, sfx at the stage's cue times
const voice = JSON.parse(fs.readFileSync(path.join(VIDEO, 'voice.json'), 'utf8'));
const inputs = [], filters = [], mix = [];
const add = (file, delay, vol, extra = '') => {
  const k = inputs.length;
  inputs.push('-i', path.join(VIDEO, file));
  filters.push(`[${k / 2}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,${extra}volume=${vol},adelay=${Math.round(delay * 1000)}:all=1[a${k / 2}]`);
  mix.push(`[a${k / 2}]`);
};
voice.lines.forEach((l) => add(l.file, l.at, 1.0));
const music = fs.existsSync(path.join(VIDEO, 'audio/music.mp3'));
// music sits ~18 dB under the voice, then swells a little under the end card
const lastWord = voice.lines.at(-1).end;
if (music) add('audio/music.mp3', 0, `'0.1+0.16*min(max((t-${(lastWord - 0.4).toFixed(2)})/1.0\,0)\,1)':eval=frame`, `atrim=0:${duration},afade=t=in:d=0.8,afade=t=out:st=${(duration - 2.4).toFixed(2)}:d=2.4,`);
const SFX_GAIN = 0.55;
for (const c of cues) {
  const f = `audio/sfx-${c.name}.mp3`;
  if (fs.existsSync(path.join(VIDEO, f))) add(f, c.t, (c.gain * SFX_GAIN).toFixed(3));
}
filters.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:dropout_transition=0,atrim=0:${duration},alimiter=limit=0.9:level=disabled[out]`);
const wav = path.join(FRAMES, 'mix.wav');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', wav], { stdio: 'inherit' });
log(`audio mixed: ${voice.lines.length} voice lines, music ${music ? 'yes' : 'no'}, ${cues.length} sfx cues`);

// ---- 4. encode
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'), '-i', wav,
  '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
log('wrote', OUT);

// ---- 5. contact sheet (a frame every 2 s) for review
const sheet = path.join(FRAMES, 'contact-sheet.jpg');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', OUT, '-vf', `fps=1/2,scale=480:-1,tile=5x6:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', sheet], { stdio: 'inherit' });
log('contact sheet', sheet);
