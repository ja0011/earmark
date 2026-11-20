import type { ReactNode } from 'react';

export function Row({ left, right, className = '' }: { left: ReactNode; right: ReactNode; className?: string }) {
  return (
    <div className={`leader py-[3px] ${className}`}>
      <span className="whitespace-nowrap">{left}</span>
      <span className="dots" aria-hidden="true" />
      <span className="whitespace-nowrap text-right">{right}</span>
    </div>
  );
}

export function Coins({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-[46px] w-[64px] ${className}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="coin absolute left-1/2 block h-[16px] w-[52px] -translate-x-1/2 rounded-[50%] border-2 border-[#C99600] bg-change"
          style={{ bottom: i * 8, zIndex: i, boxShadow: 'inset 0 -3px 0 #D9A400' }}
        />
      ))}
    </div>
  );
}
