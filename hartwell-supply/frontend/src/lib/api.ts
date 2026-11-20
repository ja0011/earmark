export type Product = {
  sku: string;
  name: string;
  title: string;
  blurb: string;
  /** USDC, 6 decimals */
  price: string;
  priceUsd: string;
  image: string;
  earmark: boolean;
  itemId: `0x${string}`;
};

export type StoreInfo = {
  name: string;
  website: string;
  address: `0x${string}` | null;
  signer: `0x${string}` | null;
  earmarkContract: `0x${string}` | null;
  earmarkAppUrl: string;
  /** Absolute URL of this store's POST /earmark/sign (the Earmark popup calls it) */
  signUrl: string;
  chainId: number;
};

export type OrderLine = { sku: string; name: string; qty: number; price: string };

export type Order = {
  txHash: `0x${string}`;
  giftId: string;
  price: string;
  change: string;
  changeTo: `0x${string}`;
  changeToName: string | null;
  lines: OrderLine[];
  paidAt: string;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const getProducts = () =>
  fetch('/api/products').then((r) => json<{ store: StoreInfo; products: Product[] }>(r));

export const saveOrder = (o: Omit<Order, 'changeToName' | 'paidAt'>) =>
  fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(o),
  }).then((r) => json<Order>(r));

export const getOrder = (txHash: string) =>
  fetch(`/api/orders/${encodeURIComponent(txHash)}`).then((r) => json<Order>(r));

export const EXPLORER = 'https://explorer.testnet.arc.io';
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
