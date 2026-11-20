#!/usr/bin/env node
// Minimal fal.ai queue runner.
// Usage: node scripts/assets/fal.mjs <name> <model> <input.json | '{json}'> <outFile> <costEstimateUsd> [note]
// - Reads FAL_KEY from the repo .env (never printed).
// - Inputs may reference earlier outputs as "@name" (replaced by that output's remote URL).
// - Downloads the first image/video to outFile, records the remote URL in assets-src/urls.json,
//   appends a line to assets-src/log.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'assets-src');
const URLS = path.join(SRC, 'urls.json');
const LOG = path.join(SRC, 'log.md');

function loadKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = env.match(/^FAL_KEY=(.*)$/m);
  const key = m && m[1].trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('FAL_KEY missing in .env');
  return key;
}

const [name, model, inputArg, outFile, cost = '0', note = ''] = process.argv.slice(2);
if (!name || !model || !inputArg || !outFile) {
  console.error('usage: fal.mjs <name> <model> <input> <outFile> <costUsd> [note]');
  process.exit(1);
}
const KEY = loadKey();
const urls = fs.existsSync(URLS) ? JSON.parse(fs.readFileSync(URLS, 'utf8')) : {};
let raw = fs.existsSync(inputArg) ? fs.readFileSync(inputArg, 'utf8') : inputArg;
raw = raw.replace(/"@([\w.-]+)"/g, (_, n) => {
  if (!urls[n]) throw new Error(`unknown reference @${n}`);
  return JSON.stringify(urls[n]);
});
const input = JSON.parse(raw);
const headers = { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' };

async function main() {
  const t0 = Date.now();
  const sub = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers, body: JSON.stringify(input) });
  const subJson = await sub.json();
  if (!sub.ok) throw new Error(`submit ${sub.status}: ${JSON.stringify(subJson)}`);
  const { request_id, status_url, response_url } = subJson;
  console.log(`[${name}] queued ${request_id}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await fetch(`${status_url}?logs=0`, { headers });
    const sj = await s.json();
    if (sj.status === 'COMPLETED') break;
    if (sj.status === 'FAILED' || sj.error) throw new Error(`failed: ${JSON.stringify(sj)}`);
    if (Date.now() - t0 > 20 * 60 * 1000) throw new Error('timeout');
  }
  const r = await fetch(response_url, { headers });
  const out = await r.json();
  if (!r.ok) throw new Error(`result ${r.status}: ${JSON.stringify(out)}`);
  const file = out.images?.[0] ?? out.image ?? out.video;
  if (!file?.url) throw new Error(`no output url: ${JSON.stringify(out).slice(0, 500)}`);
  const bin = Buffer.from(await (await fetch(file.url)).arrayBuffer());
  const dest = path.resolve(ROOT, outFile);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bin);
  // re-read so parallel runs don't clobber each other's entries
  const latest = fs.existsSync(URLS) ? JSON.parse(fs.readFileSync(URLS, 'utf8')) : {};
  latest[name] = file.url;
  fs.writeFileSync(URLS, JSON.stringify(latest, null, 2));
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (!fs.existsSync(LOG)) {
    fs.writeFileSync(LOG, '# fal.ai request log\n\n| time (UTC) | name | model | request id | est. cost (USD) | output | note |\n|---|---|---|---|---|---|---|\n');
  }
  fs.appendFileSync(LOG, `| ${new Date().toISOString()} | ${name} | ${model} | ${request_id} | ${cost} | ${path.relative(ROOT, dest)} | ${note.replace(/\|/g, '/')} |\n`);
  fs.writeFileSync(dest + '.json', JSON.stringify({ name, model, request_id, input, output: out, seconds: secs }, null, 2));
  console.log(`[${name}] done in ${secs}s -> ${path.relative(ROOT, dest)} ${file.width ?? ''}x${file.height ?? ''}`);
}
main().catch((e) => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.appendFileSync(LOG, `| ${new Date().toISOString()} | ${name} | ${model} | - | 0 (failed) | - | ERROR ${String(e.message).slice(0, 200).replace(/\|/g, '/')} |\n`);
  console.error(`[${name}] ERROR`, e.message);
  process.exit(1);
});
