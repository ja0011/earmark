import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GiftCard } from '../components/GiftCard';
import { FrameSet, heroFrameCount } from '../lib/frames';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../lib/motion';

/**
 * Hero: the film on a canvas, scrubbed by scroll and darkened 35%. Rendering stops when the hero is
 * off screen or the tab is hidden. The gift card is built in code and tilts toward the cursor.
 */
export function Hero({ started, onFirstFrame }: { started: boolean; onFirstFrame: () => void }) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const lock = useRef<HTMLDivElement>(null);
  const [hasFilm, setHasFilm] = useState<boolean | null>(null);
  const [poster, setPoster] = useState(false);
  const reduced = prefersReducedMotion();

  // --- film
  useEffect(() => {
    let frames: FrameSet | null = null;
    let raf = 0;
    let visible = true;
    let target = 0;
    let drawn = -1;
    let alive = true;
    let st: ScrollTrigger | null = null;
    const cvs = canvas.current!;
    const ctx = cvs.getContext('2d')!;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
      drawn = -1;
      kick();
    };

    const draw = () => {
      raf = 0;
      if (!frames || !visible || document.hidden) return;
      const i = Math.round(target);
      const img = frames.nearest(i);
      if (!img || (drawn === i && frames.images[i])) return;
      const cw = cvs.width;
      const ch = cvs.height;
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      drawn = frames.images[i] ? i : -1;
    };
    const kick = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) {
        frames?.start();
        kick();
      } else {
        frames?.pause();
      }
    });
    io.observe(section.current!);
    const onVis = () => (document.hidden ? frames?.pause() : (frames?.start(), kick()));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', resize);

    heroFrameCount().then((count) => {
      if (!alive) return;
      setHasFilm(count > 0);
      if (!count) {
        onFirstFrame();
        return;
      }
      const small = window.matchMedia('(max-width: 767px)').matches;
      frames = new FrameSet(count, reduced ? count : small ? 2 : 1);
      frames.onFirst = () => {
        onFirstFrame();
        kick();
      };
      frames.onLoad = () => kick();
      resize();
      frames.start();
      if (!reduced) {
        st = ScrollTrigger.create({
          trigger: section.current!,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            // Scrub slowly: the whole film plays across the hero's own scroll.
            target = self.progress * (count - 1);
            kick();
          },
        });
      } else {
        target = Math.round((count - 1) * 0.6); // a still from later in the film
      }
    });

    // Safety: never hold the loader for more than a few seconds.
    const t = setTimeout(onFirstFrame, 4000);
    return () => {
      alive = false;
      clearTimeout(t);
      io.disconnect();
      st?.kill();
      frames?.pause();
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // --- intro + card tilt + lock glint
  useLayoutEffect(() => {
    if (!started) return;
    const ctx = gsap.context(() => {
      if (!reduced) {
        gsap.from('.hero-line', { yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.08 });
        gsap.from('.hero-sub, .hero-cta', { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 0.35, stagger: 0.08 });
        gsap.from('.hero-card', { y: 60, rotate: 6, opacity: 0, duration: 1.1, ease: 'power3.out', delay: 0.2 });
      }
    }, section);

    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => ctx.revert();

    const c = card.current!;
    gsap.set(c, { transformPerspective: 900, transformOrigin: 'center' });
    const rx = gsap.quickTo(c, 'rotationX', { duration: 0.6, ease: 'power3.out' });
    const ry = gsap.quickTo(c, 'rotationY', { duration: 0.6, ease: 'power3.out' });
    let inLock = false;
    const glint = () => {
      const g = lock.current?.querySelector('.lock-glint') as HTMLElement | null;
      if (!g) return;
      gsap.fromTo(g, { xPercent: -130, opacity: 1 }, { xPercent: 130, duration: 0.7, ease: 'power2.inOut' });
    };
    const onMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      ry(dx * 8);
      rx(-dy * 8);
      const l = lock.current?.getBoundingClientRect();
      if (l) {
        const near = e.clientX > l.left - 24 && e.clientX < l.right + 24 && e.clientY > l.top - 24 && e.clientY < l.bottom + 24;
        if (near && !inLock) glint();
        inLock = near;
      }
    };
    const onLeave = () => {
      rx(0);
      ry(0);
    };
    const s = section.current!;
    s.addEventListener('pointermove', onMove);
    s.addEventListener('pointerleave', onLeave);
    return () => {
      s.removeEventListener('pointermove', onMove);
      s.removeEventListener('pointerleave', onLeave);
      ctx.revert();
    };
  }, [started]);

  const scrollToHow = (e: React.MouseEvent) => {
    const el = document.getElementById('how');
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };

  return (
    <section ref={section} aria-labelledby="hero-title" className={`relative bg-vault text-receipt on-dark ${reduced ? '' : 'md:h-[200vh]'}`}>
      <div className="relative md:sticky md:top-0 md:h-dvh min-h-[100svh] overflow-hidden">
        {/* film */}
        <div className="absolute inset-0" aria-hidden="true">
          {hasFilm === false && (
            <img
              src="/media/hero/poster.webp"
              alt=""
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${poster ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setPoster(true)}
              onError={() => setPoster(false)}
            />
          )}
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
          {/* darken 35% */}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />
        </div>

        <div className="relative mx-auto flex min-h-[100svh] max-w-[1320px] flex-col justify-center gap-12 px-5 pb-16 pt-[108px] md:h-full md:flex-row md:items-center md:justify-between md:gap-10 md:px-8 md:pb-0 md:pt-[68px]">
          <div className="max-w-[780px] md:w-[58%]">
            <h1 id="hero-title" className="display text-receipt" style={{ fontSize: 'clamp(4rem, 10vw, 10rem)' }}>
              <span className="block overflow-hidden pb-[0.04em]"><span className="hero-line block">Money</span></span>
              <span className="block overflow-hidden pb-[0.04em]"><span className="hero-line block">with a</span></span>
              <span className="block overflow-hidden pb-[0.04em]"><span className="hero-line block">purpose.</span></span>
            </h1>
            <p className="hero-sub mt-6 max-w-[560px] text-balance text-[20px] leading-[1.45] text-receipt/90">Send money that can only be spent on what you meant it for.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/send" className="hero-cta btn btn-seal">Send a gift</Link>
              <a href="#how" onClick={scrollToHow} className="hero-cta btn btn-outline text-receipt">See how it works</a>
            </div>
          </div>
          <div className="hero-card flex justify-center md:w-[40%] md:justify-end" style={{ perspective: 900 }}>
            <GiftCard ref={card} lockRef={lock} amount="$45.00" item="Snow shovel" store="Hartwell Supply" receiver="Alex" className="will-change-transform" />
          </div>
        </div>
      </div>
    </section>
  );
}
