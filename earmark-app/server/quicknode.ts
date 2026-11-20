// QuickNode Streams destination + a viem poller fallback when no Stream is configured.
import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { type Router } from 'express';
import type { Hex } from 'viem';
import { earmarkAbi } from 'earmark-plugin';
import { QUICKNODE_ENABLED, QUICKNODE_STREAM_TOKEN, deployment, tryDeployment } from './config';
import { db, save } from './db';
import { pub } from './chain';
import { handleLog, type RawLog } from './events';

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verifies the optional Stream security token. QuickNode signs each delivery with
 * HMAC-SHA256(token, nonce + timestamp + body) in x-qn-signature. A plain x-qn-token /
 * Bearer header equal to the token is also accepted for manual testing.
 */
function verify(headers: Record<string, any>, raw: string): boolean {
  if (!QUICKNODE_STREAM_TOKEN) return true;
  const sig = headers['x-qn-signature'];
  const nonce = headers['x-qn-nonce'];
  const ts = headers['x-qn-timestamp'];
  if (sig && nonce && ts) {
    const expected = createHmac('sha256', QUICKNODE_STREAM_TOKEN).update(String(nonce) + String(ts) + raw).digest('hex');
    if (safeEq(expected, String(sig))) return true;
  }
  const token = headers['x-qn-token'] ?? String(headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
  return Boolean(token) && safeEq(String(token), QUICKNODE_STREAM_TOKEN);
}

/** Finds log objects anywhere in a Stream payload: filtered output, raw receipts, or raw logs. */
export function extractLogs(payload: unknown): RawLog[] {
  const out: RawLog[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 8 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, any>;
    if (typeof o.address === 'string' && Array.isArray(o.topics) && typeof o.data === 'string' && o.transactionHash) {
      out.push({ address: o.address as string, topics: o.topics, data: o.data as Hex, transactionHash: o.transactionHash as Hex, logIndex: o.logIndex ?? 0, blockNumber: o.blockNumber });
      return;
    }
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  walk(payload, 0);
  return out;
}

export function quicknodeRouter(): Router {
  const r = express.Router();
  r.post('/webhooks/quicknode', express.raw({ type: '*/*', limit: '5mb' }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!verify(req.headers, raw)) {
      res.status(401).json({ error: 'BAD_TOKEN' });
      return;
    }
    let payload: unknown;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      res.status(400).json({ error: 'BAD_JSON' });
      return;
    }
    if (!tryDeployment()) {
      res.status(200).json({ ok: true, processed: 0, note: 'not deployed' });
      return;
    }
    const logs = extractLogs(payload);
    let processed = 0;
    for (const log of logs) if (await handleLog(log, 'quicknode').catch((e) => (console.error(e), false))) processed++;
    res.json({ ok: true, received: logs.length, processed });
  });
  return r;
}

/** Fallback when QUICKNODE_ENABLED is not "true": poll the chain with viem. */
export async function startPoller() {
  if (QUICKNODE_ENABLED) {
    console.log('[events] QuickNode Stream mode: waiting for POST /webhooks/quicknode');
    return;
  }
  let dep = tryDeployment();
  while (!dep) {
    await new Promise((r) => setTimeout(r, 15000));
    dep = tryDeployment();
  }
  const client = pub();
  const latest = await client.getBlockNumber().catch(() => 0n);
  let from = db.lastBlock ? BigInt(db.lastBlock) + 1n : BigInt(dep.deployBlock ?? 0);
  if (latest - from > 50_000n) from = latest - 50_000n;
  if (from < 0n) from = 0n;
  // Backfill what we missed, in chunks the RPC accepts.
  for (let start = from; start <= latest; start += 5_000n) {
    const end = start + 4_999n > latest ? latest : start + 4_999n;
    try {
      const logs = await client.getLogs({ address: deployment().earmark, fromBlock: start, toBlock: end });
      for (const l of logs) await handleLog(l as unknown as RawLog, 'poller');
    } catch (e) {
      console.warn('[events] backfill failed', (e as Error).message);
      break;
    }
  }
  db.lastBlock = latest.toString();
  save();
  console.log(`[events] poller watching ${deployment().earmark} from block ${latest}`);
  client.watchContractEvent({
    address: deployment().earmark,
    abi: earmarkAbi,
    pollingInterval: 3000,
    onLogs: async (logs) => {
      for (const l of logs) {
        await handleLog(l as unknown as RawLog, 'poller').catch((e) => console.error(e));
        if (l.blockNumber) db.lastBlock = l.blockNumber.toString();
      }
      save();
    },
    onError: (e) => console.warn('[events] poller error', e.message),
  });
}

export type { Hex };
