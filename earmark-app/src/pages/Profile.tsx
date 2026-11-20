import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Hex } from 'viem';
import { formatUsdc } from 'earmark-plugin';
import { AppLayout } from '../components/AppLayout';
import { SignIn } from '../components/SignIn';
import { Notice } from '../components/Tx';
import { api, ApiError } from '../lib/api';
import { formatBalance, useBalance } from '../lib/chain';
import { addressUrl, txUrl, useConfig } from '../lib/config';
import { sentence, type GiftView } from '../lib/gifts';
import { useWallet } from '../lib/wallet';

type Activity = { id: string; kind: 'sent' | 'received' | 'spent' | 'refunded' | 'funded'; text: string; at: number | null; txHash: Hex | null; giftId?: string };

const STATUS: Record<GiftView['status'], { label: string; dot: string }> = {
  Locked: { label: 'Waiting', dot: 'bg-seal' },
  Spent: { label: 'Bought', dot: 'bg-change' },
  Refunded: { label: 'Refunded', dot: 'bg-fog' },
  None: { label: 'Unknown', dot: 'bg-fog' },
};

const sum = (gifts: GiftView[]) => gifts.reduce((a, g) => a + BigInt(g.amount), 0n);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function ago(at: number | null) {
  if (!at) return '';
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysLeft(expiry: number) {
  const d = Math.ceil((expiry * 1000 - Date.now()) / 86_400_000);
  return d <= 0 ? 'Expired' : d === 1 ? '1 day left' : `${d} days left`;
}

export default function Profile() {
  const { wallet, signOut } = useWallet();
  const cfg = useConfig();
  const [bump, setBump] = useState(0);
  const balance = useBalance(cfg, wallet?.address, bump);
  const [received, setReceived] = useState<GiftView[] | null>(null);
  const [sent, setSent] = useState<GiftView[] | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'for' | 'sent'>('for');
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);
  const [fundMsg, setFundMsg] = useState<string | null>(null);

  // Gifts and activity, reloaded whenever something happens to this person.
  useEffect(() => {
    if (!wallet) return;
    let alive = true;
    Promise.all([
      api<{ gifts: GiftView[] }>(`/api/gifts?receiver=${wallet.address}`),
      api<{ gifts: GiftView[] }>(`/api/gifts?sender=${wallet.address}`),
      api<{ activity: Activity[] }>(`/api/activity?address=${wallet.address}`),
    ])
      .then(([r, s, a]) => {
        if (!alive) return;
        setReceived(r.gifts);
        setSent(s.gifts);
        setActivity(a.activity);
        setError(null);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [wallet?.address, bump]);

  // Live: any notification or gift change for this address refreshes the page (no reload needed).
  useEffect(() => {
    if (!wallet) return;
    const es = new EventSource(`/api/events?address=${wallet.address}`);
    const kick = () => setBump((b) => b + 1);
    es.addEventListener('notification', kick);
    es.addEventListener('gift', kick);
    return () => es.close();
  }, [wallet?.address]);

  // Default to the tab that has something in it.
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !received || !sent) return;
    picked.current = true;
    if (!received.length && sent.length) setTab('sent');
  }, [received, sent]);

  const lockedSent = useMemo(() => (sent ?? []).filter((g) => g.status === 'Locked'), [sent]);
  const waiting = useMemo(() => (received ?? []).filter((g) => g.status === 'Locked'), [received]);

  const copy = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const fund = async () => {
    if (!wallet) return;
    setFunding(true);
    setFundMsg(null);
    try {
      const r = await api<{ already?: boolean; message?: string }>('/api/demo/fund', { method: 'POST', json: { address: wallet.address, role: wallet.name } });
      setFundMsg(r.already ? 'You already have enough test USDC.' : 'Test USDC added.');
      setBump((b) => b + 1);
    } catch (e) {
      setFundMsg(e instanceof ApiError ? e.message : 'Could not add test USDC.');
    } finally {
      setFunding(false);
    }
  };

  const tabs = [
    { key: 'for' as const, label: 'For you', gifts: received },
    { key: 'sent' as const, label: 'You sent', gifts: sent },
  ];
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tab === 'for' ? 'sent' : 'for';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  const current = tabs.find((t) => t.key === tab)!;

  if (!wallet) {
    return (
      <AppLayout title="Profile">
        <h1 className="display text-[clamp(2.75rem,6vw,5rem)]">Your Earmark.</h1>
        <p className="mt-4 max-w-[560px] text-[19px] leading-[1.5] text-ink-soft">Use a passkey or connect MetaMask to see your balance, your gifts and everything that happened to them.</p>
        <div className="mt-8 max-w-[760px]">
          <SignIn />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Profile">
      {/* Who you are */}
      <div className="flex flex-wrap items-center gap-5">
        <span aria-hidden="true" className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-ink font-display text-[34px] font-extrabold text-receipt">
          {wallet.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <h1 className="display text-[clamp(2.75rem,6vw,4.5rem)]">{wallet.name}.</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[16px]">
            <span className="mono text-ink-soft" title={wallet.address}>{short(wallet.address)}</span>
            <button type="button" onClick={copy} className="font-semibold text-seal underline underline-offset-4">
              {copied ? 'Copied' : 'Copy address'}
            </button>
            <a href={addressUrl(cfg, wallet.address)} target="_blank" rel="noreferrer" className="font-semibold text-seal underline underline-offset-4">
              View on Arc explorer
            </a>
          </div>
          <p className="mt-1 text-[16px] text-ink-soft">
            {wallet.kind === 'metamask' ? 'Connected with MetaMask' : 'Signed in with your passkey'} ·{' '}
            <button type="button" onClick={signOut} className="font-semibold text-ink underline underline-offset-4">
              {wallet.kind === 'metamask' ? 'Disconnect' : 'Switch person'}
            </button>
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10">
          {/* Balance */}
          <section aria-labelledby="balance-title" className="rounded-[20px] border border-rule bg-paper p-6 md:p-8">
            <h2 id="balance-title" className="text-[17px] font-semibold text-ink-soft">Balance</h2>
            <p className="mono mt-2 text-[clamp(2.75rem,7vw,4.25rem)] font-medium leading-none tracking-[-0.02em]" aria-live="polite" title={balance === null ? undefined : `${(Number(balance) / 1_000_000).toFixed(6)} USDC`}>
              {balance === null ? '—' : formatBalance(balance)}
            </p>
            <p className="mt-2 text-[16px] text-ink-soft">USDC on Arc · yours to spend</p>
            <dl className="mt-6 grid gap-4 border-t border-dashed border-rule pt-5 sm:grid-cols-2">
              <div>
                <dt className="text-[16px] text-ink-soft">Locked in gifts you sent</dt>
                <dd className="mono mt-1 text-[20px]">
                  {formatUsdc(sum(lockedSent))} <span className="text-[16px] text-ink-soft">· {lockedSent.length} {lockedSent.length === 1 ? 'gift' : 'gifts'}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[16px] text-ink-soft">Waiting for you</dt>
                <dd className="mono mt-1 text-[20px]">
                  {formatUsdc(sum(waiting))} <span className="text-[16px] text-ink-soft">· {waiting.length} {waiting.length === 1 ? 'gift' : 'gifts'}</span>
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/send" className="btn btn-seal">Send a gift</Link>
              <button type="button" className="btn btn-outline" onClick={fund} disabled={funding}>
                {funding ? 'Adding…' : 'Get test USDC'}
              </button>
            </div>
            {fundMsg && <p className="mt-3 text-[16px] text-ink-soft" role="status">{fundMsg}</p>}
            <p className="mt-3 text-[16px] text-ink-soft">
              Need more? Get Arc Testnet USDC at{' '}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="font-semibold text-seal underline underline-offset-4">
                faucet.circle.com
              </a>
              .
            </p>
          </section>

          {/* Gifts */}
          <section aria-labelledby="gifts-title">
            <h2 id="gifts-title" className="mb-4 font-display text-[28px] font-extrabold tracking-[-0.02em]">Gifts</h2>
            <div role="tablist" aria-label="Gifts" className="mb-5 inline-flex rounded-full border border-rule bg-paper p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  id={`tab-${t.key}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.key}
                  aria-controls={`panel-${t.key}`}
                  tabIndex={tab === t.key ? 0 : -1}
                  onKeyDown={onTabKey}
                  onClick={() => setTab(t.key)}
                  className={`rounded-full px-5 py-2 text-[16px] font-semibold transition-colors ${tab === t.key ? 'bg-ink text-receipt' : 'text-ink hover:bg-receipt'}`}
                >
                  {t.label}
                  {t.gifts && <span className="mono ml-2 opacity-70">{t.gifts.length}</span>}
                </button>
              ))}
            </div>
            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {!current.gifts ? (
                <p className="text-[17px] text-ink-soft">Loading…</p>
              ) : current.gifts.length === 0 ? (
                <p className="text-[17px] text-ink-soft">{tab === 'for' ? 'Nothing for you yet.' : 'You haven’t sent a gift yet.'}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {current.gifts.map((g) => {
                    const st = STATUS[g.status] ?? STATUS.None;
                    const other = tab === 'for' ? `from ${g.senderName ?? short(g.sender)}` : `for ${g.receiverName ?? short(g.receiver)}`;
                    const change = g.change && BigInt(g.change) > 0n ? formatUsdc(BigInt(g.change)) : null;
                    const changeWho = g.changeTo && g.changeTo.toLowerCase() === g.receiver.toLowerCase() ? (tab === 'for' ? 'you' : g.receiverName ?? 'them') : tab === 'for' ? g.senderName ?? 'the sender' : 'you';
                    return (
                      <li key={g.id}>
                        <Link to={`/gift/${g.id}`} className="block rounded-[16px] border border-rule bg-paper p-5 transition-colors hover:border-ink/40">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <span className="mono text-[24px] font-medium">{g.amountUsd}</span>
                            <span className="inline-flex items-center gap-2 text-[16px] font-semibold">
                              <span className={`h-[9px] w-[9px] rounded-full ${st.dot}`} aria-hidden="true" />
                              {st.label}
                            </span>
                          </div>
                          <p className="mt-1 text-[17px]">
                            {g.item ? sentence(g.item.name) : 'Gift'} · {g.storeName ?? 'Store'} · {other}
                          </p>
                          <p className="mono mt-2 text-[15px] text-ink-soft">
                            #{g.id.padStart(4, '0')}
                            {g.status === 'Locked' && ` · ${daysLeft(g.expiry)}`}
                            {g.status === 'Spent' && change && (
                              <>
                                {' · '}
                                <span className="text-ink">+{change} change to {changeWho}</span>
                              </>
                            )}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Activity */}
        <section aria-labelledby="activity-title" className="min-w-0">
          <h2 id="activity-title" className="mb-4 font-display text-[28px] font-extrabold tracking-[-0.02em]">Activity</h2>
          {!activity ? (
            <p className="text-[17px] text-ink-soft">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-[17px] text-ink-soft">Nothing yet. Send or receive a gift and it shows up here.</p>
          ) : (
            <ol className="relative flex flex-col border-l-2 border-rule pl-6" aria-live="polite">
              {activity.map((a) => (
                <li key={a.id} className="relative pb-6 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[33px] top-[7px] h-[14px] w-[14px] rounded-full border-2 border-receipt ${
                      a.kind === 'spent' ? 'bg-change' : a.kind === 'refunded' || a.kind === 'funded' ? 'bg-fog' : 'bg-seal'
                    }`}
                  />
                  <p className="text-[17px] leading-[1.45]">
                    {a.giftId ? (
                      <Link to={`/gift/${a.giftId}`} className="hover:underline underline-offset-4">
                        {a.text}
                      </Link>
                    ) : (
                      a.text
                    )}
                  </p>
                  <p className="mono mt-1 flex flex-wrap gap-x-3 text-[15px] text-ink-soft">
                    {a.at && <time dateTime={new Date(a.at).toISOString()} title={new Date(a.at).toLocaleString()}>{ago(a.at)}</time>}
                    {a.txHash && (
                      <a href={txUrl(cfg, a.txHash)} target="_blank" rel="noreferrer" className="text-seal underline underline-offset-4">
                        View transaction
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
