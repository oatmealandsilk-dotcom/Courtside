/**
 * A typed phone number in the form texting needs (+ and country code). A
 * 10-digit number is taken as US/Canada, the same as the server does
 * (contact_digits, migration 88). Null when it cannot be a number.
 */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** "+19195551234" → "+1 (919) 555-1234"; other countries as they are. */
export function showPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}
