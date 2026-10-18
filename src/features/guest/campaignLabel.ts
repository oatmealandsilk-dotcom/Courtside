import { Platform } from 'react-native';

/*
 * The campaign label kept on this browser (?src=fb, Oct 18). Split out of
 * campaign.ts so the sign-up code (src/data/remote.ts) can read it without the
 * two files loading each other: the confirmation email link carries the label
 * too, because on an iPhone that link usually opens in Safari or Mail, not in
 * the Facebook or Instagram browser the person came through, and without it
 * the sign-up would not be counted for the link.
 */

const KEY = 'courtside-campaign';
const MONTH = 30 * 86_400_000;
const LABEL = /^[a-z0-9_]{2,24}$/;

const web = Platform.OS === 'web' && typeof window !== 'undefined';

/** Keeps the link's label (?src=fb), replacing an older one. Anything that is not a plain label is ignored. */
export function rememberCampaign(raw: string | null | undefined) {
  if (!web || !raw) return;
  const label = raw.trim().toLowerCase().replace(/^@+/, '');
  if (!LABEL.test(label)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ label, at: Date.now() })); } catch { /* private mode: not kept */ }
}

/** The label kept, while it is under 30 days old. */
export function savedCampaign(): string | null {
  if (!web) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { label?: unknown; at?: unknown };
    if (typeof v.label !== 'string' || !LABEL.test(v.label) || typeof v.at !== 'number' || Date.now() - v.at > MONTH) {
      localStorage.removeItem(KEY);
      return null;
    }
    return v.label;
  } catch { return null; }
}

export function forgetCampaign() {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}
