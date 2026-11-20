import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EarmarkPayButton, type PayError, type PayResult } from 'earmark-plugin/react';
import { Media } from '../components/Media';
import { QtyStepper } from '../components/QtyStepper';
import { useStore } from '../lib/store';
import { formatUnits6 } from '../lib/money';
import { saveOrder, type Order } from '../lib/api';

export function Checkout() {
  const { store, cart, bySku, subtotal, count, setQty, remove, clear, loading } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState<PayError | null>(null);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(
    () =>
      cart.flatMap((l) => {
        const p = bySku(l.sku);
        return p ? [{ sku: p.sku, qty: l.qty, name: p.name, title: p.title, price: p.price, image: p.image }] : [];
      }),
    [cart, bySku],
  );
  const cartKey = lines.map((l) => `${l.sku}x${l.qty}`).join(',');

  // A changed cart is a fresh attempt.
  useEffect(() => {
    setError(null);
  }, [cartKey]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onPaid(r: PayResult) {
    setSaving(true);
    const draft = {
      txHash: r.txHash,
      giftId: r.giftId,
      price: r.price,
      change: r.change,
      changeTo: r.changeTo,
      lines: lines.map(({ sku, name, qty, price }) => ({ sku, name, qty, price })),
    };
    let order: Order;
    try {
      order = await saveOrder(draft);
    } catch {
      order = { ...draft, changeToName: null, paidAt: new Date().toISOString() };
    }
    clear();
    navigate(`/receipt/${r.txHash}`, { state: { order } });
  }

  if (!loading && count === 0 && !saving) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <h1 className="font-store text-[2.25rem] font-extrabold tracking-[-0.02em]">Checkout</h1>
        <p className="mt-3 text-[18px] text-muted">Your cart is empty.</p>
        <Link to="/" className="mt-6 inline-flex min-h-12 items-center rounded-md bg-pine px-5 font-semibold text-paper hover:bg-pine-deep">
          Back to the shop
        </Link>
      </main>
    );
  }

  const signUrl = store?.signUrl ?? `${window.location.origin}/earmark/sign`;

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Link to="/" className="inline-flex min-h-11 items-center text-[16px] font-medium text-muted underline underline-offset-4 hover:text-ink">
        Back to the shop
      </Link>
      <h1 className="mt-2 font-store text-[2.25rem] font-extrabold leading-none tracking-[-0.02em] sm:text-[3rem]">Checkout</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <section aria-labelledby="order-title">
          <h2 id="order-title" className="border-b border-line pb-3 text-[20px] font-semibold">
            Your order
          </h2>
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.sku} className="flex gap-4 py-4">
                <Media name={l.image} alt="" ratio="1 / 1" sizes="96px" className="w-20 shrink-0 rounded-md sm:w-24" imgClassName="object-contain p-1.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-snug">{l.title}</p>
                    <p className="font-mono text-[16px]">{formatUnits6(BigInt(l.price) * BigInt(l.qty))}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <QtyStepper label={l.title} qty={l.qty} onChange={(q) => setQty(l.sku, q)} />
                    <button type="button" onClick={() => remove(l.sku)} className="min-h-11 rounded-md px-2 text-[15px] font-medium text-muted underline underline-offset-4 hover:text-ink">
                      Remove<span className="sr-only"> {l.title}</span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-ink/80 pt-4">
            <span className="text-[18px] font-semibold">Total</span>
            <span className="font-mono text-[1.375rem] font-medium">{formatUnits6(subtotal)}</span>
          </div>
        </section>

        <section aria-labelledby="pay-title" className="lg:pt-0">
          <h2 id="pay-title" className="border-b border-line pb-3 text-[20px] font-semibold">
            How would you like to pay?
          </h2>

          <div className="mt-5 rounded-lg border border-ink/15 bg-white p-5">
            <h3 className="text-[18px] font-semibold">Pay with Earmark gift</h3>
            <p className="mt-1 text-[16px] text-muted">Someone sent you money for an item here? Spend it now. Small change goes to you.</p>
            <div className="mt-4">
              {store?.address ? (
                <EarmarkPayButton
                  store={store.address}
                  cart={lines.map(({ sku, qty, name, price }) => ({ sku, qty, name, price }))}
                  signUrl={signUrl}
                  earmarkUrl={store.earmarkAppUrl}
                  disabled={saving || lines.length === 0}
                  onPaid={onPaid}
                  onError={(e) => setError(e)}
                />
              ) : (
                <p className="rounded-md bg-shelf px-4 py-3 text-[16px]">
                  {loading ? 'Loading…' : 'Earmark is not set up for this store yet.'}
                </p>
              )}
            </div>
            {saving && (
              <p role="status" className="mt-3 text-[16px]">
                Paid. Printing your receipt…
              </p>
            )}
            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="mt-4 flex gap-3 rounded-md border border-stop/30 bg-stop-bg px-4 py-3 text-stop"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" className="mt-0.5 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 7v6.5M12 16.6v.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                <div>
                  <p className="text-[18px] font-semibold leading-snug">{error.message}</p>
                  {error.code === 'ITEM_MISMATCH' && (
                    <p className="mt-1 text-[16px] text-ink/80">Change your cart to just that item, then try again.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-line bg-paper p-5">
            <h3 className="text-[18px] font-semibold text-ink/70">Pay with card</h3>
            <button
              type="button"
              disabled
              aria-describedby="card-note"
              className="mt-3 min-h-14 w-full rounded-xl border border-ink/15 bg-shelf px-5 text-[17px] font-semibold text-ink/50"
            >
              Pay with card
            </button>
            <p id="card-note" className="mt-2 text-[15px] text-muted">
              Card payments are off in this demo store.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
