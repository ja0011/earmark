import { useEffect, type ReactNode } from 'react';
import { Nav, type NavVariant } from './Nav';

export function AppLayout({ children, title, variant = 'app' }: { children: ReactNode; title: string; variant?: NavVariant }) {
  useEffect(() => {
    document.title = `${title} · Earmark`;
    window.scrollTo(0, 0);
  }, [title]);
  return (
    <div className="min-h-dvh bg-receipt text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-receipt">
        Skip to content
      </a>
      <Nav variant={variant} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1180px] px-5 pb-24 pt-[108px] md:px-8 md:pt-[128px] outline-none">
        {children}
      </main>
    </div>
  );
}
