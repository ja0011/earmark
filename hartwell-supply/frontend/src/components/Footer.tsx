export function Footer() {
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-[16px] text-muted sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-store text-[1.25rem] font-extrabold text-ink">HARTWELL SUPPLY</p>
          <p>214 Alder Street</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Open</p>
          <p>Mon to Sat, 8 to 6</p>
          <p>Sun, 10 to 4</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Pay how you like</p>
          <p>We take Earmark gifts at checkout.</p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-[15px] text-muted sm:px-6">
        A fictional store for a demo. Payments run on Arc testnet.
      </p>
    </footer>
  );
}
