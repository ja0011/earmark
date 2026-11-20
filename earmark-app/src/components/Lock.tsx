import { forwardRef } from 'react';

/** Round Seal-blue lock badge. The shackle is a separate path so it can snap shut. */
export const LockBadge = forwardRef<HTMLDivElement, { size?: number; open?: boolean; className?: string; label?: string; tone?: 'seal' | 'ink' }>(
  function LockBadge({ size = 56, open = false, className = '', label, tone = 'seal' }, ref) {
    return (
      <div
        ref={ref}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={`lock-badge relative grid shrink-0 place-items-center overflow-hidden rounded-full ${tone === 'seal' ? 'bg-seal' : 'bg-ink'} ${className}`}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.46} height={size * 0.46} fill="none" aria-hidden="true">
          <path
            className="lock-shackle"
            d="M7.5 10.5V7.75a4.5 4.5 0 0 1 9 0v2.75"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            style={{ transform: open ? 'translateY(-3px)' : 'translateY(0)', transformBox: 'fill-box', transition: 'transform .35s cubic-bezier(.3,1.6,.5,1)' }}
          />
          <rect x="4.5" y="10.5" width="15" height="10" rx="2.6" fill="#fff" />
          <circle cx="12" cy="15.5" r="1.6" fill={tone === 'seal' ? '#2F6BFF' : '#121212'} />
        </svg>
        <span className="lock-glint pointer-events-none absolute inset-0" aria-hidden="true" />
      </div>
    );
  },
);

export function LockGlyph({ open = false, size = 22, color = 'currentColor' }: { open?: boolean; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <path
        className="lock-shackle"
        d="M7.5 10.5V7.75a4.5 4.5 0 0 1 9 0v2.75"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        style={{ transform: open ? 'translate(4px,-3px) rotate(18deg)' : 'none', transformOrigin: '16.5px 10.5px', transition: 'transform .4s cubic-bezier(.3,1.6,.5,1)' }}
      />
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.6" fill={color} />
    </svg>
  );
}
