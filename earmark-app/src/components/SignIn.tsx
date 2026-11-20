import { useState } from 'react';
import type { Address } from 'viem';
import { passkeysSupported, useWallet, type Persona } from '../lib/wallet';

type Props = { want?: Persona; title?: string; compact?: boolean };

/**
 * Two ways in: a passkey demo wallet (Touch ID, nothing to install) or your own MetaMask on Arc.
 * After MetaMask connects, one field asks what people should call you (that's who "Send <name>…" finds).
 */
export function SignIn({ want, title = 'Sign in', compact }: Props) {
  const { wallet, signInAs, signOut, hasInjected, connectMetaMask, saveMetaMask } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Address | null>(null);
  const [name, setName] = useState('');

  const run = (label: string, fn: () => Promise<unknown>) => async () => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (wallet) {
    const wrong = want && wallet.name !== want;
    return (
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${compact ? '' : 'rounded-2xl border border-rule bg-paper px-5 py-4'}`}>
        <span className="text-[17px]">
          {wallet.kind === 'metamask' ? 'Connected with MetaMask as' : wallet.kind === 'demo' ? 'Signed in as the shared' : 'Signed in as'} <strong className="font-semibold">{wallet.name}</strong>{' '}
          <span className="mono text-[15px] text-ink-soft">
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </span>
        </span>
        {wrong && <span className="text-[16px] text-ink-soft">This step is for {want}.</span>}
        <button type="button" className="text-[16px] font-semibold text-seal underline underline-offset-4" onClick={signOut}>
          {wallet.kind === 'metamask' ? 'Disconnect' : 'Switch'}
        </button>
      </div>
    );
  }

  // Step 2 of MetaMask: what should people call you?
  if (pending) {
    const submit = run('mm-save', () => saveMetaMask(pending, name));
    return (
      <form
        className="rounded-2xl border border-rule bg-paper p-5 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-[20px] font-semibold">What should people call you?</h2>
        <p className="mt-1 text-[16px] text-ink-soft">
          Connected <span className="mono">{pending.slice(0, 6)}…{pending.slice(-4)}</span> on Arc. Gifts sent to this name come to this wallet.
        </p>
        <label htmlFor="mm-name" className="sr-only">
          Your name
        </label>
        <input
          id="mm-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="Your first name"
          className="mt-4 w-full rounded-xl border border-rule bg-receipt px-4 py-3 text-[18px] outline-none focus-visible:border-seal"
        />
        <p className="mt-3 rounded-xl border border-rule bg-receipt px-4 py-3 text-[15px] text-ink-soft">Maya and Alex are the shared demo accounts, so pick your own name.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" className="btn btn-seal" disabled={!!busy || !name.trim()}>
            {busy === 'mm-save' ? 'Saving…' : 'Continue'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setPending(null)}>
            Back
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[16px] font-medium text-ink">
            {error}
          </p>
        )}
      </form>
    );
  }

  const personas: Persona[] = want ? [want] : ['Maya', 'Alex'];
  const connect = run('mm', async () => {
    const { address, knownName } = await connectMetaMask();
    if (knownName) await saveMetaMask(address, knownName);
    else setPending(address);
  });

  return (
    <div className="rounded-2xl border border-rule bg-paper p-5 md:p-6">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Passkey */}
        <section aria-labelledby="si-passkey" className="flex flex-col rounded-xl border border-rule bg-receipt p-4">
          <h3 id="si-passkey" className="text-[18px] font-semibold">Try it as Maya or Alex</h3>
          <p className="mt-1 text-[16px] text-ink-soft">Shared demo accounts, the same on every device. Your device passkey approves each step. No wallet needed.</p>
          {!passkeysSupported() && <p className="mt-2 text-[16px] font-medium">This browser can't use passkeys here. Open Earmark on https.</p>}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            {personas.map((p) => (
              <button key={p} type="button" className="btn btn-seal" disabled={!!busy} onClick={run(p, () => signInAs(p))}>
                {busy === p ? 'Waiting for your passkey…' : `Sign in as ${p}`}
              </button>
            ))}
          </div>
        </section>

        {/* MetaMask */}
        <section aria-labelledby="si-mm" className="flex flex-col rounded-xl border border-rule bg-receipt p-4">
          <h3 id="si-mm" className="text-[18px] font-semibold">Connect MetaMask</h3>
          <p className="mt-1 text-[16px] text-ink-soft">Use your own wallet and USDC on Arc Testnet. MetaMask confirms every payment.</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            {hasInjected ? (
              <button type="button" className="btn btn-ink" disabled={!!busy} onClick={connect}>
                {busy === 'mm' ? 'Check MetaMask…' : 'Connect MetaMask'}
              </button>
            ) : (
              <a className="btn btn-outline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                Install MetaMask
              </a>
            )}
          </div>
        </section>
      </div>
      {!want && (
        <p className="mt-4 rounded-xl border border-rule bg-receipt px-4 py-3 text-[15px] text-ink-soft">
          <strong className="font-semibold text-ink">Demo:</strong> Maya sends the gift, Alex spends it. Maya always has test USDC.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[16px] font-medium text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
