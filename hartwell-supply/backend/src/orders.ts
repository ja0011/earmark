import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BACKEND_DIR } from './config.ts';

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

const FILE = resolve(process.env.HARTWELL_DATA_DIR || resolve(BACKEND_DIR, 'data'), 'orders.json');

function load(): Order[] {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

export function saveOrder(order: Order) {
  const all = load().filter((o) => o.txHash.toLowerCase() !== order.txHash.toLowerCase());
  all.push(order);
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(all, null, 2));
  return order;
}

export function findOrder(txHash: string) {
  return load().find((o) => o.txHash.toLowerCase() === txHash.toLowerCase());
}
