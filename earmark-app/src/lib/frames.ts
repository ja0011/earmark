// Hero film as a WebP frame sequence: /media/hero/frames/f0001.webp …

const frameUrl = (i: number) => `/media/hero/frames/f${String(i).padStart(4, '0')}.webp`;

async function exists(url: string) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok && (r.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

function findCount(j: unknown): number | null {
  // Accept a few manifest shapes: { hero: { frames: { count } } }, { hero: { frameCount } }, { heroFrames: n } …
  let found: number | null = null;
  const walk = (v: any, key: string, depth: number) => {
    if (found !== null || depth > 5 || v == null) return;
    if (typeof v === 'number' && /frame/i.test(key) && v > 1 && v < 2000) found = v;
    else if (Array.isArray(v) && /frames/i.test(key) && v.length > 1) found = v.length;
    else if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], /frame/i.test(key) && /count|total|length/i.test(k) ? 'frame' + k : k, depth + 1);
  };
  walk(j, '', 0);
  return found;
}

/** Number of hero frames available, or 0 when the film has not landed yet. */
export async function heroFrameCount(): Promise<number> {
  try {
    const r = await fetch('/media/manifest.json');
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const j = await r.json();
      const n = Number(j?.hero?.frames?.count) || findCount(j);
      if (n) return n;
    }
  } catch {}
  if (!(await exists(frameUrl(1)))) return 0;
  // Binary search the last frame.
  let lo = 1;
  let hi = 600;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (await exists(frameUrl(mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Progressive loader: first frame, then coarse to fine, so scrubbing works before everything arrives. */
export class FrameSet {
  images: (HTMLImageElement | null)[];
  private queue: number[] = [];
  private active = 0;
  private paused = false;
  onFirst?: () => void;
  onLoad?: (i: number) => void;

  constructor(public count: number, step = 1) {
    this.images = new Array(count).fill(null);
    const seen = new Set<number>();
    const push = (i: number) => {
      if (i < count && !seen.has(i)) {
        seen.add(i);
        this.queue.push(i);
      }
    };
    push(0);
    for (const s of [32, 16, 8, 4, 2, 1].filter((s) => s >= step)) for (let i = 0; i < count; i += s) push(i);
  }

  start() {
    this.paused = false;
    while (this.active < 6 && this.queue.length) this.next();
  }
  pause() {
    this.paused = true;
  }

  private next() {
    if (this.paused) return;
    const i = this.queue.shift();
    if (i === undefined) return;
    this.active++;
    const img = new Image();
    img.decoding = 'async';
    img.src = frameUrl(i + 1);
    const finish = (ok: boolean) => {
      this.active--;
      if (ok) {
        this.images[i] = img;
        if (i === 0) this.onFirst?.();
        this.onLoad?.(i);
      }
      if (!this.paused) this.next();
    };
    img.decode().then(() => finish(true), () => finish(false));
  }

  /** Nearest loaded frame to i. */
  nearest(i: number): HTMLImageElement | null {
    if (this.images[i]) return this.images[i];
    for (let d = 1; d < this.count; d++) {
      const a = this.images[i - d];
      if (a) return a;
      const b = this.images[i + d];
      if (b) return b;
    }
    return null;
  }
}
