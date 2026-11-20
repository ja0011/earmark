#!/usr/bin/env node
// fal.ai motion clips for the demo video (Kling 2.5 turbo pro image-to-video, 5 s, no audio).
// Every paid request goes through scripts/assets/fal.mjs, which logs it in assets-src/log.md.
// Raw outputs live in assets-src/video/ (gitignored); only the 30 fps JPEG frame sequences go to video/clips/.
//   node video/clips.mjs starts            # present start frame (local composite, free) + 3 nano-banana-2 start frames ($0.12 each)
//   node video/clips.mjs videos [names]    # Kling i2v for the named clips (default all), $0.35 each
//   node video/clips.mjs frames            # clips -> video/clips/<name>/f001.jpg ... (native 24 fps, trimmed) + clips.js manifest (local, free)
// Add --take N to write a retry as <name>-rN (the newest take is the one used).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VIDEO = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(VIDEO, '..');
const RAW = path.join(ROOT, 'assets-src/video');
const OUT = path.join(VIDEO, 'clips');
const FAL = path.join(ROOT, 'scripts/assets/fal.mjs');
const KLING = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const NEG = 'people, person, human, face, hands, fingers, body, silhouette, text, letters, logo, watermark, blur, distort, low quality';

export const CLIPS = {
  present: {
    start: { local: true },
    motion: 'the blue satin bow slowly unties itself and the ribbon slides off, the lid lifts gently upward revealing soft light inside, slow camera push-in, clean studio, cream background, no people, no hands',
  },
  usecase: {
    start: { prompt: 'Minimal studio still life on a warm cream surface: a chemistry textbook, a neat stack of folded wool blankets, and a small paper grocery box with fresh produce, each tied with a thin cobalt-blue (#2F6BFF) ribbon tag, soft daylight, lots of empty space, no text, no logos, no people' },
    motion: 'slow lateral camera dolly across the objects, soft shadows shift slightly, calm',
  },
  coins: {
    start: { prompt: 'Top-down view of a long white paper receipt on a cream surface, blank paper with no printed text, a small empty space beside it, soft light, no people' },
    motion: 'a few small gold coins drop into frame and land beside the receipt, bouncing and settling with a satisfying spin, top-down, slow motion',
  },
  store: {
    start: { prompt: 'A small independent shop counter in warm light, a paper shopping bag tied with a cobalt-blue ribbon tag sits on the counter next to a small card payment terminal with a blank screen, shelves softly blurred behind, no text, no logos, no people' },
    motion: 'slow push-in toward the shopping bag, gentle light flicker from the window, calm',
  },
};

// Which part of each clip the video uses, and how it is stored (JPEG width, ffmpeg -q:v).
const EXTRACT = {
  present: { from: 0, to: 5.05, w: 1920, q: 5 },
  usecase: { from: 0, to: 5.05, w: 1280, q: 8 },
  coins: { from: 0.4, to: 4.2, w: 1600, q: 6 },
  store: { from: 0, to: 5.05, w: 1280, q: 7 },
};

const argv = process.argv.slice(2);
const cmd = argv[0];
const takeIdx = argv.indexOf('--take');
const take = takeIdx > 0 ? Number(argv[takeIdx + 1]) : 0;
const names = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--take');
const suffix = take ? `-r${take}` : '';
fs.mkdirSync(RAW, { recursive: true });

/** Newest take of a file: name.ext, name-r1.ext, name-r2.ext ... */
function latest(base, ext) {
  const all = fs.readdirSync(RAW).filter((f) => f === `${base}.${ext}` || new RegExp(`^${base}-r\\d+\\.${ext}$`).test(f));
  all.sort((a, b) => (Number(a.match(/-r(\d+)\./)?.[1] ?? 0) - Number(b.match(/-r(\d+)\./)?.[1] ?? 0)));
  return all.length ? path.join(RAW, all.at(-1)) : null;
}
const fal = (name, model, input, out, cost, note) => {
  const job = path.join(RAW, `${name}.input.json`);
  fs.writeFileSync(job, JSON.stringify(input));
  execFileSync('node', [FAL, name, model, job, path.relative(ROOT, out), String(cost), note], { cwd: ROOT, stdio: 'inherit' });
};

if (cmd === 'starts') {
  // 1. present: the real site's present centred on cream, 16:9 (Pillow, no generation)
  execFileSync('python3', ['-I', '-c', `
from PIL import Image
im = Image.open(${JSON.stringify(path.join(ROOT, 'earmark-app/public/media/present-upright-2000.webp'))}).convert('RGBA')
W, H, h = 1920, 1080, 900
w = round(im.width * h / im.height)
im = im.resize((w, h), Image.LANCZOS)
bg = Image.new('RGBA', (W, H), (245, 242, 235, 255))
bg.alpha_composite(im, ((W - w) // 2, (H - h) // 2 + 10))
bg.convert('RGB').save(${JSON.stringify(path.join(RAW, 'present-start.jpg'))}, quality=92)`]);
  console.log('present-start.jpg composed');
  for (const [name, c] of Object.entries(CLIPS)) {
    if (c.start.local || (names.length && !names.includes(name))) continue;
    fal(`video-${name}-start${suffix}`, 'fal-ai/nano-banana-2', { prompt: c.start.prompt, resolution: '2K', aspect_ratio: '16:9', num_images: 1, output_format: 'png' },
      path.join(RAW, `${name}-start${suffix}.png`), 0.12, `demo video start frame, t2i 2K${take ? `, retry ${take}` : ''}`);
  }
} else if (cmd === 'videos') {
  for (const [name, c] of Object.entries(CLIPS)) {
    if (names.length && !names.includes(name)) continue;
    const start = c.start.local ? path.join(RAW, 'present-start.jpg') : latest(`${name}-start`, 'png');
    if (!start) throw new Error(`no start frame for ${name}; run "starts" first`);
    const mime = start.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const image_url = `data:${mime};base64,${fs.readFileSync(start).toString('base64')}`;
    fal(`video-${name}-clip${suffix}`, KLING, { prompt: c.motion, image_url, duration: '5', negative_prompt: NEG, cfg_scale: 0.5 },
      path.join(RAW, `${name}-clip${suffix}.mp4`), 0.35, `demo video i2v 5s from ${path.basename(start)}${take ? `, retry ${take}` : ''}`);
  }
} else if (cmd === 'frames') {
  const manifest = {};
  for (const name of Object.keys(CLIPS)) {
    const clip = latest(`${name}-clip`, 'mp4');
    if (!clip) { console.warn(`skip ${name}: no clip`); continue; }
    const dir = path.join(OUT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    // Native 24 fps (the stage blends neighbouring frames, so slow-motion stays smooth), only the part we use,
    // and smaller/softer where the clip sits under a wash.
    const x = EXTRACT[name];
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(x.from), '-to', String(x.to), '-i', clip, '-vf', `scale=${x.w}:-2:flags=lanczos`, '-q:v', String(x.q), path.join(dir, 'f%03d.jpg')]);
    manifest[name] = { frames: fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length, fps: 24, from: x.from, source: path.basename(clip) };
    console.log(`${name}: ${manifest[name].frames} frames from ${manifest[name].source}`);
  }
  fs.writeFileSync(path.join(VIDEO, 'clips.js'), `window.CLIPS = ${JSON.stringify(manifest)};\n`);
} else {
  console.log('usage: node video/clips.mjs starts|videos|frames [names] [--take N]');
}
