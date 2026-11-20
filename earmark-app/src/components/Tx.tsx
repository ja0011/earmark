import { txUrl, useConfig } from '../lib/config';

export function TxLink({ hash, label = 'View on Arc explorer' }: { hash: string; label?: string }) {
  const cfg = useConfig();
  return (
    <a href={txUrl(cfg, hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-seal underline underline-offset-4">
      {label}
      <span className="mono text-[15px] text-ink-soft no-underline">
        {hash.slice(0, 10)}…{hash.slice(-6)}
      </span>
    </a>
  );
}

export function Notice({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'error' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-5 py-4 text-[17px] ${tone === 'error' ? 'border-ink bg-paper font-medium' : 'border-rule bg-paper'}`}>
      {children}
    </div>
  );
}
