import type { Address } from 'viem';

export type RegisterWithEarmarkOptions = {
  /** Earmark server base URL, e.g. http://localhost:8787 */
  earmarkApi: string;
  name: string;
  website: string;
  store: Address;
  signer: Address;
  catalogUrl: string;
  signUrl: string;
};

/**
 * Tells Earmark where your catalogue and signer live, then asks Earmark to register your
 * signer on chain (registerStore) if it isn't yet. Safe to call on every boot.
 */
export async function registerWithEarmark(opts: RegisterWithEarmarkOptions) {
  const { earmarkApi, ...body } = opts;
  const base = earmarkApi.replace(/\/$/, '');
  const post = async (path: string, payload: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`registerWithEarmark ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const listed = (await post('/api/stores', body)) as { ok: true; store: Record<string, unknown>; onchain: boolean };
  if (listed.onchain) return { ...listed, txHash: undefined as `0x${string}` | undefined };
  const reg = (await post('/api/stores/register-onchain', { store: opts.store, signer: opts.signer })) as {
    ok: true;
    already?: boolean;
    txHash?: `0x${string}`;
  };
  return { ...listed, onchain: true, txHash: reg.txHash };
}
