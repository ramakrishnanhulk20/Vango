/** One NIM is 100000 Luna. The chain and the API only ever speak Luna. */
export const LUNA_PER_NIM = 100_000;

const DECIMALS = 5;

/** NIM for a person to read: up to two decimals, and no trailing zeros. */
export function formatNim(luna: number, maxDecimals = 2): string {
  const nim = luna / LUNA_PER_NIM;
  const fixed = nim.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, "");
}

/**
 * What to put in the amount field before the customer touches it. A whole number of
 * NIM stays whole, because "1" is what a person expects to see, not "1.00000".
 */
export function defaultAmountNim(minLuna: number): string {
  const nim = minLuna / LUNA_PER_NIM;
  if (Number.isInteger(nim)) return String(nim);
  return nim.toFixed(DECIMALS).replace(/0+$/, "");
}

/**
 * Reads what the customer typed into whole Luna, or null when it is not an amount a
 * wallet could send. Rounding is down to the Luna, so anything under one Luna rounds to
 * nothing and is refused rather than sent as a zero payment. A number too large to hold
 * exactly is refused for the same reason.
 */
export function parseNimToLuna(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
  const nim = Number(trimmed);
  if (!Number.isFinite(nim) || nim <= 0) return null;
  const luna = Math.floor(nim * LUNA_PER_NIM);
  if (!Number.isSafeInteger(luna) || luna < 1) return null;
  return luna;
}

/** "3 of 5", the line a customer reads off a paper card. */
export function progressLabel(stamps: number, target: number | null): string {
  if (target === null) return `${stamps} paid`;
  return `${Math.min(stamps, target)} of ${target}`;
}
