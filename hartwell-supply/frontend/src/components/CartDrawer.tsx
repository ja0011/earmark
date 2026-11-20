import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { formatUnits6 } from '../lib/money';
import { Media } from './Media';
import { QtyStepper } from './QtyStepper';

export function CartDrawer() {
  const { cart, bySku, subtotal, count, cartOpen, closeCart, setQty, remove } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (cartOpen && !d.open) d.showModal();
    if (!cartOpen && d.open) d.close();
  }, [cartOpen]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="cart-title"
      onClose={closeCart}
      onClick={(e) => {
        if (e.target === ref.current) closeCart();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="cart-title" className="font-store text-[1.5rem] font-bold">
            Your cart
          </h2>
          <button
            type="button"
            onClick={closeCart}
            className="flex size-11 items-center justify-center rounded-md hover:bg-shelf"
            aria-label="Close cart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {count === 0 ? (
          <div className="flex flex-1 flex-col items-start gap-4 px-5 py-8">
            <p className="text-[18px]">Nothing in here yet.</p>
            <button type="button" onClick={closeCart} className="min-h-12 rounded-md border border-ink/20 px-5 font-semibold hover:bg-shelf">
              Keep shopping
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5" aria-label="Items in cart">
              {cart.map((l) => {
                const p = bySku(l.sku);
                if (!p) return null;
                return (
                  <li key={l.sku} className="flex gap-4 py-4">
                    <Media name={p.image} alt="" ratio="1 / 1" sizes="96px" className="w-20 shrink-0 rounded-md sm:w-24" imgClassName="object-contain p-1.5" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold leading-snug">{p.title}</p>
                        <p className="font-mono text-[16px]">{formatUnits6(BigInt(p.price) * BigInt(l.qty))}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <QtyStepper label={p.title} qty={l.qty} onChange={(q) => setQty(l.sku, q)} />
                        <button type="button" onClick={() => remove(l.sku)} className="min-h-11 rounded-md px-2 text-[15px] font-medium text-muted underline underline-offset-4 hover:text-ink">
                          Remove<span className="sr-only"> {p.title}</span>
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line bg-shelf/60 px-5 py-5">
              <div className="mb-4 flex items-baseline justify-between">
                <span className="font-semibold">Subtotal</span>
                <span className="font-mono text-[1.25rem] font-medium">{formatUnits6(subtotal)}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeCart();
                  navigate('/checkout');
                }}
                className="min-h-13 w-full rounded-md bg-pine px-5 text-[18px] font-semibold text-paper hover:bg-pine-deep"
              >
                Go to checkout
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
