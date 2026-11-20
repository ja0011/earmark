import { useEffect, useRef, useState } from 'react';
import { loadCallScript, type CallScript } from '../lib/callSample';

type Props = {
  /** Called when the sample finishes (used by the gift page in demo mode). */
  onEnded?: () => void;
  autoStartToken?: number;
  note?: string;
  className?: string;
};

/**
 * The phone-call card: a play button, a live waveform from a Web Audio analyser, and the transcript typing
 * in sync with the recorded sample. Nothing plays until the first click.
 */
export function CallCard({ onEnded, autoStartToken, note, className = '' }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const graph = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const [script, setScript] = useState<CallScript | null>(null);
  const [audioOk, setAudioOk] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [started, setStarted] = useState(false);
  const fake = useRef<{ start: number } | null>(null);
  const raf = useRef(0);
  const visible = useRef(true);

  useEffect(() => {
    loadCallScript().then(({ script }) => setScript(script));
    requestAnimationFrame(() => draw(0));
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    if (canvas.current) io.observe(canvas.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf.current);
      graph.current?.ctx.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (autoStartToken) toggle();
  }, [autoStartToken]);

  const duration = script?.duration ?? 8;

  const loop = () => {
    raf.current = 0;
    const now = fake.current ? (performance.now() - fake.current.start) / 1000 : audio.current?.currentTime ?? 0;
    setT(now);
    if (fake.current && now >= duration) {
      stop(true);
      return;
    }
    draw(now);
    raf.current = requestAnimationFrame(loop);
  };

  const draw = (now: number) => {
    const c = canvas.current;
    if (!c || !visible.current || document.hidden) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== c.clientWidth * dpr) {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const bars = 48;
    const gap = 3 * dpr;
    const bw = (c.width - gap * (bars - 1)) / bars;
    let data: Uint8Array<ArrayBuffer> | null = null;
    if (graph.current && !fake.current) {
      data = new Uint8Array(new ArrayBuffer(graph.current.analyser.frequencyBinCount));
      graph.current.analyser.getByteFrequencyData(data);
    }
    for (let i = 0; i < bars; i++) {
      let v: number;
      if (data) {
        const idx = Math.floor((i / bars) * data.length * 0.7);
        v = data[idx] / 255;
      } else {
        v = 0.08; // flat line when the sample is not loaded: never pretend there is audio
      }
      const h = Math.max(2 * dpr, v * c.height);
      g.fillStyle = i / bars < now / duration ? '#2F6BFF' : 'rgba(245,242,235,0.55)';
      g.beginPath();
      g.roundRect(i * (bw + gap), (c.height - h) / 2, bw, h, bw / 2);
      g.fill();
    }
  };

  const stop = (ended: boolean) => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    setPlaying(false);
    fake.current = null;
    if (ended) {
      setT(duration + 1);
      onEnded?.();
    }
  };

  const toggle = async () => {
    const a = audio.current!;
    if (playing) {
      if (fake.current) stop(false);
      else a.pause();
      return;
    }
    setStarted(true);
    if (audioOk) {
      try {
        if (!graph.current) {
          const ctx = new AudioContext();
          const src = ctx.createMediaElementSource(a);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.75;
          src.connect(analyser);
          analyser.connect(ctx.destination);
          graph.current = { ctx, analyser };
        }
        await graph.current.ctx.resume();
        if (a.ended || a.currentTime >= a.duration - 0.05) a.currentTime = 0;
        await a.play();
        return;
      } catch {
        setAudioOk(false);
      }
    }
    // No sample yet: run the transcript on its own timing with a flat waveform.
    fake.current = { start: performance.now() };
    setPlaying(true);
    raf.current = requestAnimationFrame(loop);
  };

  return (
    <div className={`w-full max-w-[520px] rounded-[28px] bg-vault-2 p-6 text-receipt ring-1 ring-white/10 md:p-8 on-dark ${className}`}>
      <audio
        ref={audio}
        src="/media/call/call.mp3"
        preload="none"
        onPlay={() => {
          setPlaying(true);
          if (!raf.current) raf.current = requestAnimationFrame(loop);
        }}
        onPause={() => {
          setPlaying(false);
          cancelAnimationFrame(raf.current);
          raf.current = 0;
        }}
        onEnded={() => stop(true)}
        onError={() => setAudioOk(false)}
      />
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause the call sample' : 'Play the call sample'}
          aria-pressed={playing}
          className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full bg-seal text-white transition-transform hover:scale-105"
        >
          {playing ? (
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="4" y="3" width="5" height="16" rx="1.5" fill="currentColor" /><rect x="13" y="3" width="5" height="16" rx="1.5" fill="currentColor" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[20px] font-semibold">Earmark</span>
            <span className="mono text-[15px] text-fog">{fmt(Math.min(t, duration))}</span>
          </div>
          <div className="text-[15px] text-fog">{playing ? 'On call' : started ? 'Call ended' : 'Incoming call'}</div>
          <canvas ref={canvas} className="mt-2 h-[40px] w-full" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-6 min-h-[150px] space-y-4" aria-live="polite">
        {(script?.lines ?? []).map((l, i) => {
          const shown = l.words.filter((w) => w.start <= t);
          if (!started || !shown.length) return null;
          return (
            <p key={i} className={`text-[19px] leading-[1.45] ${l.speaker === 'Alex' ? 'pl-8 text-receipt' : 'text-receipt/90'}`}>
              <span className={`mono mr-2 text-[15px] ${l.speaker === 'Earmark' ? 'text-seal' : 'text-fog'}`}>{l.speaker.toUpperCase()}</span>
              {shown.map((w) => w.text).join(' ')}
              {shown.length < l.words.length && <span className="ml-[2px] inline-block h-[1em] w-[2px] translate-y-[3px] animate-pulse bg-receipt/70" aria-hidden="true" />}
            </p>
          );
        })}
        {!started && <p className="text-[17px] text-fog">Press play to hear the call.</p>}
        {started && !audioOk && <p className="text-[15px] text-fog">The recorded sample isn't loaded yet, so this is the transcript only.</p>}
        {note && <p className="text-[15px] text-fog">{note}</p>}
      </div>
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
