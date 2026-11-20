import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';

type Line = { role: 'agent' | 'user'; text: string };
type Status = 'idle' | 'mic' | 'connecting' | 'connected' | 'ended' | 'error';
type Session = { conversationToken?: string; signedUrl?: string; dynamicVariables: Record<string, string>; overrides?: { agent: { language: string; firstMessage: string } } };

/**
 * An in-browser voice call with the Earmark ElevenLabs agent (the same agent that makes the phone reminders).
 * The server mints a short-lived conversation token; the API key never reaches the browser.
 */
export function BrowserCall({ giftId, autoStart, onPurchaseRequested, onEnded }: { giftId: string; autoStart?: number; onPurchaseRequested: () => void; onEnded?: () => void }) {
  const { t } = useT();
  const [status, setStatus] = useState<Status>('idle');
  const [mode, setMode] = useState<'speaking' | 'listening'>('listening');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const convo = useRef<any>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const draw = () => {
    raf.current = requestAnimationFrame(draw);
    const c = canvas.current;
    if (!c || document.hidden) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== c.clientWidth * dpr) {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    let data: Uint8Array | null = null;
    try {
      data = convo.current ? (modeRef.current === 'speaking' ? convo.current.getOutputByteFrequencyData() : convo.current.getInputByteFrequencyData()) : null;
    } catch {}
    const bars = 48;
    const gap = 3 * dpr;
    const bw = (c.width - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const v = data && data.length ? data[Math.floor((i / bars) * data.length * 0.7)] / 255 : 0.06;
      const h = Math.max(2 * dpr, v * c.height);
      g.fillStyle = modeRef.current === 'speaking' ? '#2F6BFF' : 'rgba(245,242,235,0.7)';
      g.beginPath();
      g.roundRect(i * (bw + gap), (c.height - h) / 2, bw, h, bw / 2);
      g.fill();
    }
  };

  const stopDrawing = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  const starting = useRef(false);
  const start = async () => {
    if (convo.current || starting.current) return;
    starting.current = true;
    setError(null);
    setLines([]);
    try {
      setStatus('mic');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setStatus('connecting');
      const session = await api<Session>(`/api/calls/session?giftId=${giftId}`);
      const { Conversation } = await import('@elevenlabs/client');
      const auth = session.conversationToken
        ? { conversationToken: session.conversationToken, connectionType: 'webrtc' as const }
        : { signedUrl: session.signedUrl!, connectionType: 'websocket' as const };
      convo.current = await Conversation.startSession({
        ...auth,
        dynamicVariables: session.dynamicVariables,
        // The receiver's language: the agent greets and talks in it from the first word.
        ...(session.overrides ? { overrides: session.overrides } : {}),
        clientTools: {
          // Same pending purchase request the phone webhook creates. Never moves money.
          request_purchase_in_app: async () => {
            const r = await api<{ message: string }>('/api/agent/purchase-request', { method: 'POST', json: { gift_id: giftId, source: 'browser' } });
            onPurchaseRequested();
            return r.message;
          },
        },
        onConnect: () => setStatus('connected'),
        onDisconnect: () => {
          setStatus('ended');
          convo.current = null;
          stopDrawing();
          onEnded?.();
        },
        onError: (message: string) => {
          setError(typeof message === 'string' ? message : t('bc.dropped'));
        },
        onModeChange: ({ mode }: { mode: 'speaking' | 'listening' }) => setMode(mode),
        onMessage: ({ message, role, source }: { message: string; role?: string; source?: string }) => {
          const who = role === 'agent' || source === 'ai' ? 'agent' : 'user';
          if (message?.trim()) setLines((l) => [...l, { role: who, text: message }]);
        },
      } as any);
      if (!raf.current) draw();
    } catch (e) {
      const err = e as Error;
      setStatus('error');
      convo.current = null;
      setError(err.name === 'NotAllowedError' ? t('bc.needMic') : err.message || t('bc.failed'));
    } finally {
      starting.current = false;
    }
  };

  const hangUp = async () => {
    try {
      await convo.current?.endSession();
    } catch {}
    convo.current = null;
    stopDrawing();
    setStatus('ended');
  };

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart]);

  useEffect(
    () => () => {
      stopDrawing();
      convo.current?.endSession?.().catch?.(() => {});
    },
    [],
  );

  const live = status === 'connected' || status === 'connecting' || status === 'mic';
  const label =
    status === 'mic' ? t('bc.mic') : status === 'connecting' ? t('bc.connecting') : status === 'connected' ? (mode === 'speaking' ? t('bc.talking') : t('bc.listening')) : status === 'ended' ? t('bc.ended') : t('bc.ready');

  return (
    <div className="w-full rounded-[28px] bg-vault-2 p-6 text-receipt ring-1 ring-white/10 md:p-8 on-dark">
      <div className="flex items-center gap-5">
        {live ? (
          <button type="button" onClick={hangUp} aria-label={t('bc.hangup')} className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full bg-receipt text-ink transition-transform hover:scale-105">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 14.5c4.9-4.4 13.1-4.4 18 0l-2.3 2.6a1 1 0 0 1-1.3.2l-2.4-1.5a1 1 0 0 1-.5-.9v-1.8a10.6 10.6 0 0 0-5 0v1.8a1 1 0 0 1-.5.9l-2.4 1.5a1 1 0 0 1-1.3-.2z" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button type="button" onClick={start} aria-label={t('bc.start')} className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full bg-seal text-white transition-transform hover:scale-105">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="currentColor" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[20px] font-semibold">Earmark</span>
            <span className="text-[15px] text-fog" role="status">
              {label}
            </span>
          </div>
          <canvas ref={canvas} className="mt-2 h-[40px] w-full" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-6 max-h-[300px] min-h-[96px] space-y-3 overflow-y-auto" aria-live="polite" aria-label={t('bc.transcript')}>
        {lines.map((l, i) => (
          <p key={i} className={`text-[18px] leading-[1.45] ${l.role === 'user' ? 'pl-8' : 'text-receipt/90'}`}>
            <span className={`mono mr-2 text-[15px] ${l.role === 'agent' ? 'text-seal' : 'text-fog'}`}>{l.role === 'agent' ? 'EARMARK' : t('bc.you')}</span>
            {l.text}
          </p>
        ))}
        {!lines.length && status === 'idle' && <p className="text-[16px] text-fog">{t('bc.idle')}</p>}
        {error && (
          <p role="alert" className="text-[16px] text-receipt">
            {error}
          </p>
        )}
      </div>
      <p className="mt-4 text-[15px] text-fog">{t('call.voiceBy')}</p>
    </div>
  );
}
