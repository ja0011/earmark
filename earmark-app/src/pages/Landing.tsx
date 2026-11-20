import { useCallback, useEffect, useState } from 'react';
import Lenis from 'lenis';
import { Nav } from '../components/Nav';
import { Loader } from '../landing/Loader';
import { Hero } from '../landing/Hero';
import { Problem } from '../landing/Problem';
import { Vault } from '../landing/Vault';
import { Rules } from '../landing/Rules';
import { Call } from '../landing/Call';
import { TryIt } from '../landing/TryIt';
import { Footer } from '../landing/Footer';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../lib/motion';
import { useHtmlLang } from '../lib/i18n';

export default function Landing() {
  const [assetsReady, setAssetsReady] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  useHtmlLang();

  useEffect(() => {
    document.title = 'Earmark: money with a purpose';
    document.fonts?.ready.then(() => setFontsReady(true));
    const t = setTimeout(() => setFontsReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // Lenis smooth scroll, driven from GSAP's ticker so ScrollTrigger and Lenis share one clock.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ autoRaf: false, lerp: 0.12, smoothWheel: true });
    const tick = (time: number) => lenis.raf(time * 1000);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    if (loading) lenis.stop();
    (window as any).__lenis = lenis;
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete (window as any).__lenis;
    };
  }, []);

  useEffect(() => {
    const lenis = (window as any).__lenis as Lenis | undefined;
    document.documentElement.style.overflow = loading ? 'hidden' : '';
    if (!loading) {
      lenis?.start();
      ScrollTrigger.refresh();
    }
  }, [loading]);

  const onFirstFrame = useCallback(() => setAssetsReady(true), []);
  const onDone = useCallback(() => setLoading(false), []);

  return (
    <div className="overflow-x-clip bg-receipt text-ink">
      <a href="#problem-title" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-receipt">
        Skip to content
      </a>
      {loading && <Loader ready={assetsReady && fontsReady} onDone={onDone} />}
      <Nav variant="landing" />
      <main>
        <Hero started={!loading} onFirstFrame={onFirstFrame} />
        <Problem />
        <Vault />
        <Rules />
        <Call />
        <TryIt />
      </main>
      <Footer />
    </div>
  );
}
