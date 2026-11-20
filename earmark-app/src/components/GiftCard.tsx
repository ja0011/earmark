import { forwardRef, type ReactNode } from 'react';
import { LockBadge } from './Lock';

type Props = {
  amount: string; // "$45.00"
  item: string; // "Snow shovel"
  store: string;
  receiver: string;
  status?: 'Locked' | 'Spent' | 'Refunded' | string;
  giftNumber?: string;
  lockOpen?: boolean;
  footer?: ReactNode;
  className?: string;
  lockRef?: React.Ref<HTMLDivElement>;
};

/** The Earmark gift card, built in code. */
export const GiftCard = forwardRef<HTMLDivElement, Props>(function GiftCard(
  { amount, item, store, receiver, status = 'Locked', giftNumber, lockOpen, footer, className = '', lockRef },
  ref,
) {
  const spent = status === 'Spent';
  const refunded = status === 'Refunded';
  return (
    <div
      ref={ref}
      className={`gift-card relative flex w-full max-w-[460px] flex-col justify-between gap-4 rounded-[22px] bg-paper p-[7%] text-ink card-shadow ${className}`}
      style={{ aspectRatio: '1.58' }}
    >
      {/* paper edge and seal line */}
      <div className="absolute inset-x-0 top-0 h-[6px] rounded-t-[22px] bg-seal" aria-hidden="true" />
      <>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-display text-[22px] font-extrabold leading-none tracking-[-0.02em]">EARMARK</div>
            {giftNumber && <div className="mono mt-2 text-[15px] text-ink-soft">GIFT #{giftNumber.padStart(4, '0')}</div>}
          </div>
          <LockBadge ref={lockRef} size={58} open={lockOpen ?? (spent || refunded)} tone={spent || refunded ? 'ink' : 'seal'} label={`Status: ${status}`} />
        </div>
        <div>
          <div className={`mono leading-none tracking-[-0.03em] ${spent ? 'text-ink-soft line-through decoration-2' : ''}`} style={{ fontSize: 'clamp(40px, 6.2vw, 64px)' }}>
            {amount}
          </div>
          <div className="mt-3 max-w-[76%] text-[17px] font-medium leading-snug text-ink-soft">
            <span className="block">
              {item} · {store}
            </span>
            <span className="block">For {receiver}</span>
          </div>
          {footer}
        </div>
      </>
      {/* perforation */}
      <div className="absolute right-[24%] top-0 h-full border-l-2 border-dashed border-rule opacity-70" aria-hidden="true" />
    </div>
  );
});
