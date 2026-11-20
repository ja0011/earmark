import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Address, Hex } from 'viem';
import { ROOT } from './config';

export type Contact = { name: string; address: Address; phone?: string; pronoun?: string; createdAt: number };
export type StoreRecord = {
  name: string;
  slug: string;
  website: string;
  store: Address;
  signer: Address;
  catalogUrl: string;
  signUrl: string;
  enabledSkus?: string[];
  onchainTx?: Hex;
  createdAt: number;
  updatedAt: number;
};
export type Notification = { id: string; address: Address; text: string; giftId?: string; txHash?: Hex; kind: string; at: number };
export type PurchaseRequest = {
  id: string;
  giftId: string;
  receiver: Address;
  status: 'pending' | 'done' | 'declined';
  source: 'call' | 'browser' | 'demo';
  txHash?: Hex;
  createdAt: number;
};
export type GiftTx = { createdTx?: Hex; redeemedTx?: Hex; refundedTx?: Hex; price?: string; change?: string; changeTo?: Address };

type Data = {
  contacts: Contact[];
  stores: StoreRecord[];
  notifications: Notification[];
  purchaseRequests: PurchaseRequest[];
  processedLogs: string[];
  giftTx: Record<string, GiftTx>;
  reminders: Record<string, { d7?: number; d4?: number }>;
  funded: Record<string, number>;
  lastBlock?: string;
};

const DIR = resolve(ROOT, process.env.EARMARK_DATA_DIR || 'server/data');
const FILE = resolve(DIR, 'db.json');

const empty = (): Data => ({ contacts: [], stores: [], notifications: [], purchaseRequests: [], processedLogs: [], giftTx: {}, reminders: {}, funded: {} });

function load(): Data {
  if (!existsSync(FILE)) return empty();
  try {
    return { ...empty(), ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

export const db: Data = load();

let timer: NodeJS.Timeout | null = null;
/** Debounced atomic write to server/data/db.json */
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    if (db.processedLogs.length > 5000) db.processedLogs = db.processedLogs.slice(-4000);
    if (db.notifications.length > 500) db.notifications = db.notifications.slice(-400);
    writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
    renameSync(FILE + '.tmp', FILE);
  }, 150);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
