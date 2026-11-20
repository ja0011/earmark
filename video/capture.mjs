#!/usr/bin/env node
// Captures the real Earmark + Hartwell UI for the demo video into video/captures/.
// Spends ONE real testnet gift: Maya sends Alex $0.45 for a snow shovel; Alex tries drill + shovel
// (rejected), removes the drill and pays $0.40 ($0.05 change).
//   APP=http://localhost:5173 STORE=http://localhost:5174 node video/capture.mjs
// Only needed to refresh the screenshots; render.mjs uses the PNGs already in captures/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'captures');
const APP = process.env.APP || 'http://localhost:5173';
const STORE = process.env.STORE || 'http://localhost:5174';
const ONLY = process.env.ONLY; // e.g. ONLY=static to skip the paid flow
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (p, name, full = false) => p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }).then(() => log('shot', name));

const b = await chromium.launch();
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function device(ctx, page) {
  const c = await ctx.newCDPSession(page);
  await c.send('WebAuthn.enable');
  const { authenticatorId } = await c.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { c, authenticatorId };
}
async function signIn(opts, who) {
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  const dev = await device(ctx, page);
  await page.goto(`${APP}/me`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: `Sign in as ${who}` }).click();
  await page.waitForSelector('text=Shared demo account', { timeout: 30000 });
  await sleep(2500);
  return { ctx, page, dev };
}

// Static pages first (no money moves).
{
  const ctx = await b.newContext(DESK);
  const p = await ctx.newPage();
  await p.goto(`${APP}/stores`, { waitUntil: 'networkidle' });
  await sleep(2000);
  // The storefront photo has a passer-by in it; the video shows no people, so hide it for the capture.
  await p.addStyleTag({ content: 'img[alt^="A small hardware store"], img[alt^="A small hardware store"] + *, [aria-label^="A small hardware store"] { visibility: hidden !important; }' });
  await p.evaluate(() => { const i = document.querySelector('img[alt^="A small hardware store"]'); let e = i; for (let k = 0; k < 3 && e; k++) { e.style.visibility = 'hidden'; e = e.parentElement; if (e?.tagName === 'DIV' && e.parentElement?.children.length > 1) { e.style.visibility = 'hidden'; break; } } });
  await sleep(300);
  const rects = await p.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; };
    return {
      steps: [...document.querySelectorAll('ol > li')].slice(0, 4).map((li) => ({ li: r(li), dot: r(li.querySelector(':scope > span')), title: r(li.querySelector('h2')) })),
      code: [...document.querySelectorAll('pre')].map((pre) => r(pre.parentElement)),
      page: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    };
  });
  fs.writeFileSync(path.join(OUT, 'stores-rects.js'), `window.STORES_RECTS = ${JSON.stringify(rects)};\n`);
  await shot(p, 'd-stores');
  await shot(p, 'd-stores-full', true);
  await ctx.close();
}
if (ONLY === 'static') { await b.close(); process.exit(0); }

const maya = await signIn(DESK, 'Maya');
const alexPhone = await signIn(PHONE, 'Alex');
const alex = await signIn(DESK, 'Alex');
log('Maya balance', await maya.page.locator('#balance-title + p').textContent().catch(() => '?'));
await shot(alexPhone.page, 'p-profile-before');

// Watch Alex's phone for the "Maya sent you" toast.
let toastShot = false;
const watcher = (async () => {
  for (let i = 0; i < 400 && !toastShot; i++) {
    const t = await alexPhone.page.locator('div[aria-live="polite"] > div').first().innerText({ timeout: 300 }).catch(() => '');
    if (/sent you/i.test(t)) {
      await sleep(700);
      await shot(alexPhone.page, 'p-toast');
      log('toast:', t.replace(/\s+/g, ' '));
      toastShot = true;
    }
    await sleep(250);
  }
})();

// Maya: Send page empty, review, locked. SKIP_SEND=1 resumes after a gift was already sent.
let links = [];
if (!process.env.SKIP_SEND) {
const M = maya.page;
await M.goto(`${APP}/send`, { waitUntil: 'networkidle' });
await sleep(1200);
await shot(M, 'd-send-empty');
await M.locator('textarea').fill('Send Alex $0.45 for a snow shovel at Hartwell Supply.');
await M.getByRole('button', { name: 'Read it' }).click();
await M.waitForSelector('text=Lock it', { timeout: 60000 });
await sleep(1200);
await shot(M, 'd-send-review');
await M.getByRole('button', { name: /Lock it/ }).click();
await M.waitForSelector('text=/Locked\\./i', { timeout: 120000 });
await sleep(1500);
await shot(M, 'd-send-locked');
links = await M.$$eval('a[href*="tx"]', (as) => as.map((a) => a.href));
log('lock tx links', links.join(' '));
fs.writeFileSync(path.join(OUT, 'tx.json'), JSON.stringify({ lock: links }, null, 1));

} else toastShot = true;
await watcher;
if (!toastShot) log('WARN no toast seen');
await alexPhone.page.reload({ waitUntil: 'networkidle' });
await sleep(3000);
await shot(alexPhone.page, 'p-profile-after');

// Alex (desktop): drill + shovel at Hartwell, rejected.
const A = alex.page;
await A.goto(STORE, { waitUntil: 'networkidle' });
await sleep(1500);
await A.getByRole('button', { name: /Add .*drill.* to cart/i }).first().click();
await sleep(800);
if (await A.getByRole('button', { name: 'Close cart' }).isVisible().catch(() => false)) await A.getByRole('button', { name: 'Close cart' }).click();
await sleep(500);
await A.getByRole('button', { name: /Add .*shovel.* to cart/i }).first().click();
await sleep(800);
await A.goto(`${STORE}/checkout`, { waitUntil: 'networkidle' });
await sleep(2000);
await shot(A, 'd-checkout-two');
const { credentials } = await alex.dev.c.send('WebAuthn.getCredentials', { authenticatorId: alex.dev.authenticatorId });
const openPopup = async () => {
  const [pop] = await Promise.all([alex.ctx.waitForEvent('page'), A.getByRole('button', { name: /Pay with Earmark gift/ }).click()]);
  const pd = await device(alex.ctx, pop);
  for (const cr of credentials) await pd.c.send('WebAuthn.addCredential', { authenticatorId: pd.authenticatorId, credential: cr });
  await pop.waitForLoadState('networkidle');
  await sleep(3000);
  // Alex may hold more than one shovel gift: pick the newest (first) one.
  const radios = pop.getByRole('radio');
  if (await radios.count()) { await radios.first().check(); await sleep(2500); }
  return pop;
};
let pop = await openPopup();
log('popup size', JSON.stringify(pop.viewportSize()));
await shot(pop, 'd-popup-rejected');
log('popup text', (await pop.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300));
await sleep(1500);
await shot(A, 'd-checkout-rejected');
await pop.close().catch(() => {});
await sleep(1000);

// Remove the drill, then pay.
await A.getByRole('button', { name: /Remove Cordless drill/i }).click();
await sleep(1500);
await shot(A, 'd-checkout-shovel');
log('checkout now', (await A.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300));
pop = await openPopup();
await shot(pop, 'd-popup-ready');
await pop.getByRole('button', { name: /^Pay \$0\.40/ }).click({ timeout: 30000 });
await sleep(1200);
await shot(pop, 'd-popup-paying').catch(() => {});
await A.waitForURL(/receipt/, { timeout: 120000 });
await sleep(2000);
await shot(A, 'd-receipt');
await shot(A, 'd-receipt-full', true);
const rlinks = await A.$$eval('a[href*="tx"]', (as) => as.map((a) => a.href));
log('receipt text', (await A.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400));
log('receipt links', rlinks.join(' '));
fs.writeFileSync(path.join(OUT, 'tx.json'), JSON.stringify({ lock: links, pay: rlinks }, null, 1));

await alexPhone.page.reload({ waitUntil: 'networkidle' });
await sleep(3000);
await shot(alexPhone.page, 'p-profile-spent');
await A.goto(`${APP}/me`, { waitUntil: 'networkidle' });
await sleep(3000);
await shot(A, 'd-profile-alex');
await b.close();
