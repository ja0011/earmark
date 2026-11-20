import { CallCard } from '../components/CallCard';

export function Call() {
  return (
    <section id="call" data-nav="dark" tabIndex={-1} aria-labelledby="call-title" className="bg-vault px-5 py-24 text-receipt outline-none md:px-8 md:py-36 on-dark">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <div>
          <h2 id="call-title" className="display" style={{ fontSize: 'clamp(3.25rem, 8vw, 8rem)' }}>
            It even calls.
          </h2>
          <p className="mt-6 max-w-[480px] text-[22px] leading-[1.45] text-receipt/90">Four days left? Earmark calls to remind you, and can buy it for you.</p>
        </div>
        <div className="flex justify-center md:justify-end">
          <CallCard />
        </div>
      </div>
    </section>
  );
}
