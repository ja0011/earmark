// Screenshots of every screen of Earmark + Hartwell Supply, in story order, for motion-graphics work.
// Runs the real flow once on Arc testnet (one $0.45 test gift, shared Maya -> shared Alex).
// Output: video/screens/NN-name.png (1920x1080 at 2x = 3840x2160), mobile/ (390x844 at 3x), INDEX.md
// Usage: node video/screens/capture.mjs   (needs local servers: Earmark :5173/:8787, Hartwell :5174/:8788)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:8787';
const STORE = process.env.STORE_URL || 'http://localhost:5174';
const EXPLORER = 'https://explorer.testnet.arc.io';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// FROM_STORE=<giftId> redoes everything from the store onward (shots 29+) with that already-locked gift.
const FROM = process.env.FROM_STORE;
const FIRST_STORE_SHOT = 29;
let keep = [];
if (FROM) {
  for (const f of fs.readdirSync(DIR)) if (f.endsWith('.png') && Number(f.slice(0, 2)) >= FIRST_STORE_SHOT) fs.rmSync(path.join(DIR, f));
  for (const f of fs.readdirSync(path.join(DIR, 'mobile'))) fs.rmSync(path.join(DIR, 'mobile', f));
  const lines = fs.readFileSync(path.join(DIR, 'INDEX.md'), 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('## '));
  keep = lines.slice(at - 1, lines.findIndex((l) => l.includes(`\`${FIRST_STORE_SHOT}-`)) - 1);
} else {
  for (const f of fs.readdirSync(DIR)) if (f.endsWith('.png')) fs.rmSync(path.join(DIR, f));
  fs.rmSync(path.join(DIR, 'mobile'), { recursive: true, force: true });
  fs.mkdirSync(path.join(DIR, 'mobile'), { recursive: true });
}

let n = FROM ? FIRST_STORE_SHOT - 1 : 0;
const index = [...keep];
let chapter = '';
const section = (title) => { chapter = title; index.push(`\n## ${title}\n`); };
async function shot(page, name, what, opts = {}) {
  n += 1;
  const file = `${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(DIR, opts.dir ?? '', file), fullPage: !!opts.full, timeout: 60000 });
  index.push(`- \`${opts.dir ? opts.dir + '/' : ''}${file}\`: ${what}`);
  console.log(file);
}

async function authenticator(page, credentials = []) {
  const c = await page.context().newCDPSession(page);
  await c.send('WebAuthn.enable');
  const { authenticatorId } = await c.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  for (const cr of credentials) await c.send('WebAuthn.addCredential', { authenticatorId, credential: cr });
  return { c, authenticatorId };
}
/** One browser per person (Chrome allows one internal authenticator per browser). */
async function person(name) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  let live = await authenticator(page);
  await page.goto(`${APP}/me`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: `Sign in as ${name}` }).click();
  await page.waitForSelector(`text=everyone signed in as ${name}`, { timeout: 30000 });
  const { credentials } = await live.c.send('WebAuthn.getCredentials', { authenticatorId: live.authenticatorId });
  const rearm = async (p) => {
    await live.c.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: live.authenticatorId }).catch(() => {});
    live = await authenticator(p, credentials);
  };
  return { browser, ctx, page, rearm };
}
const lenisTo = (page, y) => page.evaluate((y) => {
  const l = window.__lenis;
  if (l) l.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}, y);
const topOf = (page, sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);

let alex, maya, M, A, giftHref;
if (!FROM) {
// ─── 1. Landing page (desktop, with motion) ───
section('1. Landing page');
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto(APP, { waitUntil: 'networkidle' });
  await wait(1200);
  await shot(page, 'landing-loader', 'Loading screen (the receipt tears away)');
  await wait(6000);
  await shot(page, 'landing-hero', 'Hero: "Money with a purpose" headline and the wrapped present');
  const face = page.locator('.present > div.absolute');
  const fb = await face.boundingBox();
  await page.mouse.move(fb.x + fb.width * 0.45, fb.y + fb.height * 0.5, { steps: 20 });
  await wait(900);
  await shot(page, 'landing-hero-hover', 'Hovering the present: a flashlight reveals the receipt inside');
  await page.getByRole('button', { name: 'Show the receipt' }).click();
  await wait(2000);
  await shot(page, 'landing-hero-receipt', '"Show the receipt": the present opens to the gift receipt');
  await page.mouse.move(10, 10);

  await lenisTo(page, (await topOf(page, '[aria-labelledby="problem-title"]')) - 60);
  await wait(2500);
  await shot(page, 'landing-problem-chat', 'The problem: Maya sends $45 for a shovel, Alex spends it on pizza');
  await lenisTo(page, (await topOf(page, '#problem-title')) - 300);
  await wait(2000);
  await shot(page, 'landing-problem-title', '"You meant a shovel." Money doesn\'t remember why you sent it');

  const vault = await topOf(page, '#how');
  for (const [i, p, what] of [[1, 0.05, 'Lock: Maya locks $45 for one shovel at one store'], [2, 0.5, 'Shop: Alex buys it at Hartwell Supply with one tap'], [3, 0.97, 'Change: the $5.02 left over goes straight to Alex']]) {
    await lenisTo(page, vault + p * 2 * 1080);
    await wait(1800);
    await shot(page, `landing-how-step${i}`, `How it works, step ${i}. ${what}`);
  }
  const rules = await topOf(page, '#rules');
  await lenisTo(page, rules);
  await wait(4500);
  await shot(page, 'landing-rules', 'The rules: only this item, only this store, only this person + the fingerprint');
  const rh = await page.evaluate(() => document.querySelector('#rules').offsetHeight);
  if (rh > 1300) {
    await lenisTo(page, rules + rh - 1080);
    await wait(2500);
    await shot(page, 'landing-rules-fingerprint', 'The rules, continued: the fingerprint hash');
  }
  await lenisTo(page, await topOf(page, '#call'));
  await wait(2500);
  await shot(page, 'landing-call', 'The call: ElevenLabs reminder ("your shovel gift expires in four days")');
  const play = page.getByRole('button', { name: /play|listen/i }).first();
  if (await play.count()) {
    await play.click().catch(() => {});
    await wait(5000);
    await shot(page, 'landing-call-playing', 'The call playing: transcript types in sync, waveform moves');
  }
  await lenisTo(page, await topOf(page, '#try'));
  await wait(2000);
  await shot(page, 'landing-try', 'Try it: links into the app');
  await lenisTo(page, 999999);
  await wait(1500);
  await shot(page, 'landing-footer', 'Footer');
  await browser.close();

  // Whole landing page as one tall image (reduced motion, so every section shows its final state)
  const b2 = await chromium.launch();
  const p2 = await b2.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await p2.goto(APP, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p2, 'landing-full-page', 'The whole landing page in one tall image (1x)', { full: true });
  await b2.close();
}

// ─── 2. Sending a gift (Maya) and the live notification (Alex) ───
section('2. Maya sends a gift');
alex = await person('Alex');
await alex.page.goto(`${APP}/me`, { waitUntil: 'networkidle' });
maya = await person('Maya');
M = maya.page;
await M.goto(`${APP}/me`, { waitUntil: 'networkidle' });
await wait(2500);
await shot(M, 'maya-profile-before', 'Maya\'s profile before sending: USDC balance, gifts, activity');
await M.evaluate(() => { localStorage.removeItem('earmark:current'); });
await M.goto(`${APP}/send`, { waitUntil: 'networkidle' });
await wait(1000);
await shot(M, 'send-signed-out', 'Send page, signed out: sign in as Maya/Alex (passkey) or connect MetaMask');
await M.getByRole('button', { name: 'Sign in as Maya' }).click();
await M.waitForSelector('text=Signed in as the shared', { timeout: 30000 });
await wait(800);
await shot(M, 'send-signed-in', 'Send page, signed in as Maya (balance chip top right)');
const box = M.locator('textarea');
await box.click();
await box.fill('');
await box.type('Send Alex $0.45 for a snow shovel at Hartwell Supply.', { delay: 20 });
await shot(M, 'send-typed', 'Maya types the gift in plain English');
await M.getByRole('button', { name: 'Read it' }).click();
await wait(700);
await shot(M, 'send-reading', 'The Claude agent reads it (finding the person, store and item)');
await M.waitForSelector('text=Lock it', { timeout: 60000 });
await wait(1200);
await shot(M, 'send-review-card', 'Review card: item, store, who, amount, expiry, fingerprint');
await maya.rearm(M);
const lock = M.getByRole('button', { name: /Lock it/ });
await lock.scrollIntoViewIfNeeded();
await lock.click();
await wait(1200);
await shot(M, 'send-locking', 'Locking: approving USDC and creating the gift on Arc');
await M.waitForSelector('text=/Locked\\./i', { timeout: 180000 });
await wait(1500);
await shot(M, 'send-locked', 'Locked: the USDC is in the Earmark contract, with the transaction link');

section('3. Alex gets the gift');
A = alex.page;
await A.bringToFront();
await A.waitForSelector('text=/sent you/i', { timeout: 60000 }).catch(() => {});
await wait(1500);
await shot(A, 'alex-notification', 'Alex\'s screen: live notification from the QuickNode Stream ("Maya sent you $0.45…")');
await A.reload({ waitUntil: 'networkidle' });
await wait(2500);
await shot(A, 'alex-profile-gift-waiting', 'Alex\'s profile: the gift is waiting for him');
giftHref = await A.locator('[role=tabpanel] a').first().getAttribute('href');
await A.goto(`${APP}${giftHref}`, { waitUntil: 'networkidle' });
await wait(2500);
await shot(A, 'gift-page', 'Gift page: what it buys, where, countdown, "Shop at Hartwell" and "Call me now"');
await shot(A, 'gift-page-full', 'Gift page, full length', { full: true });
} else {
  alex = await person('Alex');
  maya = await person('Maya');
  M = maya.page;
  A = alex.page;
  giftHref = `/gift/${FROM}`;
}

section('4. At the store (Hartwell Supply)');
await A.goto(STORE, { waitUntil: 'networkidle' });
await wait(1500);
await shot(A, 'store-home', 'Hartwell Supply: a separate store that installed the Earmark plugin');
await shot(A, 'store-home-full', 'Hartwell Supply, full catalogue', { full: true });
for (const name of ['Add Cordless drill to cart', 'Add Snow shovel to cart']) {
  const btn = A.getByRole('button', { name });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await wait(600);
}
await shot(A, 'store-cart-added', 'Alex adds a drill and the snow shovel');
await A.goto(`${STORE}/checkout`, { waitUntil: 'networkidle' });
await wait(1200);
await shot(A, 'store-checkout', 'Checkout with the "Pay with Earmark gift" button');
let [pop] = await Promise.all([alex.ctx.waitForEvent('page'), A.getByRole('button', { name: /Pay with Earmark gift/ }).click()]);
await pop.waitForLoadState('networkidle');
await wait(1500);
await shot(pop, 'popup-pick-gift', 'Earmark checkout window: pick which gift to use');
await pop.locator('text=Snow shovel · from Maya').last().click({ timeout: 20000 });
await wait(2500);
await shot(pop, 'popup-refused', 'Earmark window: refused, this gift only buys the snow shovel');
await A.bringToFront();
await A.waitForSelector('text=This gift only buys the snow shovel', { timeout: 30000 });
await wait(800);
await shot(A, 'store-refused', 'Store checkout: the drill isn\'t allowed');
await pop.close().catch(() => {});
await A.getByRole('button', { name: /Remove Cordless drill/i }).or(A.locator('text=Remove').first()).first().click();
await wait(900);
await shot(A, 'store-checkout-shovel', 'Drill removed: just the $0.40 shovel');
[pop] = await Promise.all([alex.ctx.waitForEvent('page'), A.getByRole('button', { name: /Pay with Earmark gift/ }).click()]);
await alex.rearm(pop);
await pop.waitForLoadState('networkidle');
await pop.locator('text=Snow shovel · from Maya').last().click({ timeout: 20000 });
const payBtn = pop.getByRole('button', { name: /^Pay \$0\.40/ });
await payBtn.waitFor({ timeout: 30000 });
await wait(1000);
await shot(pop, 'popup-confirm', 'Earmark window: store signed the real price. Pay $0.40, $0.05 change to Alex');
await payBtn.click();
await wait(1500);
await shot(pop, 'popup-paying', 'Paying: redeeming the gift on Arc').catch(() => {});
await A.waitForURL(/receipt/, { timeout: 180000 });
await A.bringToFront();
await wait(2500);
await shot(A, 'store-receipt', 'Store receipt: paid with the Earmark gift, change to Alex, transaction link');
await shot(A, 'store-receipt-full', 'Store receipt, full length', { full: true });

section('5. After: change, profiles and activity');
await A.goto(`${APP}${giftHref}`, { waitUntil: 'networkidle' });
await wait(2500);
await shot(A, 'gift-page-bought', 'Gift page after: Bought, $0.05 change went to Alex');
await A.goto(`${APP}/me`, { waitUntil: 'networkidle' });
await wait(3000);
await shot(A, 'alex-profile-after', 'Alex\'s profile: balance up by the change, activity timeline');
await shot(A, 'alex-profile-after-full', 'Alex\'s profile, full length', { full: true });
await M.bringToFront();
await M.goto(`${APP}/me`, { waitUntil: 'networkidle' });
await wait(3000);
await shot(M, 'maya-profile-after', 'Maya\'s profile: "Alex bought the shovel", gift marked Bought');
await M.getByRole('tab', { name: /You sent/ }).click().catch(() => {});
await wait(1000);
await shot(M, 'maya-profile-sent', 'Maya\'s "You sent" tab');

section('6. USDC transactions on Arc (explorer)');
const giftId = giftHref.split('/').pop();
let created, spent;
for (let i = 0; i < 20 && !(created && spent); i++) {
  const act = await (await fetch(`${API}/api/activity?address=0x643cA42D50193A79F8df4a4510007d8CAF41E215`)).json();
  created = act.activity.find((a) => a.giftId === giftId && a.kind !== 'spent' && a.txHash);
  spent = act.activity.find((a) => a.giftId === giftId && a.kind === 'spent' && a.txHash);
  if (!(created && spent)) await wait(3000);
}
for (const [name, tx, what] of [['explorer-create-gift', created?.txHash, 'Arc explorer: createGift, $0.45 USDC moves from Maya into the Earmark contract'], ['explorer-redeem', spent?.txHash, 'Arc explorer: redeem, $0.40 USDC to the store and $0.05 change to Alex']]) {
  if (!tx) { console.warn(`no tx for ${name}`); continue; }
  await A.goto(`${EXPLORER}/tx/${tx}`, { waitUntil: 'load' }).catch(() => {});
  await wait(6000);
  await shot(A, name, `${what} (${tx})`);
  await shot(A, `${name}-full`, `${what}, full page`, { full: true });
  const tt = A.getByRole('tab', { name: /token transfers/i }).or(A.locator('text=Token transfers').first());
  if (await tt.count()) {
    await tt.first().click().catch(() => {});
    await wait(3500);
    await shot(A, `${name}-transfers`, `${what}: token transfers tab`);
  }
}
await A.goto(`${EXPLORER}/address/0x9d91F4ee5FfAd6A31d662801B695514770C4D0BD`, { waitUntil: 'load' }).catch(() => {});
await wait(6000);
await shot(A, 'explorer-contract', 'Arc explorer: the Earmark contract and its transactions');

section('7. For stores');
await A.goto(`${APP}/stores`, { waitUntil: 'networkidle' });
await wait(1500);
await shot(A, 'stores-top', 'For stores: "Add Earmark in under an hour"');
const sh = await A.evaluate(() => document.documentElement.scrollHeight);
for (let y = 900, i = 1; y < sh - 400; y += 900, i++) {
  await A.evaluate((y) => scrollTo(0, y), y);
  await wait(800);
  await shot(A, `stores-step${i}`, `For stores, scrolled (${i}): connect, button snippet, signer snippet`);
}
await shot(A, 'stores-full', 'For stores, full page', { full: true });
await alex.browser.close();
await maya.browser.close();

// ─── 8. Phone size ───
section('8. Phone size (390x844)');
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'networkidle' });
  await wait(7000);
  await shot(p, 'm-landing-hero', 'Phone: landing hero', { dir: 'mobile' });
  for (const [sel, name, what] of [['[aria-labelledby="problem-title"]', 'm-landing-chat', 'Phone: the chat'], ['#how', 'm-landing-how', 'Phone: how it works'], ['#rules', 'm-landing-rules', 'Phone: the rules'], ['#call', 'm-landing-call', 'Phone: the call']]) {
    await lenisTo(p, await topOf(p, sel));
    await wait(2500);
    await shot(p, name, what, { dir: 'mobile' });
  }
  for (const [route, name, what] of [['/send', 'm-send', 'Phone: send page'], ['/me', 'm-profile', 'Phone: profile sign-in'], ['/stores', 'm-stores', 'Phone: for stores']]) {
    await p.goto(APP + route, { waitUntil: 'networkidle' });
    await wait(1500);
    await shot(p, name, what, { dir: 'mobile' });
  }
  await p.goto(STORE, { waitUntil: 'networkidle' });
  await wait(1500);
  await shot(p, 'm-store', 'Phone: Hartwell Supply', { dir: 'mobile' });
  await browser.close();
}

fs.writeFileSync(path.join(DIR, 'INDEX.md'), `# Earmark screens, in order

Every screen of Earmark and Hartwell Supply, captured from the real site running one live $0.45 gift on Arc testnet (Maya → Alex).
Desktop shots are 3840×2160 (1920×1080 at 2x). Phone shots are in \`mobile/\` at 1170×2532 (390×844 at 3x). "full" files are whole-page tall images.
Regenerate: \`node video/screens/capture.mjs\` (spends one $0.45 test gift).
${index.join('\n')}
`);
console.log(`done: ${n} screenshots`);
