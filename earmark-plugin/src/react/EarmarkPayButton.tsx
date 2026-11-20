import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Address } from 'viem';
import type { EarmarkMessage, PayError, PayResult } from '../index';

export type EarmarkCartLine = { sku: string; qty: number; name: string; price: string };

export type EarmarkPayButtonProps = {
  /** Your store address as registered in Earmark */
  store: Address;
  cart: EarmarkCartLine[];
  /** Absolute URL of your POST /earmark/sign route */
  signUrl: string;
  onPaid: (r: PayResult) => void;
  onError?: (e: PayError) => void;
  /** Earmark app origin. Default http://localhost:5173 */
  earmarkUrl?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
};

const SEAL = '#2F6BFF';
const CSS = `
.earmark-pay-btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:56px;padding:14px 20px;border-radius:12px;background:${SEAL};color:#fff;cursor:pointer;font-family:Manrope,ui-sans-serif,system-ui,sans-serif;font-size:17px;font-weight:600;line-height:1.2;transition:background .15s ease,transform .15s ease}
.earmark-pay-btn:hover{background:#1F57E6}
.earmark-pay-btn:active{transform:translateY(1px)}
.earmark-pay-btn:focus-visible{outline:3px solid ${SEAL};outline-offset:3px}
.earmark-pay-btn[aria-disabled="true"]{opacity:.55;cursor:not-allowed}
.earmark-pay-btn[data-state="waiting"]{background:#15171C}
.earmark-pay-btn .em-mark{font-family:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;font-weight:800;letter-spacing:-.01em;font-size:18px}
.earmark-pay-btn .em-lock{flex:none;width:30px;height:30px;border-radius:50%;background:#fff;display:grid;place-items:center}
.earmark-pay-btn[data-state="waiting"] .em-lock{background:${SEAL}}
.earmark-pay-wrap{container-type:inline-size}
@container (max-width: 400px){.earmark-pay-btn .em-mark{display:none}}
.earmark-pay-hint{margin:8px 0 0;font-family:Manrope,ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.4;color:inherit;opacity:.75}
`;

function LockGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4.5 7V5.25a3.5 3.5 0 0 1 7 0V7" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <rect x="2.75" y="7" width="10.5" height="7.25" rx="1.75" fill={color} />
    </svg>
  );
}

export function EarmarkPayButton(props: EarmarkPayButtonProps) {
  const { store, cart, signUrl, onPaid, onError, earmarkUrl = 'http://localhost:5173', label, disabled, className, style } = props;
  const [state, setState] = useState<'idle' | 'waiting'>('idle');
  const popupRef = useRef<Window | null>(null);
  const latest = useRef({ store, cart, signUrl, onPaid, onError });
  latest.current = { store, cart, signUrl, onPaid, onError };
  const earmarkOrigin = new URL(earmarkUrl).origin;

  const sendCart = useCallback(() => {
    const cur = latest.current;
    popupRef.current?.postMessage(
      { type: 'earmark:cart', store: cur.store, cart: cur.cart, signUrl: cur.signUrl } satisfies EarmarkMessage,
      earmarkOrigin,
    );
  }, [earmarkOrigin]);

  // Listen for as long as the button is mounted, so a popup that showed an error can still pay later.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== earmarkOrigin) return; // only trust the Earmark app
      if (!popupRef.current || event.source !== popupRef.current) return; // only our own popup
      const msg = event.data as EarmarkMessage;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      const cur = latest.current;
      switch (msg.type) {
        case 'earmark:ready':
          sendCart();
          break;
        case 'earmark:paid': {
          const { txHash, giftId, price, change, changeTo } = msg;
          setState('idle');
          cur.onPaid({ txHash, giftId, price, change, changeTo });
          break;
        }
        case 'earmark:error':
          setState('idle');
          cur.onError?.({ code: msg.code, message: msg.message });
          break;
        case 'earmark:closed':
          popupRef.current = null;
          setState('idle');
          break;
      }
    };
    window.addEventListener('message', onMessage);
    // Notice a popup the shopper closed without paying.
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setState('idle');
      }
    }, 500);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
    };
  }, [earmarkOrigin, sendCart]);

  const open = useCallback(() => {
    if (disabled) return;
    if (popupRef.current && !popupRef.current.closed) {
      // Already open (maybe after an error): bring it forward with the current cart.
      setState('waiting');
      sendCart();
      popupRef.current.focus();
      return;
    }
    const url = `${earmarkUrl.replace(/\/$/, '')}/pay?store=${encodeURIComponent(store)}&origin=${encodeURIComponent(window.location.origin)}`;
    const w = window.open(url, 'earmark', 'width=440,height=720');
    if (!w) {
      onError?.({ code: 'POPUP_BLOCKED', message: 'Allow pop-ups to pay with your Earmark gift.' });
      return;
    }
    popupRef.current = w;
    setState('waiting');
  }, [disabled, earmarkUrl, store, onError, sendCart]);

  const text = state === 'waiting' ? 'Finish in the Earmark window' : label ?? 'Pay with Earmark gift';

  return (
    <div className={`earmark-pay-wrap${className ? ` ${className}` : ''}`} style={style}>
      <style>{CSS}</style>
      <button
        type="button"
        className="earmark-pay-btn"
        data-state={state}
        aria-disabled={disabled ? 'true' : undefined}
        aria-label={state === 'waiting' ? 'Earmark window is open. Finish paying there.' : `${label ?? 'Pay with Earmark gift'}`}
        onClick={open}
      >
        <span className="em-lock">
          <LockGlyph color={state === 'waiting' ? '#fff' : SEAL} />
        </span>
        <span>{text}</span>
        {state === 'idle' && (
          <span className="em-mark" aria-hidden="true">
            EARMARK
          </span>
        )}
      </button>
    </div>
  );
}

export default EarmarkPayButton;
