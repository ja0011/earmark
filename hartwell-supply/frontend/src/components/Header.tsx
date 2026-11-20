import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';

export function Header() {
  const { count, openCart } = useStore();
  return (
    <header className="no-print sticky top-0 z-30 bg-pine text-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-6">
        <Link to="/" className="group flex items-baseline gap-3 rounded-sm" aria-label="Hartwell Supply, home">
          <span className="font-store text-[1.375rem] font-extrabold leading-none tracking-[-0.01em] sm:text-[1.625rem]">
            HARTWELL SUPPLY
          </span>
          <span className="hidden text-[15px] text-paper/70 md:inline">Hardware on Alder Street</span>
        </Link>
        <button
          type="button"
          onClick={openCart}
          className="flex min-h-11 items-center gap-2.5 rounded-md border border-paper/25 px-3.5 text-[16px] font-semibold hover:bg-pine-soft"
          aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
        >
          <CartIcon />
          <span aria-hidden="true">Cart</span>
          <span
            aria-hidden="true"
            className={`min-w-7 rounded-full px-2 py-0.5 text-center font-mono text-[15px] leading-6 ${count ? 'bg-brass text-pine-deep' : 'bg-paper/15'}`}
          >
            {count}
          </span>
        </button>
      </div>
    </header>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 4h2.2l2.2 10.4a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
      <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
