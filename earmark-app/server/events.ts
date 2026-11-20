// One place that turns Earmark logs into notifications, whether they come from the QuickNode Stream or the poller.
import { decodeEventLog, getAddress, type Hex } from 'viem';
import { earmarkAbi, formatUsdc } from 'earmark-plugin';
import { deployment } from './config';
import { db, save } from './db';
import { forgetGift, readGift, same } from './chain';
import { contactByAddress, itemFor, shortItem, usdShort } from './directory';
import { giftUpdate, notify } from './sse';

export type RawLog = { address: string; topics: Hex[]; data: Hex; transactionHash: Hex; logIndex: number | string | bigint; blockNumber?: number | string | bigint };

const NAMES = new Set(['GiftCreated', 'GiftRedeemed', 'GiftRefunded']);

export function decodeEarmarkLog(log: RawLog) {
  const { earmark } = deployment();
  if (!same(log.address, earmark)) return null;
  try {
    const ev = decodeEventLog({ abi: earmarkAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data });
    if (!NAMES.has(ev.eventName)) return null;
    return ev;
  } catch {
    return null;
  }
}

/** Returns true if the log was new. Dedupe key: tx hash + log index. */
export async function handleLog(log: RawLog, source: 'quicknode' | 'poller'): Promise<boolean> {
  const ev = decodeEarmarkLog(log);
  if (!ev) return false;
  const key = `${log.transactionHash.toLowerCase()}:${Number(log.logIndex)}`;
  if (db.processedLogs.includes(key)) return false;
  db.processedLogs.push(key);
  save();

  const args = ev.args as Record<string, any>;
  const giftId = String(args.giftId);
  forgetGift(giftId);
  const tx = (db.giftTx[giftId] ??= {});

  if (ev.eventName === 'GiftCreated') {
    tx.createdTx = log.transactionHash;
    tx.createdAt ??= Date.now();
    const sender = contactByAddress(args.sender);
    const item = await itemFor(args.store, args.itemId);
    const text = `${sender?.name ?? 'Someone'} sent you ${usdShort(args.amount)} for a ${(item?.name ?? 'gift').toLowerCase()}.`;
    notify(getAddress(args.receiver), text, { giftId, txHash: log.transactionHash, kind: 'GiftCreated' });
    giftUpdate(giftId, { status: 'Locked', txHash: log.transactionHash }, [args.receiver, args.sender]);
  } else if (ev.eventName === 'GiftRedeemed') {
    tx.redeemedTx = log.transactionHash;
    tx.redeemedAt ??= Date.now();
    tx.price = String(args.price);
    tx.change = String(args.change);
    tx.changeTo = getAddress(args.changeTo);
    const gift = await readGift(BigInt(giftId), true).catch(() => null);
    const receiver = contactByAddress(args.receiver);
    const item = await itemFor(args.store, gift?.itemId ?? '0x');
    const who = receiver?.name ?? 'They';
    let text = `${who} bought the ${shortItem(item?.name ?? 'item')}.`;
    const change = BigInt(args.change);
    if (change > 0n) {
      text += same(args.changeTo, args.receiver)
        ? ` ${formatUsdc(change)} went back to ${receiver?.pronoun ?? 'them'}.`
        : ` ${formatUsdc(change)} came back to you.`;
    }
    const targets = [args.receiver, gift?.sender].filter(Boolean) as string[];
    // The receiver hears it in their own words; the sender gets the story line.
    let mine = `You bought the ${shortItem(item?.name ?? 'item')}.`;
    if (change > 0n && same(args.changeTo, args.receiver)) mine += ` You kept ${formatUsdc(change)} change.`;
    for (const t of new Set(targets.map((a) => a.toLowerCase()))) {
      notify(getAddress(t), same(t, args.receiver) ? mine : text, { giftId, txHash: log.transactionHash, kind: 'GiftRedeemed' });
    }
    for (const pr of db.purchaseRequests) if (pr.giftId === giftId && pr.status === 'pending') pr.status = 'done';
    giftUpdate(giftId, { status: 'Spent', txHash: log.transactionHash, price: tx.price, change: tx.change, changeTo: tx.changeTo }, targets);
  } else if (ev.eventName === 'GiftRefunded') {
    tx.refundedTx = log.transactionHash;
    tx.refundedAt ??= Date.now();
    const gift = await readGift(BigInt(giftId), true).catch(() => null);
    const receiver = contactByAddress(gift?.receiver);
    notify(getAddress(args.sender), `Your ${usdShort(args.amount)} gift${receiver ? ` to ${receiver.name}` : ''} expired. It came back to you.`, {
      giftId,
      txHash: log.transactionHash,
      kind: 'GiftRefunded',
    });
    giftUpdate(giftId, { status: 'Refunded', txHash: log.transactionHash }, [args.sender, gift?.receiver ?? args.sender]);
  }
  save();
  console.log(`[events] ${source} ${ev.eventName} gift ${giftId} (${log.transactionHash.slice(0, 10)}…)`);
  return true;
}
