/** Money is always integer cents. These helpers are the only place dollars appear. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** "25", "25.5", "$1,025.50" → cents. Returns null when it isn't a valid amount. */
export function parseDollarsToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0") || "0", 10);
  return neg ? -cents : cents;
}

export function percentOff(cents: number, pct: number): number {
  return Math.round((cents * (100 - pct)) / 100);
}
