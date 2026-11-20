import { Link } from 'react-router-dom';
import { useConfig } from '../lib/config';

export function TryIt() {
  const cfg = useConfig();
  return (
    <section id="try" tabIndex={-1} aria-labelledby="try-title" className="bg-receipt px-5 py-24 outline-none md:px-8 md:py-36">
      <div className="mx-auto max-w-[1180px]">
        <h2 id="try-title" className="display" style={{ fontSize: 'clamp(3.5rem, 10vw, 10rem)' }}>
          Send one.
        </h2>
        <p className="mt-6 max-w-[520px] text-[22px] leading-[1.45]">It's live on Arc testnet. Lock a gift, then buy it.</p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Link to="/send" className="group flex min-h-[132px] items-center justify-between gap-6 rounded-[24px] bg-seal px-7 py-6 text-white transition-colors hover:bg-seal-deep md:min-h-[180px] md:px-10">
            <span className="font-display text-[clamp(2rem,3.4vw,3rem)] font-extrabold leading-none tracking-[-0.02em]">Send a gift</span>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 transition-transform group-hover:scale-110" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M7.5 10.5V7.75a4.5 4.5 0 0 1 9 0v2.75" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /><rect x="4.5" y="10.5" width="15" height="10" rx="2.6" fill="#fff" /></svg>
            </span>
          </Link>
          <a
            href={cfg?.hartwellUrl ?? 'http://localhost:5174'}
            className="group flex min-h-[132px] items-center justify-between gap-6 rounded-[24px] border-2 border-ink px-7 py-6 transition-colors hover:bg-ink hover:text-receipt md:min-h-[180px] md:px-10"
          >
            <span className="font-display text-[clamp(2rem,3.4vw,3rem)] font-extrabold leading-none tracking-[-0.02em]">Open Hartwell Supply</span>
            <span className="mono hidden shrink-0 text-[15px] opacity-70 sm:inline">a separate store</span>
          </a>
        </div>
      </div>
    </section>
  );
}
