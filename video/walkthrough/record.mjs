// Records the real Earmark site being used, as short 1920x1080 clips for the walkthrough video.
// Uses Chrome's screencast (sharp frames, real timing) and a drawn cursor so viewers can follow along.
// Spends one $0.45 test gift (shared Maya -> shared Alex) on Arc testnet.
// Usage: node video/walkthrough/record.mjs   (needs the local servers: Earmark :5173, Hartwell :5174)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(DIR, 'raw');
const CLIPS = path.join(DIR, 'clips');
const APP = process.env.APP_URL || 'http://localhost:5173';
const STORE = process.env.STORE_URL || 'http://localhost:5174';
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(CLIPS, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A simple drawn cursor (headless screencasts don't include the system cursor).
const CURSOR = () => {
  const add = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.5-3.4 6.5z" fill="#121212" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-4px,-2px)', transition: 'none' });
    document.documentElement.appendChild(c);
    const pos = JSON.parse(sessionStorage.getItem('__cursor') || '{"x":960,"y":620}');
    c.style.left = pos.x + 'px';
    c.style.top = pos.y + 'px';
    addEventListener('mousemove', (e) => {
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
      sessionStorage.setItem('__cursor', JSON.stringify({ x: e.clientX, y: e.clientY }));
    }, true);
    addEventListener('mousedown', () => (c.style.transform = 'translate(-4px,-2px) scale(.85)'), true);
    addEventListener('mouseup', () => (c.style.transform = 'translate(-4px,-2px)'), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
};

/** Record one clip of a page with Chrome's screencast, then encode it to 30 fps H.264. */
async function record(page, name, fn) {
  const cdp = await page.context().newCDPSession(page);
  const dir = path.join(RAW, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  await fn();
  await wait(400);
  const t1 = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  if (!frames.length) throw new Error(`${name}: no frames`);
  // Variable-rate frames -> concat list with real durations -> constant 30 fps.
  const lines = [];
  frames.forEach((fr, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(fr.t + 1 / 30, t1 - t0 + frames[0].t);
    lines.push(`file '${fr.f}'`, `duration ${Math.max(1 / 60, next - fr.t).toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1).f}'`);
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, lines.join('\n'));
  const out = path.join(CLIPS, `${name}.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#F5F2EB,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-an', out]);
  log(`${name}: ${frames.length} frames -> ${path.relative(DIR, out)}`);
}

/** Smooth, human-ish mouse travel. */
async function glide(page, x, y, steps = 28) {
  await page.mouse.move(x, y, { steps });
}
async function glideTo(page, locator, dx = 0.5, dy = 0.5, steps = 28) {
  const b = await locator.boundingBox();
  await glide(page, b.x + b.width * dx, b.y + b.height * dy, steps);
}
async function smoothScroll(page, y, ms = 1600) {
  await page.evaluate(({ y, ms }) => new Promise((done) => {
    const from = scrollY, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      scrollTo(0, from + (y - from) * ease(p));
      p < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), { y, ms });
}

async function authenticator(ctx, page, credentials = []) {
  const c = await ctx.newCDPSession(page);
  await c.send('WebAuthn.enable');
  const { authenticatorId } = await c.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  for (const cr of credentials) await c.send('WebAuthn.addCredential', { authenticatorId, credential: cr });
  return { c, authenticatorId };
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await ctx.addInitScript(CURSOR);
const page = await ctx.newPage();
const dev = await authenticator(ctx, page);
const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);

// Sign in as the shared Maya (not filmed, done first so nothing else interferes)
await page.goto(`${APP}/me`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Sign in as Maya' }).click();
await page.waitForSelector('text=everyone signed in as Maya', { timeout: 30000 });
// Keep the device passkey so it can be re-attached before each step that needs it.
const { credentials: deviceCreds } = await dev.c.send('WebAuthn.getCredentials', { authenticatorId: dev.authenticatorId });
let live = dev;
const rearm = async (p) => {
  await live.c.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: live.authenticatorId }).catch(() => {});
  live = await authenticator(ctx, p, deviceCreds);
};

const RESUME = process.env.FROM_R5 === '1';
if (!RESUME) {
// R1: landing page, hover the present, show the receipt
await page.goto(APP, { waitUntil: 'networkidle' });
await wait(6500); // loader tears away
if (want('r1-landing')) {
  await record(page, 'r1-landing', async () => {
    const face = page.locator('.present > div.absolute');
    await wait(500);
    await glideTo(page, face, 0.2, 0.3, 30);
    await glideTo(page, face, 0.45, 0.45, 40);
    await glideTo(page, face, 0.7, 0.55, 40);
    await glideTo(page, face, 0.5, 0.4, 30);
    await wait(500);
    await glideTo(page, page.getByRole('button', { name: 'Show the receipt' }), 0.5, 0.5, 24);
    await page.getByRole('button', { name: 'Show the receipt' }).click();
    await wait(2200);
  });
}


// R2 + R3: type the request, review, lock it
await page.goto(`${APP}/send`, { waitUntil: 'networkidle' });
await wait(800);
await record(page, 'r2-send', async () => {
  const box = page.locator('textarea');
  await glideTo(page, box, 0.3, 0.5, 26);
  await box.click();
  await box.fill('');
  await box.type('Send Alex $0.45 for a snow shovel at Hartwell Supply.', { delay: 38 });
  await wait(300);
  await glideTo(page, page.getByRole('button', { name: 'Read it' }), 0.5, 0.5, 18);
  await page.getByRole('button', { name: 'Read it' }).click();
  await page.waitForSelector('text=Lock it', { timeout: 30000 });
  await wait(900);
});
await rearm(page);
await record(page, 'r3-lock', async () => {
  const lock = page.getByRole('button', { name: /Lock it/ });
  await lock.scrollIntoViewIfNeeded();
  await wait(600);
  await glideTo(page, lock, 0.5, 0.5, 30);
  await lock.click();
  await page.waitForSelector('text=/Locked\\./i', { timeout: 120000 });
  await wait(1800);
});

// Switch to the shared Alex (not filmed), then R4: his gift is waiting
await page.goto(`${APP}/me`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Switch person' }).click();
await rearm(page);
await page.getByRole('button', { name: 'Sign in as Alex' }).click();
await page.waitForSelector('text=everyone signed in as Alex', { timeout: 30000 });
await wait(2500);
await record(page, 'r4-alex-gift', async () => {
  await wait(600);
  const card = page.locator('[role=tabpanel] a').first();
  await card.scrollIntoViewIfNeeded();
  await glideTo(page, card, 0.6, 0.5, 34);
  await wait(1800);
});

} else {
  // Resuming at the store: just switch to Alex (not filmed).
  await page.goto(`${APP}/me`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Switch person' }).click();
  await rearm(page);
  await page.getByRole('button', { name: 'Sign in as Alex' }).click();
  await page.waitForSelector('text=everyone signed in as Alex', { timeout: 30000 });
}

// R5: at Hartwell, the drill is refused; R6: just the shovel pays
await page.goto(STORE, { waitUntil: 'networkidle' });
await wait(800);
await record(page, 'r5-drill-rejected', async () => {
  for (const name of ['Add Cordless drill to cart', 'Add Snow shovel to cart']) {
    const btn = page.getByRole('button', { name });
    await btn.scrollIntoViewIfNeeded();
    await wait(300);
    await glideTo(page, btn, 0.5, 0.5, 22);
    await btn.click();
    await wait(500);
  }
  await page.goto(`${STORE}/checkout`, { waitUntil: 'networkidle' });
  await wait(700);
  const pay = page.getByRole('button', { name: /Pay with Earmark gift/ });
  await glideTo(page, pay, 0.5, 0.5, 26);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), pay.click()]);
  globalThis.__pop = pop;
  await pop.waitForLoadState('networkidle');
  await pop.locator('text=Snow shovel · from Maya').last().click({ timeout: 20000 });
  await page.waitForSelector('text=This gift only buys the snow shovel', { timeout: 30000 });
  await page.bringToFront();
  await wait(2200);
});
// The Earmark window shows the same refusal; close it, fix the cart.
await globalThis.__pop?.close().catch(() => {});
const remove = page.getByRole('button', { name: /Remove Cordless drill/i }).or(page.locator('text=Remove').first());
await remove.first().click();
await wait(800);

const credentials = deviceCreds;
await record(page, 'r6-paid', async () => {
  const pay = page.getByRole('button', { name: /Pay with Earmark gift/ });
  await glideTo(page, pay, 0.5, 0.5, 24);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), pay.click()]);
  await rearm(pop);
  await pop.waitForLoadState('networkidle');
  await pop.locator('text=Snow shovel · from Maya').last().click({ timeout: 20000 });
  await pop.getByRole('button', { name: /^Pay \$0\.40/ }).click({ timeout: 30000 });
  await page.waitForURL(/receipt/, { timeout: 120000 });
  await page.bringToFront();
  await wait(900);
  await smoothScroll(page, 220, 1200);
  await wait(1800);
});

// R7: the For stores page (install steps and snippets)
await page.goto(`${APP}/stores`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelectorAll('img').forEach((i) => /storefront/.test(i.src) && (i.style.visibility = 'hidden')));
await wait(800);
await record(page, 'r7-stores', async () => {
  await wait(700);
  const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await smoothScroll(page, Math.min(h, 1400), 3600);
  await wait(500);
  await smoothScroll(page, h, 2200);
  await wait(900);
});

// R8: Alex's profile: balance and activity
await page.goto(`${APP}/me`, { waitUntil: 'networkidle' });
await wait(2500);
await record(page, 'r8-profile', async () => {
  await wait(800);
  await glideTo(page, page.locator('#balance-title + p'), 0.6, 0.5, 30);
  await wait(900);
  await glideTo(page, page.locator('#activity-title'), 0.3, 0.5, 30);
  await wait(1600);
});

// End card: the landing hero, still
const end = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await end.goto(APP, { waitUntil: 'networkidle' });
await wait(6500);
await end.screenshot({ path: path.join(CLIPS, 'end-card.png') });
log('end-card.png');
await b.close();
