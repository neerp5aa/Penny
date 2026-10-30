export type Cents = string;

export function formatCad(cents: Cents, showSign = false): string {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const dollars = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const remainder = (absolute % 100n).toString().padStart(2, "0");
  const sign = negative ? "−" : showSign && value > 0n ? "+" : "";
  return `${sign}$${dollars}.${remainder}`;
}

export function parseCadToCents(input: string): number {
  const normalized = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) throw new Error("Enter a valid CAD amount with up to two decimal places");
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large");
  return Number(cents);
}

export function centsToInput(cents: Cents): string {
  const value = BigInt(cents);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
