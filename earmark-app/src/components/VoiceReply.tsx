import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { useT } from '../lib/i18n';

export type Reply = { id: string; text: string; english: string; language?: string; languageName: string | null; audioUrl: string | null; at: number; from: string };

const MAX_SECONDS = 30;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}

/**
 * The receiver answers the sender by voice, in their own language. The server transcribes it with
 * ElevenLabs Speech-to-Text and puts it in English for the sender.
 */
export function VoiceReply({ giftId, from, to, onSent }: { giftId: string; from: string; to: string; onSent: (r: Reply) => void }) {
  const { t } = useT();
  const [state, setState] = useState<'idle' | 'recording' | 'sending' | 'sent'>('idle');
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Reply | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      cancelled.current = true;
      if (rec.current?.state === 'recording') rec.current.stop();
    },
    [],
  );

  const start = async () => {
    setError(null);
    const mime = pickMime();
    if (mime === null) return setError(t('reply.noRecorder'));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError(t('reply.needMic'));
    }
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    cancelled.current = false;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) clearInterval(timer.current);
      if (cancelled.current) return setState('idle');
      send(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }));
    };
    rec.current = r;
    r.start(250);
    setSecs(0);
    setState('recording');
    const began = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSecs(s);
      if (s >= MAX_SECONDS && r.state === 'recording') r.stop();
    }, 250);
  };

  const stop = (cancel = false) => {
    cancelled.current = cancel;
    if (rec.current?.state === 'recording') rec.current.stop();
  };

  const send = async (blob: Blob) => {
    setState('sending');
    try {
      const res = await fetch(`/api/gifts/${giftId}/reply?from=${from}`, { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] || 'audio/webm' }, body: blob });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, body.error ?? 'ERROR', body.message ?? `Request failed (${res.status}).`);
      setLast(body.reply);
      setState('sent');
      onSent(body.reply);
    } catch (e) {
      setError((e as Error).message);
      setState('idle');
    }
  };

  return (
    <section aria-labelledby="reply-title" className="rounded-[24px] border border-rule bg-paper p-5 md:p-6">
      <h2 id="reply-title" className="text-[20px] font-semibold">
        {t('reply.title', { name: to })}
      </h2>
      <p className="mt-1 text-[16px] text-ink-soft">{t('reply.hint', { name: to })}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state === 'recording' ? (
          <>
            <button type="button" className="btn btn-seal" onClick={() => stop(false)}>
              <span className="h-[12px] w-[12px] animate-pulse rounded-full bg-white" aria-hidden="true" />
              {t('reply.stop')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => stop(true)}>
              {t('reply.cancel')}
            </button>
            <span className="mono text-[16px]" role="timer" aria-label={t('reply.recording')}>
              {t('reply.recording')} 0:{String(secs).padStart(2, '0')} / 0:{MAX_SECONDS}
            </span>
          </>
        ) : (
          <button type="button" className="btn btn-ink" onClick={start} disabled={state === 'sending'}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {state === 'sending' ? t('reply.sending') : state === 'sent' ? t('reply.another') : t('reply.record')}
          </button>
        )}
      </div>
      {state === 'sent' && last && (
        <div className="mt-4 rounded-xl border border-rule bg-receipt px-4 py-3" role="status">
          <p className="text-[16px] text-ink-soft">{t('reply.sent', { name: to })}</p>
          <p className="mt-1 text-[18px]" lang="en">
            “{last.english}”
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[16px] font-medium">
          {error}
        </p>
      )}
    </section>
  );
}

/** Replies so far: the receiver sees their own words; the sender sees the English with the original voice. */
export function RepliesList({ replies, viewerIsSender }: { replies: Reply[]; viewerIsSender: boolean }) {
  const { t, locale } = useT();
  if (!replies.length) return null;
  return (
    <section aria-labelledby="replies-title">
      <h2 id="replies-title" className="mb-3 text-[20px] font-semibold">
        {t('replies.title')}
      </h2>
      <ul className="flex flex-col gap-3">
        {replies.map((r) => (
          <li key={r.id} className="rounded-2xl border border-rule bg-paper px-5 py-4">
            {viewerIsSender ? (
              <>
                <p className="text-[19px]" lang="en">
                  “{r.english}”
                </p>
                {r.text !== r.english && (
                  <p className="mt-1 text-[16px] text-ink-soft" lang={r.language}>
                    {r.languageName ? `${r.languageName}: ` : ''}“{r.text}”
                  </p>
                )}
              </>
            ) : (
              <p className="text-[19px]" lang={r.language}>
                <span className="text-[16px] text-ink-soft">{t('replies.youSaid')}: </span>“{r.text}”
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              {r.audioUrl && <audio controls preload="none" src={r.audioUrl} className="h-10 max-w-full" />}
              <time className="mono text-[15px] text-ink-soft" dateTime={new Date(r.at).toISOString()}>
                {new Date(r.at).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
