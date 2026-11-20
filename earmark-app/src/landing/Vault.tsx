import { useLayoutEffect, useRef } from 'react';
import { GiftCard } from '../components/GiftCard';
import { LockGlyph } from '../components/Lock';
import { Coins, Row } from '../components/ReceiptRow';
import { gsap, ScrollTrigger, prefersReducedMotion, useMedia } from '../lib/motion';

const BEATS = [
  { key: 'lock', label: 'Lock', text: 'Maya locks $45 for one shovel at one store.' },
  { key: 'shop', label: 'Shop', text: 'Alex buys it at Hartwell Supply with one tap.' },
  { key: 'change', label: 'Change', text: 'The $5.02 left over goes straight to Alex.' },
];

function ReceiptBlocks({ beat }: { beat?: number }) {
  const show = (i: number) => (beat === undefined ? true : beat >= i);
  return (
    <>
      <div className="rc-block" data-i="0" style={show(0) ? undefined : { height: 0, overflow: 'hidden' }}>
        <div className="rc-in">
          <Row left="ITEM" right="SNOW SHOVEL" />
          <Row left="STORE" right="HARTWELL SUPPLY" />
          <Row left="FOR" right="ALEX" />
          <Row left="LOCKED" right={<span className="text-seal">$45.00</span>} />
        </div>
      </div>
      <div className="rc-block" data-i="1" style={show(1) ? undefined : { height: 0, overflow: 'hidden' }}>
        <div className="rc-in mt-3 border-t-2 border-dashed border-rule pt-3">
          <Row left="SNOW SHOVEL" right="$39.98" />
        </div>
      </div>
      <div className="rc-block" data-i="2" style={show(2) ? undefined : { height: 0, overflow: 'hidden' }}>
        <div className="rc-in mt-3 border-t-2 border-dashed border-rule pt-3">
          <Coins className="coins mx-auto mb-2" />
          <Row left="CHANGE TO ALEX" right="$5.02" className="font-bold" />
        </div>
      </div>
    </>
  );
}

function ReceiptHead() {
  return (
    <div className="mb-3 flex items-center justify-between border-b-2 border-dashed border-rule pb-3">
      <span className="font-display text-[20px] font-extrabold tracking-[-0.02em]">EARMARK</span>
      <span className="text-ink-soft">GIFT #0001</span>
    </div>
  );
}

function Still({ i, className = '' }: { i: number; className?: string }) {
  if (i === 0)
    return (
      <div className={`grid aspect-[3/2] place-items-center rounded-[20px] bg-vault-2 p-6 ${className}`}>
        <GiftCard amount="$45.00" item="Snow shovel" store="Hartwell Supply" receiver="Alex" className="beat-card max-w-[380px]" />
      </div>
    );
  if (i === 1)
    return (
      <div className={`grid aspect-[3/2] place-items-center rounded-[20px] bg-vault-2 p-6 ${className}`}>
        <div className="w-full max-w-[360px] rounded-[14px] bg-[#FBFAF7] p-5 text-[#2A2F24]" role="img" aria-label="Hartwell Supply checkout: snow shovel, $39.98, paid with an Earmark gift.">
          <div className="mb-3 flex items-baseline justify-between border-b border-[#2A2F24]/15 pb-3">
            <span className="font-display text-[18px] font-extrabold tracking-[-0.01em]">HARTWELL SUPPLY</span>
            <span className="text-[15px] opacity-70">Checkout</span>
          </div>
          <div className="mono flex justify-between text-[16px]">
            <span>Snow shovel</span>
            <span>$39.98</span>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 rounded-full bg-seal px-4 py-3 text-[16px] font-semibold text-white">
            <LockGlyph size={18} color="#fff" />
            Pay with Earmark gift
          </div>
        </div>
      </div>
    );
  return (
    <div className={`grid aspect-[3/2] place-items-center rounded-[20px] bg-vault-2 p-6 ${className}`}>
      <div className="flex flex-col items-center text-center" role="img" aria-label="$5.02 change goes to Alex.">
        <Coins className="mb-4 scale-150" />
        <span className="mono text-[16px] text-fog">CHANGE TO ALEX</span>
        <span className="mono mt-1 text-[clamp(2.6rem,5vw,4rem)] font-bold leading-none text-change">+$5.02</span>
      </div>
    </div>
  );
}

export function Vault() {
  const root = useRef<HTMLElement>(null);
  const wide = useMedia('(min-width: 900px)');
  const reduced = prefersReducedMotion();
  // Pinned and stepped on every screen size (phones too); only Reduce Motion gets the plain stacked list.
  const pinned = !reduced;

  useLayoutEffect(() => {
    if (!pinned) return;
    const el = root.current!;
    let beat = -1;
    const ctx = gsap.context(() => {
      const blocks = gsap.utils.toArray<HTMLElement>('.rc-block');
      const texts = gsap.utils.toArray<HTMLElement>('.beat-text');
      const stills = gsap.utils.toArray<HTMLElement>('.beat-still');
      const dots = gsap.utils.toArray<HTMLElement>('.beat-dot');
      // Start on beat one, fully printed, so the section never looks empty.
      gsap.set(texts, { autoAlpha: 0, y: 30 });
      gsap.set(stills, { autoAlpha: 0, scale: 0.96 });
      gsap.set(blocks, { height: 0, overflow: 'hidden' });
      gsap.set([texts[0], stills[0]], { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(blocks[0], { height: 'auto' });
      dots[0]?.classList.add('is-on');
      beat = 0;
      const shackle = el.querySelector<SVGPathElement>('.beat-card .lock-shackle');
      // The card slides in and the lock snaps shut with a small bounce.
      const snap = () => {
        gsap.fromTo('.beat-card', { xPercent: 50, rotate: 6, opacity: 0 }, { xPercent: 0, rotate: 0, opacity: 1, duration: 0.8, ease: 'power3.out' });
        if (shackle) gsap.fromTo(shackle, { y: -6 }, { y: 0, duration: 0.6, delay: 0.6, ease: 'bounce.out' });
        gsap.fromTo('.beat-card', { scale: 1 }, { scale: 1.035, yoyo: true, repeat: 1, duration: 0.12, delay: 0.66, ease: 'power2.out' });
      };

      const go = (n: number) => {
        if (n === beat) return;
        const forward = n > beat;
        beat = n;
        texts.forEach((t, i) => gsap.to(t, { autoAlpha: i === n ? 1 : 0, y: i === n ? 0 : i < n ? -30 : 30, duration: 0.5, ease: 'power3.out', overwrite: true }));
        stills.forEach((s, i) => gsap.to(s, { autoAlpha: i === n ? 1 : 0, scale: i === n ? 1 : 0.96, duration: 0.6, ease: 'power3.out', overwrite: true }));
        dots.forEach((d, i) => d.classList.toggle('is-on', i <= n));
        blocks.forEach((b, i) => {
          if (i <= n && b.offsetHeight === 0) {
            const lines = b.querySelectorAll('.leader, .coins');
            gsap.to(b, { height: 'auto', duration: 0.5, ease: 'steps(6)', overwrite: true });
            gsap.fromTo(lines, { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.09, delay: 0.05 });
          } else if (i > n) {
            gsap.to(b, { height: 0, duration: 0.3, ease: 'power2.in', overwrite: true });
          }
        });
        if (n === 0 && forward) snap();
        if (n === 2 && forward) {
          gsap.fromTo('.rc-block[data-i="2"] .coin', { y: -160, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.1, delay: 0.25, ease: 'bounce.out' });
        }
      };

      ScrollTrigger.create({
        trigger: el.querySelector('.vault-pin'),
        start: 'top top',
        end: '+=200%',
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => go(self.progress < 0.3 ? 0 : self.progress < 0.64 ? 1 : 2),
        onEnter: () => snap(),
        onEnterBack: () => go(2),
      });
    }, el);
    return () => ctx.revert();
  }, [pinned, wide]);

  return (
    <section id="how" data-nav="dark" ref={root} tabIndex={-1} aria-labelledby="how-title" className="bg-vault text-receipt outline-none on-dark">
      <h2 id="how-title" className="sr-only">
        How it works
      </h2>
      {pinned ? (
        <div className="vault-pin relative h-dvh overflow-hidden">
          <div className="mx-auto grid h-full max-w-[1320px] grid-cols-1 content-center gap-6 px-5 pt-[68px] min-[900px]:grid-cols-[1fr_340px_1fr] min-[900px]:content-normal min-[900px]:items-center min-[900px]:gap-10 min-[900px]:px-8 xl:gap-14">
            <div className="relative h-[190px] min-[900px]:h-[280px]">
              {BEATS.map((b, i) => (
                <div key={b.key} className="beat-text absolute inset-x-0 top-0">
                  <div className="mono mb-5 flex items-center gap-3 text-[16px] text-fog">
                    <span className="text-seal">0{i + 1}</span>
                    <span>{b.label.toUpperCase()}</span>
                  </div>
                  <p className="font-display text-[clamp(1.85rem,3.6vw,3.6rem)] font-extrabold leading-[0.98] tracking-[-0.02em]">{b.text}</p>
                </div>
              ))}
              <div className="absolute bottom-0 left-0 flex gap-2" aria-hidden="true">
                {BEATS.map((b) => (
                  <span key={b.key} className="beat-dot h-[4px] w-10 rounded-full bg-white/20 transition-colors [&.is-on]:bg-seal" />
                ))}
              </div>
            </div>
            <div className="flex items-start justify-center min-[900px]:h-full min-[900px]:items-center">
              <div className="receipt-paper zigzag-bottom w-full max-w-[340px] rounded-t-md px-5 pt-5 text-[15px] tracking-[0.01em] shadow-2xl min-[900px]:px-6 min-[900px]:pt-6 min-[900px]:text-[16px]">
                <ReceiptHead />
                <ReceiptBlocks />
              </div>
            </div>
            <div className="relative hidden aspect-[3/2] min-[900px]:block">
              {[0, 1, 2].map((i) => (
                <div key={i} className="beat-still absolute inset-0 flex items-center">
                  <Still i={i} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-[720px] px-5 py-24">
          <ol className="flex flex-col gap-20">
            {BEATS.map((b, i) => (
              <li key={b.key}>
                <div className="mono mb-4 flex items-center gap-3 text-[16px] text-fog">
                  <span className="text-seal">0{i + 1}</span>
                  <span>{b.label.toUpperCase()}</span>
                </div>
                <p className="font-display text-[clamp(2rem,8vw,3rem)] font-extrabold leading-[0.98] tracking-[-0.02em]">{b.text}</p>
                <Still i={i} className="mt-8" />
                <div className="receipt-paper zigzag-bottom mt-6 rounded-t-md px-5 pt-5 text-[15px]">
                  {i === 0 && <ReceiptHead />}
                  {i === 0 && (
                    <>
                      <Row left="ITEM" right="SNOW SHOVEL" />
                      <Row left="STORE" right="HARTWELL SUPPLY" />
                      <Row left="FOR" right="ALEX" />
                      <Row left="LOCKED" right={<span className="text-seal">$45.00</span>} />
                    </>
                  )}
                  {i === 1 && <Row left="SNOW SHOVEL" right="$39.98" />}
                  {i === 2 && (
                    <>
                      <Coins className="mx-auto mb-2" />
                      <Row left="CHANGE TO ALEX" right="$5.02" className="font-bold" />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
