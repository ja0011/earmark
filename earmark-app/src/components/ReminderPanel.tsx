import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { CallCard, type SpokenSource } from './CallCard';
import { Notice } from './Tx';

/**
 * The 7- and 4-day reminder as a recorded message from Earmark (ElevenLabs TTS, in the receiver's language),
 * like the landing-page sample. After it plays, the receiver answers with a tap.
 */
export function ReminderPanel({ giftId, onRequested, autoStartToken }: { giftId: string; onRequested: () => void; autoStartToken?: number }) {
  const { t, lang } = useT();
  const [source, setSource] = useState<SpokenSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setSource(null);
    setEnded(false);
    setAnswer(null);
    api<SpokenSource>(`/api/gifts/${giftId}/reminder?lang=${lang}`)
      .then((r) => alive && setSource(r))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [giftId, lang]);

  const yes = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/agent/purchase-request', { method: 'POST', json: { gift_id: giftId, source: 'reminder' } });
      setAnswer('yes');
      onRequested();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t('reminder.title')} className="rounded-[32px] bg-vault p-3">
      {source ? (
        <CallCard key={`${lang}:${source.audioUrl}`} source={source} autoStartToken={autoStartToken} onEnded={() => setEnded(true)} className="max-w-none" />
      ) : (
        <p className="px-5 py-6 text-[17px] text-fog on-dark">{t('reminder.loading')}</p>
      )}
      {ended && !answer && (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-5 text-receipt on-dark">
          <p className="mr-2 text-[18px] font-semibold">{t('reminder.question')}</p>
          <button type="button" className="btn btn-seal" onClick={yes} disabled={busy}>
            {t('reminder.yes')}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setAnswer('no')} disabled={busy}>
            {t('reminder.no')}
          </button>
        </div>
      )}
      {answer === 'no' && <p className="px-5 pb-4 pt-4 text-[17px] text-receipt on-dark" role="status">{t('reminder.later')}</p>}
      {error && (
        <div className="px-2 pb-2 pt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </section>
  );
}
