import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { decodeEventLog, type Address, type Hex } from 'viem';
import { earmarkAbi, erc20Abi, formatUsdc } from 'earmark-plugin';
import { AppLayout } from '../components/AppLayout';
import { GiftCard } from '../components/GiftCard';
import { Row } from '../components/ReceiptRow';
import { SignIn } from '../components/SignIn';
import { Notice, TxLink } from '../components/Tx';
import { api, ApiError } from '../lib/api';
import { addressUrl, useConfig } from '../lib/config';
import { chainMessage, publicClient, walletFor } from '../lib/chain';
import { sentence } from '../lib/gifts';
import { useWallet } from '../lib/wallet';

type Parsed = {
  receiver: { name: string; address: Address };
  store: { name: string; address: Address; website: string };
  item: { sku: string; itemId: Hex; name: string; price: string; priceUsd: string };
  amount: string;
  expiry: number;
  fingerprintPreview: Hex;
  source: 'claude' | 'rules';
};

const EXAMPLE = 'Send Alex $0.45 for a snow shovel at Hartwell Supply.';
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Send() {
  const cfg = useConfig();
  const { wallet, authorize } = useWallet();
  const [text, setText] = useState(EXAMPLE);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<null | 'passkey' | 'approve' | 'lock' | 'confirm'>(null);
  const [txs, setTxs] = useState<{ approve?: Hex; create?: Hex }>({});
  const [done, setDone] = useState<{ giftId: string; fingerprint: Hex } | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [funding, setFunding] = useState(false);

  const refreshBalance = async () => {
    if (!cfg?.ready || !cfg.usdc || !wallet) return setBalance(null);
    const b = await publicClient(cfg).readContract({ address: cfg.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] }).catch(() => null);
    setBalance(b as bigint | null);
  };
  useEffect(() => {
    refreshBalance();
    // A new persona is topped up right after sign-in; keep the balance fresh.
    const iv = setInterval(refreshBalance, 5000);
    return () => clearInterval(iv);
  }, [cfg?.ready, wallet?.address]);

  const read = async (e: React.FormEvent) => {
    e.preventDefault();
    setParsing(true);
    setError(null);
    setParsed(null);
    setDone(null);
    setTxs({});
    try {
      setParsed(await api<Parsed>('/api/agent/parse', { method: 'POST', json: { text, sender: wallet?.address } }));
      refreshBalance();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const fund = async () => {
    if (!wallet) return;
    setFunding(true);
    setError(null);
    try {
      await api('/api/demo/fund', { method: 'POST', json: { address: wallet.address, role: 'Maya' } });
      await refreshBalance();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not top up.');
    } finally {
      setFunding(false);
    }
  };

  const lock = async () => {
    if (!cfg?.ready || !cfg.earmark || !cfg.usdc || !parsed || !wallet) return;
    setError(null);
    if (parsed.receiver.address.toLowerCase() === wallet.address.toLowerCase()) {
      setError("You can't send a gift to yourself. Switch to Maya to send it.");
      return;
    }
    try {
      setStep('passkey');
      const key = await authorize(`lock:${parsed.item.itemId}:${parsed.amount}`);
      const pub = publicClient(cfg);
      const w = walletFor(cfg, key);
      const amount = BigInt(parsed.amount);
      const allowance = (await pub.readContract({ address: cfg.usdc, abi: erc20Abi, functionName: 'allowance', args: [wallet.address, cfg.earmark] })) as bigint;
      if (allowance < amount) {
        setStep('approve');
        const { request } = await pub.simulateContract({ account: w.account, address: cfg.usdc, abi: erc20Abi, functionName: 'approve', args: [cfg.earmark, amount] });
        const approveHash = await w.writeContract(request);
        setTxs((t) => ({ ...t, approve: approveHash }));
        const r = await pub.waitForTransactionReceipt({ hash: approveHash, timeout: 90_000 });
        if (r.status !== 'success') throw new Error('The USDC approval reverted.');
      }
      setStep('lock');
      // Expiry: 30 days from now (the review card showed the same window).
      const expiry = BigInt(Math.max(parsed.expiry, Math.floor(Date.now() / 1000) + 30 * 86400 - 600));
      const { request } = await pub.simulateContract({
        account: w.account,
        address: cfg.earmark,
        abi: earmarkAbi,
        functionName: 'createGift',
        args: [parsed.receiver.address, parsed.store.address, parsed.item.itemId, amount, expiry],
      });
      const createHash = await w.writeContract(request);
      setTxs((t) => ({ ...t, create: createHash }));
      setStep('confirm');
      const receipt = await pub.waitForTransactionReceipt({ hash: createHash, timeout: 90_000 });
      if (receipt.status !== 'success') throw new Error('createGift reverted on chain.');
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: earmarkAbi, data: log.data, topics: log.topics });
          if (ev.eventName === 'GiftCreated') {
            const a = ev.args as any;
            setDone({ giftId: String(a.giftId), fingerprint: a.fingerprint });
          }
        } catch {}
      }
      refreshBalance();
    } catch (err) {
      setError(chainMessage(err));
    } finally {
      setStep(null);
    }
  };

  const busy = step !== null;
  const amount = parsed ? BigInt(parsed.amount) : 0n;
  // On Arc, gas is paid in the same USDC: keep a cent for approve + createGift.
  const gasMargin = cfg?.chainId === 5042002 ? 10_000n : 0n;
  const short_of = balance !== null && parsed ? balance < amount + gasMargin : false;
  const limit = cfg ? BigInt(cfg.changeLimit) : 10_000_000n;
  const leftover = parsed ? amount - BigInt(parsed.item.price) : 0n;

  return (
    <AppLayout title="Send a gift">
      <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <form onSubmit={read}>
            <label htmlFor="ask" className="display block" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.75rem)' }}>
              Who's it for, and what should it buy?
            </label>
            <textarea id="ask" className="field mt-8 min-h-[132px] resize-y text-[20px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button type="submit" className="btn btn-seal" disabled={parsing || !text.trim()}>
                {parsing ? 'Reading it…' : 'Read it'}
              </button>
              {text !== EXAMPLE && (
                <button type="button" className="text-[16px] font-semibold underline underline-offset-4" onClick={() => setText(EXAMPLE)}>
                  Use the example
                </button>
              )}
            </div>
          </form>
          {cfg && !cfg.ready && (
            <div className="mt-8">
              <Notice tone="error">{cfg.error}</Notice>
            </div>
          )}
          <div className="mt-10">
            <SignIn title="Sign in to send" />
          </div>
        </div>

        <div aria-live="polite">
          {error && (
            <div className="mb-6">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
          {!parsed && !error && (
            <div className="receipt-paper zigzag-bottom rounded-t-xl px-7 pt-7 text-[16px] text-ink-soft">
              <p>The review card shows up here: the item, the store, who it's for, the amount, when it expires and its fingerprint.</p>
            </div>
          )}
          {parsed && !done && (
            <div className="receipt-paper zigzag-bottom rounded-t-xl px-6 pt-7 text-[16px] md:px-8">
              <div className="mb-4 flex items-center justify-between border-b-2 border-dashed border-rule pb-4">
                <span className="font-display text-[22px] font-extrabold tracking-[-0.02em]">REVIEW</span>
                <span className="text-ink-soft">{parsed.source === 'claude' ? 'Read by Claude' : 'Read by rules'}</span>
              </div>
              <Row left="ITEM" right={parsed.item.name} />
              <Row left="PRICE" right={`$${parsed.item.priceUsd}`} />
              <Row left="STORE" right={parsed.store.name.toUpperCase()} />
              <Row left="FOR" right={`${parsed.receiver.name.toUpperCase()} ${short(parsed.receiver.address)}`} />
              <Row left="AMOUNT" right={<span className="text-seal">{formatUsdc(parsed.amount)}</span>} />
              <Row left="EXPIRES" right={`30 DAYS · ${new Date(parsed.expiry * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`} />
              <div className="mt-4 border-t-2 border-dashed border-rule pt-4">
                <div className="text-ink-soft">FINGERPRINT</div>
                <div className="mt-1 break-all text-[15px] leading-[1.55]">{parsed.fingerprintPreview}</div>
              </div>
              <p className="mt-5 font-sans text-[16px] leading-snug text-ink-soft">
                {leftover > 0n
                  ? leftover <= limit
                    ? `If it's bought at full price, the ${formatUsdc(leftover)} left over goes to ${parsed.receiver.name}. $10 or less goes to them; more goes back to the sender.`
                    : `${formatUsdc(leftover)} would be left over. $10 or less goes to them; more goes back to the sender.`
                  : 'Exactly the price. Nothing left over.'}
              </p>
              <div className="mt-6 flex flex-col gap-3 pb-2 font-sans">
                {wallet && balance !== null && (
                  <p className="text-[16px]">
                    Your balance: <span className="mono">{formatUsdc(balance)}</span>
                    {short_of && '. Not enough for this gift.'}
                  </p>
                )}
                {wallet && short_of && cfg?.features.faucet && (
                  <button type="button" className="btn btn-outline self-start" onClick={fund} disabled={funding}>
                    {funding ? 'Topping up…' : 'Get test USDC'}
                  </button>
                )}
                {wallet && short_of && !cfg?.features.faucet && (
                  <p className="text-[16px]">
                    Get test USDC at{' '}
                    <a className="font-semibold text-seal underline" href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                      faucet.circle.com
                    </a>{' '}
                    (Arc Testnet) for <span className="mono">{short(wallet.address)}</span>.
                  </p>
                )}
                <button type="button" className="btn btn-seal w-full text-[18px]" onClick={lock} disabled={!wallet || busy || !cfg?.ready || short_of}>
                  {step === 'passkey' ? 'Confirm with your passkey…' : step === 'approve' ? 'Approving USDC…' : step === 'lock' ? 'Locking on Arc…' : step === 'confirm' ? 'Waiting for Arc…' : 'Lock it'}
                </button>
                {!wallet && <p className="text-[16px] text-ink-soft">Sign in first. Your passkey approves the payment.</p>}
                {txs.approve && <TxLink hash={txs.approve} label="USDC approval" />}
                {txs.create && <TxLink hash={txs.create} label="createGift" />}
              </div>
            </div>
          )}
          {parsed && done && (
            <div>
              <GiftCard
                amount={formatUsdc(parsed.amount)}
                item={sentence(parsed.item.name)}
                store={parsed.store.name}
                receiver={parsed.receiver.name}
                giftNumber={done.giftId}
              />
              <h2 className="display mt-10 text-[clamp(2.5rem,5vw,4rem)]">Locked.</h2>
              <p className="mt-3 text-[19px]">
                {parsed.receiver.name} can spend it on the {parsed.item.name.toLowerCase()} at {parsed.store.name}, and nowhere else.
              </p>
              <div className="mono mt-6 break-all rounded-xl border border-rule bg-paper px-4 py-3 text-[15px]">{done.fingerprint}</div>
              <div className="mt-6 flex flex-col gap-3">
                {txs.create && <TxLink hash={txs.create} label="createGift on Arc" />}
                {cfg?.earmark && (
                  <a className="text-[16px] font-semibold underline underline-offset-4" href={addressUrl(cfg, cfg.earmark)} target="_blank" rel="noreferrer">
                    Earmark contract
                  </a>
                )}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={`/gift/${done.giftId}`} className="btn btn-seal">Open the gift</Link>
                <button type="button" className="btn btn-outline" onClick={() => (setParsed(null), setDone(null), setTxs({}))}>
                  Send another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
