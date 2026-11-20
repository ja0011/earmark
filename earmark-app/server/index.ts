import express, { type NextFunction, type Request, type Response } from 'express';
import { getAddress, isAddress, parseEther, zeroAddress, type Address, type Hex } from 'viem';
import { earmarkAbi, erc20Abi } from 'earmark-plugin';
import {
  ANTHROPIC_API_KEY,
  AGENT_ENABLED,
  CALL_MODE,
  DEPLOYER_PRIVATE_KEY,
  ELEVENLABS_TOOL_SECRET,
  EARMARK_APP_URL,
  EXPLORER,
  HARTWELL_API_URL,
  HARTWELL_URL,
  PORT,
  QUICKNODE_ENABLED,
  RPC_URL,
  deployment,
  tryDeployment,
} from './config';
import { db, save } from './db';
import { allGifts, changeLimit, ownerWallet, pub, readGift, same, storeSigner, usdcBalance } from './chain';
import { ensureHartwell, contactByAddress, publicContact, storeByAddress, upsertContact, upsertStore, fetchCatalog } from './directory';
import { giftJson } from './gifts';
import { AgentError, parseGift } from './agent';
import { quicknodeRouter, startPoller } from './quicknode';
import { sseHandler } from './sse';
import { browserSession, createPurchaseRequest, placeCall, startReminders } from './calls';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './config';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// QuickNode needs the raw body for signature checks, so it is mounted before express.json().
app.use(quicknodeRouter());
app.use(express.json({ limit: '64kb' }));

// The Earmark app is served from its own origin; allow it (and the store, which calls /api/stores) to call us.
const ALLOWED = new Set([EARMARK_APP_URL, HARTWELL_URL, HARTWELL_API_URL]);
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && ALLOWED.has(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return void res.status(204).end();
  next();
});

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

// Simple per-key limiter for routes that spend the owner's funds.
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

const needAddress = (v: unknown, field: string): Address => {
  if (typeof v !== 'string' || !isAddress(v)) throw Object.assign(new Error(`${field} must be an address`), { status: 400 });
  return getAddress(v);
};

// ---------------------------------------------------------------- config + RPC

app.get('/api/config', h(async (_req, res) => {
  const dep = tryDeployment();
  let limit = '10000000';
  if (dep) limit = (await changeLimit().catch(() => 10_000_000n)).toString();
  res.json({
    ready: Boolean(dep),
    error: dep ? null : (() => { try { deployment(); } catch (e) { return (e as Error).message; } })(),
    chainId: dep?.chainId ?? 5042002,
    earmark: dep?.earmark ?? null,
    usdc: dep?.usdc ?? null,
    explorer: EXPLORER,
    changeLimit: limit,
    hartwellUrl: HARTWELL_URL,
    features: {
      agent: ANTHROPIC_API_KEY ? 'claude' : 'rules',
      events: QUICKNODE_ENABLED ? 'quicknode' : 'poller',
      calls: CALL_MODE,
      faucet: Boolean(DEPLOYER_PRIVATE_KEY),
    },
  });
}));

// Browser JSON-RPC goes through here (no CORS surprises, one place to change RPC).
const RPC_METHODS = /^(eth_(chainId|blockNumber|call|estimateGas|gasPrice|maxPriorityFeePerGas|feeHistory|getBalance|getCode|getTransactionCount|getTransactionReceipt|getTransactionByHash|getBlockByNumber|getBlockByHash|getLogs|sendRawTransaction|fillTransaction|createAccessList|blobBaseFee)|net_version)$/;
app.post('/api/rpc', h(async (req, res) => {
  const body = req.body;
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 20 || !calls.every((c) => c && typeof c.method === 'string' && RPC_METHODS.test(c.method))) {
    console.warn('[rpc] blocked', calls.map((c) => c?.method).join(','));
    return res.status(400).json({ jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32601, message: 'method not allowed' } });
  }
  const upstream = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  res.status(upstream.status).type('application/json').send(await upstream.text());
}));

// ---------------------------------------------------------------- contacts

app.get('/api/contacts', (_req, res) => res.json({ contacts: db.contacts.map(publicContact) }));
app.post('/api/contacts', h((req, res) => {
  const c = upsertContact({ name: String(req.body?.name ?? ''), address: String(req.body?.address ?? ''), phone: undefined });
  res.json({ ok: true, contact: publicContact(c) });
}));

// ---------------------------------------------------------------- stores

app.get('/api/stores', h(async (_req, res) => {
  await ensureHartwell();
  res.json({ stores: db.stores });
}));

app.post('/api/stores', h(async (req, res) => {
  const b = req.body ?? {};
  const rec = upsertStore({
    name: String(b.name ?? ''),
    website: String(b.website ?? ''),
    store: String(b.store ?? '') as Address,
    signer: String(b.signer ?? b.store ?? '') as Address,
    catalogUrl: b.catalogUrl ? String(b.catalogUrl) : undefined,
    signUrl: b.signUrl ? String(b.signUrl) : undefined,
    enabledSkus: Array.isArray(b.enabledSkus) ? b.enabledSkus.map(String) : undefined,
    slug: b.slug ? String(b.slug) : undefined,
  });
  let onchain = false;
  if (tryDeployment()) onchain = same(await storeSigner(rec.store).catch(() => zeroAddress), rec.signer);
  res.json({ ok: true, store: rec, onchain });
}));

app.get('/api/stores/catalog', h(async (req, res) => {
  const url = String(req.query.url ?? '');
  if (!/^https?:\/\/[^\s]+\/earmark\/catalog$/.test(url)) return res.status(400).json({ error: 'BAD_URL', message: 'Use the full URL ending in /earmark/catalog.' });
  try {
    res.json(await fetchCatalog(url, 5_000));
  } catch (e) {
    res.status(502).json({ error: 'CATALOG_DOWN', message: `Couldn't read that catalogue: ${(e as Error).message}` });
  }
}));

app.post('/api/stores/register-onchain', h(async (req, res) => {
  const store = needAddress(req.body?.store, 'store');
  const signer = needAddress(req.body?.signer ?? req.body?.store, 'signer');
  deployment();
  const current = await storeSigner(store);
  if (same(current, signer)) return res.json({ ok: true, already: true });
  if (current !== zeroAddress) return res.status(409).json({ error: 'ALREADY_REGISTERED', message: 'That store already has a key. Rotate it from the owner console.' });
  if (limited(`reg:${req.ip}`, 5, 3_600_000)) return res.status(429).json({ error: 'SLOW_DOWN', message: 'Too many registrations. Try again later.' });
  const wallet = ownerWallet();
  if (!wallet) return res.status(503).json({ error: 'NO_OWNER_KEY', message: 'The Earmark owner key is not configured on this server (DEPLOYER_PRIVATE_KEY).' });
  const hash = await wallet.writeContract({ address: deployment().earmark, abi: earmarkAbi, functionName: 'registerStore', args: [store, signer], chain: wallet.chain, account: wallet.account! });
  const receipt = await pub().waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') return res.status(502).json({ error: 'REVERTED', message: 'registerStore reverted.', txHash: hash });
  const rec = storeByAddress(store);
  if (rec) upsertStore({ ...rec, onchainTx: hash });
  res.json({ ok: true, txHash: hash });
}));

// ---------------------------------------------------------------- agent

app.post('/api/agent/parse', h(async (req, res) => {
  if (limited(`agent:${req.ip}`, 30, 60_000)) return res.status(429).json({ error: 'SLOW_DOWN', message: 'Give it a second.' });
  try {
    const sender = typeof req.body?.sender === 'string' && isAddress(req.body.sender) ? getAddress(req.body.sender) : undefined;
    res.json(await parseGift(String(req.body?.text ?? ''), sender));
  } catch (e) {
    if (e instanceof AgentError) return res.status(e.status).json({ error: e.code, message: e.message });
    throw e;
  }
}));

// ---------------------------------------------------------------- gifts

app.get('/api/gifts', h(async (req, res) => {
  deployment();
  const receiver = typeof req.query.receiver === 'string' ? req.query.receiver : undefined;
  const sender = typeof req.query.sender === 'string' ? req.query.sender : undefined;
  const store = typeof req.query.store === 'string' ? req.query.store : undefined;
  let gifts = await allGifts();
  if (receiver) gifts = gifts.filter((g) => same(g.receiver, receiver));
  if (sender) gifts = gifts.filter((g) => same(g.sender, sender));
  if (store) gifts = gifts.filter((g) => same(g.store, store));
  res.json({ gifts: await Promise.all(gifts.slice(0, 50).map(giftJson)) });
}));

app.get('/api/gifts/:id', h(async (req, res) => {
  deployment();
  const id = String(req.params.id);
  if (!/^\d{1,12}$/.test(id)) return res.status(400).json({ error: 'BAD_ID' });
  const g = await readGift(BigInt(id), req.query.fresh === '1');
  if (!g) return res.status(404).json({ error: 'NOT_FOUND', message: 'No gift with that number.' });
  res.json({ gift: await giftJson(g) });
}));

// ---------------------------------------------------------------- notifications

app.get('/api/events', sseHandler);
app.get('/api/notifications', (req, res) => {
  const a = String(req.query.address ?? '');
  res.json({ notifications: db.notifications.filter((n) => same(n.address, a)).slice(-20).reverse() });
});

// ---------------------------------------------------------------- calls + purchase requests

app.post('/api/calls/now', h(async (req, res) => {
  const id = String(req.body?.giftId ?? '');
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'BAD_ID' });
  if (limited(`call:${id}`, 3, 10 * 60_000)) return res.status(429).json({ error: 'SLOW_DOWN', message: 'That gift was just called. Try again in a few minutes.' });
  const g = await readGift(BigInt(id), true);
  if (!g) return res.status(404).json({ error: 'NOT_FOUND' });
  if (g.status !== 1) return res.status(409).json({ error: 'NOT_LOCKED', message: 'This gift has already been used.' });
  res.json(await placeCall(g, 'now'));
}));

/** Browser call with the same agent: mints a conversation token; the ElevenLabs key never reaches the browser. */
app.get('/api/calls/session', h(async (req, res) => {
  const id = String(req.query.giftId ?? '');
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'BAD_ID' });
  if (!AGENT_ENABLED) return res.status(503).json({ error: 'DEMO_MODE', message: 'The call is in demo mode. Playing the recorded sample.' });
  if (limited(`session:${req.ip}`, 12, 10 * 60_000)) return res.status(429).json({ error: 'SLOW_DOWN', message: 'Too many calls. Try again in a few minutes.' });
  const g = await readGift(BigInt(id), true);
  if (!g) return res.status(404).json({ error: 'NOT_FOUND' });
  if (g.status !== 1) return res.status(409).json({ error: 'NOT_LOCKED', message: 'This gift has already been used.' });
  res.json(await browserSession(g));
}));

/** ElevenLabs agent server tool: the receiver said yes on the call. */
app.post('/api/agent/purchase-request', h(async (req, res) => {
  const b = req.body ?? {};
  // source: "browser" (the agent's client tool in the gift page), "demo" (recorded sample), else the phone webhook.
  const source = b.source === 'demo' ? 'demo' : b.source === 'browser' ? 'browser' : 'call';
  if (source === 'call' && ELEVENLABS_TOOL_SECRET && req.headers['x-earmark-tool-secret'] !== ELEVENLABS_TOOL_SECRET) {
    return res.status(401).json({ error: 'BAD_SECRET' });
  }
  if (source === 'demo' && AGENT_ENABLED) return res.status(400).json({ error: 'LIVE_MODE', message: 'The agent is live; it creates purchase requests.' });
  const { request, item } = await createPurchaseRequest(b.gift_id ?? b.giftId, source);
  const who = contactByAddress(request.receiver)?.name;
  res.json({ ok: true, request, message: `Requested the ${(item?.name ?? 'item').toLowerCase()}. ${who ? `${who} approves` : 'Approve'} it in the Earmark app with a passkey. Nothing is bought until then.` });
}));

app.get('/api/purchase-requests', (req, res) => {
  const r = String(req.query.receiver ?? '');
  const g = String(req.query.gift ?? '');
  res.json({ requests: db.purchaseRequests.filter((p) => (r ? same(p.receiver, r) : true) && (g ? p.giftId === g : true) && p.status === 'pending') });
});

app.post('/api/purchase-requests/:id', h(async (req, res) => {
  const pr = db.purchaseRequests.find((p) => p.id === req.params.id);
  if (!pr) return res.status(404).json({ error: 'NOT_FOUND' });
  const status = req.body?.status;
  if (status === 'declined') pr.status = 'declined';
  else if (status === 'done' && typeof req.body?.txHash === 'string') {
    // Only mark done once the chain agrees.
    const g = await readGift(BigInt(pr.giftId), true);
    if (g?.status === 2) {
      pr.status = 'done';
      pr.txHash = req.body.txHash as Hex;
    }
  }
  save();
  res.json({ ok: true, request: pr });
}));

// ---------------------------------------------------------------- demo faucet

app.post('/api/demo/fund', h(async (req, res) => {
  const address = needAddress(req.body?.address, 'address');
  const role = req.body?.role === 'Maya' || req.body?.role === 'maya' ? 'maya' : 'alex';
  const dep = deployment();
  const wallet = ownerWallet();
  if (!wallet) {
    return res.status(503).json({ error: 'FAUCET_NOT_CONFIGURED', message: 'The demo faucet is off. Get test USDC at faucet.circle.com (Arc Testnet).' });
  }
  const local = dep.chainId === 31337;
  const key = `${address.toLowerCase()}:${role}`;
  if (!local && limited(`fund:${req.ip}`, 6, 3_600_000)) return res.status(429).json({ error: 'SLOW_DOWN', message: 'The faucet needs a break. Try again later.' });

  const client = pub();
  const txs: Hex[] = [];
  const account = wallet.account!;
  // Arc: native gas IS USDC, and the ERC-20 at 0x3600… reads the same balance (6 decimals).
  const gasTarget = parseEther('0.02'); // ~8 txs at Arc's 25 gwei
  const native = await client.getBalance({ address });
  if (role === 'maya') {
    const bal = await usdcBalance(address);
    const want = 500_000n; // $0.50: the $0.45 demo gift + gas
    if (bal < 460_000n) {
      if (local) {
        txs.push(await wallet.writeContract({ address: dep.usdc, abi: [{ type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] }] as const, functionName: 'mint', args: [address, want - bal], chain: wallet.chain, account }));
      } else {
        txs.push(await wallet.writeContract({ address: dep.usdc, abi: erc20Abi, functionName: 'transfer', args: [address, want - bal], chain: wallet.chain, account }));
      }
    }
  }
  if ((local || role === 'alex') && native < gasTarget / 2n) {
    txs.push(await wallet.sendTransaction({ to: address, value: gasTarget - native, chain: wallet.chain, account }));
  }
  if (!txs.length) return res.json({ ok: true, already: true, message: 'This wallet already has enough.' });
  for (const t of txs) {
    const r = await client.waitForTransactionReceipt({ hash: t, timeout: 60_000 });
    if (r.status !== 'success') return res.status(502).json({ error: 'REVERTED', message: 'The top-up failed on chain.', txHashes: txs });
  }
  db.funded[key] = Date.now();
  save();
  res.json({ ok: true, txHashes: txs });
}));

// ---------------------------------------------------------------- production: serve the built site

const DIST = resolve(ROOT, 'dist');
if (existsSync(resolve(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|webhooks\/).*/, (_req, res) => res.sendFile(resolve(DIST, 'index.html')));
}

// ---------------------------------------------------------------- errors

app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[server]', err?.shortMessage ?? err?.message ?? err);
  res.status(status).json({ error: err?.code && typeof err.code === 'string' ? err.code : 'ERROR', message: err?.shortMessage ?? err?.message ?? 'Something went wrong.' });
});

app.listen(PORT, () => {
  const dep = tryDeployment();
  console.log(`[earmark] server on http://localhost:${PORT}`);
  console.log(`[earmark] contract: ${dep ? dep.earmark : 'NOT DEPLOYED (contracts/deployments/arc-testnet.json missing)'} | agent: ${ANTHROPIC_API_KEY ? 'claude' : 'rules'} | events: ${QUICKNODE_ENABLED ? 'quicknode' : 'poller'} | calls: ${CALL_MODE}`);
  startPoller().catch((e) => console.error('[events]', e));
  startReminders();
  ensureHartwell().catch(() => {});
});
