import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Row } from '../components/ReceiptRow';
import { gsap, prefersReducedMotion } from '../lib/motion';

/** A long receipt that tears upward as you reach the bottom. */
export function Footer() {
  const root = useRef<HTMLElement>(null);
  const reduced = prefersReducedMotion();

  useLayoutEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.ft-paper',
        { yPercent: 28, rotate: -1.2 },
        { yPercent: 0, rotate: 0, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom bottom', scrub: 0.6 } },
      );
    }, root);
    return () => ctx.revert();
  }, []);

  const top = () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    (document.querySelector('#hero-title') as HTMLElement | null)?.focus?.();
  };

  return (
    <footer ref={root} data-nav="dark" className="overflow-hidden bg-vault px-5 pt-24 md:px-8 md:pt-32">
      <div className="ft-paper receipt-paper zigzag-top mx-auto w-full max-w-[560px] rounded-b-none px-7 pb-12 text-[16px] md:px-10">
        <div className="flex items-center justify-between border-b-2 border-dashed border-rule pb-4">
          <span className="font-display text-[28px] font-extrabold tracking-[-0.02em]">EARMARK</span>
          <span className="text-ink-soft">THANK YOU</span>
        </div>
        <p className="py-6 text-[18px]">Built on Arc with USDC.</p>
        <nav aria-label="Footer" className="border-y-2 border-dashed border-rule py-4">
          <ul>
            <li><Row left={<a className="hover:text-seal hover:underline underline-offset-4" href="#how">How it works</a>} right="01" /></li>
            <li><Row left={<a className="hover:text-seal hover:underline underline-offset-4" href="#rules">The rules</a>} right="02" /></li>
            <li><Row left={<a className="hover:text-seal hover:underline underline-offset-4" href="#call">The call</a>} right="03" /></li>
            <li><Row left={<Link className="hover:text-seal hover:underline underline-offset-4" to="/send">Send a gift</Link>} right="04" /></li>
            <li><Row left={<Link className="hover:text-seal hover:underline underline-offset-4" to="/stores">For stores</Link>} right="05" /></li>
          </ul>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <span>© 2026 Earmark</span>
          <button type="button" onClick={top} className="font-semibold text-seal underline underline-offset-4">
            Back to the top
          </button>
        </div>
        {/* a barcode, because receipts have one */}
        <div className="mt-8 flex h-[44px] items-stretch gap-[3px]" aria-hidden="true">
          {Array.from({ length: 56 }, (_, i) => (
            <span key={i} className="bg-ink" style={{ width: [1, 2, 3, 1, 2][(i * 7) % 5], opacity: (i * 13) % 4 ? 1 : 0 }} />
          ))}
        </div>
      </div>
    </footer>
  );
}
