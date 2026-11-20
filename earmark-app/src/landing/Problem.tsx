import { useLayoutEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../lib/motion';

const BUBBLES = [
  { who: 'Maya', text: 'Sent you $45 for a shovel.', mine: true },
  { who: 'Alex', text: 'Thanks!!', mine: false },
  { who: 'Alex', text: '…so I got pizza.', mine: false, meta: 'Two days later' },
];

export function Problem() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.bubble').forEach((b, i) => {
        gsap.from(b, {
          y: 28,
          scale: 0.94,
          opacity: 0,
          duration: 0.55,
          ease: 'back.out(1.6)',
          scrollTrigger: { trigger: '.chat', start: `top ${78 - i * 14}%`, toggleActions: 'play none none reverse' },
        });
      });
      gsap.from('.problem-title .ln', {
        yPercent: 105,
        duration: 0.9,
        ease: 'power4.out',
        stagger: 0.08,
        scrollTrigger: { trigger: '.problem-title', start: 'top 85%' },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} aria-labelledby="problem-title" className="bg-receipt px-5 py-24 md:px-8 md:py-36">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto max-w-[560px] overflow-hidden rounded-[28px] border border-rule bg-paper">
          <div className="flex items-center gap-3 border-b border-rule px-5 py-4 md:px-6">
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-ink text-[16px] font-semibold text-receipt">A</span>
            <span className="text-[17px] font-semibold">Alex</span>
          </div>
          <div className="chat flex flex-col gap-4 px-5 py-6 md:px-6 md:py-8" role="log" aria-label="Messages between Maya and Alex">
            {BUBBLES.map((b, i) => (
              <div key={i} className={`bubble flex flex-col ${b.mine ? 'items-end' : 'items-start'}`}>
                {b.meta && <span className="mb-2 mt-4 self-center text-[15px] text-ink-soft">{b.meta}</span>}
                <span className="mb-1 px-2 text-[15px] font-semibold text-ink-soft">{b.who}</span>
                <p
                  className={`max-w-[85%] rounded-[22px] px-5 py-3 text-[20px] leading-snug ${
                    b.mine ? 'rounded-br-md bg-ink text-receipt' : 'rounded-bl-md border border-rule bg-receipt text-ink'
                  }`}
                >
                  {b.text}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-20 text-center md:mt-28">
          <h2 id="problem-title" className="problem-title display" style={{ fontSize: 'clamp(3.25rem, 8vw, 8rem)' }}>
            <span className="block overflow-hidden"><span className="ln block">You meant</span></span>
            <span className="block overflow-hidden"><span className="ln block">a shovel.</span></span>
          </h2>
          <p className="mx-auto mt-6 max-w-[560px] text-balance text-[22px] leading-[1.45]">Money doesn't remember why you sent it. Earmark does.</p>
        </div>
      </div>
    </section>
  );
}
