import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap, prefersReducedMotion } from '../lib/motion';
import { PresentReveal } from './PresentReveal';

/**
 * Hero: the headline, and in the middle a wrapped present. Hover it to see the receipt inside;
 * "Show the receipt" takes the wrapping away.
 */
export function Hero({ started, onFirstFrame }: { started: boolean; onFirstFrame: () => void }) {
  const section = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const reduced = prefersReducedMotion();

  useLayoutEffect(() => {
    if (!started || reduced) return;
    const ctx = gsap.context(() => {
      gsap.from('.hero-line', { yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.08 });
      gsap.from('.hero-sub', { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 0.3 });
      gsap.from('.present', { y: 50, rotate: -4, opacity: 0, duration: 1.1, ease: 'power3.out', delay: 0.35 });
      gsap.from('.hero-cta', { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out', delay: 0.6, stagger: 0.07 });
    }, section);
    return () => ctx.revert();
  }, [started, reduced]);

  const scrollToHow = (e: React.MouseEvent) => {
    const el = document.getElementById('how');
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };

  return (
    <section ref={section} aria-labelledby="hero-title" className="bg-receipt text-ink">
      <div className="mx-auto flex min-h-[100svh] max-w-[1320px] flex-col items-center justify-center px-5 pb-10 pt-[84px] text-center md:px-8">
        <h1 id="hero-title" className="display" style={{ fontSize: 'clamp(4rem, 10vw, 10rem)' }}>
          <span className="block overflow-hidden pb-[0.04em]"><span className="hero-line block">Money with a</span></span>
          <span className="block overflow-hidden pb-[0.04em]"><span className="hero-line block">purpose.</span></span>
        </h1>
        <p className="hero-sub mt-5 max-w-[560px] text-balance text-[20px] leading-[1.45]">Send money that can only be spent on what you meant it for.</p>

        <PresentReveal open={open} onReady={onFirstFrame} className="mt-6" />

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="hero-cta btn btn-outline"
            aria-pressed={open}
            aria-controls="present-receipt"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Wrap it back up' : 'Show the receipt'}
          </button>
          <Link to="/send" className="hero-cta btn btn-seal">Send a gift</Link>
          <a href="#how" onClick={scrollToHow} className="hero-cta btn btn-outline">See how it works</a>
        </div>
      </div>
    </section>
  );
}
