// Contacts and stores: who people are, where stores live, what they sell.
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { formatUsdc } from 'earmark-plugin';
import { DEMO_RECEIVER_PHONE, HARTWELL_API_URL, HARTWELL_URL } from './config';
import { db, save, type Contact, type StoreRecord } from './db';
import { same } from './chain';

// ---------------------------------------------------------------- contacts

const PRONOUNS: Record<string, string> = { maya: 'her', alex: 'him' };

export function upsertContact(input: { name: string; address: string; phone?: string }): Contact {
  if (!isAddress(input.address)) throw Object.assign(new Error('address must be an address'), { status: 400 });
  const name = input.name.trim().slice(0, 40);
  if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
  const address = getAddress(input.address);
  const existing = db.contacts.find((c) => same(c.address, address));
  const phone = input.phone || (name.toLowerCase() === 'alex' ? DEMO_RECEIVER_PHONE || undefined : undefined);
  const c: Contact = { name, address, phone, pronoun: PRONOUNS[name.toLowerCase()] ?? 'them', createdAt: Date.now() };
  if (existing) Object.assign(existing, c);
  else db.contacts.push(c);
  save();
  return existing ?? c;
}

/** Most recently registered contact with that name. */
export function contactByName(name: string): Contact | undefined {
  const n = name.trim().toLowerCase();
  return [...db.contacts].sort((a, b) => b.createdAt - a.createdAt).find((c) => c.name.toLowerCase() === n);
}

export function contactByAddress(a?: string): Contact | undefined {
  return a ? db.contacts.find((c) => same(c.address, a)) : undefined;
}

export const nameOf = (a?: string) => contactByAddress(a)?.name;
export const publicContact = (c: Contact) => ({ name: c.name, address: c.address, hasPhone: Boolean(c.phone) });

// ---------------------------------------------------------------- stores

export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function upsertStore(input: Partial<StoreRecord> & { name: string; store: string; signer: string }): StoreRecord {
  if (!isAddress(input.store) || !isAddress(input.signer)) throw Object.assign(new Error('store and signer must be addresses'), { status: 400 });
  const store = getAddress(input.store);
  const existing = db.stores.find((s) => same(s.store, store));
  const now = Date.now();
  const website = (input.website ?? existing?.website ?? '').replace(/\/$/, '');
  const rec: StoreRecord = {
    name: input.name.trim().slice(0, 60),
    slug: input.slug ?? existing?.slug ?? slugify(input.name),
    website,
    store,
    signer: getAddress(input.signer),
    catalogUrl: input.catalogUrl ?? existing?.catalogUrl ?? `${website}/earmark/catalog`,
    signUrl: input.signUrl ?? existing?.signUrl ?? `${website}/earmark/sign`,
    enabledSkus: input.enabledSkus ?? existing?.enabledSkus,
    onchainTx: (input.onchainTx ?? existing?.onchainTx) as Hex | undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (existing) Object.assign(existing, rec);
  else db.stores.push(rec);
  save();
  return existing ?? rec;
}

export function storeByAddress(a?: string) {
  return a ? db.stores.find((s) => same(s.store, a)) : undefined;
}

export type CatalogItem = { sku: string; itemId: Hex; name: string; price: string; priceUsd: string; image?: string };
export type Catalog = { store: { name: string; website: string; address: Address; signer: Address }; items: CatalogItem[] };

const catalogCache = new Map<string, { at: number; cat: Catalog }>();

export async function fetchCatalog(url: string, maxAgeMs = 60_000): Promise<Catalog> {
  const hit = catalogCache.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.cat;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`catalog ${url} returned ${res.status}`);
  const cat = (await res.json()) as Catalog;
  if (!cat?.store?.address || !Array.isArray(cat.items)) throw new Error(`catalog ${url} is not an Earmark catalog`);
  cat.items = cat.items.map((i) => ({ ...i, priceUsd: i.priceUsd ?? formatUsdc(i.price, { symbol: false }) }));
  catalogCache.set(url, { at: Date.now(), cat });
  return cat;
}

/** The demo store registers itself via registerWithEarmark; if it has not yet, discover it from its catalog. */
export async function ensureHartwell(): Promise<StoreRecord | undefined> {
  const found = db.stores.find((s) => s.slug === 'hartwell-supply');
  if (found) return found;
  try {
    const cat = await fetchCatalog(`${HARTWELL_API_URL}/earmark/catalog`, 5_000);
    return upsertStore({
      name: cat.store.name || 'Hartwell Supply',
      slug: 'hartwell-supply',
      website: HARTWELL_URL,
      store: cat.store.address,
      signer: cat.store.signer,
      catalogUrl: `${HARTWELL_API_URL}/earmark/catalog`,
      signUrl: `${HARTWELL_API_URL}/earmark/sign`,
    });
  } catch {
    return undefined;
  }
}

export async function storeByName(name: string): Promise<StoreRecord | undefined> {
  const n = slugify(name);
  const match = () => db.stores.find((s) => s.slug === n || slugify(s.name) === n || s.slug.startsWith(n) || n.startsWith(s.slug));
  let s = match();
  if (!s && n.includes('hartwell')) s = await ensureHartwell();
  return s ?? match();
}

export async function catalogFor(store: StoreRecord): Promise<CatalogItem[]> {
  const cat = await fetchCatalog(store.catalogUrl);
  return store.enabledSkus ? cat.items.filter((i) => store.enabledSkus!.includes(i.sku)) : cat.items;
}

export async function itemFor(storeAddr: string, itemId: string): Promise<CatalogItem | undefined> {
  const s = storeByAddress(storeAddr) ?? (await ensureHartwell().then((h) => (h && same(h.store, storeAddr) ? h : undefined)));
  if (!s) return undefined;
  try {
    const cat = await fetchCatalog(s.catalogUrl);
    return cat.items.find((i) => same(i.itemId, itemId));
  } catch {
    return undefined;
  }
}

/** "SNOW SHOVEL" -> "shovel", "ROCK SALT 20 LB" -> "salt" */
export function shortItem(name: string) {
  const words = name.toLowerCase().replace(/\s\d.*$/, '').trim().split(/\s+/);
  return words[words.length - 1] || name.toLowerCase();
}

/** 45000000n -> "$45", 39980000n -> "$39.98" */
export function usdShort(v: bigint | string) {
  const s = formatUsdc(v);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}
