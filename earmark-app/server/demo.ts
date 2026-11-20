// The two shared demo accounts: one Maya and one Alex for everyone who tries Earmark.
// Their keys live only in this server's environment. The server signs for them, but only the four calls the
// demo needs (approve USDC to Earmark, createGift, redeem, refund), capped at $1, one transaction at a time.
import { createWalletClient, decodeFunctionData, erc20Abi, getAddress, http, parseEther, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { earmarkAbi } from 'earmark-plugin';
import { RPC_URL, deployment } from './config';
import { chainFor, ownerWallet, pub, same, usdcBalance } from './chain';

export const PERSONAS = ['Maya', 'Alex'] as const;
export type Persona = (typeof PERSONAS)[number];

/** Gifts from the shared accounts are capped so a stranger can't drain them. */
const MAX_AMOUNT = 1_000_000n; // $1.00
/** Keep Maya able to send a $0.45 gift, and Alex able to pay gas. */
const MAYA_MIN = 600_000n; // $0.60
const MAYA_TARGET = 2_000_000n; // $2.00
const ALEX_GAS_MIN = parseEther('0.03');
const ALEX_GAS_TARGET = parseEther('0.10');

const keyFor = (p: Persona) => (process.env[`DEMO_${p.toUpperCase()}_PRIVATE_KEY`] ?? '').trim() as Hex;

export function personaOf(name: string): Persona | null {
  const n = name.trim().toLowerCase();
  return PERSONAS.find((p) => p.toLowerCase() === n) ?? null;
}

/** Shared account addresses, or null when the keys aren't configured. */
export function demoAccounts(): Record<Persona, Address> | null {
  try {
    return { Maya: privateKeyToAccount(keyFor('Maya')).address, Alex: privateKeyToAccount(keyFor('Alex')).address };
  } catch {
    return null;
  }
}

export function isDemoAddress(a: string) {
  const d = demoAccounts();
  return !!d && PERSONAS.some((p) => same(d[p], a));
}

function walletOf(p: Persona) {
  const account = privateKeyToAccount(keyFor(p));
  return createWalletClient({ account, chain: chainFor(deployment().chainId), transport: http(RPC_URL) });
}

export class DemoRefused extends Error {
  status = 403;
  code = 'NOT_ALLOWED';
}

/** Only the Earmark demo calls are allowed. Everything else is refused before signing. */
function check(to: string, data: Hex, value: bigint) {
  const dep = deployment();
  if (value !== 0n) throw new DemoRefused('The shared accounts never send plain value.');
  if (same(to, dep.usdc)) {
    const call = decodeFunctionData({ abi: erc20Abi, data });
    if (call.functionName !== 'approve') throw new DemoRefused('The shared accounts only approve USDC for Earmark.');
    const [spender, amount] = call.args as [Address, bigint];
    if (!same(spender, dep.earmark)) throw new DemoRefused('USDC can only be approved for the Earmark contract.');
    if (amount > MAX_AMOUNT) throw new DemoRefused('Demo gifts are capped at $1.00.');
    return 'approve';
  }
  if (same(to, dep.earmark)) {
    const call = decodeFunctionData({ abi: earmarkAbi, data });
    if (call.functionName === 'createGift') {
      const amount = (call.args as readonly unknown[])[3] as bigint;
      if (amount > MAX_AMOUNT) throw new DemoRefused('Demo gifts are capped at $1.00.');
      return 'createGift';
    }
    if (call.functionName === 'redeem' || call.functionName === 'refund') return call.functionName;
    throw new DemoRefused('That Earmark call is not available to the shared accounts.');
  }
  throw new DemoRefused('The shared accounts only talk to Earmark and USDC.');
}

// One transaction at a time per account, so two people demoing at once never reuse a nonce.
const queues = new Map<Persona, Promise<unknown>>();
function serial<T>(p: Persona, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(p) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(p, next);
  return next;
}

export async function demoSend(p: Persona, tx: { to: string; data: Hex; value?: string | number | bigint }): Promise<{ hash: Hex; call: string }> {
  if (!demoAccounts()) throw Object.assign(new Error('The shared demo accounts are not configured on this server.'), { status: 503 });
  const to = getAddress(tx.to);
  const call = check(to, tx.data, BigInt(tx.value ?? 0));
  const wallet = walletOf(p);
  const hash = await serial(p, async () => {
    const nonce = await pub().getTransactionCount({ address: wallet.account.address, blockTag: 'pending' });
    const h = await wallet.sendTransaction({ to, data: tx.data, nonce, chain: wallet.chain, account: wallet.account });
    await pub().waitForTransactionReceipt({ hash: h, timeout: 60_000 }).catch(() => {});
    return h;
  });
  topUpDemo().catch((e) => console.warn('[demo] top-up failed:', e?.shortMessage ?? e?.message));
  return { hash, call };
}

/** Keep Maya stocked with test USDC and Alex with gas, from the owner wallet. */
export async function topUpDemo(): Promise<Hex[]> {
  const d = demoAccounts();
  const owner = ownerWallet();
  if (!d || !owner) return [];
  const dep = deployment();
  const txs: Hex[] = [];
  const maya = await usdcBalance(d.Maya);
  if (maya < MAYA_MIN) {
    txs.push(await owner.writeContract({ address: dep.usdc, abi: erc20Abi, functionName: 'transfer', args: [d.Maya, MAYA_TARGET - maya], chain: owner.chain, account: owner.account! }));
  }
  const alexGas = await pub().getBalance({ address: d.Alex });
  if (alexGas < ALEX_GAS_MIN) {
    txs.push(await owner.sendTransaction({ to: d.Alex, value: ALEX_GAS_TARGET - alexGas, chain: owner.chain, account: owner.account! }));
  }
  for (const h of txs) await pub().waitForTransactionReceipt({ hash: h, timeout: 60_000 }).catch(() => {});
  if (txs.length) console.log(`[demo] topped up shared accounts (${txs.length} tx)`);
  return txs;
}
