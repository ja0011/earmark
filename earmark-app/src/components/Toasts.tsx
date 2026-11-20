import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../lib/wallet';

type Note = { id: string; text: string; giftId?: string; kind: string };

/** Live notifications for the signed-in wallet, pushed over SSE from the QuickNode webhook (or the poller). */
export function Toasts() {
  const { wallet } = useWallet();
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!wallet) return;
    const es = new EventSource(`/api/events?address=${wallet.address}`);
    const on = (e: MessageEvent) => {
      try {
        const n = JSON.parse(e.data) as Note;
        setNotes((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, 3));
        setTimeout(() => setNotes((list) => list.filter((x) => x.id !== n.id)), 9000);
      } catch {}
    };
    es.addEventListener('notification', on as EventListener);
    return () => es.close();
  }, [wallet?.address]);

  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 left-4 z-50 flex flex-col items-end gap-3 md:left-auto">
      {notes.map((n) => (
        <div key={n.id} className="pointer-events-auto flex w-full max-w-[400px] items-start gap-3 rounded-2xl bg-ink px-5 py-4 text-receipt shadow-xl on-dark">
          <span className={`mt-[7px] h-[10px] w-[10px] shrink-0 rounded-full ${n.kind === 'GiftRedeemed' ? 'bg-change' : 'bg-seal'}`} aria-hidden="true" />
          <div className="flex-1">
            <p className="text-[17px] leading-snug">{n.text}</p>
            {n.giftId && (
              <Link to={`/gift/${n.giftId}`} className="mt-1 inline-block text-[15px] font-semibold underline underline-offset-4">
                Open gift #{n.giftId}
              </Link>
            )}
          </div>
          <button type="button" aria-label="Dismiss" className="-mr-1 grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" onClick={() => setNotes((l) => l.filter((x) => x.id !== n.id))}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
