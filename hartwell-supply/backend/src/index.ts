import express, { type Router } from 'express';
import { isAddress, isHex } from 'viem';
import { earmarkRouter } from 'earmark-plugin/server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKEND_DIR, config, earmarkContract, signerKey, storeAddress, signerAddress } from './config.ts';
import { catalog } from './catalog.ts';
import { findOrder, saveOrder, type OrderLine } from './orders.ts';

const app = express();
app.disable('x-powered-by');

/* ---------- Earmark (via earmark-plugin) ----------
 * The router needs the contract address, which the contracts session publishes in
 * contracts/deployments/arc-testnet.json. Build it lazily so the store boots before that exists.
 */
let mounted: { contract: string; router: Router } | null = null;
function currentEarmarkRouter(): Router | null {
  const contract = earmarkContract();
  const privateKey = signerKey();
  if (!contract || !privateKey) return null;
  if (mounted?.contract !== contract) {
    mounted = {
      contract,
      router: earmarkRouter({
        privateKey,
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        earmark: contract,
        store: storeAddress(),
        storeSlug: 'hartwell-supply',
        catalog: () => catalog,
        storeInfo: { name: config.storeName, website: config.storeUrl },
        allowedOrigins: [config.earmarkAppUrl, config.storeUrl],
      }),
    };
    console.log(`[hartwell] Earmark ready. Contract ${contract}`);
  }
  return mounted.router;
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/earmark')) return next();
  const router = currentEarmarkRouter();
  if (router) return router(req, res, next);
  const origin = req.headers.origin;
  if (origin === config.earmarkAppUrl) res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.status(503).json({
    error: 'NOT_READY',
    message: !signerKey() ? 'Store key missing. Run npm run store-key.' : 'Earmark contract not deployed yet.',
  });
});

/* ---------- Store API ---------- */
app.use('/api', express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, store: storeAddress() ?? null, earmark: earmarkContract() ?? null });
});

app.get('/api/products', (_req, res) => {
  res.json({
    store: {
      name: config.storeName,
      website: config.storeUrl,
      address: storeAddress() ?? null,
      signer: signerAddress() ?? null,
      earmarkContract: earmarkContract() ?? null,
      earmarkAppUrl: config.earmarkAppUrl,
      signUrl: `${config.apiUrl.replace(/\/$/, '')}/earmark/sign`,
      chainId: config.chainId,
    },
    products: catalog,
  });
});

async function nameFor(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${config.earmarkApiUrl.replace(/\/$/, '')}/api/contacts`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const list = (Array.isArray(body) ? body : (body as { contacts?: unknown[] })?.contacts ?? []) as { name?: string; address?: string }[];
    const hit = list.find((c) => c?.address?.toLowerCase() === address.toLowerCase());
    return hit?.name ?? null;
  } catch {
    return null;
  }
}

const isUnits = (v: unknown): v is string => typeof v === 'string' && /^\d{1,30}$/.test(v);

app.post('/api/orders', async (req, res) => {
  const { txHash, giftId, price, change, changeTo, lines } = req.body ?? {};
  if (!isHex(txHash) || txHash.length !== 66 || !isAddress(changeTo) || !isUnits(price) || !isUnits(change) || !/^\d+$/.test(String(giftId))) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing payment details.' });
    return;
  }
  const clean: OrderLine[] = (Array.isArray(lines) ? lines : [])
    .filter((l) => l && catalog.some((p) => p.sku === l.sku))
    .map((l) => {
      const p = catalog.find((x) => x.sku === l.sku)!;
      return { sku: p.sku, name: p.name, qty: Math.max(1, Math.min(20, Number(l.qty) || 1)), price: p.price };
    });
  const order = saveOrder({
    txHash,
    giftId: String(giftId),
    price,
    change,
    changeTo,
    changeToName: await nameFor(changeTo),
    lines: clean,
    paidAt: new Date().toISOString(),
  });
  res.json(order);
});

app.get('/api/orders/:txHash', async (req, res) => {
  const order = findOrder(req.params.txHash);
  if (!order) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  if (!order.changeToName) {
    const name = await nameFor(order.changeTo);
    if (name) {
      order.changeToName = name;
      saveOrder(order);
    }
  }
  res.json(order);
});

/* ---------- production: serve the built store front from the same origin ---------- */
const DIST = resolve(BACKEND_DIR, '../frontend/dist');
if (existsSync(resolve(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|earmark\/).*/, (_req, res) => res.sendFile(resolve(DIST, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`[hartwell] backend on http://localhost:${config.port}`);
  console.log(`[hartwell] store ${storeAddress() ?? '(no key: run npm run store-key)'}`);
  if (!earmarkContract()) console.log('[hartwell] waiting for contracts/deployments/arc-testnet.json');
});
