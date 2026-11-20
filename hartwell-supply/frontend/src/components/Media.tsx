import { useState } from 'react';

type Props = {
  /** Media base name, e.g. "snow-shovel" → /media/snow-shovel-640.webp */
  name: string;
  alt: string;
  /** CSS aspect-ratio, e.g. "16 / 9" */
  ratio: string;
  sizes: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
};

/**
 * Responsive image with a plain light block behind it. Until the asset exists,
 * the block of the right aspect ratio is all you see (no stock imagery).
 */
export function Media({ name, alt, ratio, sizes, className = '', imgClassName = 'object-cover', eager }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const base = `/media/${name}`;
  return (
    <div
      className={`relative overflow-hidden bg-shelf ${className}`}
      style={{ aspectRatio: ratio }}
      {...(failed && alt ? { role: 'img', 'aria-label': alt } : {})}
    >
      {!failed && (
        <img
          src={`${base}-1280.webp`}
          srcSet={`${base}-640.webp 640w, ${base}-1280.webp 1280w, ${base}-2000.webp 2000w`}
          sizes={sizes}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          {...(eager ? ({ fetchpriority: 'high' } as Record<string, string>) : {})}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      )}
    </div>
  );
}
