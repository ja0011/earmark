import { keccak256, toBytes } from 'viem';

/**
 * The Hartwell Supply catalogue. The store is the source of truth for prices:
 * the signer looks prices up here, never from the cart the browser sends.
 */
export type Product = {
  sku: string;
  /** Receipt line, upper case */
  name: string;
  /** Shelf name for the store page */
  title: string;
  blurb: string;
  /** USDC, 6 decimals, as a string */
  price: string;
  priceUsd: string;
  /** Media base name: /media/<image>-640.webp etc. */
  image: string;
  earmark: boolean;
  itemId: `0x${string}`;
};

const ITEM_NAMESPACE = 'hartwell-supply';

export const itemIdForSku = (sku: string) => keccak256(toBytes(`${ITEM_NAMESPACE}:${sku}`));

// Testnet demo prices: about 1/100 of shelf price so a 20 USDC faucet drip covers ~35 full demos.
const rows: Omit<Product, 'itemId' | 'price'>[] = [
  { sku: 'snow-shovel', name: 'SNOW SHOVEL', title: 'Snow shovel', blurb: '24 inch poly blade, steel shaft.', priceUsd: '0.40', image: 'snow-shovel', earmark: true },
  { sku: 'ice-scraper', name: 'ICE SCRAPER', title: 'Ice scraper', blurb: 'Brass blade. Fits a glovebox.', priceUsd: '0.09', image: 'ice-scraper', earmark: true },
  { sku: 'work-gloves', name: 'INSULATED WORK GLOVES', title: 'Insulated work gloves', blurb: 'Lined leather palms. Size L.', priceUsd: '0.25', image: 'work-gloves', earmark: true },
  { sku: 'rock-salt', name: 'ROCK SALT 20 LB', title: 'Rock salt, 20 lb', blurb: 'For steps and driveways.', priceUsd: '0.13', image: 'rock-salt', earmark: true },
  { sku: 'claw-hammer', name: 'CLAW HAMMER', title: 'Claw hammer', blurb: '16 oz, wood handle.', priceUsd: '0.20', image: 'claw-hammer', earmark: true },
  { sku: 'cordless-drill', name: 'CORDLESS DRILL', title: 'Cordless drill', blurb: '18V, two batteries, charger.', priceUsd: '0.89', image: 'cordless-drill', earmark: true },
];

const usdToUnits = (usd: string) => {
  const [whole, frac = ''] = usd.split('.');
  return (BigInt(whole) * 1_000_000n + BigInt((frac + '000000').slice(0, 6))).toString();
};

export const catalog: Product[] = rows.map((r) => ({ ...r, price: usdToUnits(r.priceUsd), itemId: itemIdForSku(r.sku) }));

export const bySku = (sku: string) => catalog.find((p) => p.sku === sku);
