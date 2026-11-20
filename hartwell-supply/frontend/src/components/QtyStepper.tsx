type Props = { label: string; qty: number; onChange: (qty: number) => void };

export function QtyStepper({ label, qty, onChange }: Props) {
  const btn = 'flex size-11 items-center justify-center text-[20px] leading-none hover:bg-shelf disabled:opacity-40';
  return (
    <div className="inline-flex items-center rounded-md border border-ink/20" role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" className={btn} onClick={() => onChange(qty - 1)} aria-label={`One fewer ${label}`}>
        <span aria-hidden="true">−</span>
      </button>
      <span className="min-w-8 text-center font-mono text-[16px]" aria-live="polite" aria-atomic="true">
        <span className="sr-only">Quantity </span>
        {qty}
      </span>
      <button type="button" className={btn} onClick={() => onChange(qty + 1)} disabled={qty >= 20} aria-label={`One more ${label}`}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
