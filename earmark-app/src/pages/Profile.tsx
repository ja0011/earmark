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
import { LanguagePicker, useT, type T } from '../lib/i18n';

type Activity = { id: string; kind: 'sent' | 'received' | 'spent' | 'refunded' | 'funded' | 'reply'; text: string; at: number | null; txHash: Hex | null; giftId?: string; audioUrl?: string; original?: string };

const STATUS: Record<GiftView['status'], { label: 'p.stWaiting' | 'p.stBought' | 'p.stRefunded'; dot: string }> = {
  Locked: { label: 'p.stWaiting', dot: 'bg-seal' },
  Spent: { label: 'p.stBought', dot: 'bg-change' },
  Refunded: { label: 'p.stRefunded', dot: 'bg-fog' },
  None: { label: 'p.stWaiting', dot: 'bg-fog' },
};

const sum = (gifts: GiftView[]) => gifts.reduce((a, g) => a + BigInt(g.amount), 0n);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function ago(at: number | null, t: T, locale: string) {
  if (!at) return '';
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return t('p.justNow');
  if (s < 3600) return t('p.minAgo', { n: Math.round(s / 60) });
  if (s < 86400) return t('p.hAgo', { n: Math.round(s / 3600) });
  return new Date(at).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function daysLeft(expiry: number, t: T) {
  const d = Math.ceil((expiry * 1000 - Date.now()) / 86_400_000);
  return d <= 0 ? t('gift.expired') : d === 1 ? t('p.dayLeft') : t('p.daysLeft', { n: d });
}

export default function Profile() {
  const { wallet, signOut } = useWallet();
  const cfg = useConfig();
  const { t, lang, locale } = useT();
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
      api<{ gifts: GiftView[] }>(`/api/gifts?receiver=${wallet.address}&lang=${lang}`),
      api<{ gifts: GiftView[] }>(`/api/gifts?sender=${wallet.address}&lang=${lang}`),
      api<{ activity: Activity[] }>(`/api/activity?address=${wallet.address}&lang=${lang}`),
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
  }, [wallet?.address, bump, lang]);

  // Live: any notification or gift change for this address refreshes the page (no reload needed).
  useEffect(() => {
    if (!wallet) return;
    const es = new EventSource(`/api/events?address=${wallet.address}`);
    const kick = () => setBump((b) => b + 1);
    es.addEventListener('notification', kick);
    es.addEventListener('gift', kick);
    return () => es.close();
  }, [wallet?.address]);

  // Default to the tab that has something in it; start over when the person switches.
  const picked = useRef(false);
  useEffect(() => {
    picked.current = false;
    setTab('for');
    setReceived(null);
    setSent(null);
    setActivity(null);
  }, [wallet?.address]);
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
      setFundMsg(r.already ? (r.message ?? 'You already have enough test USDC.') : t('p.getUsdc') + ' ✓');
      setBump((b) => b + 1);
    } catch (e) {
      setFundMsg(e instanceof ApiError ? e.message : 'Could not add test USDC.');
    } finally {
      setFunding(false);
    }
  };

  const tabs = [
    { key: 'for' as const, label: t('p.forYou'), gifts: received },
    { key: 'sent' as const, label: t('p.youSent'), gifts: sent },
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
      <AppLayout title={t('p.title')}>
        <h1 className="display text-[clamp(2.75rem,6vw,5rem)]">{t('p.yours')}</h1>
        <p className="mt-4 max-w-[560px] text-[19px] leading-[1.5] text-ink-soft">{t('p.signInBody')}</p>
        <div className="mt-8 max-w-[760px]">
          <SignIn />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t('p.title')}>
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
              {copied ? t('p.copied') : t('p.copy')}
            </button>
            <a href={addressUrl(cfg, wallet.address)} target="_blank" rel="noreferrer" className="font-semibold text-seal underline underline-offset-4">
              {t('p.explorer')}
            </a>
          </div>
          <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-rule bg-paper px-4 py-2 text-[16px] text-ink-soft">
            {wallet.kind === 'metamask' ? t('p.viaMM') : wallet.kind === 'demo' ? t('p.viaDemo', { name: wallet.name }) : t('p.viaPasskey')}
            <span aria-hidden="true">·</span>
            <button type="button" onClick={signOut} className="font-semibold text-ink underline underline-offset-4">
              {wallet.kind === 'metamask' ? t('si.disconnect') : t('p.switch')}
            </button>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <LanguagePicker id="lang-picker-profile" />
            <span className="max-w-[520px] text-[15px] text-ink-soft">{t('lang.help')}</span>
          </div>
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
            <h2 id="balance-title" className="text-[17px] font-semibold text-ink-soft">{t('p.balance')}</h2>
            <p className="mono mt-2 text-[clamp(2.75rem,7vw,4.25rem)] font-medium leading-none tracking-[-0.02em]" aria-live="polite" title={balance === null ? undefined : `${(Number(balance) / 1_000_000).toFixed(6)} USDC`}>
              {balance === null ? '—' : formatBalance(balance)}
            </p>
            <p className="mt-2 text-[16px] text-ink-soft">{t('p.balanceSub')}</p>
            <dl className="mt-6 grid gap-4 border-t border-dashed border-rule pt-5 sm:grid-cols-2">
              <div>
                <dt className="text-[16px] text-ink-soft">{t('p.lockedSent')}</dt>
                <dd className="mono mt-1 text-[20px]">
                  {formatUsdc(sum(lockedSent))} <span className="text-[16px] text-ink-soft">· {lockedSent.length} {lockedSent.length === 1 ? t('p.gift') : t('p.gifts')}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[16px] text-ink-soft">{t('p.waiting')}</dt>
                <dd className="mono mt-1 text-[20px]">
                  {formatUsdc(sum(waiting))} <span className="text-[16px] text-ink-soft">· {waiting.length} {waiting.length === 1 ? t('p.gift') : t('p.gifts')}</span>
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/send" className="btn btn-seal">{t('nav.send')}</Link>
              <button type="button" className="btn btn-outline" onClick={fund} disabled={funding}>
                {funding ? t('p.adding') : t('p.getUsdc')}
              </button>
            </div>
            {fundMsg && <p className="mt-3 text-[16px] text-ink-soft" role="status">{fundMsg}</p>}
            <p className="mt-3 text-[16px] text-ink-soft">
              {t('p.needMore')}{' '}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="font-semibold text-seal underline underline-offset-4">
                faucet.circle.com
              </a>
              .
            </p>
          </section>

          {/* Gifts */}
          <section aria-labelledby="gifts-title">
            <h2 id="gifts-title" className="mb-4 font-display text-[28px] font-extrabold tracking-[-0.02em]">{t('p.giftsTitle')}</h2>
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
                <p className="text-[17px] text-ink-soft">{t('p.loading')}</p>
              ) : current.gifts.length === 0 ? (
                <p className="text-[17px] text-ink-soft">{tab === 'for' ? t('p.nothingForYou') : t('p.notSent')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {current.gifts.map((g) => {
                    const st = STATUS[g.status] ?? STATUS.None;
                    const other = tab === 'for' ? t('p.from', { name: g.senderName ?? short(g.sender) }) : t('p.for', { name: g.receiverName ?? short(g.receiver) });
                    const change = g.change && BigInt(g.change) > 0n ? formatUsdc(BigInt(g.change)) : null;
                    const changeWho = g.changeTo && g.changeTo.toLowerCase() === g.receiver.toLowerCase() ? (tab === 'for' ? t('gift.you') : g.receiverName ?? 'them') : tab === 'for' ? g.senderName ?? t('gift.theSender') : t('gift.you');
                    return (
                      <li key={g.id}>
                        <Link to={`/gift/${g.id}`} className="block rounded-[16px] border border-rule bg-paper p-5 transition-colors hover:border-ink/40">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <span className="mono text-[24px] font-medium">{g.amountUsd}</span>
                            <span className="inline-flex items-center gap-2 text-[16px] font-semibold">
                              <span className={`h-[9px] w-[9px] rounded-full ${st.dot}`} aria-hidden="true" />
                              {t(st.label)}
                            </span>
                          </div>
                          <p className="mt-1 text-[17px]">
                            {g.itemLocal ? sentence(g.itemLocal) : g.item ? sentence(g.item.name) : 'Gift'} · {g.storeName ?? 'Store'} · {other}
                          </p>
                          <p className="mono mt-2 text-[15px] text-ink-soft">
                            #{g.id.padStart(4, '0')}
                            {g.status === 'Locked' && ` · ${daysLeft(g.expiry, t)}`}
                            {g.status === 'Spent' && change && (
                              <>
                                {' · '}
                                <span className="text-ink">{t('p.changeTo', { amount: change, name: changeWho })}</span>
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
          <h2 id="activity-title" className="mb-4 font-display text-[28px] font-extrabold tracking-[-0.02em]">{t('p.activity')}</h2>
          {!activity ? (
            <p className="text-[17px] text-ink-soft">{t('p.loading')}</p>
          ) : activity.length === 0 ? (
            <p className="text-[17px] text-ink-soft">{t('p.noActivity')}</p>
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
                  {a.original && <p className="mt-1 text-[16px] text-ink-soft">{t('p.original', { text: a.original })}</p>}
                  {a.audioUrl && <audio controls preload="none" src={a.audioUrl} aria-label={t('p.listen')} className="mt-2 h-10 max-w-full" />}
                  <p className="mono mt-1 flex flex-wrap gap-x-3 text-[15px] text-ink-soft">
                    {a.at && <time dateTime={new Date(a.at).toISOString()} title={new Date(a.at).toLocaleString(locale)}>{ago(a.at, t, locale)}</time>}
                    {a.txHash && (
                      <a href={txUrl(cfg, a.txHash)} target="_blank" rel="noreferrer" className="text-seal underline underline-offset-4">
                        {t('p.viewTx')}
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
