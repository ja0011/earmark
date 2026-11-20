import { useMemo, useState, type ReactNode } from 'react';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { formatUsdc, itemIdFor } from 'earmark-plugin';
import { AppLayout } from '../components/AppLayout';
import { Code } from '../components/Code';
import { Media } from '../components/Media';
import { Notice, TxLink } from '../components/Tx';
import { api } from '../lib/api';
import { useConfig } from '../lib/config';

type Item = { sku: string; name: string; price: string; itemId?: Hex; image?: string };

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode }) {
  return (
    <li className={`relative border-l-2 pb-14 pl-8 md:pl-12 ${done ? 'border-seal' : 'border-rule'} last:pb-0`}>
      <span
        className={`mono absolute -left-[19px] top-0 grid h-9 w-9 place-items-center rounded-full text-[15px] ${done ? 'bg-seal text-white' : active ? 'bg-ink text-receipt' : 'bg-placeholder text-ink-soft'}`}
        aria-hidden="true"
      >
        {done ? (
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>
        ) : (
          n
        )}
      </span>
      <h2 className="text-[24px] font-semibold leading-tight md:text-[28px]">
        <span className="sr-only">Step {n}{done ? ', done' : ''}: </span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </li>
  );
}

export default function Stores() {
  const cfg = useConfig();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [catalogUrl, setCatalogUrl] = useState('');
  const [connected, setConnected] = useState(false);

  const [key, setKey] = useState<Hex | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState<{ txHash?: Hex; already?: boolean } | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  const [items, setItems] = useState<Item[] | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [catError, setCatError] = useState<string | null>(null);
  const [loadingCat, setLoadingCat] = useState(false);
  const [saved, setSaved] = useState(false);

  const slug = slugify(name || 'your-store');
  const site = website.replace(/\/$/, '');

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !/^https?:\/\//.test(site)) return;
    if (!catalogUrl) setCatalogUrl(`${site}/earmark/catalog`);
    setConnected(true);
  };

  const useDemo = () => {
    setName('Hartwell Supply');
    setWebsite(cfg?.hartwellUrl ?? 'http://localhost:5174');
    setCatalogUrl(`${(cfg?.hartwellUrl ?? 'http://localhost:5174').replace(/\/$/, '')}/earmark/catalog`);
  };

  const createKey = () => {
    const k = generatePrivateKey();
    setKey(k);
    setAddress(privateKeyToAccount(k).address);
    setDownloaded(false);
  };

  const download = () => {
    if (!key || !address) return;
    const env = [
      `# ${name} - Earmark store key. Keep this file on your server only. Earmark never sees it again.`,
      `EARMARK_STORE_PRIVATE_KEY=${key}`,
      `EARMARK_STORE_ADDRESS=${address}`,
      `EARMARK_CONTRACT=${cfg?.earmark ?? ''}`,
      `EARMARK_CHAIN_ID=${cfg?.chainId ?? 5042002}`,
      `ARC_RPC_URL=https://rpc.testnet.arc.io`,
      `EARMARK_APP_URL=${window.location.origin}`,
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([env], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.earmark.env`;
    a.click();
    URL.revokeObjectURL(url);
    setKey(null); // one time: the key is gone from this page now
    setDownloaded(true);
  };

  const register = async () => {
    if (!address) return;
    setRegistering(true);
    setRegError(null);
    try {
      await api('/api/stores', {
        method: 'POST',
        json: { name, website: site, store: address, signer: address, catalogUrl, signUrl: catalogUrl.replace(/\/catalog$/, '/sign'), slug },
      });
      const r = await api<{ ok: true; txHash?: Hex; already?: boolean }>('/api/stores/register-onchain', { method: 'POST', json: { store: address, signer: address } });
      setRegistered(r);
    } catch (e) {
      setRegError((e as Error).message);
    } finally {
      setRegistering(false);
    }
  };

  const loadCatalog = async () => {
    setLoadingCat(true);
    setCatError(null);
    try {
      let data: { items: Item[] };
      try {
        const r = await fetch(catalogUrl);
        if (!r.ok) throw new Error(String(r.status));
        data = await r.json();
      } catch {
        data = await api(`/api/stores/catalog?url=${encodeURIComponent(catalogUrl)}`);
      }
      setItems(data.items);
      setEnabled(Object.fromEntries(data.items.map((i) => [i.sku, true])));
    } catch (e) {
      setCatError((e as Error).message);
    } finally {
      setLoadingCat(false);
    }
  };

  const saveProducts = async () => {
    if (!address) return;
    await api('/api/stores', {
      method: 'POST',
      json: { name, website: site, store: address, signer: address, catalogUrl, enabledSkus: Object.keys(enabled).filter((k) => enabled[k]) },
    }).catch(() => {});
    setSaved(true);
  };

  const step2Done = downloaded && !!registered;
  const step3Done = saved;

  const buttonCode = useMemo(
    () => `import { EarmarkPayButton } from 'earmark-plugin/react';

<EarmarkPayButton
  store="${address ?? '0xYourStoreAddress'}"
  cart={cart}            // [{ sku, qty, name, price }]
  signUrl="${site || 'https://your-store.example'}/earmark/sign"
  onPaid={(r) => showReceipt(r)}   // { txHash, giftId, price, change, changeTo }
  onError={(e) => showError(e.message)}
/>`,
    [address, site],
  );

  const serverCode = useMemo(
    () => `import express from 'express';
import { earmarkRouter, registerWithEarmark } from 'earmark-plugin/server';

const app = express();
app.use(earmarkRouter({
  privateKey: process.env.EARMARK_STORE_PRIVATE_KEY,   // from the .env you downloaded
  rpcUrl: process.env.ARC_RPC_URL,
  chainId: Number(process.env.EARMARK_CHAIN_ID),
  earmark: process.env.EARMARK_CONTRACT,
  storeSlug: '${slug}',
  storeInfo: { name: '${name || 'Your Store'}', website: '${site || 'https://your-store.example'}' },
  catalog: products,   // [{ sku, name, price: '39980000' }] - prices live here, never in the browser
}));
// GET /earmark/catalog and POST /earmark/sign are now live.`,
    [slug, name, site],
  );

  return (
    <AppLayout title="For stores">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <h1 className="display" style={{ fontSize: 'clamp(3rem, 7vw, 6.5rem)' }}>
            Add Earmark in under an hour.
          </h1>
          <p className="mt-6 max-w-[560px] text-[22px] leading-[1.45]">A button for your checkout. A signer for your server. That's it.</p>
        </div>
        <Media name="hartwell-storefront" ratio={16 / 9} alt="A small hardware store front in winter." className="rounded-[20px]" />
      </div>

      <ol className="mt-20 max-w-[860px] pl-5">
        <Step n={1} title="Connect your store" done={connected} active={!connected}>
          <form onSubmit={connect} className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="st-name">Store name</label>
              <input id="st-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hartwell Supply" disabled={connected} autoComplete="organization" />
            </div>
            <div>
              <label className="label" htmlFor="st-site">Website</label>
              <input id="st-site" className="field" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://hartwell.example" disabled={connected} inputMode="url" />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="st-cat">Catalogue URL</label>
              <input id="st-cat" className="field mono text-[16px]" value={catalogUrl} onChange={(e) => setCatalogUrl(e.target.value)} placeholder={`${site || 'https://your-store.example'}/earmark/catalog`} disabled={connected} />
            </div>
            <div className="flex flex-wrap items-center gap-4 md:col-span-2">
              {!connected ? (
                <>
                  <button type="submit" className="btn btn-ink" disabled={!name.trim() || !/^https?:\/\//.test(site)}>
                    Connect
                  </button>
                  <button type="button" className="text-[16px] font-semibold underline underline-offset-4" onClick={useDemo}>
                    Use the demo store
                  </button>
                </>
              ) : (
                <button type="button" className="text-[16px] font-semibold underline underline-offset-4" onClick={() => setConnected(false)}>
                  Edit
                </button>
              )}
            </div>
          </form>
        </Step>

        <Step n={2} title="Create your store key" done={step2Done} active={connected && !step2Done}>
          <p className="text-[18px] text-ink-soft">Your server signs every Earmark order with this key. It's made in your browser and you download it once.</p>
          <div className="mt-5 flex flex-col gap-4">
            {!address && (
              <button type="button" className="btn btn-ink self-start" onClick={createKey} disabled={!connected}>
                Create key
              </button>
            )}
            {address && (
              <div className="rounded-2xl border border-rule bg-paper px-5 py-4">
                <div className="text-[15px] text-ink-soft">Public address (your store's signer)</div>
                <div className="mono mt-1 break-all text-[17px]">{address}</div>
              </div>
            )}
            {address && !downloaded && key && (
              <button type="button" className="btn btn-seal self-start" onClick={download}>
                Download private key (.env)
              </button>
            )}
            {downloaded && <p className="text-[17px]">Downloaded. The private key is gone from this page. Put it in your server's .env.</p>}
            {downloaded && !registered && (
              <button type="button" className="btn btn-ink self-start" onClick={register} disabled={registering || !cfg?.ready}>
                {registering ? 'Registering on Arc…' : 'Register with Earmark'}
              </button>
            )}
            {regError && <Notice tone="error">{regError}</Notice>}
            {registered?.txHash && <TxLink hash={registered.txHash} label="registerStore on Arc" />}
            {registered?.already && <p className="text-[17px]">Already registered on Arc.</p>}
          </div>
        </Step>

        <Step n={3} title="Pick your products" done={step3Done} active={step2Done && !step3Done}>
          <p className="text-[18px] text-ink-soft">Each product you turn on gets an Earmark item ID. Gifts can only buy items that are on.</p>
          <div className="mt-5">
            {!items && (
              <button type="button" className="btn btn-ink" onClick={loadCatalog} disabled={!connected || loadingCat || !catalogUrl}>
                {loadingCat ? 'Reading your catalogue…' : 'Read my catalogue'}
              </button>
            )}
            {catError && (
              <div className="mt-4">
                <Notice tone="error">Couldn't read {catalogUrl}: {catError}</Notice>
              </div>
            )}
            {items && (
              <ul className="divide-y divide-rule rounded-2xl border border-rule bg-paper">
                {items.map((it) => {
                  const on = enabled[it.sku];
                  const id = it.itemId ?? itemIdFor(slug, it.sku);
                  return (
                    <li key={it.sku} className="flex items-center gap-4 px-4 py-3 md:px-5">
                      <Media name={it.image ?? it.sku} ratio={1} alt="" fit="contain" sizes="64px" className="w-14 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[17px] font-semibold">{it.name}</div>
                        <div className="mono truncate text-[15px] text-ink-soft" title={id}>
                          {/^\d+$/.test(it.price) ? formatUsdc(it.price) : it.price} · {id.slice(0, 10)}…{id.slice(-6)}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`Accept Earmark gifts for ${it.name}`}
                        onClick={() => (setEnabled((m) => ({ ...m, [it.sku]: !m[it.sku] })), setSaved(false))}
                        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-seal' : 'bg-rule'}`}
                      >
                        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] ${on ? 'left-7' : 'left-1'}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {items && (
              <button type="button" className="btn btn-ink mt-5" onClick={saveProducts} disabled={!address}>
                {saved ? 'Saved' : 'Save products'}
              </button>
            )}
          </div>
        </Step>

        <Step n={4} title="Add the button" done={false} active={connected}>
          <div className="flex flex-col gap-5">
            <Code label="Checkout (React)" code={buttonCode} />
            <Code label="Server (Express)" code={serverCode} />
            <Code label="Install" code={`npm install earmark-plugin`} />
          </div>
        </Step>
      </ol>
    </AppLayout>
  );
}
