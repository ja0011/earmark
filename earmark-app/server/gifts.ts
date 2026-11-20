import { formatUsdc } from 'earmark-plugin';
import { db } from './db';
import { type ChainGift, statusName } from './chain';
import { contactByAddress, itemFor, storeByAddress } from './directory';

export async function giftJson(g: ChainGift) {
  const id = g.id.toString();
  const item = await itemFor(g.store, g.itemId);
  const store = storeByAddress(g.store);
  const tx = db.giftTx[id] ?? {};
  return {
    id,
    sender: g.sender,
    senderName: contactByAddress(g.sender)?.name ?? null,
    receiver: g.receiver,
    receiverName: contactByAddress(g.receiver)?.name ?? null,
    store: g.store,
    storeName: store?.name ?? null,
    storeWebsite: store?.website ?? null,
    signUrl: store?.signUrl ?? null,
    itemId: g.itemId,
    item: item ? { sku: item.sku, name: item.name, price: item.price, priceUsd: item.priceUsd, image: item.image ?? item.sku } : null,
    amount: g.amount.toString(),
    amountUsd: formatUsdc(g.amount),
    expiry: Number(g.expiry),
    fingerprint: g.fingerprint,
    status: statusName(g.status),
    ...tx,
  };
}

export type GiftJson = Awaited<ReturnType<typeof giftJson>>;
