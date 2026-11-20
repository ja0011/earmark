import { useEffect, useRef, useState } from 'react';
import { LockBadge } from '../components/Lock';
import { Row } from '../components/ReceiptRow';
import { gsap, prefersReducedMotion } from '../lib/motion';

/**
 * A wrapped present you can see through. A round "flashlight" follows the pointer and shows the
 * receipt inside; the button opens the wrapping fully. The receipt is real text and always in the
 * page, so keyboard and screen-reader users get it too.
 */
export function PresentReveal({ onReady, open, className = '' }: { onReady?: () => void; open: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLImageElement>(null);
  const [touch, setTouch] = useState(false);
  const hovering = useRef(false);

  // Tell the loader once the present is on screen (or soon after, whatever happens).
  useEffect(() => {
    const img = wrap.current;
    if (img?.complete && img.naturalWidth) onReady?.();
    const t = setTimeout(() => onReady?.(), 4000);
    return () => clearTimeout(t);
  }, [onReady]);

  useEffect(() => {
    setTouch(!window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  // Pointer: move the flashlight; grow it on enter, close it on leave.
  useEffect(() => {
    const el = box.current!;
    const img = wrap.current!;
    const reduced = prefersReducedMotion();
    const radius = () => Math.round(Math.max(84, Math.min(124, el.clientWidth * 0.3)));
    const place = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      gsap.to(img, { '--x': `${e.clientX - r.left}px`, '--y': `${e.clientY - r.top}px`, duration: reduced ? 0 : 0.18, ease: 'power2.out', overwrite: 'auto' });
    };
    const enter = (e: PointerEvent) => {
      if (img.dataset.open === '1') return;
      hovering.current = true;
      const r = el.getBoundingClientRect();
      gsap.set(img, { '--x': `${e.clientX - r.left}px`, '--y': `${e.clientY - r.top}px` });
      gsap.to(img, { '--r': `${radius()}px`, duration: reduced ? 0 : 0.35, ease: 'back.out(1.6)' });
    };
    const move = (e: PointerEvent) => {
      if (img.dataset.open === '1') return;
      if (!hovering.current) enter(e);
      place(e);
    };
    const leave = () => {
      hovering.current = false;
      if (img.dataset.open === '1') return;
      gsap.to(img, { '--r': '0px', duration: reduced ? 0 : 0.3, ease: 'power2.in' });
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    const up = (e: PointerEvent) => e.pointerType !== 'mouse' && leave();
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', leave);
    return () => {
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointercancel', leave);
    };
  }, []);

  // The button: open the wrapping all the way from the centre, or wrap it back up.
  useEffect(() => {
    const el = box.current!;
    const img = wrap.current!;
    const reduced = prefersReducedMotion();
    const size = el.clientWidth;
    img.dataset.open = open ? '1' : '0';
    if (open) {
      gsap.to(img, { '--x': `${size / 2}px`, '--y': `${size / 2}px`, duration: reduced ? 0 : 0.25, ease: 'power2.out' });
      gsap.to(img, { '--r': `${Math.ceil(size * 0.92)}px`, duration: reduced ? 0 : 0.8, ease: 'power3.inOut' });
    } else {
      gsap.to(img, { '--r': '0px', duration: reduced ? 0 : 0.6, ease: 'power3.inOut' });
    }
  }, [open]);

  const mask = 'radial-gradient(circle var(--r) at var(--x) var(--y), transparent 0, transparent calc(var(--r) * 0.82), #000 var(--r))';

  return (
    <figure className={`flex flex-col items-center ${className}`}>
      <div
        ref={box}
        className="present relative aspect-square w-[min(78vw,36vh,400px)] min-w-[260px] select-none rounded-[8px] shadow-[0_30px_60px_-28px_rgba(18,18,18,0.45)]"
        style={{ touchAction: 'pan-y' }}
      >
        {/* Inside: the receipt */}
        <div id="present-receipt" className="mono absolute inset-0 flex flex-col justify-center rounded-[8px] bg-paper px-[9%] text-[15px] leading-[1.5] text-ink sm:text-[16px]">
          <div className="mb-3 flex items-center justify-between border-b-2 border-dashed border-rule pb-3">
            <span className="font-display text-[20px] font-extrabold tracking-[-0.02em]">EARMARK</span>
            <LockBadge size={36} label="Locked" />
          </div>
          <Row left="ITEM" right="SNOW SHOVEL" />
          <Row left="STORE" right="HARTWELL SUPPLY" />
          <Row left="FOR" right="ALEX" />
          <Row left="AMOUNT" right="$45.00" />
          <div className="mt-3 border-t-2 border-dashed border-rule pt-3">
            <Row left="STATUS" right={<span className="text-seal">LOCKED</span>} className="font-bold" />
          </div>
        </div>

        {/* Outside: the wrapping, with a see-through hole where the pointer is */}
        <img
          ref={wrap}
          src="/media/present-1280.webp"
          srcSet="/media/present-640.webp 640w, /media/present-1280.webp 1280w, /media/present-2000.webp 2000w"
          sizes="(max-width: 600px) 78vw, 420px"
          alt="A wrapped present with a blue ribbon."
          draggable={false}
          onLoad={() => onReady?.()}
          className="absolute inset-0 h-full w-full rounded-[8px] object-cover"
          style={
            {
              '--x': '50%',
              '--y': '50%',
              '--r': '0px',
              WebkitMaskImage: mask,
              maskImage: mask,
            } as React.CSSProperties
          }
        />
      </div>
      <figcaption className="mt-3 text-[15px] text-ink-soft">
        {open ? 'This gift can only buy one thing.' : touch ? 'Drag across the present to see inside.' : 'Hover the present to see what it can buy.'}
      </figcaption>
    </figure>
  );
}
