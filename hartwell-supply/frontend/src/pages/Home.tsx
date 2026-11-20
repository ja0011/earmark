import { useState } from 'react';
import { Media } from '../components/Media';
import { useStore } from '../lib/store';
import { formatUnits6 } from '../lib/money';
import type { Product } from '../lib/api';

export function Home() {
  const { products, loading, loadError } = useStore();
  return (
    <main id="main">
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10" aria-labelledby="hero-title">
        <div className="grid items-end gap-6 lg:grid-cols-[1.6fr_1fr] lg:gap-10">
          <Media
            name="hartwell-storefront"
            alt="The front of Hartwell Supply on a snowy morning"
            ratio="16 / 9"
            sizes="(min-width: 1024px) 680px, 100vw"
            className="rounded-lg"
            eager
          />
          <div className="pb-1">
            <h1 id="hero-title" className="font-store text-[2.5rem] font-extrabold leading-[0.95] tracking-[-0.02em] sm:text-[3.25rem]">
              Snow's coming. We have shovels.
            </h1>
            <p className="mt-4 max-w-md text-[18px] text-muted">
              A neighbourhood hardware store on Alder Street. Tools, salt, gloves and advice since the old days.
            </p>
            <p className="mt-5 inline-flex items-start gap-2.5 rounded-md bg-shelf px-3 py-2 text-[16px]">
              <span className="mt-[0.55em] size-2 shrink-0 rounded-full bg-pine" aria-hidden="true" />
              Got an Earmark gift? Pay with it at checkout.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4 sm:mt-20 sm:px-6" aria-labelledby="shelf-title">
        <div className="mb-6 flex items-end justify-between border-b border-line pb-3">
          <h2 id="shelf-title" className="font-store text-[1.75rem] font-bold sm:text-[2rem]">
            On the shelf
          </h2>
          <p className="text-[16px] text-muted">{products.length ? `${products.length} items` : ''}</p>
        </div>
        {loadError && (
          <p role="alert" className="rounded-md bg-stop-bg px-4 py-3 text-stop">
            {loadError}
          </p>
        )}
        <ul className="grid grid-cols-1 gap-x-6 gap-y-4 min-[520px]:grid-cols-2 min-[520px]:gap-y-10 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} aria-hidden="true">
                  <div className="aspect-square rounded-lg bg-shelf" />
                </li>
              ))
            : products.map((p) => <ProductCard key={p.sku} p={p} />)}
        </ul>
      </section>
    </main>
  );
}

function ProductCard({ p }: { p: Product }) {
  const { add } = useStore();
  const [added, setAdded] = useState(false);
  return (
    <li className="flex gap-4 min-[520px]:flex-col min-[520px]:gap-0">
      <Media
        name={p.image}
        alt={p.title}
        ratio="1 / 1"
        sizes="(min-width: 1024px) 360px, (min-width: 520px) 50vw, 130px"
        className="w-32 shrink-0 rounded-lg min-[520px]:w-full"
        imgClassName="object-contain p-4 sm:p-6"
      />
      <div className="flex flex-1 flex-col justify-between gap-2 min-[520px]:mt-4 min-[520px]:flex-row min-[520px]:items-start">
        <div>
          <h3 className="text-[18px] font-semibold leading-snug">{p.title}</h3>
          <p className="text-[16px] text-muted">{p.blurb}</p>
          <p className="mt-1 font-mono text-[17px] font-medium">{formatUnits6(p.price)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            add(p.sku);
            setAdded(true);
            window.setTimeout(() => setAdded(false), 1600);
          }}
          className="min-h-11 shrink-0 self-start rounded-md bg-pine px-4 text-[16px] font-semibold text-paper hover:bg-pine-deep"
          aria-label={`Add ${p.title} to cart`}
        >
          {added ? 'Added' : 'Add to cart'}
        </button>
        {added && (
          <span className="sr-only" role="status">
            {p.title} added to cart.
          </span>
        )}
      </div>
    </li>
  );
}
