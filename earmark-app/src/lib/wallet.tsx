// Two kinds of wallet:
// - passkey: an embedded wallet. The private key is generated in this browser and kept in localStorage under the
//   passkey credential id. Every money-moving action needs a fresh WebAuthn assertion with user verification.
// - metamask: the person's own browser wallet. Nothing secret is stored here; MetaMask signs every transaction.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAddress, keccak256, toBytes, type Address, type Hex, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { api } from './api';
import { ensureArc, injected, injectedWalletFor, walletFor } from './chain';
import { loadConfig } from './config';

export type Persona = 'Maya' | 'Alex';
export type WalletKind = 'passkey' | 'metamask';
type StoredWallet = { kind?: WalletKind; name: string; address: Address; privateKey?: Hex; createdAt: number };
export type Wallet = { credentialId: string; kind: WalletKind; name: string; address: Address };

const KEY_WALLETS = 'earmark:wallets';
const KEY_CURRENT = 'earmark:current';

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function readAll(): Record<string, StoredWallet> {
  try {
    return JSON.parse(localStorage.getItem(KEY_WALLETS) ?? '{}');
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, StoredWallet>) {
  localStorage.setItem(KEY_WALLETS, JSON.stringify(all));
}

export function passkeysSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials && window.isSecureContext;
}

function rpId() {
  return window.location.hostname;
}

function checkUserVerified(cred: PublicKeyCredential) {
  const resp = cred.response as AuthenticatorAssertionResponse;
  const flags = new Uint8Array(resp.authenticatorData)[32];
  if ((flags & 0x04) === 0) throw new Error('Your device did not verify you (Face ID, Touch ID or PIN). Try again.');
}

export class PasskeyError extends Error {}

async function assertion(credentialId: string | null, purpose: string): Promise<PublicKeyCredential> {
  if (!passkeysSupported()) throw new PasskeyError('Passkeys need a secure browser context (https or localhost).');
  const challenge = new Uint8Array(toBytes(keccak256(new TextEncoder().encode(`${purpose}:${Date.now()}:${b64url(random(16))}`))));
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: rpId(),
        userVerification: 'required',
        timeout: 60_000,
        allowCredentials: credentialId ? [{ type: 'public-key', id: fromB64url(credentialId) }] : [],
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyError('No passkey was chosen.');
    checkUserVerified(cred);
    return cred;
  } catch (e) {
    if ((e as Error).name === 'NotAllowedError') throw new PasskeyError('The passkey check was cancelled.');
    throw e;
  }
}

type Ctx = {
  wallet: Wallet | null;
  wallets: Wallet[];
  /** Create a new passkey + wallet for a demo persona. */
  create: (persona: Persona) => Promise<Wallet>;
  /** Sign in with any passkey saved on this device. */
  signIn: () => Promise<Wallet>;
  signOut: () => void;
  /**
   * A wallet client for one money-moving action. Passkey: a fresh WebAuthn assertion first.
   * MetaMask: makes sure the wallet is on Arc; MetaMask then asks the person to confirm.
   */
  signer: (purpose: string) => Promise<WalletClient>;
  /** True when a browser wallet such as MetaMask is installed. */
  hasInjected: boolean;
  /** Ask MetaMask to connect and switch to Arc. Returns the account and the name used before, if any. */
  connectMetaMask: () => Promise<{ address: Address; knownName: string | null }>;
  /** Save the connected MetaMask account under a display name and sign in with it. */
  saveMetaMask: (address: Address, name: string) => Promise<Wallet>;
};

const WalletCtx = createContext<Ctx | null>(null);

const toWallet = (credentialId: string, w: StoredWallet): Wallet => ({ credentialId, kind: w.kind ?? 'passkey', name: w.name, address: w.address });
const mmId = (a: string) => `mm:${a.toLowerCase()}`;

async function registerPersona(w: Wallet) {
  await api('/api/contacts', { method: 'POST', json: { name: w.name, address: w.address } }).catch(() => {});
  await api('/api/demo/fund', { method: 'POST', json: { address: w.address, role: w.name } }).catch(() => {});
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY_CURRENT);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_CURRENT) setCurrentId(e.newValue);
      if (e.key === KEY_WALLETS || e.key === KEY_CURRENT) setVersion((v) => v + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const all = useMemo(() => readAll(), [version]);
  const wallet = currentId && all[currentId] ? toWallet(currentId, all[currentId]) : null;
  const wallets = Object.entries(all).map(([id, w]) => toWallet(id, w));

  // Make sure the server knows this persona (contacts) even after a server reset.
  useEffect(() => {
    if (wallet) api('/api/contacts', { method: 'POST', json: { name: wallet.name, address: wallet.address } }).catch(() => {});
  }, [wallet?.address]);

  const select = (id: string) => {
    localStorage.setItem(KEY_CURRENT, id);
    setCurrentId(id);
    setVersion((v) => v + 1);
  };

  const create = useCallback(async (persona: Persona) => {
    if (!passkeysSupported()) throw new PasskeyError('Passkeys need a secure browser context (https or localhost).');
    let cred: PublicKeyCredential | null;
    try {
      cred = (await navigator.credentials.create({
        publicKey: {
          challenge: random(32),
          rp: { name: 'Earmark', id: rpId() },
          user: { id: random(16), name: `${persona.toLowerCase()}@earmark.demo`, displayName: `${persona} (Earmark demo)` },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          timeout: 60_000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;
    } catch (e) {
      if ((e as Error).name === 'NotAllowedError') throw new PasskeyError('Creating the passkey was cancelled.');
      throw e;
    }
    if (!cred) throw new PasskeyError('No passkey was created.');
    const id = b64url(cred.rawId);
    const privateKey = generatePrivateKey();
    const address = getAddress(privateKeyToAccount(privateKey).address);
    const store = readAll();
    store[id] = { kind: 'passkey', name: persona, address, privateKey, createdAt: Date.now() };
    writeAll(store);
    select(id);
    const w = toWallet(id, store[id]);
    await registerPersona(w);
    return w;
  }, []);

  const signIn = useCallback(async () => {
    const cred = await assertion(null, 'sign-in');
    const id = b64url(cred.rawId);
    const store = readAll();
    if (!store[id] || store[id].kind === 'metamask') throw new PasskeyError("That passkey's wallet isn't on this browser. Create a new one here.");
    select(id);
    const w = toWallet(id, store[id]);
    registerPersona(w);
    return w;
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY_CURRENT);
    setCurrentId(null);
  }, []);

  const [hasInjected, setHasInjected] = useState(false);
  useEffect(() => {
    // Extensions inject window.ethereum around page load; check now and once more shortly after.
    const check = () => setHasInjected(!!injected());
    check();
    const t = setTimeout(check, 600);
    return () => clearTimeout(t);
  }, []);

  const connectMetaMask = useCallback(async () => {
    const provider = injected();
    if (!provider) throw new PasskeyError('MetaMask isn\u2019t installed in this browser.');
    let accounts: string[];
    try {
      accounts = await provider.request({ method: 'eth_requestAccounts' });
    } catch (e: any) {
      if (e?.code === 4001) throw new PasskeyError('Connecting was cancelled in MetaMask.');
      throw e;
    }
    if (!accounts?.length) throw new PasskeyError('MetaMask didn\u2019t share an account.');
    const cfg = await loadConfig();
    try {
      await ensureArc(provider, cfg);
    } catch (e: any) {
      if (e?.code === 4001) throw new PasskeyError('Switching to Arc Testnet was cancelled in MetaMask.');
      throw e;
    }
    const address = getAddress(accounts[0]);
    return { address, knownName: readAll()[mmId(address)]?.name ?? null };
  }, []);

  const saveMetaMask = useCallback(async (address: Address, name: string) => {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!clean) throw new PasskeyError('Add a name so people can send to you.');
    const id = mmId(address);
    const store = readAll();
    store[id] = { kind: 'metamask', name: clean, address: getAddress(address), createdAt: store[id]?.createdAt ?? Date.now() };
    writeAll(store);
    select(id);
    const w = toWallet(id, store[id]);
    await registerPersona(w);
    return w;
  }, []);

  // Follow MetaMask: switching accounts there switches (or signs out) here.
  useEffect(() => {
    const provider = injected();
    if (!provider?.on) return;
    const onAccounts = (accounts: string[]) => {
      const cur = localStorage.getItem(KEY_CURRENT);
      if (!cur?.startsWith('mm:')) return;
      const next = accounts?.[0] ? mmId(accounts[0]) : null;
      if (next && readAll()[next]) select(next);
      else {
        localStorage.removeItem(KEY_CURRENT);
        setCurrentId(null);
      }
    };
    provider.on('accountsChanged', onAccounts);
    return () => provider.removeListener?.('accountsChanged', onAccounts);
  }, [hasInjected]);

  const signer = useCallback(
    async (purpose: string): Promise<WalletClient> => {
      if (!currentId) throw new PasskeyError('Sign in first.');
      const w = readAll()[currentId];
      if (!w) throw new PasskeyError('Wallet not found on this browser.');
      const cfg = await loadConfig();
      if (w.kind === 'metamask') {
        const provider = injected();
        if (!provider) throw new PasskeyError('MetaMask isn\u2019t available in this browser.');
        const accounts: string[] = await provider.request({ method: 'eth_accounts' });
        if (!accounts.some((a) => a.toLowerCase() === w.address.toLowerCase())) {
          throw new PasskeyError(`Switch MetaMask to ${w.address.slice(0, 6)}\u2026${w.address.slice(-4)} and try again.`);
        }
        await ensureArc(provider, cfg);
        return injectedWalletFor(cfg, provider, w.address);
      }
      const cred = await assertion(currentId, purpose);
      if (b64url(cred.rawId) !== currentId) throw new PasskeyError('That was a different passkey.');
      if (!w.privateKey) throw new PasskeyError('Wallet not found on this browser.');
      return walletFor(cfg, w.privateKey);
    },
    [currentId],
  );

  return (
    <WalletCtx.Provider value={{ wallet, wallets, create, signIn, signOut, signer, hasInjected, connectMetaMask, saveMetaMask }}>{children}</WalletCtx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error('useWallet outside WalletProvider');
  return ctx;
}
