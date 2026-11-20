import { randomBytes } from 'node:crypto';
import { createPublicClient, http, isAddress, getAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { earmarkAbi } from '../abi';
import {
  ORDER_TYPES,
  earmarkDomain,
  itemIdFor,
  itemMismatchMessage,
  type CatalogItem,
  type Gift,
  type SignRequest,
  type SignedOrder,
} from '../index';

export class EarmarkSignError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'EarmarkSignError';
  }
}

export type EarmarkSignerOptions = {
  /** The store's signing key. Read it from the store's own .env; never ship it to a browser. */
  privateKey: Hex;
  rpcUrl: string;
  chainId: number;
  /** Earmark contract address */
  earmark: Address;
  /** Server-side catalogue: the only source of prices. Can be a function for live toggles. */
  catalog: CatalogItem[] | (() => CatalogItem[] | Promise<CatalogItem[]>);
  /** Used to derive item ids when a catalog item has no explicit itemId, e.g. "hartwell-supply". */
  storeSlug?: string;
  /** The store address registered in Earmark. Defaults to the signer address. */
  store?: Address;
};

export type ResolvedCatalogItem = CatalogItem & { itemId: Hex };

export function resolveCatalog(items: CatalogItem[], storeSlug?: string): ResolvedCatalogItem[] {
  return items
    .filter((i) => i.earmark !== false)
    .map((i) => {
      const itemId = i.itemId ?? (storeSlug ? itemIdFor(storeSlug, i.sku) : undefined);
      if (!itemId) throw new Error(`earmark-plugin: catalog item "${i.sku}" needs an itemId or pass storeSlug`);
      return { ...i, itemId };
    });
}

export function earmarkSigner(opts: EarmarkSignerOptions) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(opts.privateKey ?? '')) {
    throw new Error('earmark-plugin: privateKey must be a 0x-prefixed 32-byte hex string (set it in your .env)');
  }
  if (!isAddress(opts.earmark)) throw new Error('earmark-plugin: earmark must be the Earmark contract address');

  const account = privateKeyToAccount(opts.privateKey);
  const storeAddress = getAddress(opts.store ?? account.address);
  const client = createPublicClient({ transport: http(opts.rpcUrl) });
  const domain = earmarkDomain(opts.chainId, getAddress(opts.earmark));

  async function catalog(): Promise<ResolvedCatalogItem[]> {
    const raw = typeof opts.catalog === 'function' ? await opts.catalog() : opts.catalog;
    return resolveCatalog(raw, opts.storeSlug);
  }

  async function readGift(giftId: bigint): Promise<Gift> {
    const g = (await client.readContract({
      address: domain.verifyingContract,
      abi: earmarkAbi,
      functionName: 'getGift',
      args: [giftId],
    })) as Gift;
    return g;
  }

  async function sign(req: SignRequest): Promise<SignedOrder> {
    let giftId: bigint;
    try {
      giftId = BigInt(req.giftId);
    } catch {
      throw new EarmarkSignError(400, 'BAD_REQUEST', 'giftId must be a number.');
    }
    if (!req.receiver || !isAddress(req.receiver)) throw new EarmarkSignError(400, 'BAD_REQUEST', 'receiver must be an address.');
    if (!Array.isArray(req.cart)) throw new EarmarkSignError(400, 'BAD_REQUEST', 'cart must be a list.');

    const gift = await readGift(giftId);
    if (gift.status === 0) throw new EarmarkSignError(404, 'GIFT_NOT_FOUND', 'That gift does not exist.');
    if (gift.status === 2) throw new EarmarkSignError(409, 'GIFT_SPENT', 'This gift has already been spent.');
    if (gift.status === 3) throw new EarmarkSignError(409, 'GIFT_REFUNDED', 'This gift was refunded.');
    if (Number(gift.expiry) <= Math.floor(Date.now() / 1000)) {
      throw new EarmarkSignError(410, 'GIFT_EXPIRED', 'This gift has expired.');
    }
    if (getAddress(gift.store) !== storeAddress) {
      throw new EarmarkSignError(422, 'STORE_MISMATCH', 'This gift is for a different store.');
    }
    if (getAddress(gift.receiver) !== getAddress(req.receiver)) {
      throw new EarmarkSignError(403, 'RECEIVER_MISMATCH', 'This gift belongs to someone else.');
    }

    const items = await catalog();
    const item = items.find((i) => i.itemId.toLowerCase() === gift.itemId.toLowerCase());
    if (!item) throw new EarmarkSignError(422, 'ITEM_NOT_SOLD', 'This store does not sell the item on this gift.');

    // The cart must be exactly one unit of the gift's item. Browser prices are ignored.
    const lines = req.cart.filter((l) => l && Number(l.qty) > 0);
    const exact = lines.length === 1 && lines[0].sku === item.sku && Number(lines[0].qty) === 1;
    if (!exact) throw new EarmarkSignError(422, 'ITEM_MISMATCH', itemMismatchMessage(item.name));

    const price = BigInt(item.price);
    if (price > gift.amount) {
      throw new EarmarkSignError(422, 'OVER_AMOUNT', `This gift doesn't cover the ${item.name.toLowerCase()}.`);
    }

    const orderId = `0x${randomBytes(32).toString('hex')}` as Hex;
    const receiver = getAddress(gift.receiver);
    const signature = await account.signTypedData({
      domain,
      types: ORDER_TYPES,
      primaryType: 'Order',
      message: { giftId, itemId: item.itemId, price, orderId, receiver },
    });

    return {
      giftId: giftId.toString(),
      itemId: item.itemId,
      price: price.toString(),
      orderId,
      receiver,
      signature,
      store: storeAddress,
      chainId: opts.chainId,
      verifyingContract: domain.verifyingContract,
    };
  }

  return { sign, address: account.address, store: storeAddress, catalog, readGift };
}

export type EarmarkSigner = ReturnType<typeof earmarkSigner>;
