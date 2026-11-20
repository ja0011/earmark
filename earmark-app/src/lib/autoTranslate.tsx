import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from './i18n';

/**
 * Translates the pages that don't have hand-written strings (landing, send, stores) into the person's language.
 * It walks the page's text (and placeholder / aria-label / title / alt), sends what's new to the server
 * (Claude, cached per string), and swaps the text in place. Changes React makes later are picked up again.
 * Skips anything inside translate="no" and .mono (amounts, addresses, hashes, receipts).
 */
const cache = new Map<string, string>(); // `${lang}:${english}` -> translation
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const;
const WORDY = /\p{L}{2,}/u;

type Orig = { lang: string; en: string; shown: string };
// Module-level so switching language (or remounting) still knows each node's English.
const textOrig = new WeakMap<Text, Orig>();
const attrOrig = new WeakMap<Element, Record<string, Orig>>();

export function AutoTranslate({ children }: { children: ReactNode }) {
  const { chosen: lang } = useT();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const pending = new Set<string>();
    let queued: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    const skip = (n: Node | null) => {
      const e = n instanceof Element ? n : n?.parentElement;
      return !e || Boolean(e.closest('[translate="no"], .mono, script, style, code, pre, svg, textarea'));
    };

    const want = (en: string) => {
      const key = `${lang}:${en}`;
      if (cache.has(key) || pending.has(key)) return;
      pending.add(key);
      queued.push(en);
      if (!timer) timer = setTimeout(flush, 120);
    };

    const flush = async () => {
      timer = null;
      const batch = queued.splice(0, 80);
      if (queued.length) timer = setTimeout(flush, 50);
      if (!batch.length) return;
      try {
        const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, texts: batch.map((b) => b.trim()) }) });
        const j = (await r.json()) as { translations?: string[] };
        batch.forEach((en, i) => {
          const tr = j.translations?.[i];
          if (tr) cache.set(`${lang}:${en}`, en.replace(en.trim(), tr)); // keep the original's surrounding spaces
        });
      } catch {}
      batch.forEach((en) => pending.delete(`${lang}:${en}`));
      if (alive) apply(el);
    };

    const doText = (t: Text) => {
      const v = t.nodeValue ?? '';
      let o = textOrig.get(t);
      if (!o || (v !== o.shown && v !== o.en)) o = { lang, en: v, shown: v }; // React changed it: new source text
      textOrig.set(t, o);
      if (lang === 'en') {
        if (v !== o.en) t.nodeValue = o.shown = o.en;
        return;
      }
      if (!WORDY.test(o.en) || skip(t)) return;
      const tr = cache.get(`${lang}:${o.en}`);
      if (tr) {
        if (v !== tr) t.nodeValue = o.shown = tr;
      } else want(o.en);
    };

    const doAttrs = (e: Element) => {
      for (const a of ATTRS) {
        const v = e.getAttribute(a);
        if (v == null) continue;
        const rec = attrOrig.get(e) ?? {};
        let o = rec[a];
        if (!o || (v !== o.shown && v !== o.en)) o = { lang, en: v, shown: v };
        rec[a] = o;
        attrOrig.set(e, rec);
        if (lang === 'en') {
          if (v !== o.en) e.setAttribute(a, (o.shown = o.en));
          continue;
        }
        if (!WORDY.test(o.en) || skip(e)) continue;
        const tr = cache.get(`${lang}:${o.en}`);
        if (tr) {
          if (v !== tr) e.setAttribute(a, (o.shown = tr));
        } else want(o.en);
      }
    };

    const apply = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) return doText(node as Text);
      if (!(node instanceof Element)) return;
      doAttrs(node);
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
        else doAttrs(n as Element);
      }
    };

    apply(el);
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target as Text);
        else if (m.type === 'attributes') doAttrs(m.target as Element);
        else m.addedNodes.forEach(apply);
      }
    });
    mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    return () => {
      alive = false;
      mo.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [lang]);

  return (
    <div ref={root} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
