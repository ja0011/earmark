import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap, prefersReducedMotion } from '../lib/motion';

const LINES = ['ITEM: SNOW SHOVEL', 'STORE: HARTWELL SUPPLY', 'FOR: ALEX', 'STATUS: LOCKED'];

/** Full-screen receipt veil. The receipt prints itself, then tears off along a zigzag edge. */
export function Loader({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [printed, setPrinted] = useState(false);
  const done = useRef(false);

  useLayoutEffect(() => {
    const el = root.current!;
    const reduced = prefersReducedMotion();
    const ctx = gsap.context(() => {
      if (reduced) {
        gsap.set('.ld-line, .ld-status', { opacity: 1 });
        setPrinted(true);
        return;
      }
      const tl = gsap.timeline({ onComplete: () => setPrinted(true) });
      tl.from('.ld-paper', { yPercent: -18, opacity: 0, duration: 0.45, ease: 'power2.out' });
      el.querySelectorAll<HTMLElement>('.ld-line').forEach((line, i) => {
        const chars = line.querySelectorAll('.ld-ch');
        tl.set(line, { opacity: 1 }, i === 0 ? '>' : '>-0.02');
        tl.from(chars, { opacity: 0, duration: 0.01, stagger: 0.022, ease: 'none' }, '<');
        tl.from('.ld-paper-inner', { y: 6, duration: 0.18, ease: 'power1.out' }, '<');
      });
      tl.to('.ld-status', { opacity: 1, duration: 0.3 }, '+=0.05');
    }, el);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!ready || !printed || done.current) return;
    done.current = true;
    const el = root.current!;
    if (prefersReducedMotion()) {
      gsap.to(el, { opacity: 0, duration: 0.3, onComplete: onDone });
      return;
    }
    const tl = gsap.timeline({ onComplete: onDone });
    tl.to('.ld-tear-top', { y: -window.innerHeight * 0.9, rotate: -3, duration: 0.85, ease: 'power3.in' }, 0.15)
      .to('.ld-tear-bottom', { y: 40, opacity: 0, duration: 0.6, ease: 'power2.in' }, 0.2)
      .to('.ld-status', { opacity: 0, duration: 0.2 }, 0)
      .to(el, { opacity: 0, duration: 0.45, ease: 'power1.out' }, 0.75);
  }, [ready, printed, onDone]);

  return (
    <div ref={root} className="fixed inset-0 z-[60] grid place-items-center bg-receipt" role="status" aria-live="polite" aria-label="Locking it in">
      <div className="flex flex-col items-center">
        <div className="ld-paper relative w-[280px]">
          <div className="ld-tear-top receipt-paper zigzag-bottom rounded-t-md px-6 pt-6 shadow-[0_20px_40px_-24px_rgba(18,18,18,.35)]">
            <div className="ld-paper-inner">
              <div className="mb-4 flex items-center justify-between border-b-2 border-dashed border-rule pb-3 text-[15px]">
                <span>EARMARK</span>
                <span className="text-ink-soft">#0001</span>
              </div>
              {LINES.map((l) => (
                <div key={l} className="ld-line py-[3px] text-[16px] tracking-[0.02em] opacity-0" aria-hidden="true">
                  {[...l].map((c, i) => (
                    <span key={i} className={`ld-ch ${l.startsWith('STATUS') && i > 7 ? 'text-seal' : ''}`}>
                      {c === ' ' ? ' ' : c}
                    </span>
                  ))}
                </div>
              ))}
              <div className="sr-only">{LINES.join('. ')}</div>
            </div>
          </div>
          <div className="ld-tear-bottom receipt-paper zigzag-top -mt-[2px] h-[34px] rounded-b-md" aria-hidden="true" />
        </div>
        <p className="ld-status mt-8 text-[18px] font-medium opacity-0">Locking it in…</p>
      </div>
    </div>
  );
}
