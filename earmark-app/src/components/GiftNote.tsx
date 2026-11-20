import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { CallCard, type SpokenSource } from './CallCard';

type Note = SpokenSource & { original: string; translated: string; from: string; lang: string; translatedBy: boolean };

/** The sender's note, translated into the viewer's language and read aloud (ElevenLabs) in the sender's voice. */
export function GiftNote({ giftId }: { giftId: string }) {
  const { t, lang } = useT();
  const [note, setNote] = useState<Note | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ note: Note | null }>(`/api/gifts/${giftId}/note?lang=${lang}`)
      .then((r) => alive && setNote(r.note))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [giftId, lang]);

  if (!note) return null;
  return (
    <section aria-labelledby="note-title" className="rounded-[24px] border border-rule bg-paper p-5 md:p-6">
      <h2 id="note-title" className="text-[17px] font-semibold text-ink-soft">
        {t('note.from', { name: note.from })}
      </h2>
      <blockquote className="mt-2 text-[22px] leading-[1.4]" lang={note.lang}>
        “{note.translated}”
      </blockquote>
      {note.translatedBy && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px] text-ink-soft">
          <span>{t('note.translated')}</span>
          <button type="button" className="font-semibold text-seal underline underline-offset-4" aria-expanded={showOriginal} onClick={() => setShowOriginal((s) => !s)}>
            {showOriginal ? t('note.hideOriginal') : t('note.showOriginal')}
          </button>
        </div>
      )}
      {showOriginal && (
        <p className="mt-2 text-[17px] text-ink-soft" lang="en">
          “{note.original}”
        </p>
      )}
      <div className="mt-4 rounded-[28px] bg-vault p-2">
        <CallCard key={`${lang}:${note.audioUrl}`} source={note} title={note.from} className="max-w-none" />
      </div>
    </section>
  );
}
