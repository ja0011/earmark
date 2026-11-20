import { useState } from 'react';

export function Code({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <figure className="overflow-hidden rounded-2xl bg-vault text-receipt on-dark">
      <figcaption className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <span className="mono text-[15px] text-fog">{label}</span>
        <button type="button" onClick={copy} className="rounded-full px-3 py-1 text-[15px] font-semibold hover:bg-white/10" aria-label={`Copy ${label}`}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className="mono overflow-x-auto px-5 py-4 text-[15px] leading-[1.6]">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
