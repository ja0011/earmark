import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Address, Hex } from 'viem';
import { ROOT } from './config';

export type Contact = { name: string; address: Address; phone?: string; pronoun?: string; language?: string; createdAt: number };
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
  source: 'call' | 'browser' | 'demo' | 'reminder';
  txHash?: Hex;
  createdAt: number;
};
export type GiftTx = {
  createdTx?: Hex;
  redeemedTx?: Hex;
  refundedTx?: Hex;
  createdAt?: number;
  redeemedAt?: number;
  refundedAt?: number;
  price?: string;
  change?: string;
  changeTo?: Address;
};
/** A short note the sender wrote with the gift (English source; translations live in `translations`). */
export type GiftNote = { text: string; at: number };
/** A voice reply from the receiver: what they said (their language) and the English for the sender. */
export type GiftReply = { id: string; giftId: string; from: Address; to: Address; text: string; english: string; language?: string; audio?: string; at: number };
/** Demo-faucet top-ups, so a person's activity can show where their test USDC came from. */
export type FundTx = { address: Address; txHash: Hex; amountUsd: string; at: number };

type Data = {
  contacts: Contact[];
  stores: StoreRecord[];
  notifications: Notification[];
  purchaseRequests: PurchaseRequest[];
  processedLogs: string[];
  giftTx: Record<string, GiftTx>;
  reminders: Record<string, { d7?: number; d4?: number }>;
  funded: Record<string, number>;
  fundTx: FundTx[];
  notes: Record<string, GiftNote>;
  replies: GiftReply[];
  /** "en>es:<text>" -> translation */
  translations: Record<string, string>;
  lastBlock?: string;
};

const DIR = resolve(ROOT, process.env.EARMARK_DATA_DIR || 'server/data');
const FILE = resolve(DIR, 'db.json');
/** server/data (or EARMARK_DATA_DIR): db.json and generated audio. */
export const DATA_DIR = DIR;

const empty = (): Data => ({ contacts: [], stores: [], notifications: [], purchaseRequests: [], processedLogs: [], giftTx: {}, reminders: {}, funded: {}, fundTx: [], notes: {}, replies: [], translations: {} });

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
    if (db.fundTx.length > 500) db.fundTx = db.fundTx.slice(-400);
    if (db.replies.length > 500) db.replies = db.replies.slice(-400);
    writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
    renameSync(FILE + '.tmp', FILE);
  }, 150);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
