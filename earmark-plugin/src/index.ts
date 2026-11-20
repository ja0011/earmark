import { defineChain, keccak256, toBytes, type Address, type Hex } from 'viem';

export { earmarkAbi } from './abi';
export { erc20Abi } from './erc20';

/** Arc testnet. Native gas is USDC (18 decimals natively); the ERC-20 USDC interface uses 6 decimals. */
export const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'], webSocket: ['wss://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: 'https://explorer.testnet.arc.io' },
  },
  testnet: true,
});

export const ARC_EXPLORER = 'https://explorer.testnet.arc.io';
export const explorerTx = (hash: string) => `${ARC_EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${ARC_EXPLORER}/address/${addr}`;

/** EIP-712 Order type. Field order must match the Solidity typehash byte for byte. */
export const ORDER_TYPES = {
  Order: [
    { name: 'giftId', type: 'uint256' },
    { name: 'itemId', type: 'bytes32' },
    { name: 'price', type: 'uint256' },
    { name: 'orderId', type: 'bytes32' },
    { name: 'receiver', type: 'address' },
  ],
} as const;

export function earmarkDomain(chainId: number, verifyingContract: Address) {
  return { name: 'Earmark', version: '1', chainId, verifyingContract } as const;
}

/** itemId = keccak256("<store slug>:<sku>"), e.g. itemIdFor("hartwell-supply", "snow-shovel"). */
export function itemIdFor(store: string, sku: string): Hex {
  return keccak256(toBytes(`${store}:${sku}`));
}

/** $10.00 in 6-decimal USDC. Leftover at or under this goes to the receiver; more goes back to the sender. */
export const CHANGE_LIMIT = 10_000_000n;
export const USDC_DECIMALS = 6;

export const GIFT_STATUS = ['None', 'Locked', 'Spent', 'Refunded'] as const;
export type GiftStatus = (typeof GIFT_STATUS)[number];

/** 39980000n -> "$39.98". Pass { symbol: false } for "39.98". */
export function formatUsdc(value: bigint | string | number, opts: { symbol?: boolean } = {}): string {
  const v = BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 1_000_000n;
  const cents = (abs % 1_000_000n) / 10_000n;
  const str = `${whole.toLocaleString('en-US')}.${cents.toString().padStart(2, '0')}`;
  return `${neg ? '-' : ''}${opts.symbol === false ? '' : '$'}${str}`;
}

/** "39.98" -> 39980000n */
export function parseUsdc(usd: string | number): bigint {
  const [w, f = ''] = String(usd).trim().replace(/^\$/, '').split('.');
  return BigInt(w || '0') * 1_000_000n + BigInt((f + '000000').slice(0, 6));
}

export type Gift = {
  sender: Address;
  receiver: Address;
  store: Address;
  itemId: Hex;
  amount: bigint;
  expiry: bigint;
  fingerprint: Hex;
  status: number;
};

export type CartLine = { sku: string; qty: number; name?: string; price?: string };

export type CatalogItem = {
  sku: string;
  name: string;
  /** 6-decimal USDC as a decimal string, e.g. "39980000" */
  price: string;
  priceUsd?: string;
  image?: string;
  /** Defaults to itemIdFor(storeSlug, sku) */
  itemId?: Hex;
  /** Only Earmark-enabled items are offered in the catalog. Defaults to true. */
  earmark?: boolean;
};

export type SignRequest = { giftId: string | number | bigint; receiver: Address; cart: CartLine[] };

export type SignedOrder = {
  giftId: string;
  itemId: Hex;
  price: string;
  orderId: Hex;
  receiver: Address;
  signature: Hex;
  store: Address;
  chainId: number;
  verifyingContract: Address;
};

export type PayResult = {
  txHash: Hex;
  giftId: string;
  price: string;
  change: string;
  changeTo: Address;
};

export type PayError = { code: string; message: string };

/** Popup protocol messages (see docs/INTERFACES.md). */
export type EarmarkMessage =
  | { type: 'earmark:ready' }
  | { type: 'earmark:cart'; store: Address; cart: CartLine[]; signUrl: string }
  | ({ type: 'earmark:paid' } & PayResult)
  | ({ type: 'earmark:error' } & PayError)
  | { type: 'earmark:closed' };

/** "SNOW SHOVEL" -> "This gift only buys the snow shovel." */
export function itemMismatchMessage(itemName: string): string {
  return `This gift only buys the ${itemName.toLowerCase()}.`;
}
