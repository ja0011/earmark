// Cuts the walkthrough video together: website recordings (clips/), fal.ai motion shots (../shots/),
// Jessica's voiceover (../voiceover/), captions in Earmark's font, and a soft music bed.
// Usage: node video/walkthrough/edit.mjs   -> video/earmark-walkthrough.mp4
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.resolve(DIR, '..');
const WORK = path.join(DIR, 'raw', 'edit');
fs.mkdirSync(WORK, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const rec = (n) => path.join(DIR, 'clips', `${n}.mp4`);
const shot = (n) => path.join(VIDEO, 'shots', `${n}.mp4`);

// The timeline follows Jessica's lines (see ../voiceover/earmark-voiceover.srt).
// t = when the segment starts in the final video; from = where to start inside the source;
// fit = squeeze the rest of the source into the slot (speeds it up) instead of trimming.
const END = 47.5;
const TIMELINE = [
  { t: 0.0, src: shot('06-gift') },                                  // "You send someone money…"
  { t: 5.2, src: rec('r1-landing'), fit: true },                     // "Earmark fixes that…"
  { t: 9.0, src: shot('01-lock'), from: 1.5 },                       // "…one item, one store, one person"
  { t: 11.0, src: rec('r2-send'), from: 0.6, fit: true },                       // "Just type who it's for…"
  { t: 14.2, src: rec('r3-lock'), from: 5.4, fit: true },                       // "…and lock it in."
  { t: 15.7, src: shot('04-phone-notification') },                   // "They get a notification…"
  { t: 17.1, src: rec('r4-alex-gift'), from: 2.0, fit: true },                  // "…head to the store"
  { t: 18.9, src: rec('r5-drill-rejected'), from: 2.5, fit: true },             // "Try to buy something else? It won't let you."
  { t: 22.5, src: rec('r6-paid'), from: 6.8, fit: true },                       // "Buy the right thing…"
  { t: 24.3, src: shot('03-change-coins'), from: 1.2 },              // "…the change goes straight to them."
  { t: 25.5, src: shot('05-store-counter') },                        // "For stores…"
  { t: 27.3, src: rec('r7-stores'), fit: true },                     // "…a button at checkout and a small signer"
  { t: 32.2, src: shot('07-textbook') },                             // "And it's not just gifts."
  { t: 33.8, src: shot('08-blankets') },                             // "Donate to a shelter…"
  { t: 35.9, src: shot('09-groceries') },                            // "Send groceries to family."
  { t: 37.8, src: shot('10-team-books') },                           // "Give your team a learning budget."
  { t: 40.1, src: rec('r8-profile'), from: 2.0, fit: true },                    // "If it's never used, the money comes back."
  { t: 42.6, still: path.join(DIR, 'clips', 'end-card.png') },       // "Earmark. Money with a purpose."
];

// 1. Each segment -> exact-length 1920x1080 30 fps clip
const parts = [];
TIMELINE.forEach((s, i) => {
  const len = (TIMELINE[i + 1]?.t ?? END) - s.t;
  const out = path.join(WORK, `seg${String(i).padStart(2, '0')}.mp4`);
  const norm = 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p';
  if (s.still) {
    ff(['-loop', '1', '-t', len.toFixed(3), '-i', s.still, '-vf', `${norm},fade=t=out:st=${(len - 0.8).toFixed(2)}:d=0.8`, '-c:v', 'libx264', '-crf', '17', '-an', out]);
  } else {
    const from = s.from ?? 0;
    const avail = dur(s.src) - from;
    const speed = s.fit ? Math.max(1, avail / len) : 1; // never slow down
    ff(['-ss', from.toFixed(3), '-i', s.src, '-t', (len * speed).toFixed(3), '-vf', `setpts=PTS/${speed.toFixed(4)},${norm}`, '-t', len.toFixed(3), '-c:v', 'libx264', '-crf', '17', '-an', out]);
    if (speed > 1.6) console.log(`note: ${path.basename(s.src)} plays at ${speed.toFixed(2)}x`);
  }
  parts.push(out);
});
fs.writeFileSync(path.join(WORK, 'parts.txt'), parts.map((p) => `file '${p}'`).join('\n'));
const picture = path.join(WORK, 'picture.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'parts.txt'), '-c', 'copy', picture]);

// 2. Captions: one transparent PNG per voiceover line, rendered in Manrope by Chromium
const srt = fs.readFileSync(path.join(VIDEO, 'voiceover', 'earmark-voiceover.srt'), 'utf8').trim().split(/\n\s*\n/);
const sec = (s) => { const [h, m, r] = s.split(':'); const [x, ms] = r.split(','); return +h * 3600 + +m * 60 + +x + +ms / 1000; };
const cues = srt.map((blk) => {
  const [, times, ...text] = blk.split('\n');
  const [a, bb] = times.split(' --> ');
  return { start: sec(a), end: sec(bb), text: text.join(' ') };
});
// Long lines are split into two halves on sentence boundaries so captions stay short.
const shortCues = cues.flatMap((c) => {
  const parts = c.text.match(/[^.?!…]+[.?!…]+(\s|$)/g)?.map((x) => x.trim()) ?? [c.text];
  if (parts.length < 2 || c.text.length < 70) return [c];
  const total = c.text.length;
  let t = c.start;
  return parts.map((p) => {
    const d = ((c.end - c.start) * p.length) / total;
    const cue = { start: t, end: t + d, text: p };
    t += d;
    return cue;
  });
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [i, c] of shortCues.entries()) {
  await page.setContent(`<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:transparent}
.cap{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);max-width:1500px;padding:14px 30px;border-radius:999px;
background:rgba(18,18,18,.82);color:#F5F2EB;font:600 40px/1.3 Manrope,system-ui,sans-serif;text-align:center;letter-spacing:-.005em}</style>
</head><body><div class="cap">${c.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  c.png = path.join(WORK, `cap${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: c.png, omitBackground: true });
}
await browser.close();

// 3. Overlay captions, add voiceover + music, encode
const inputs = ['-i', picture];
shortCues.forEach((c) => inputs.push('-loop', '1', '-t', String(END), '-framerate', '30', '-i', c.png)); // full-length so each caption can show at its time
const vo = path.join(VIDEO, 'voiceover', 'earmark-voiceover.mp3');
const music = path.join(VIDEO, 'audio', 'music.mp3');
inputs.push('-i', vo, '-i', music);
let chain = '[0:v]';
const filters = [];
shortCues.forEach((c, i) => {
  const outLabel = i === shortCues.length - 1 ? '[v]' : `[v${i}]`;
  // +0.2 s: the voiceover starts 0.2 s in (adelay below)
  const next = shortCues[i + 1]?.start ?? END;
  const until = Math.min(c.end + 0.35, next + 0.2 - 0.04); // never overlap the next caption
  filters.push(`${chain}[${i + 1}:v]overlay=0:0:enable='between(t,${(c.start + 0.2).toFixed(2)},${until.toFixed(2)})'${outLabel}`);
  chain = outLabel;
});
const voIdx = shortCues.length + 1;
filters.push(`[${voIdx}:a]adelay=200|200,volume=1.0[vo]`);
filters.push(`[${voIdx + 1}:a]atrim=0:${END},volume=0.11,afade=t=in:st=0:d=1.5,afade=t=out:st=${END - 3}:d=3[mu]`);
filters.push('[vo][mu]amix=inputs=2:duration=longest:normalize=0[a]');
const final = path.join(VIDEO, 'earmark-walkthrough.mp4');
ff([...inputs, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-t', String(END),
  '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
console.log(`done -> ${path.relative(process.cwd(), final)} (${dur(final).toFixed(2)} s, ${shortCues.length} captions)`);
