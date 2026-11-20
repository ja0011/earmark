import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getOrder, txUrl, type Order } from '../lib/api';
import { formatUnits6, shortHash } from '../lib/money';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline ${strong ? 'font-semibold' : ''}`}>
      <span className="min-w-0 break-words">{label}</span>
      <span className="leader" aria-hidden="true" />
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

export function Receipt() {
  const { txHash = '' } = useParams();
  const location = useLocation();
  const initial = (location.state as { order?: Order } | null)?.order ?? null;
  const [order, setOrder] = useState<Order | null>(initial);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    // Refresh from the store's log (it may have the receiver's name).
    getOrder(txHash)
      .then((o) => alive && setOrder(o))
      .catch(() => alive && !initial && setMissing(true));
    return () => {
      alive = false;
    };
  }, [txHash, initial]);

  if (missing) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <h1 className="font-store text-[2.25rem] font-extrabold">Receipt not found</h1>
        <p className="mt-3 text-muted">We have no order with that transaction.</p>
        <Link to="/" className="mt-6 inline-flex min-h-12 items-center rounded-md bg-pine px-5 font-semibold text-paper">
          Back to the shop
        </Link>
      </main>
    );
  }
  if (!order) {
    return (
      <main id="main" className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <p role="status">Printing your receipt…</p>
      </main>
    );
  }

  const gift = (BigInt(order.price) + BigInt(order.change)).toString();
  const who = (order.changeToName ?? `${order.changeTo.slice(0, 6)}…${order.changeTo.slice(-4)}`).toUpperCase();
  const when = new Date(order.paidAt);
  const lines = order.lines.length ? order.lines : [{ sku: 'item', name: 'ITEM', qty: 1, price: order.price }];

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
      <div className="no-print mx-auto max-w-md">
        <h1 className="font-store text-[2.25rem] font-extrabold leading-none tracking-[-0.02em]">Paid. Thank you.</h1>
        <p className="mt-2 text-[18px] text-muted">Your receipt is below. Pick up at the counter.</p>
      </div>

      <figure className="mx-auto mt-8 max-w-md drop-shadow-[0_10px_24px_rgba(30,31,26,0.12)]" aria-labelledby="receipt-title">
        <div className="receipt-edge top" aria-hidden="true" />
        <div className="bg-white px-6 py-7 font-mono text-[16px] leading-relaxed text-ink sm:px-8">
          <div className="text-center">
            <p id="receipt-title" className="font-store text-[1.75rem] font-extrabold leading-none tracking-[-0.01em]">
              HARTWELL SUPPLY
            </p>
            <p className="mt-2">214 ALDER STREET</p>
            <p>
              {when.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase()}{' '}
              {when.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <div className="my-5 border-t-2 border-dashed border-ink/30" />

          <div className="space-y-1">
            {lines.map((l) => (
              <Row key={l.sku} label={l.qty > 1 ? `${l.name} x${l.qty}` : l.name} value={formatUnits6(order.price)} />
            ))}
          </div>

          <div className="my-5 border-t-2 border-dashed border-ink/30" />

          <div className="space-y-1">
            <Row label={`EARMARK GIFT #${order.giftId}`} value={formatUnits6(gift)} />
            <Row label="PAID" value={formatUnits6(order.price)} strong />
            <Row label={`CHANGE TO ${who}`} value={formatUnits6(order.change)} strong />
          </div>

          <div className="my-5 border-t-2 border-dashed border-ink/30" />

          <p className="text-[15px]">ARC TESTNET TRANSACTION</p>
          <a
            href={txUrl(order.txHash)}
            target="_blank"
            rel="noreferrer"
            className="break-all text-[15px] underline underline-offset-4 hover:text-pine"
          >
            {shortHash(order.txHash, 14, 10)}
            <span className="sr-only"> (opens the block explorer in a new tab)</span>
          </a>
          <p className="mt-6 text-center">THANK YOU. COME AGAIN.</p>
        </div>
        <div className="receipt-edge" aria-hidden="true" />
      </figure>

      <div className="no-print mx-auto mt-8 flex max-w-md flex-wrap gap-3">
        <a
          href={txUrl(order.txHash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center rounded-md bg-pine px-5 font-semibold text-paper hover:bg-pine-deep"
        >
          View transaction<span className="sr-only"> on the block explorer, opens in a new tab</span>
        </a>
        <button type="button" onClick={() => window.print()} className="min-h-12 rounded-md border border-ink/20 px-5 font-semibold hover:bg-shelf">
          Print
        </button>
        <Link to="/" className="inline-flex min-h-12 items-center rounded-md px-3 font-semibold underline underline-offset-4">
          Back to the shop
        </Link>
      </div>
    </main>
  );
}
