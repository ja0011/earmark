import { createPublicClient, createWalletClient, defineChain, getAddress, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_TESTNET, earmarkAbi, erc20Abi, GIFT_STATUS, type Gift } from 'earmark-plugin';
import { DEPLOYER_PRIVATE_KEY, RPC_URL, deployment } from './config';

export function chainFor(chainId: number) {
  if (chainId === ARC_TESTNET.id) return { ...ARC_TESTNET, rpcUrls: { default: { http: [RPC_URL] } } };
  return defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
}

let _pub: ReturnType<typeof createPublicClient> | null = null;
let _pubChain = 0;
export function pub() {
  const { chainId } = deployment();
  if (!_pub || _pubChain !== chainId) {
    _pub = createPublicClient({ chain: chainFor(chainId), transport: http(RPC_URL, { retryCount: 2 }), pollingInterval: 3000 });
    _pubChain = chainId;
  }
  return _pub;
}

export function ownerWallet() {
  if (!/^0x[0-9a-fA-F]{64}$/.test(DEPLOYER_PRIVATE_KEY)) return null;
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY as Hex);
  const { chainId } = deployment();
  return createWalletClient({ account, chain: chainFor(chainId), transport: http(RPC_URL) });
}

export type ChainGift = Gift & { id: bigint };

const settled = new Map<string, ChainGift>();
const recent = new Map<string, { at: number; gift: ChainGift }>();

export async function readGift(id: bigint, fresh = false): Promise<ChainGift | null> {
  const key = id.toString();
  const done = settled.get(key);
  if (done) return done;
  const r = recent.get(key);
  if (!fresh && r && Date.now() - r.at < 4000) return r.gift;
  const { earmark } = deployment();
  const g = (await pub().readContract({ address: earmark, abi: earmarkAbi, functionName: 'getGift', args: [id] })) as Gift;
  if (g.status === 0) return null;
  const gift = { ...g, id };
  if (g.status === 2 || g.status === 3) settled.set(key, gift);
  else recent.set(key, { at: Date.now(), gift });
  return gift;
}

export function forgetGift(id: bigint | string) {
  recent.delete(id.toString());
}

export async function nextGiftId(): Promise<bigint> {
  const { earmark } = deployment();
  return (await pub().readContract({ address: earmark, abi: earmarkAbi, functionName: 'nextGiftId' })) as bigint;
}

/** Scans every gift. Fine for a testnet demo; a production index would come from the Stream. */
export async function allGifts(): Promise<ChainGift[]> {
  const next = await nextGiftId();
  const ids: bigint[] = [];
  for (let i = next - 1n; i >= 1n && ids.length < 400; i--) ids.push(i);
  const out: ChainGift[] = [];
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = await Promise.all(ids.slice(i, i + 25).map((id) => readGift(id).catch(() => null)));
    for (const g of chunk) if (g) out.push(g);
  }
  return out;
}

export async function storeSigner(store: Address): Promise<Address> {
  const { earmark } = deployment();
  return (await pub().readContract({ address: earmark, abi: earmarkAbi, functionName: 'storeSigner', args: [store] })) as Address;
}

export async function changeLimit(): Promise<bigint> {
  const { earmark } = deployment();
  try {
    return (await pub().readContract({ address: earmark, abi: earmarkAbi, functionName: 'CHANGE_LIMIT' })) as bigint;
  } catch {
    return 10_000_000n;
  }
}

export async function usdcBalance(a: Address): Promise<bigint> {
  const { usdc } = deployment();
  return (await pub().readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [a] })) as bigint;
}

export const statusName = (s: number) => GIFT_STATUS[s] ?? 'None';
export const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const addr = (a: string) => getAddress(a);
export type { Hex };
