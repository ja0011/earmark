import { useState } from 'react';

type Props = {
  name: string;
  alt: string;
  ratio: number;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  fit?: 'cover' | 'contain';
};

/**
 * Responsive WebP from /media/<name>-{640,1280,2000}.webp. Until the file exists it is a neutral
 * receipt-coloured block with the right aspect ratio, so the layout never jumps when assets land.
 */
export function Media({ name, alt, ratio, sizes = '(min-width: 1024px) 50vw, 100vw', className = '', imgClassName = '', eager, fit = 'cover' }: Props) {
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const base = `/media/${name}`;
  return (
    <div className={`relative overflow-hidden bg-placeholder ${className}`} style={{ aspectRatio: String(ratio) }}>
      {state !== 'missing' && (
        <img
          src={`${base}-1280.webp`}
          srcSet={`${base}-640.webp 640w, ${base}-1280.webp 1280w, ${base}-2000.webp 2000w`}
          sizes={sizes}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('ok')}
          onError={() => setState('missing')}
          className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${state === 'ok' ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      )}
      {state === 'missing' && <span className="sr-only">{alt}</span>}
    </div>
  );
}
