import { useEffect, useState } from 'react';
import { decodeEventLog, getAddress, type Address, type Hex, type WalletClient } from 'viem';
import { earmarkAbi, type CartLine, type SignedOrder } from 'earmark-plugin';
import { api } from './api';
import type { AppConfig } from './config';
import { publicClient } from './chain';

export type GiftView = {
  id: string;
  sender: Address;
  senderName: string | null;
  receiver: Address;
  receiverName: string | null;
  store: Address;
  storeName: string | null;
  storeWebsite: string | null;
  signUrl: string | null;
  itemId: Hex;
  item: { sku: string; name: string; price: string; priceUsd: string; image: string } | null;
  amount: string;
  amountUsd: string;
  expiry: number;
  fingerprint: Hex;
  status: 'Locked' | 'Spent' | 'Refunded' | 'None';
  createdTx?: Hex;
  redeemedTx?: Hex;
  refundedTx?: Hex;
  price?: string;
  change?: string;
  changeTo?: Address;
};

export const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Gift from the server, kept live via SSE (and a periodic chain re-read as a backstop). */
export function useGift(id: string | undefined) {
  const [gift, setGift] = useState<GiftView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = (fresh = false) =>
      api<{ gift: GiftView }>(`/api/gifts/${id}${fresh ? '?fresh=1' : ''}`)
        .then((r) => alive && (setGift(r.gift), setError(null)))
        .catch((e) => alive && setError(e.message));
    load(true);
    const es = new EventSource(`/api/events?gift=${id}`);
    es.addEventListener('gift', () => load(true));
    const iv = setInterval(() => load(true), 15000);
    return () => {
      alive = false;
      es.close();
      clearInterval(iv);
    };
  }, [id, tick]);

  return { gift, error, reload: () => setTick((t) => t + 1), setGift };
}

export type RedeemResult = { txHash: Hex; giftId: string; price: string; change: string; changeTo: Address };

/** POST the cart to the store's signer, then call redeem from the receiver's wallet. */
export async function redeemWithStore(opts: {
  cfg: AppConfig;
  /** From useWallet().signer(): a passkey wallet or MetaMask. */
  wallet: WalletClient;
  giftId: string;
  receiver: Address;
  signUrl: string;
  cart: CartLine[];
  onStep?: (s: 'signing' | 'sending' | 'confirming') => void;
}): Promise<RedeemResult> {
  const { cfg, wallet, giftId, receiver, signUrl, cart, onStep } = opts;
  if (!cfg.earmark) throw new Error('Earmark is not deployed yet.');
  onStep?.('signing');
  const res = await fetch(signUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ giftId, receiver, cart: cart.map((l) => ({ sku: l.sku, qty: l.qty })) }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.message ?? `The store couldn't sign this order (${res.status}).`), { code: body?.error ?? 'SIGN_FAILED' });
  const order = body as SignedOrder;
  if (getAddress(order.verifyingContract) !== getAddress(cfg.earmark) || Number(order.chainId) !== cfg.chainId) {
    throw Object.assign(new Error('The store signed for a different Earmark contract.'), { code: 'WRONG_CONTRACT' });
  }
  if (order.giftId !== giftId) throw Object.assign(new Error('The store signed a different gift.'), { code: 'WRONG_GIFT' });

  const pub = publicClient(cfg);
  onStep?.('sending');
  const { request } = await pub.simulateContract({
    account: wallet.account!,
    address: cfg.earmark,
    abi: earmarkAbi,
    functionName: 'redeem',
    args: [BigInt(giftId), BigInt(order.price), order.orderId, order.signature],
  });
  const hash = await wallet.writeContract(request);
  onStep?.('confirming');
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== 'success') throw Object.assign(new Error('The payment reverted on chain.'), { code: 'REVERTED' });
  let change = '0';
  let changeTo: Address = receiver;
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: earmarkAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'GiftRedeemed') {
        change = String((ev.args as any).change);
        changeTo = (ev.args as any).changeTo;
      }
    } catch {}
  }
  return { txHash: hash, giftId, price: order.price, change, changeTo };
}

export function useCountdown(expiry: number | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  if (!expiry) return null;
  const ms = Math.max(0, expiry * 1000 - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { ms, d, h, m, s, text: `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` };
}
