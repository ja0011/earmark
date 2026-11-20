import { useEffect, useMemo, useRef, useState } from 'react';
import { getAddress, isAddress, type Address } from 'viem';
import { formatUsdc, itemMismatchMessage, type CartLine, type EarmarkMessage } from 'earmark-plugin';
import { Row } from '../components/ReceiptRow';
import { SignIn } from '../components/SignIn';
import { TxLink } from '../components/Tx';
import { api } from '../lib/api';
import { useConfig } from '../lib/config';
import { chainMessage } from '../lib/chain';
import { redeemWithStore, sentence, type GiftView, type RedeemResult } from '../lib/gifts';
import { useWallet } from '../lib/wallet';

type StoreRec = { name: string; store: Address; website: string; signUrl: string };

const priceText = (p?: string) => {
  if (!p) return '';
  if (/^\d+$/.test(p)) return formatUsdc(p); // 6-decimal units, e.g. "39980000"
  return p.startsWith('$') ? p : `$${p}`;
};

/** The Earmark pay popup, opened by EarmarkPayButton from a store's checkout. */
export default function Pay() {
  const cfg = useConfig();
  const { wallet, authorize } = useWallet();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const storeParam = params.get('store') ?? '';
  const openerOrigin = useMemo(() => {
    try {
      return new URL(params.get('origin') ?? '').origin;
    } catch {
      return null;
    }
  }, [params]);
  const storeAddr = isAddress(storeParam) ? getAddress(storeParam) : null;

  const [cart, setCart] = useState<CartLine[] | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [store, setStore] = useState<StoreRec | null>(null);
  const [gifts, setGifts] = useState<GiftView[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<RedeemResult | null>(null);
  const paidRef = useRef(false);

  const post = (msg: EarmarkMessage) => {
    if (window.opener && openerOrigin) window.opener.postMessage(msg, openerOrigin);
  };

  useEffect(() => {
    document.title = 'Pay with Earmark';
    if (!window.opener || !openerOrigin) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== openerOrigin || e.source !== window.opener) return;
      const m = e.data as EarmarkMessage;
      if (m?.type === 'earmark:cart' && Array.isArray(m.cart)) {
        // A new cart can arrive at any time (the shopper changed it and clicked again).
        setCart(m.cart);
        setSignUrl(typeof m.signUrl === 'string' ? m.signUrl : null);
        setMismatch(null);
        setError(null);
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'earmark:ready' });
    const again = setInterval(() => !cart && post({ type: 'earmark:ready' }), 1000);
    const bye = () => !paidRef.current && post({ type: 'earmark:closed' });
    window.addEventListener('beforeunload', bye);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('beforeunload', bye);
      clearInterval(again);
    };
  }, [openerOrigin, cart === null]);

  useEffect(() => {
    if (!storeAddr) return;
    api<{ stores: StoreRec[] }>('/api/stores')
      .then((r) => setStore(r.stores.find((s) => s.store.toLowerCase() === storeAddr.toLowerCase()) ?? null))
      .catch(() => {});
  }, [storeAddr]);

  useEffect(() => {
    if (!wallet || !storeAddr) return setGifts(null);
    api<{ gifts: GiftView[] }>(`/api/gifts?receiver=${wallet.address}&store=${storeAddr}`)
      .then((r) => {
        const locked = r.gifts.filter((g) => g.status === 'Locked' && g.expiry * 1000 > Date.now());
        setGifts(locked);
        if (locked.length === 1) setPicked(locked[0].id);
      })
      .catch((e) => setError(e.message));
  }, [wallet?.address, storeAddr]);

  const gift = gifts?.find((g) => g.id === picked) ?? null;

  // The item rule, checked before anything is signed. The store's signer checks it again server-side.
  useEffect(() => {
    if (!gift || !cart) return;
    const lines = cart.filter((l) => Number(l.qty) > 0);
    const ok = gift.item && lines.length === 1 && lines[0].sku === gift.item.sku && Number(lines[0].qty) === 1;
    if (!ok) {
      const message = itemMismatchMessage(gift.item?.name ?? 'item on this gift');
      setMismatch(message);
      post({ type: 'earmark:error', code: 'ITEM_MISMATCH', message });
    } else setMismatch(null);
  }, [gift?.id, cart]);

  const signOrigin = (() => {
    try {
      return signUrl ? new URL(signUrl).origin : null;
    } catch {
      return null;
    }
  })();
  const signMismatch = Boolean(store?.signUrl && signOrigin && new URL(store.signUrl).origin !== signOrigin);

  const pay = async () => {
    if (!cfg || !gift || !cart || !signUrl || !wallet) return;
    setError(null);
    try {
      setStep('passkey');
      const key = await authorize(`redeem:${gift.id}`);
      const r = await redeemWithStore({ cfg, privateKey: key, giftId: gift.id, receiver: wallet.address, signUrl, cart, onStep: setStep });
      paidRef.current = true;
      setPaid(r);
      post({ type: 'earmark:paid', ...r });
    } catch (e) {
      const message = chainMessage(e);
      const code = (e as any)?.code && typeof (e as any).code === 'string' ? (e as any).code : 'PAY_FAILED';
      setError(message);
      post({ type: 'earmark:error', code, message });
    } finally {
      setStep(null);
    }
  };

  const storeName = store?.name ?? 'this store';
  const total = cart?.reduce((s, l) => (/^\d+$/.test(l.price ?? '') ? s + BigInt(l.price!) * BigInt(l.qty) : s), 0n) ?? 0n;

  return (
    <div className="min-h-dvh bg-receipt text-ink">
      <header className="flex items-center justify-between border-b border-rule px-5 py-4">
        <span className="font-display text-[24px] font-extrabold tracking-[-0.02em]">EARMARK</span>
        <span className="text-[15px] text-ink-soft">Paying {storeName}</span>
      </header>
      <main className="mx-auto flex max-w-[440px] flex-col gap-6 px-5 py-6">
        {!window.opener || !openerOrigin ? (
          <p className="text-[18px]">Open this from a store's checkout with the Pay with Earmark gift button.</p>
        ) : paid ? (
          <div className="flex flex-col gap-5" role="status">
            <h1 className="display text-[44px]">Paid.</h1>
            <div className="receipt-paper zigzag-bottom rounded-t-xl px-5 pt-5 text-[15px]">
              <Row left={gift?.item?.name ?? 'ITEM'} right={formatUsdc(paid.price)} />
              {BigInt(paid.change) > 0n && (
                <Row
                  className="font-bold"
                  left={paid.changeTo.toLowerCase() === wallet?.address.toLowerCase() ? `CHANGE TO ${(wallet?.name ?? 'YOU').toUpperCase()}` : 'BACK TO SENDER'}
                  right={formatUsdc(paid.change)}
                />
              )}
              <div className="mt-3 pb-1 font-sans">
                <TxLink hash={paid.txHash} label="Arc transaction" />
              </div>
            </div>
            <button type="button" className="btn btn-seal" onClick={() => window.close()}>
              Back to {storeName}
            </button>
          </div>
        ) : (
          <>
            <section aria-labelledby="cart-h">
              <h1 id="cart-h" className="text-[20px] font-semibold">
                Your cart
              </h1>
              {!cart ? (
                <p className="mt-2 text-[16px] text-ink-soft">Waiting for the store…</p>
              ) : (
                <div className="receipt-paper zigzag-bottom mt-3 rounded-t-xl px-5 pt-4 text-[15px]">
                  {cart.map((l) => (
                    <Row key={l.sku} left={`${l.qty > 1 ? `${l.qty} × ` : ''}${(l.name ?? l.sku).toUpperCase()}`} right={priceText(l.price)} />
                  ))}
                  {cart.length > 1 && total > 0n && <Row className="mt-1 border-t-2 border-dashed border-rule pt-2" left="TOTAL" right={formatUsdc(total)} />}
                </div>
              )}
            </section>

            {signMismatch && <p role="alert" className="text-[16px] font-medium">This checkout's signer doesn't match the one {storeName} registered with Earmark, so Earmark won't pay it.</p>}

            <SignIn title="Sign in to pay" compact={Boolean(wallet)} />

            {wallet && gifts && gifts.length === 0 && <p className="text-[17px]">You don't have a gift that works at {storeName}.</p>}

            {wallet && gifts && gifts.length > 0 && (
              <fieldset>
                <legend className="text-[20px] font-semibold">Your gifts for {storeName}</legend>
                <div className="mt-3 flex flex-col gap-3">
                  {gifts.map((g) => (
                    <label
                      key={g.id}
                      className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 bg-paper px-4 py-3 ${picked === g.id ? 'border-seal' : 'border-rule'}`}
                    >
                      <input type="radio" name="gift" className="h-5 w-5 accent-[#2F6BFF]" checked={picked === g.id} onChange={() => setPicked(g.id)} />
                      <span className="flex-1">
                        <span className="mono block text-[18px]">{g.amountUsd}</span>
                        <span className="text-[16px] text-ink-soft">
                          {g.item ? sentence(g.item.name) : 'Item'} · from {g.senderName ?? 'someone'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {mismatch && (
              <div role="alert" className="rounded-2xl border-2 border-ink bg-paper px-5 py-4">
                <p className="text-[19px] font-semibold">{mismatch}</p>
                <p className="mt-1 text-[16px] text-ink-soft">Change your cart in the store, then press the Earmark button again.</p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-[17px] font-medium">
                {error}
              </p>
            )}

            {gift && !mismatch && (
              <button type="button" className="btn btn-seal w-full text-[18px]" onClick={pay} disabled={!!step || !cart || !signUrl || signMismatch || !cfg?.ready}>
                {step === 'passkey'
                  ? 'Confirm with your passkey…'
                  : step === 'signing'
                    ? `${storeName} is signing…`
                    : step === 'sending' || step === 'confirming'
                      ? 'Paying on Arc…'
                      : `Pay ${priceText(cart?.[0]?.price) || 'with this gift'}`}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
