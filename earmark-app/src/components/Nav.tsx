import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../lib/wallet';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#rules', label: 'The rules' },
  { href: '#call', label: 'The call' },
  { href: '#try', label: 'Try it' },
];

export function Nav({ variant = 'app' }: { variant?: 'landing' | 'app' }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { wallet } = useWallet();
  const loc = useLocation();

  const [overDark, setOverDark] = useState(false);

  useEffect(() => {
    if (variant !== 'landing') return;
    const on = () => {
      setScrolled(window.scrollY > window.innerHeight * 0.85);
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

  const dark = variant === 'landing' && !scrolled;
  const vault = variant === 'landing' && scrolled && overDark;
  const base = variant === 'landing' ? '' : '/';
  const links = variant === 'landing' ? LINKS : [
    { href: '/send', label: 'Send' },
    { href: '/stores', label: 'For stores' },
    ...(wallet ? [{ href: '/gifts', label: 'My gifts' }] : []),
  ];

  const go = (href: string) => (e: React.MouseEvent) => {
    if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) {
        e.preventDefault();
        setOpen(false);
        el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        (el as HTMLElement).focus?.({ preventScroll: true });
      }
    }
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        dark ? 'text-ink' : vault ? 'border-b border-white/10 bg-vault/90 text-receipt backdrop-blur-md on-dark' : 'border-b border-rule/70 bg-receipt/92 text-ink backdrop-blur-md'
      }`}
    >
      <nav aria-label="Main" className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between px-5 md:px-8">
        <Link to="/" className="font-display text-[26px] font-extrabold leading-none tracking-[-0.02em]" aria-label="Earmark, home">
          EARMARK
        </Link>
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              {l.href.startsWith('#') ? (
                <a href={base + l.href} onClick={go(l.href)} className="text-[16px] font-medium opacity-90 hover:opacity-100 hover:underline underline-offset-[6px] decoration-2 decoration-seal">
                  {l.label}
                </a>
              ) : (
                <Link to={l.href} className={`text-[16px] font-medium hover:underline underline-offset-[6px] decoration-2 decoration-seal ${loc.pathname === l.href ? 'underline' : ''}`}>
                  {l.label}
                </Link>
              )}
            </li>
          ))}
          {variant === 'app' && wallet && (
            <li className="mono text-[15px] text-ink-soft" aria-label={`Signed in as ${wallet.name}`}>
              {wallet.name} · {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
            </li>
          )}
        </ul>
        <button
          type="button"
          className="md:hidden -mr-2 grid h-11 w-11 place-items-center rounded-full"
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
        <div id="mobile-menu" className="md:hidden border-t border-rule bg-receipt text-ink">
          <ul className="flex flex-col px-5 py-3">
            {links.map((l) => (
              <li key={l.href}>
                {l.href.startsWith('#') ? (
                  <a href={l.href} onClick={go(l.href)} className="block py-3 text-[18px] font-medium">
                    {l.label}
                  </a>
                ) : (
                  <Link to={l.href} className="block py-3 text-[18px] font-medium">
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
