import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatBalance, useBalance } from '../lib/chain';
import { useConfig } from '../lib/config';
import { useWallet } from '../lib/wallet';

export type NavVariant = 'landing' | 'app' | 'stores';
type NavLink = { href: string; label: string; external?: boolean };

/** Landing: the story sections. The app and the stores area each get their own clear entry on the right. */
const LANDING: NavLink[] = [
  { href: '#how', label: 'How it works' },
  { href: '#rules', label: 'The rules' },
  { href: '#call', label: 'The call' },
];

const linkCls = 'text-[16px] font-medium hover:underline underline-offset-[6px] decoration-2 decoration-seal';

/**
 * Three top bars for three audiences:
 * - landing: the story, plus "For stores" and "Open the app"
 * - app: what shoppers do (send, profile, shop) and their name + balance
 * - stores: a separate dark bar for shop owners adding Earmark
 */
export function Nav({ variant = 'app' }: { variant?: NavVariant }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { wallet } = useWallet();
  const loc = useLocation();
  const cfg = useConfig();
  const balance = useBalance(variant === 'app' ? cfg : null, wallet?.address);
  const [overDark, setOverDark] = useState(false);

  useEffect(() => {
    if (variant !== 'landing') return;
    const on = () => {
      setScrolled(window.scrollY > 8); // the hero is paper, so the bar needs its backing as soon as text scrolls under it
      // Match the bar to the section under it: dark over Vault sections, paper over Receipt ones.
      const y = 34;
      const dark = [...document.querySelectorAll<HTMLElement>('[data-nav="dark"]')].some((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= y && r.bottom >= y;
      });
      setOverDark(dark);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [variant]);

  useEffect(() => setOpen(false), [loc.pathname]);

  const links: NavLink[] =
    variant === 'landing'
      ? LANDING
      : variant === 'stores'
        ? [{ href: '/stores', label: 'Add Earmark' }]
        : [
            { href: '/send', label: 'Send a gift' },
            { href: '/me', label: 'Profile' },
            { href: cfg?.hartwellUrl ?? 'http://localhost:5174', label: 'Shop at Hartwell', external: true },
          ];

  const go = (href: string) => (e: React.MouseEvent) => {
    if (!href.startsWith('#')) return;
    const el = document.querySelector(href);
    if (!el) return;
    e.preventDefault();
    setOpen(false);
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    (el as HTMLElement).focus?.({ preventScroll: true });
  };

  const top = variant === 'landing' && !scrolled;
  const vault = variant === 'stores' || (variant === 'landing' && scrolled && overDark);
  const bar = top
    ? 'text-ink'
    : vault
      ? 'border-b border-white/10 bg-vault/95 text-receipt backdrop-blur-md on-dark'
      : 'border-b border-rule/70 bg-receipt/92 text-ink backdrop-blur-md';

  const renderLink = (l: NavLink, cls: string) =>
    l.href.startsWith('#') ? (
      <a href={l.href} onClick={go(l.href)} className={cls}>
        {l.label}
      </a>
    ) : l.external ? (
      <a href={l.href} className={cls}>
        {l.label}
      </a>
    ) : (
      <Link to={l.href} className={`${cls} ${loc.pathname === l.href ? 'underline' : ''}`} aria-current={loc.pathname === l.href ? 'page' : undefined}>
        {l.label}
      </Link>
    );

  const chip = wallet && variant === 'app' && (
    <Link
      to="/me"
      className="mono inline-flex items-center gap-2 rounded-full border border-rule bg-paper px-4 py-2 text-[15px] hover:border-ink/40"
      aria-label={`Your profile: ${wallet.name}, balance ${balance === null ? 'loading' : formatBalance(balance)}`}
      title={balance === null ? undefined : `${(Number(balance) / 1_000_000).toFixed(6)} USDC`}
    >
      <span className="font-sans font-semibold">{wallet.name}</span>
      <span aria-hidden="true">·</span>
      <span>{balance === null ? '—' : formatBalance(balance)}</span>
    </Link>
  );

  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${bar}`}>
      <nav aria-label="Main" className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between gap-6 px-5 md:px-8">
        <Link to={variant === 'stores' ? '/stores' : '/'} className="flex items-baseline gap-2 leading-none" aria-label={variant === 'stores' ? 'Earmark for stores, home' : 'Earmark, home'}>
          <span className="font-display text-[26px] font-extrabold tracking-[-0.02em]">EARMARK</span>
          {variant === 'stores' && <span className="rounded-full bg-seal px-3 py-1 text-[15px] font-semibold text-white">for stores</span>}
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <ul className="flex items-center gap-8">
            {links.map((l) => (
              <li key={l.href}>{renderLink(l, `${linkCls} ${variant === 'landing' ? 'opacity-90 hover:opacity-100' : ''}`)}</li>
            ))}
          </ul>

          {variant === 'landing' && (
            <div className="flex items-center gap-5">
              <span aria-hidden="true" className="h-6 w-px bg-current opacity-25" />
              <Link to="/stores" className={`${linkCls} opacity-80 hover:opacity-100`}>
                For stores
              </Link>
              <Link to="/me" className="btn btn-seal !min-h-[44px] !px-5 !py-2">
                Open the app
              </Link>
            </div>
          )}
          {variant === 'app' && chip}
          {variant === 'stores' && (
            <Link to="/" className={`${linkCls} opacity-80 hover:opacity-100`}>
              ← Back to Earmark
            </Link>
          )}
        </div>

        <button
          type="button"
          className="-mr-2 grid h-11 w-11 place-items-center rounded-full md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className={`md:hidden border-t ${variant === 'stores' ? 'border-white/10 bg-vault text-receipt' : 'border-rule bg-receipt text-ink'}`}>
          <ul className="flex flex-col px-5 py-3">
            {variant === 'app' && wallet && <li className="py-3">{chip}</li>}
            {links.map((l) => (
              <li key={l.href}>{renderLink(l, 'block py-3 text-[18px] font-medium')}</li>
            ))}
            {variant === 'landing' && (
              <>
                <li>
                  <Link to="/stores" className="block py-3 text-[18px] font-medium">
                    For stores
                  </Link>
                </li>
                <li className="py-3">
                  <Link to="/me" className="btn btn-seal w-full justify-center">
                    Open the app
                  </Link>
                </li>
              </>
            )}
            {variant === 'stores' && (
              <li>
                <Link to="/" className="block py-3 text-[18px] font-medium">
                  ← Back to Earmark
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  );
}
