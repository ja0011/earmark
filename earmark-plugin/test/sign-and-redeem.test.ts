/**
 * Signs an order with earmarkSigner and redeems it against a real Earmark contract on a local anvil.
 * Proves the EIP-712 domain, Order type and field order match the Solidity contract byte for byte.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { earmarkAbi, itemIdFor, formatUsdc, type CatalogItem } from '../src/index';
import { earmarkSigner, earmarkRouter, EarmarkSignError } from '../src/server/index';

const CONTRACTS = resolve(__dirname, '../../contracts');
const MNEMONIC = 'test test test test test test test test test test test junk';

const CATALOG: CatalogItem[] = [
  { sku: 'snow-shovel', name: 'SNOW SHOVEL', price: '39980000' },
  { sku: 'ice-scraper', name: 'ICE SCRAPER', price: '8490000' },
  { sku: 'cordless-drill', name: 'CORDLESS DRILL', price: '89000000' },
];

function artifact(name: string): { abi: any[]; bytecode: Hex } {
  const p = resolve(CONTRACTS, `out/${name}.sol/${name}.json`);
  if (!existsSync(p)) execSync('forge build', { cwd: CONTRACTS, stdio: 'inherit' });
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object as Hex };
}

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, () => {
      const port = (s.address() as any).port;
      s.close(() => res(port));
    });
    s.on('error', rej);
  });
}

let anvil: ChildProcess;
let rpcUrl: string;
let pub: PublicClient;
let chain: ReturnType<typeof defineChain>;
let earmark: Address;
let usdc: Address;
let usdcAbi: any[];
const owner = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
const maya = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });
const alex = mnemonicToAccount(MNEMONIC, { addressIndex: 2 });
const storeKey = generatePrivateKey();
const store = privateKeyToAccount(storeKey).address;
const shovelId = itemIdFor('hartwell-supply', 'snow-shovel');

const wallet = (account: typeof owner) => createWalletClient({ account, chain, transport: http(rpcUrl) });

async function send(account: typeof owner, address: Address, abi: any, functionName: string, args: unknown[]) {
  const hash = await wallet(account).writeContract({ address, abi, functionName, args } as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${functionName} reverted`);
  return r;
}

async function balance(a: Address) {
  return (await pub.readContract({ address: usdc, abi: usdcAbi, functionName: 'balanceOf', args: [a] })) as bigint;
}

async function createGift(amount: bigint): Promise<bigint> {
  await send(maya, usdc, usdcAbi, 'mint', [maya.address, amount]);
  await send(maya, usdc, usdcAbi, 'approve', [earmark, amount]);
  const giftId = (await pub.readContract({ address: earmark, abi: earmarkAbi, functionName: 'nextGiftId' })) as bigint;
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
  await send(maya, earmark, earmarkAbi, 'createGift', [alex.address, store, shovelId, amount, expiry]);
  return giftId;
}

function signer() {
  return earmarkSigner({ privateKey: storeKey, rpcUrl, chainId: 31337, earmark, catalog: CATALOG, storeSlug: 'hartwell-supply' });
}

beforeAll(async () => {
  const port = await freePort();
  rpcUrl = `http://127.0.0.1:${port}`;
  anvil = spawn('anvil', ['--port', String(port), '--silent', '--chain-id', '31337'], { stdio: 'ignore' });
  chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
  pub = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  for (let i = 0; i < 100; i++) {
    try { await pub.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  const mock = artifact('MockUSDC');
  usdcAbi = mock.abi;
  const em = artifact('Earmark');
  const w = wallet(owner);
  const h1 = await w.deployContract({ abi: mock.abi, bytecode: mock.bytecode, args: [], chain } as any);
  usdc = (await pub.waitForTransactionReceipt({ hash: h1 })).contractAddress!;
  const h2 = await w.deployContract({ abi: em.abi, bytecode: em.bytecode, args: [usdc, owner.address], chain } as any);
  earmark = (await pub.waitForTransactionReceipt({ hash: h2 })).contractAddress!;
  await send(owner, earmark, earmarkAbi, 'registerStore', [store, store]);
});

afterAll(() => {
  anvil?.kill();
});

describe('earmarkSigner + Earmark.redeem', () => {
  it('signs a $39.98 shovel order that redeems a $45 gift: store gets $39.98, Alex gets $5.02', async () => {
    const giftId = await createGift(45_000_000n);
    const storeBefore = await balance(store);
    const alexBefore = await balance(alex.address);

    // The browser claims the shovel costs a cent. The signer must ignore it.
    const order = await signer().sign({ giftId: giftId.toString(), receiver: alex.address, cart: [{ sku: 'snow-shovel', qty: 1, price: '10000' }] });
    expect(order.price).toBe('39980000');
    expect(order.itemId).toBe(shovelId);
    expect(order.orderId).toMatch(/^0x[0-9a-f]{64}$/);

    const r = await send(alex, earmark, earmarkAbi, 'redeem', [giftId, BigInt(order.price), order.orderId, order.signature]);
    expect(r.status).toBe('success');

    expect(formatUsdc((await balance(store)) - storeBefore)).toBe('$39.98');
    expect(formatUsdc((await balance(alex.address)) - alexBefore)).toBe('$5.02');
    const gift = (await pub.readContract({ address: earmark, abi: earmarkAbi, functionName: 'getGift', args: [giftId] })) as any;
    expect(gift.status).toBe(2);
  });

  it('rejects a cart with the drill: "This gift only buys the snow shovel."', async () => {
    const giftId = await createGift(45_000_000n);
    const s = signer();
    const carts = [
      [{ sku: 'snow-shovel', qty: 1 }, { sku: 'cordless-drill', qty: 1 }],
      [{ sku: 'cordless-drill', qty: 1 }],
      [{ sku: 'snow-shovel', qty: 2 }],
    ];
    for (const cart of carts) {
      const err = await s.sign({ giftId: giftId.toString(), receiver: alex.address, cart }).catch((e) => e);
      expect(err).toBeInstanceOf(EarmarkSignError);
      expect(err.code).toBe('ITEM_MISMATCH');
      expect(err.message).toBe('This gift only buys the snow shovel.');
    }

    // Same rule over HTTP via earmarkRouter, with CORS for the Earmark popup.
    const app = express();
    app.use(earmarkRouter({ privateKey: storeKey, rpcUrl, chainId: 31337, earmark, catalog: CATALOG, storeSlug: 'hartwell-supply', storeInfo: { name: 'Hartwell Supply', website: 'http://localhost:5174' }, allowedOrigins: ['http://localhost:5173'] }));
    const res = await request(app)
      .post('/earmark/sign')
      .set('Origin', 'http://localhost:5173')
      .send({ giftId: giftId.toString(), receiver: alex.address, cart: carts[0] });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'ITEM_MISMATCH', message: 'This gift only buys the snow shovel.' });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const cat = await request(app).get('/earmark/catalog');
    expect(cat.body.store.signer).toBe(store);
    expect(cat.body.items[0]).toMatchObject({ sku: 'snow-shovel', itemId: shovelId, price: '39980000', priceUsd: '39.98' });
  });

  it('rejects a signature for someone who is not the receiver', async () => {
    const giftId = await createGift(45_000_000n);
    const err = await signer().sign({ giftId: giftId.toString(), receiver: maya.address, cart: [{ sku: 'snow-shovel', qty: 1 }] }).catch((e) => e);
    expect(err.code).toBe('RECEIVER_MISMATCH');
  });

  it('fails on chain when the signed price is tampered with', async () => {
    const giftId = await createGift(45_000_000n);
    const order = await signer().sign({ giftId: giftId.toString(), receiver: alex.address, cart: [{ sku: 'snow-shovel', qty: 1 }] });
    // Pay $1.00 instead of $39.98 with the store's real signature.
    await expect(
      pub.simulateContract({ account: alex, address: earmark, abi: earmarkAbi, functionName: 'redeem', args: [giftId, 1_000_000n, order.orderId, order.signature] }),
    ).rejects.toThrow(/InvalidStoreSignature/);
    // The untampered order still works afterwards.
    const r = await send(alex, earmark, earmarkAbi, 'redeem', [giftId, BigInt(order.price), order.orderId, order.signature]);
    expect(r.status).toBe('success');
  });
});
