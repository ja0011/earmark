import { useState } from 'react';
import { passkeysSupported, useWallet, type Persona } from '../lib/wallet';

type Props = { want?: Persona; title?: string; compact?: boolean };

/** Passkey sign-in with the two demo personas. */
export function SignIn({ want, title = 'Sign in with a passkey', compact }: Props) {
  const { wallet, wallets, create, signIn, signOut } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          Signed in as <strong className="font-semibold">{wallet.name}</strong>{' '}
          <span className="mono text-[15px] text-ink-soft">
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </span>
        </span>
        {wrong && <span className="text-[16px] text-ink-soft">This step is for {want}.</span>}
        <button type="button" className="text-[16px] font-semibold text-seal underline underline-offset-4" onClick={signOut}>
          Switch
        </button>
      </div>
    );
  }

  const personas: Persona[] = want ? [want] : ['Maya', 'Alex'];
  const existing = wallets.length > 0;

  return (
    <div className="rounded-2xl border border-rule bg-paper p-5 md:p-6">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      <p className="mt-1 text-[16px] text-ink-soft">Face ID, Touch ID or your device PIN. Your wallet key stays in this browser.</p>
      {!passkeysSupported() && <p className="mt-3 text-[16px] font-medium">This browser can't use passkeys here. Open Earmark on localhost or https.</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {existing && (
          <button type="button" className="btn btn-seal" disabled={!!busy} onClick={run('signin', signIn)}>
            {busy === 'signin' ? 'Waiting for your passkey…' : 'Sign in with passkey'}
          </button>
        )}
        {personas.map((p) => (
          <button key={p} type="button" className={`btn ${existing ? 'btn-outline' : 'btn-seal'}`} disabled={!!busy} onClick={run(p, () => create(p))}>
            {busy === p ? 'Creating passkey…' : `New passkey as ${p}`}
          </button>
        ))}
      </div>
      {!want && <p className="mt-3 text-[15px] text-ink-soft">Demo: Maya sends the gift, Alex spends it. Each gets a passkey on this device.</p>}
      {error && (
        <p role="alert" className="mt-3 text-[16px] font-medium text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
