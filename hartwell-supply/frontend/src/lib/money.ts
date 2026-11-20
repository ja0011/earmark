/** USDC uses 6 decimals. Amounts move around as integer strings. */
export function formatUnits6(units: string | bigint | number): string {
  let v: bigint;
  try {
    v = BigInt(units);
  } catch {
    return '$0.00';
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const cents = (v + 5_000n) / 10_000n;
  const dollars = cents / 100n;
  const rest = (cents % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}$${dollars.toLocaleString('en-US')}.${rest}`;
}

export function sumUnits(values: (string | bigint)[]): string {
  return values.reduce<bigint>((a, b) => a + BigInt(b), 0n).toString();
}

export function shortHash(h: string, head = 10, tail = 8) {
  return h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h;
}
