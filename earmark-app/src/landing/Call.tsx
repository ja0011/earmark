import { useState } from 'react';
import { CallCard } from '../components/CallCard';
import { useT } from '../lib/i18n';

const SAMPLES = {
  en: { label: 'English', base: '/media/call/call' },
  es: { label: 'Español', base: '/media/call/call-es' },
} as const;
type SampleLang = keyof typeof SAMPLES;

export function Call() {
  const { chosen } = useT();
  // Someone who picked Spanish hears the Spanish call first.
  const [lang, setLang] = useState<SampleLang>(chosen === 'es' ? 'es' : 'en');
  const [playToken, setPlayToken] = useState(0);

  const pick = (l: SampleLang) => {
    if (l === lang) return;
    setLang(l);
    setPlayToken((t) => t + 1); // a click: play the other language straight away
  };

  return (
    <section id="call" data-nav="dark" tabIndex={-1} aria-labelledby="call-title" className="bg-vault px-5 py-24 text-receipt outline-none md:px-8 md:py-36 on-dark">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <div>
          <h2 id="call-title" className="display" style={{ fontSize: 'clamp(3.25rem, 8vw, 8rem)' }}>
            It even calls.
          </h2>
          <p className="mt-6 max-w-[480px] text-[22px] leading-[1.45] text-receipt/90">Four days left? Earmark calls to remind you, and can buy it for you.</p>

          <div className="mt-10 max-w-[480px] border-t border-white/15 pt-8">
            <h3 className="text-[24px] font-semibold leading-tight">In their language.</h3>
            <p className="mt-3 text-[18px] leading-[1.5] text-receipt/80">
              Sending to family who speak Spanish? Earmark calls, reminds and reads your note to them in Spanish. Their reply comes back to you in English.
            </p>
            <div role="group" aria-label="Language of the call" className="mt-6 inline-flex rounded-full border border-white/25 p-1" translate="no">
              {(Object.keys(SAMPLES) as SampleLang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  lang={l}
                  aria-pressed={lang === l}
                  onClick={() => pick(l)}
                  className={`min-h-[44px] rounded-full px-5 text-[16px] font-semibold transition-colors ${lang === l ? 'bg-seal text-white' : 'text-receipt hover:bg-white/10'}`}
                >
                  {SAMPLES[l].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <CallCard key={lang} sample={SAMPLES[lang].base} autoStartToken={playToken} />
        </div>
      </div>
    </section>
  );
}
