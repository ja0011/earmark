import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getProducts, type Product, type StoreInfo } from './api';

type CartLine = { sku: string; qty: number };

type StoreCtx = {
  store: StoreInfo | null;
  products: Product[];
  loading: boolean;
  loadError: string | null;
  bySku: (sku: string) => Product | undefined;
  cart: CartLine[];
  count: number;
  subtotal: string;
  add: (sku: string) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
};

const Ctx = createContext<StoreCtx | null>(null);
const KEY = 'hartwell:cart';

function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.sku === 'string' && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>(readCart);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getProducts()
      .then((r) => {
        if (!alive) return;
        setStore(r.store);
        setProducts(r.products);
      })
      .catch(() => alive && setLoadError('The shop is closed for a moment. Try again shortly.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {
      /* private mode: cart lives in memory only */
    }
  }, [cart]);

  const bySku = useCallback((sku: string) => products.find((p) => p.sku === sku), [products]);

  const add = useCallback((sku: string) => {
    setCart((c) => {
      const hit = c.find((l) => l.sku === sku);
      return hit ? c.map((l) => (l.sku === sku ? { ...l, qty: Math.min(l.qty + 1, 20) } : l)) : [...c, { sku, qty: 1 }];
    });
  }, []);
  const setQty = useCallback((sku: string, qty: number) => {
    setCart((c) => (qty <= 0 ? c.filter((l) => l.sku !== sku) : c.map((l) => (l.sku === sku ? { ...l, qty: Math.min(qty, 20) } : l))));
  }, []);
  const remove = useCallback((sku: string) => setCart((c) => c.filter((l) => l.sku !== sku)), []);
  const clear = useCallback(() => setCart([]), []);

  const value = useMemo<StoreCtx>(() => {
    const known = cart.filter((l) => products.length === 0 || products.some((p) => p.sku === l.sku));
    const count = known.reduce((a, l) => a + l.qty, 0);
    const subtotal = known
      .reduce((a, l) => a + BigInt(products.find((p) => p.sku === l.sku)?.price ?? '0') * BigInt(l.qty), 0n)
      .toString();
    return {
      store,
      products,
      loading,
      loadError,
      bySku,
      cart: known,
      count,
      subtotal,
      add,
      setQty,
      remove,
      clear,
      cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
    };
  }, [store, products, loading, loadError, bySku, cart, add, setQty, remove, clear, cartOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
