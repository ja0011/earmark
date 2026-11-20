import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { SignIn } from '../components/SignIn';
import { Notice } from '../components/Tx';
import { api } from '../lib/api';
import { sentence, type GiftView } from '../lib/gifts';
import { useWallet } from '../lib/wallet';

export default function Gifts() {
  const { wallet } = useWallet();
  const [received, setReceived] = useState<GiftView[] | null>(null);
  const [sent, setSent] = useState<GiftView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) return;
    setError(null);
    Promise.all([
      api<{ gifts: GiftView[] }>(`/api/gifts?receiver=${wallet.address}`),
      api<{ gifts: GiftView[] }>(`/api/gifts?sender=${wallet.address}`),
    ])
      .then(([r, s]) => (setReceived(r.gifts), setSent(s.gifts)))
      .catch((e) => setError(e.message));
  }, [wallet?.address]);

  const list = (gifts: GiftView[] | null, empty: string) =>
    !gifts ? null : gifts.length === 0 ? (
      <p className="text-[17px] text-ink-soft">{empty}</p>
    ) : (
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {gifts.map((g) => (
          <li key={g.id}>
            <Link to={`/gift/${g.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-paper">
              <span className="text-[18px]">
                <span className="mono mr-3 text-ink-soft">#{g.id.padStart(4, '0')}</span>
                {g.amountUsd} · {g.item ? sentence(g.item.name) : 'Item'} · {g.storeName ?? 'Store'}
              </span>
              <span className="inline-flex items-center gap-2 text-[16px] font-semibold">
                <span className={`h-[9px] w-[9px] rounded-full ${g.status === 'Locked' ? 'bg-seal' : g.status === 'Spent' ? 'bg-change' : 'bg-fog'}`} aria-hidden="true" />
                {g.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <AppLayout title="My gifts">
      <h1 className="display text-[clamp(2.75rem,6vw,5rem)]">Your gifts.</h1>
      <div className="mt-8 max-w-[760px]">
        {!wallet && <SignIn />}
        {error && <Notice tone="error">{error}</Notice>}
        {wallet && (
          <div className="flex flex-col gap-12">
            <SignIn compact />
            <section>
              <h2 className="mb-4 text-[22px] font-semibold">For you</h2>
              {list(received, 'Nothing for you yet.')}
            </section>
            <section>
              <h2 className="mb-4 text-[22px] font-semibold">You sent</h2>
              {list(sent, 'You haven’t sent a gift yet.')}
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
