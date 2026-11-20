import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { encodeAbiParameters, keccak256 } from 'viem';
import { itemIdFor } from 'earmark-plugin';
import { LockBadge } from '../components/Lock';
import { gsap, prefersReducedMotion } from '../lib/motion';

const ROWS = ['Only this item. The snow shovel, nothing else.', 'Only this store. Hartwell Supply, nowhere else.', 'Only this person. Alex, nobody else.'];

// Illustrative demo addresses. The hash below is the real fingerprint of these inputs.
const MAYA = '0x4b7E2c1F9a03d56e8b1c0A77F2e9d4c83A6b5190' as const;
const ALEX = '0xa1Ec5d3B77e20f9C4D8b6A1E0f3C2d9b8E7f4A26' as const;
const STORE = '0x6d03dC4C231e74138F26598E272aD93C8161e378' as const;

function LockRow({ text, i }: { text: string; i: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const [closed, setClosed] = useState(prefersReducedMotion());
  useEffect(() => {
    if (closed) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setTimeout(() => setClosed(true), 180 + i * 60);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -25% 0px' },
    );
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);
  const [head, ...rest] = text.split('. ');
  return (
    <li ref={ref} className="flex items-center gap-5 border-t border-rule py-7 md:gap-8 md:py-9">
      <LockBadge size={52} open={!closed} label={closed ? 'Locked' : 'Locking'} />
      <p className="text-[22px] leading-snug md:text-[28px]">
        <strong className="font-semibold">{head}.</strong> <span className="text-ink-soft">{rest.join('. ')}</span>
      </p>
    </li>
  );
}

function Source({ k, v }: { k: string; v: string }) {
  const isAddr = v.startsWith('0x');
  return (
    <div className="fp-src mono flex items-baseline gap-4 rounded-xl border border-rule bg-paper px-4 py-3 text-[15px] md:text-[16px]">
      <span className="w-[56px] shrink-0 text-ink-soft">{k}</span>
      <span className="min-w-0 truncate" title={v}>
        {isAddr ? (
          <>
            <span className="hidden xl:inline">{v}</span>
            <span className="xl:hidden">{v.slice(0, 12)}…{v.slice(-8)}</span>
          </>
        ) : (
          v
        )}
      </span>
    </div>
  );
}

export function Rules() {
  const root = useRef<HTMLElement>(null);
  const hashRef = useRef<HTMLButtonElement>(null);
  const [rejected, setRejected] = useState(false);
  const reduced = prefersReducedMotion();

  const hash = useMemo(
    () =>
      keccak256(
        encodeAbiParameters(
          [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'uint64' }, { type: 'uint256' }],
          [MAYA, ALEX, STORE, itemIdFor('hartwell-supply', 'snow-shovel'), 45_000_000n, 1767225600n, 1n],
        ),
      ),
    [],
  );

  useLayoutEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      gsap.from('.rules-title .ln', { yPercent: 105, duration: 0.9, stagger: 0.08, ease: 'power4.out', scrollTrigger: { trigger: '.rules-title', start: 'top 85%' } });
      const tl = gsap.timeline({ scrollTrigger: { trigger: '.fp-stage', start: 'top 62%', toggleActions: 'play none none none' } });
      tl.from('.fp-src', { opacity: 0, x: (i) => (i % 2 ? 40 : -40), duration: 0.5, stagger: 0.08, ease: 'power3.out' })
        .to('.fp-src', {
          y: (_i, el: HTMLElement) => {
            const stage = (el.closest('.fp-stage') as HTMLElement).getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return stage.top + stage.height / 2 - (r.top + r.height / 2);
          },
          x: (_i, el: HTMLElement) => {
            const stage = (el.closest('.fp-stage') as HTMLElement).getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return stage.left + stage.width / 2 - (r.left + r.width / 2);
          },
          scale: 0.6,
          opacity: 0,
          filter: 'blur(4px)',
          duration: 0.8,
          stagger: 0.06,
          ease: 'power3.in',
        }, '+=0.5')
        .set('.fp-hash', { opacity: 1 }, '-=0.1')
        .from('.fp-ch', { opacity: 0, duration: 0.01, stagger: 0.018, ease: 'none' })
        .from('.fp-caption', { opacity: 0, y: 12, duration: 0.5 }, '-=0.3')
        .to('.fp-src', { x: 0, y: 0, scale: 1, filter: 'blur(0px)', opacity: 0.6, duration: 0.6, stagger: 0.05, ease: 'power2.out' }, '+=0.2');
    }, root);
    return () => ctx.revert();
  }, []);

  const reject = () => {
    if (rejected) return;
    setRejected(true);
    if (!reduced) gsap.fromTo(hashRef.current, { x: 0 }, { keyframes: { x: [-10, 9, -7, 6, -3, 0] }, duration: 0.45, ease: 'power1.out' });
    setTimeout(() => setRejected(false), 1100);
  };

  const sources = [
    { k: 'MAYA', v: MAYA },
    { k: 'ALEX', v: ALEX },
    { k: 'STORE', v: STORE },
    { k: 'ITEM', v: 'SNOW SHOVEL · $45.00 · 30 DAYS' },
  ];

  return (
    <section id="rules" ref={root} tabIndex={-1} aria-labelledby="rules-title" className="bg-receipt px-5 py-24 outline-none md:px-8 md:py-36">
      <div className="mx-auto max-w-[1180px]">
        <h2 id="rules-title" className="rules-title display" style={{ fontSize: 'clamp(3rem, 7.4vw, 7.4rem)' }}>
          <span className="block overflow-hidden"><span className="ln block">Only this.</span></span>
          <span className="block overflow-hidden"><span className="ln block">Only there.</span></span>
          <span className="block overflow-hidden"><span className="ln block">Only them.</span></span>
        </h2>
        <ul className="mt-14 border-b border-rule md:mt-20">
          {ROWS.map((r, i) => (
            <LockRow key={r} text={r} i={i} />
          ))}
        </ul>

        <div className="fp-stage relative mx-auto mt-24 grid max-w-[1080px] grid-cols-[minmax(0,1fr)] gap-3 md:mt-32 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-x-5 md:gap-y-4">
          {sources.slice(0, 2).map((s) => (
            <Source key={s.k} k={s.k} v={s.v} />
          ))}
          <div className="my-6 flex flex-col items-center text-center md:col-span-2 md:my-8">
            <button
              ref={hashRef}
              type="button"
              onMouseEnter={reject}
              onFocus={reject}
              onClick={reject}
              aria-label={`Fingerprint ${hash}. Change anything and it breaks.`}
              className="fp-hash relative w-full rounded-2xl bg-ink px-5 py-6 text-receipt md:px-10 md:py-9 on-dark"
              style={{ opacity: reduced ? 1 : 0 }}
            >
              <span className="mono block break-all text-[17px] leading-[1.6] md:text-[25px]" aria-hidden="true">
                {[...hash].map((c, i) => (
                  <span key={i} className="fp-ch">
                    {c}
                  </span>
                ))}
              </span>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-150 ${rejected ? 'opacity-100' : 'opacity-0'}`}
              >
                <span className="display rounded-lg border-[3px] border-seal bg-ink px-5 py-2 text-[clamp(2rem,5vw,3.5rem)] text-seal" style={{ transform: 'rotate(-4deg)' }}>
                  Rejected
                </span>
              </span>
            </button>
            <p className="fp-caption mt-6 text-[20px] md:text-[22px]">One fingerprint. Change anything and it breaks.</p>
          </div>
          {sources.slice(2).map((s) => (
            <Source key={s.k} k={s.k} v={s.v} />
          ))}
        </div>
      </div>
    </section>
  );
}
