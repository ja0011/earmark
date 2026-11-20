import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Dict, type Key } from '../i18n/en';
import { es } from '../i18n/es';
import { api } from './api';
import { useWallet } from './wallet';

export const LANGS = [
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
] as const;
export type Lang = (typeof LANGS)[number]['code'];

const DICTS: Record<Lang, Dict> = { en, es };
const STORE_KEY = 'earmark.lang';
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in DICTS;
export const nativeName = (l: string) => LANGS.find((x) => x.code === l)?.native ?? l;

type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;
/** lang: what this page renders in. chosen: the person's pick (differs on English-only pages). */
type Ctx = { lang: Lang; chosen: Lang; t: T; setLang: (l: Lang) => void; locale: string };

function makeT(lang: Lang): T {
  const dict = DICTS[lang];
  return (key, vars) => {
    let s = dict[key] ?? en[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

const LOCALES: Record<Lang, string> = { en: 'en', es: 'es' };
const englishT = makeT('en');
const englishCtx: Ctx = { lang: 'en', chosen: 'en', t: englishT, setLang: () => {}, locale: 'en' };
const LanguageContext = createContext<Ctx>(englishCtx);

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The receiver's language. Kept in this browser (for the signed-out pay popup) and on the server contact,
 * where reminders, the voice agent and notes from family read it.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { wallet } = useWallet();
  const [lang, setLangState] = useState<Lang>(() => readStored() ?? 'en');

  // Signed in: the server's choice wins if this browser has none (another device, or a shared demo account).
  useEffect(() => {
    if (!wallet) return;
    let alive = true;
    api<{ contacts: { address: string; language?: string }[] }>('/api/contacts')
      .then((r) => {
        const me = r.contacts.find((c) => c.address.toLowerCase() === wallet.address.toLowerCase());
        if (!alive || !me) return;
        const stored = readStored();
        if (isLang(me.language) && me.language !== 'en' && !stored) setLangState(me.language);
        else if (stored && stored !== (me.language ?? 'en')) api('/api/contacts/language', { method: 'POST', json: { address: wallet.address, language: stored } }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [wallet?.address]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      try {
        localStorage.setItem(STORE_KEY, l);
      } catch {}
      if (wallet) api('/api/contacts/language', { method: 'POST', json: { address: wallet.address, language: l } }).catch(() => {});
    },
    [wallet?.address],
  );

  const value = useMemo<Ctx>(() => ({ lang, chosen: lang, t: makeT(lang), setLang, locale: LOCALES[lang] }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Pages without hand-written strings render English here, and <AutoTranslate> turns them into the chosen language. */
export function EnglishOnly({ children }: { children: ReactNode }) {
  const parent = useContext(LanguageContext);
  const value = useMemo<Ctx>(() => ({ ...parent, lang: 'en', t: englishT, locale: 'en' }), [parent]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useT = () => useContext(LanguageContext);

/** Sets <html lang> for the current page (screen readers pick the right voice). */
export function useHtmlLang() {
  const { chosen } = useT();
  useEffect(() => {
    document.documentElement.lang = chosen;
  }, [chosen]);
}

export function LanguagePicker({ className = '', id = 'lang-picker' }: { className?: string; id?: string }) {
  const { chosen, setLang, t } = useT();
  return (
    <label htmlFor={id} className={`inline-flex items-center gap-2 text-[15px] ${className}`}>
      <span className="sr-only">{t('lang.label')}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 opacity-70">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      <select
        id={id}
        value={chosen}
        onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
        className="min-h-[40px] rounded-full border border-rule bg-paper px-3 py-1 text-[15px] font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-seal"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
