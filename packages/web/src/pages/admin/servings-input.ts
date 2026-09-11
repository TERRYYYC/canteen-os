/** Validate a numeric field's exact decimal value before accepting a JS number. */
export function parseServingsInput(raw: string): { valid: true; value: number | undefined } | { valid: false } {
  const text = raw.trim();
  if (!text) return { valid: true, value: undefined };
  const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return { valid: false };
  const fraction = match[2] ?? match[3] ?? '';
  const coefficient = `${match[1] ?? ''}${fraction}`.replace(/^0+/, '');
  const digits = coefficient.replace(/0+$/, '');
  const exponent = Number(match[4] ?? '0');
  // Removing coefficient trailing zeroes leaves an exact integer only when
  // the decimal shift is nonnegative. Never let Number round a tiny fraction.
  const shift = exponent - fraction.length + coefficient.length - digits.length;
  if (!digits || !Number.isSafeInteger(shift) || shift < 0 || digits.length + shift > 16) return { valid: false };
  const exact = digits + '0'.repeat(shift);
  const value = Number(exact);
  return Number.isSafeInteger(value) && value > 0 && String(value) === exact
    ? { valid: true, value } : { valid: false };
}
