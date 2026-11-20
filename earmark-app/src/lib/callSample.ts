export type Word = { text: string; start: number; end: number };
export type Line = { speaker: string; text: string; start: number; end: number; words: Word[] };
/** joiner: '' for languages written without spaces (Chinese). */
export type CallScript = { duration: number; lines: Line[]; joiner?: string };

const FALLBACK_LINES: { speaker: 'Earmark' | 'Alex'; text: string }[] = [
  { speaker: 'Earmark', text: 'Hey Alex, your $45 shovel gift expires in four days. Want me to buy it for you?' },
  { speaker: 'Alex', text: 'Yeah, do it.' },
];

/** Even word timings, used only until media/call/call.json lands. */
export function estimatedScript(): CallScript {
  let t = 0.3;
  const lines = FALLBACK_LINES.map((l) => {
    const words = l.text.split(' ').map((w) => {
      const d = 0.16 + w.length * 0.045;
      const word = { text: w, start: t, end: t + d };
      t += d + 0.04;
      return word;
    });
    const line = { ...l, start: words[0].start, end: t, words };
    t += 0.7;
    return line;
  });
  return { duration: t, lines };
}

/** base: '/media/call/call' (English) or '/media/call/call-es' (Spanish). */
export async function loadCallScript(base = '/media/call/call'): Promise<{ script: CallScript; real: boolean }> {
  try {
    const r = await fetch(`${base}.json`);
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const j = (await r.json()) as CallScript;
      if (Array.isArray(j.lines) && j.lines.length) {
        for (const l of j.lines) if (!Array.isArray(l.words) || !l.words.length) l.words = estimateWords(l);
        return { script: j, real: true };
      }
    }
  } catch {}
  return { script: estimatedScript(), real: false };
}

function estimateWords(l: Line): Word[] {
  const parts = l.text.split(' ');
  const span = (l.end - l.start) / parts.length;
  return parts.map((text, i) => ({ text, start: l.start + i * span, end: l.start + (i + 1) * span }));
}
