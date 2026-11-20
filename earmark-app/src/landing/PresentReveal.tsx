import { useEffect, useRef, useState } from 'react';
import { LockBadge } from '../components/Lock';
import { Row } from '../components/ReceiptRow';
import { gsap, prefersReducedMotion } from '../lib/motion';

/** The box's front face inside present-upright.webp (measured from the cutout's alpha), in %. */
const FACE = { left: 0.6, top: 22.6, width: 98.8, height: 76.6 };

/**
 * An upright wrapped present you can see through. A round "flashlight" follows the pointer over the
 * front of the box and shows the receipt inside; the bow stays solid. "Show the receipt" (in the hero)
 * opens the whole front and lifts the present away. The receipt is real text and always in the page,
 * so keyboard and screen-reader users get it too.
 */
export function PresentReveal({ onReady, open, className = '' }: { onReady?: () => void; open: boolean; className?: string }) {
  const face = useRef<HTMLDivElement>(null);
  const receipt = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLImageElement>(null);
  const [touch, setTouch] = useState(false);
  const hovering = useRef(false);
  const isOpen = useRef(false);

  useEffect(() => {
    const img = wrap.current;
    if (img?.complete && img.naturalWidth) onReady?.();
    const t = setTimeout(() => onReady?.(), 4000);
    return () => clearTimeout(t);
  }, [onReady]);

  useEffect(() => {
    setTouch(!window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  // Pointer over the front face: move the flashlight; grow it on enter, close it on leave.
  useEffect(() => {
    const el = face.current!;
    const rc = receipt.current!;
    const reduced = prefersReducedMotion();
    const radius = () => Math.round(Math.max(84, Math.min(130, el.clientWidth * 0.28)));
    const at = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { '--x': `${e.clientX - r.left}px`, '--y': `${e.clientY - r.top}px` };
    };
    const enter = (e: PointerEvent) => {
      if (isOpen.current) return;
      hovering.current = true;
      gsap.set(rc, at(e));
      gsap.to(rc, { '--r': `${radius()}px`, duration: reduced ? 0 : 0.35, ease: 'back.out(1.6)', overwrite: 'auto' });
    };
    const move = (e: PointerEvent) => {
      if (isOpen.current) return;
      if (!hovering.current) enter(e);
      gsap.to(rc, { ...at(e), duration: reduced ? 0 : 0.18, ease: 'power2.out', overwrite: 'auto' });
    };
    const leave = () => {
      hovering.current = false;
      if (isOpen.current) return;
      gsap.to(rc, { '--r': '0px', duration: reduced ? 0 : 0.3, ease: 'power2.in' });
    };
    const up = (e: PointerEvent) => e.pointerType !== 'mouse' && leave();
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', leave);
    return () => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', leave);
    };
  }, []);

  // The button: open the whole front, then lift the present away; or put it back.
  useEffect(() => {
    const el = face.current!;
    const rc = receipt.current!;
    const img = wrap.current!;
    const reduced = prefersReducedMotion();
    const d = (s: number) => (reduced ? 0 : s);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (open === isOpen.current) return;
    isOpen.current = open;
    gsap.killTweensOf([rc, img]);
    if (open) {
      const cover = Math.ceil(Math.hypot(w, h) / 2 / 0.8);
      gsap.to(rc, { '--x': `${w / 2}px`, '--y': `${h / 2}px`, duration: d(0.25), ease: 'power2.out' });
      gsap.to(rc, { '--r': `${cover}px`, duration: d(0.7), ease: 'power3.inOut' });
      gsap.to(img, { autoAlpha: 0, y: -24, scale: 0.98, duration: d(0.6), delay: d(0.45), ease: 'power2.in' });
      rc.classList.add('is-open');
    } else {
      rc.classList.remove('is-open');
      gsap.to(img, { autoAlpha: 1, y: 0, scale: 1, duration: d(0.5), ease: 'power3.out' });
      gsap.to(rc, { '--r': '0px', duration: d(0.6), delay: d(0.3), ease: 'power3.inOut' });
    }
  }, [open]);

  const mask = 'radial-gradient(circle var(--r) at var(--x) var(--y), #000 0, #000 calc(var(--r) * 0.82), transparent var(--r))';

  return (
    <figure className={`flex flex-col items-center ${className}`}>
      <div className="present relative w-[min(86vw,460px,calc((100svh-230px)*0.71))] min-w-[260px] select-none">
        <img
          ref={wrap}
          src="/media/present-upright-1280.webp"
          srcSet="/media/present-upright-640.webp 640w, /media/present-upright-1280.webp 1280w, /media/present-upright-2000.webp 2000w"
          sizes="(max-width: 600px) 86vw, 460px"
          width={1202}
          height={1691}
          alt="A wrapped present with a blue bow on top."
          draggable={false}
          onLoad={() => onReady?.()}
          className="block h-auto w-full drop-shadow-[0_28px_40px_rgba(18,18,18,0.22)]"
        />
        {/* The front face: the flashlight works here only, so the bow never gets cut through. */}
        <div
          ref={face}
          className="absolute"
          style={{ left: `${FACE.left}%`, top: `${FACE.top}%`, width: `${FACE.width}%`, height: `${FACE.height}%`, touchAction: 'pan-y' }}
        >
          <div
            ref={receipt}
            id="present-receipt"
            className="mono absolute inset-0 flex flex-col justify-center rounded-[6px] bg-paper px-[9%] text-[15px] leading-[1.6] text-ink transition-shadow duration-500 sm:text-[16px] lg:text-[17px] [&.is-open]:shadow-[0_30px_60px_-28px_rgba(18,18,18,0.45)]"
            style={{ '--x': '50%', '--y': '50%', '--r': '0px', WebkitMaskImage: mask, maskImage: mask } as React.CSSProperties}
          >
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
        </div>
      </div>
      <figcaption className="mt-4 text-center text-[15px] text-ink-soft">
        {open ? 'This gift can only buy one thing.' : touch ? 'Drag across the present to see inside.' : 'Hover the present to see what it can buy.'}
      </figcaption>
    </figure>
  );
}
