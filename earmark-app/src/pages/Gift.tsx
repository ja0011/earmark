import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { earmarkAbi, formatUsdc } from 'earmark-plugin';
import type { Hex } from 'viem';
import { AppLayout } from '../components/AppLayout';
import { CallCard } from '../components/CallCard';
import { BrowserCall } from '../components/BrowserCall';
import { GiftCard } from '../components/GiftCard';
import { Row, Coins } from '../components/ReceiptRow';
import { SignIn } from '../components/SignIn';
import { Notice, TxLink } from '../components/Tx';
import { api } from '../lib/api';
import { useConfig } from '../lib/config';
import { chainMessage, publicClient, walletFor } from '../lib/chain';
import { redeemWithStore, sentence, useCountdown, useGift } from '../lib/gifts';
import { useWallet } from '../lib/wallet';

type PR = { id: string; giftId: string; status: string; source: 'call' | 'browser' | 'demo' };

export default function GiftPage() {
  const { id } = useParams();
  const cfg = useConfig();
  const { gift, error, reload } = useGift(id);
  const { wallet, authorize } = useWallet();
  const cd = useCountdown(gift?.expiry);
  const [requests, setRequests] = useState<PR[]>([]);
  const [call, setCall] = useState<{ mode: 'phone' | 'live' | 'browser' | 'demo'; message: string } | null>(null);
  const [browserToken, setBrowserToken] = useState(0);
  const [calling, setCalling] = useState(false);
  const [playToken, setPlayToken] = useState(0);
  const [buying, setBuying] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [paidTx, setPaidTx] = useState<Hex | null>(null);
  const [refunding, setRefunding] = useState(false);

  const loadRequests = () => {
    if (!id) return;
    api<{ requests: PR[] }>(`/api/purchase-requests?gift=${id}`).then((r) => setRequests(r.requests)).catch(() => {});
  };
  useEffect(() => {
    loadRequests();
    const iv = setInterval(loadRequests, 6000);
    return () => clearInterval(iv);
  }, [id]);
  useEffect(() => {
    if (!gift) return;
    const es = new EventSource(`/api/events?address=${gift.receiver}`);
    es.addEventListener('purchase-request', loadRequests as EventListener);
    return () => es.close();
  }, [gift?.receiver]);

  useEffect(() => {
    if (gift?.item) document.title = `${gift.amountUsd} for a ${gift.item.name.toLowerCase()} · Earmark`;
  }, [gift?.id, gift?.item?.name]);

  const callNow = async () => {
    if (!gift) return;
    // No phone number set up: talk to the same agent right here in the browser.
    if (cfg?.features.calls === 'browser') {
      setCall({ mode: 'browser', message: '' });
      setBrowserToken((t) => t + 1);
      return;
    }
    setCalling(true);
    try {
      const r = await api<{ mode: 'live' | 'browser' | 'demo'; message: string }>('/api/calls/now', { method: 'POST', json: { giftId: gift.id } });
      setCall(r);
      if (r.mode === 'demo') setPlayToken((t) => t + 1);
      if (r.mode === 'browser') setBrowserToken((t) => t + 1);
    } catch (e) {
      setCall({ mode: 'demo', message: (e as Error).message });
    } finally {
      setCalling(false);
    }
  };

  const onSampleEnded = async () => {
    if (!gift || call?.mode !== 'demo') return;
    // Demo mode: the recorded Alex said "Yeah, do it." Create the same request the live agent's tool would.
    await api('/api/agent/purchase-request', { method: 'POST', json: { gift_id: gift.id, source: 'demo' } }).catch(() => {});
    loadRequests();
  };

  const isReceiver = wallet && gift && wallet.address.toLowerCase() === gift.receiver.toLowerCase();

  const confirmBuy = async (pr: PR) => {
    if (!cfg || !gift || !gift.item || !wallet) return;
    if (!gift.signUrl) return setBuyError(`${gift.storeName ?? 'The store'} hasn't told Earmark where its signer lives.`);
    setBuyError(null);
    try {
      setBuying('passkey');
      const key = await authorize(`redeem:${gift.id}`);
      const r = await redeemWithStore({
        cfg,
        privateKey: key,
        giftId: gift.id,
        receiver: wallet.address,
        signUrl: gift.signUrl,
        cart: [{ sku: gift.item.sku, qty: 1 }],
        onStep: (s) => setBuying(s),
      });
      setPaidTx(r.txHash);
      await api(`/api/purchase-requests/${pr.id}`, { method: 'POST', json: { status: 'done', txHash: r.txHash } }).catch(() => {});
      loadRequests();
      reload();
    } catch (e) {
      setBuyError(chainMessage(e));
    } finally {
      setBuying(null);
    }
  };

  const decline = async (pr: PR) => {
    await api(`/api/purchase-requests/${pr.id}`, { method: 'POST', json: { status: 'declined' } }).catch(() => {});
    loadRequests();
  };

  const refund = async () => {
    if (!cfg?.earmark || !gift) return;
    setRefunding(true);
    setBuyError(null);
    try {
      const key = await authorize(`refund:${gift.id}`);
      const pub = publicClient(cfg);
      const w = walletFor(cfg, key);
      const { request } = await pub.simulateContract({ account: w.account, address: cfg.earmark, abi: earmarkAbi, functionName: 'refund', args: [BigInt(gift.id)] });
      const hash = await w.writeContract(request);
      await pub.waitForTransactionReceipt({ hash });
      reload();
    } catch (e) {
      setBuyError(chainMessage(e));
    } finally {
      setRefunding(false);
    }
  };

  if (error && !gift) {
    return (
      <AppLayout title={`Gift #${id}`}>
        <h1 className="display text-[clamp(2.5rem,6vw,5rem)]">Gift #{id}</h1>
        <div className="mt-8 max-w-[640px]">
          <Notice tone="error">{error}</Notice>
        </div>
      </AppLayout>
    );
  }
  if (!gift) {
    return (
      <AppLayout title={`Gift #${id}`}>
        <div className="max-w-[460px] animate-pulse rounded-[22px] bg-placeholder" style={{ aspectRatio: '1.58' }} />
      </AppLayout>
    );
  }

  const itemName = gift.item ? sentence(gift.item.name) : 'Item';
  const storeName = gift.storeName ?? 'the store';
  const shopUrl = gift.storeWebsite || cfg?.hartwellUrl || 'http://localhost:5174';
  const expired = cd ? cd.ms === 0 : false;
  const pending = requests.find((r) => r.status === 'pending');

  return (
    <AppLayout title={`Gift #${gift.id}`}>
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <GiftCard amount={gift.amountUsd} item={itemName} store={storeName} receiver={gift.receiverName ?? 'you'} status={gift.status} giftNumber={gift.id} />
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="inline-flex items-center gap-2 text-[17px] font-semibold" role="status" aria-live="polite">
              <span className={`h-[10px] w-[10px] rounded-full ${gift.status === 'Locked' ? 'bg-seal' : gift.status === 'Spent' ? 'bg-change' : 'bg-fog'}`} aria-hidden="true" />
              {gift.status}
            </span>
            {gift.status === 'Locked' && cd && (
              <span className="mono text-[16px]" aria-label={`Expires in ${cd.d} days ${cd.h} hours`}>
                {expired ? 'EXPIRED' : `EXPIRES IN ${cd.text.toUpperCase()}`}
              </span>
            )}
          </div>
          <div className="mono mt-6 break-all rounded-xl border border-rule bg-paper px-4 py-3 text-[15px]">
            <span className="text-ink-soft">FINGERPRINT </span>
            {gift.fingerprint}
          </div>
          {gift.createdTx && (
            <div className="mt-4">
              <TxLink hash={gift.createdTx} label="Locked on Arc" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h1 className="display text-[clamp(2.5rem,5.5vw,4.5rem)]">
              {gift.status === 'Spent' ? 'Bought.' : gift.status === 'Refunded' ? 'Refunded.' : `${gift.receiverName ?? 'Your'}${gift.receiverName ? "'s" : ''} ${gift.item ? gift.item.name.toLowerCase().split(' ').pop() : 'gift'}.`}
            </h1>
            <p className="mt-4 text-[19px]">
              {gift.status === 'Locked' &&
                `${gift.senderName ?? 'Someone'} locked ${gift.amountUsd} for the ${itemName.toLowerCase()} at ${storeName}. It works there, for that, for ${gift.receiverName ?? 'you'}.`}
              {gift.status === 'Spent' && `The ${itemName.toLowerCase()} is paid for.`}
              {gift.status === 'Refunded' && `It expired unused, so ${gift.amountUsd} went back to ${gift.senderName ?? 'the sender'}.`}
            </p>
          </div>

          {gift.status === 'Locked' && !expired && (
            <div className="flex flex-wrap gap-3">
              <a href={shopUrl} className="btn btn-seal">
                Shop at {storeName}
              </a>
              <button type="button" className="btn btn-outline" onClick={callNow} disabled={calling}>
                {calling ? 'Calling…' : 'Call me now'}
              </button>
            </div>
          )}

          {call && (
            <div className="flex flex-col gap-4">
              {call.message && <Notice>{call.message}</Notice>}
              {call.mode === 'browser' && (
                <div className="rounded-[32px] bg-vault p-3">
                  <BrowserCall giftId={gift.id} autoStart={browserToken} onPurchaseRequested={loadRequests} />
                </div>
              )}
              {call.mode === 'live' && cfg?.features.calls === 'phone' && (
                <button type="button" className="self-start text-[16px] font-semibold underline underline-offset-4" onClick={() => (setCall({ mode: 'browser', message: '' }), setBrowserToken((t) => t + 1))}>
                  Or talk here in the browser
                </button>
              )}
              {call.mode === 'demo' && (
                <div className="bg-vault rounded-[32px] p-3">
                  <CallCard autoStartToken={playToken} onEnded={onSampleEnded} note="Demo mode: no phone call was placed." className="max-w-none" />
                </div>
              )}
            </div>
          )}

          {gift.status === 'Locked' && pending && (
            <div className="rounded-2xl border-2 border-seal bg-paper p-6" role="region" aria-label="Purchase request">
              <h2 className="text-[22px] font-semibold">Buy the {itemName.toLowerCase()} now?</h2>
              <p className="mt-2 text-[17px] text-ink-soft">
                You said yes on the call{pending.source === 'demo' ? ' (recorded demo)' : ''}. Earmark asks {storeName} to sign the order, then pays it from your gift.
              </p>
              {!isReceiver && (
                <div className="mt-4">
                  <SignIn want="Alex" title={`Sign in as ${gift.receiverName ?? 'the receiver'} to confirm`} />
                </div>
              )}
              {isReceiver && (
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" className="btn btn-seal" onClick={() => confirmBuy(pending)} disabled={!!buying}>
                    {buying === 'passkey' ? 'Confirm with your passkey…' : buying === 'signing' ? `${storeName} is signing…` : buying === 'sending' || buying === 'confirming' ? 'Paying on Arc…' : 'Confirm with passkey'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => decline(pending)} disabled={!!buying}>
                    Not now
                  </button>
                </div>
              )}
            </div>
          )}

          {buyError && <Notice tone="error">{buyError}</Notice>}

          {gift.status === 'Spent' && gift.price && (
            <div className="receipt-paper zigzag-bottom rounded-t-xl px-6 pt-6 text-[16px] md:px-8">
              <Row left={gift.item?.name ?? 'ITEM'} right={formatUsdc(gift.price)} />
              {gift.change && BigInt(gift.change) > 0n && (
                <div className="mt-3 border-t-2 border-dashed border-rule pt-3">
                  <Coins className="mx-auto mb-2" />
                  <Row
                    className="font-bold"
                    left={gift.changeTo?.toLowerCase() === gift.receiver.toLowerCase() ? `CHANGE TO ${(gift.receiverName ?? 'RECEIVER').toUpperCase()}` : `BACK TO ${(gift.senderName ?? 'SENDER').toUpperCase()}`}
                    right={formatUsdc(gift.change)}
                  />
                </div>
              )}
              {(gift.redeemedTx || paidTx) && (
                <div className="mt-4 pb-1 font-sans">
                  <TxLink hash={(gift.redeemedTx || paidTx)!} label="Paid on Arc" />
                </div>
              )}
            </div>
          )}

          {gift.status === 'Locked' && expired && (
            <div className="flex flex-col gap-3">
              <p className="text-[18px]">This gift expired unused. Anyone can send it back to {gift.senderName ?? 'the sender'}.</p>
              {wallet ? (
                <button type="button" className="btn btn-outline self-start" onClick={refund} disabled={refunding}>
                  {refunding ? 'Refunding…' : 'Refund it'}
                </button>
              ) : (
                <SignIn />
              )}
            </div>
          )}

          {gift.status === 'Locked' && !pending && !isReceiver && (
            <p className="text-[16px] text-ink-soft">
              Is this yours? <Link className="font-semibold text-seal underline" to="/gifts">See your gifts</Link>
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
