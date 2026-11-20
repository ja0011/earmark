/**
 * A throwaway local store for testing earmark-plugin end to end without Hartwell Supply:
 * mounts earmarkRouter with a fresh key, registers it on the local chain, and serves a plain-JS checkout
 * page that speaks the popup protocol. Local anvil only.
 */
import express from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { earmarkRouter, registerWithEarmark } from 'earmark-plugin/server';

const PORT = Number(process.env.STORE_PORT ?? 9788);
const APP = process.env.EARMARK_APP_URL ?? 'http://localhost:5273';
const API = process.env.EARMARK_API_URL ?? 'http://localhost:9787';
const rpcUrl = process.env.LOCAL_RPC ?? 'http://127.0.0.1:8545';
const dep = JSON.parse(readFileSync(resolve(import.meta.dirname, '../.local/deployment.json'), 'utf8'));
const key = generatePrivateKey();
const signer = privateKeyToAccount(key).address;
const catalog = [
  { sku: 'snow-shovel', name: 'SNOW SHOVEL', price: '39980000' },
  { sku: 'ice-scraper', name: 'ICE SCRAPER', price: '8490000' },
  { sku: 'work-gloves', name: 'INSULATED WORK GLOVES', price: '24990000' },
  { sku: 'rock-salt', name: 'ROCK SALT 20 LB', price: '12990000' },
  { sku: 'claw-hammer', name: 'CLAW HAMMER', price: '19980000' },
  { sku: 'cordless-drill', name: 'CORDLESS DRILL', price: '89000000' },
];

const app = express();
app.use(earmarkRouter({ privateKey: key, rpcUrl, chainId: dep.chainId, earmark: dep.earmark, catalog, storeSlug: 'hartwell-supply', storeInfo: { name: 'Hartwell Supply', website: `http://localhost:${PORT}` }, allowedOrigins: [APP] }));
app.get('/checkout.html', (_req, res) => {
  res.type('html').send(`<!doctype html><meta charset=utf-8><title>Test checkout</title>
<h1>Test checkout</h1><p id=cart></p><button id=pay>Pay with Earmark gift</button><button id=fix>Remove the drill</button><pre id=out></pre>
<script>
const EARMARK = ${JSON.stringify(APP)};
let cart = [{ sku: 'snow-shovel', qty: 1, name: 'SNOW SHOVEL', price: '39980000' }, { sku: 'cordless-drill', qty: 1, name: 'CORDLESS DRILL', price: '89000000' }];
const show = () => (document.getElementById('cart').textContent = cart.map(l => l.name).join(', '));
show();
let popup = null;
const send = () => popup && popup.postMessage({ type: 'earmark:cart', store: ${JSON.stringify(signer)}, cart, signUrl: location.origin + '/earmark/sign' }, EARMARK);
window.addEventListener('message', (e) => {
  if (e.origin !== EARMARK || e.source !== popup) return;
  document.getElementById('out').textContent += JSON.stringify(e.data) + '\\n';
  if (e.data.type === 'earmark:ready') send();
});
document.getElementById('pay').onclick = () => {
  if (popup && !popup.closed) { send(); popup.focus(); return; }
  popup = window.open(EARMARK + '/pay?store=${signer}&origin=' + encodeURIComponent(location.origin), 'earmark', 'width=440,height=720');
};
document.getElementById('fix').onclick = () => { cart = cart.filter(l => l.sku !== 'cordless-drill'); show(); };
</script>`);
});

app.listen(PORT, async () => {
  console.log(`[demo-store] http://localhost:${PORT} signer ${signer}`);
  // Register on chain (owner key via the Earmark server) and in Earmark's directory.
  const r = await fetch(`${API}/api/stores/register-onchain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store: signer, signer }) });
  console.log('[demo-store] register-onchain', r.status, await r.text());
  console.log('[demo-store] directory', await registerWithEarmark({ earmarkApi: API, name: 'Hartwell Supply', website: `http://localhost:${PORT}`, store: signer, signer, catalogUrl: `http://localhost:${PORT}/earmark/catalog`, signUrl: `http://localhost:${PORT}/earmark/sign` }).then((x) => x.onchain));
});
