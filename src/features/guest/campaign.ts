import { Platform } from 'react-native';

import { remote } from '@/data/remote';
import { isSupabaseConfigured } from '@/lib/supabase';

/*
 * The link a visitor came through, on the website (Oct 18, owner, about his
 * Facebook link: "so how will we tell if courtside is coming from Facebook",
 * then "build tracking").
 *
 * courtsidebase.com/?ref=fb counts the visit (public/waitlist.html), then
 * opens the app with ?src=fb. The app keeps that label here for 30 days (a
 * newer link replaces it), so that:
 *   - a tap on "Get the app" (the guest strip, the Join sheet) is counted for
 *     fb too, once a day, and
 *   - a brand-new account made here is counted as one sign-up for fb, once
 *     (the server checks it is new: migration 165).
 * Only the label is kept, never anything about the person. A campaign label
 * is not a person and never credits anyone (that is ?ref=, referral.ts).
 * Web only: the phone apps never get a label, so everything here does nothing there.
 */

const KEY = 'courtside-campaign';
/** The same random id public/waitlist.html makes for this browser. Not tied to any account. */
const VISITOR_KEY = 'courtside-visitor';
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

function forgetCampaign() {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function visitorId(): string | null {
  try {
    const kept = localStorage.getItem(VISITOR_KEY);
    if (kept && UUID.test(kept)) return kept;
    const made = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null;
    if (made) localStorage.setItem(VISITOR_KEY, made);
    return made;
  } catch { return null; }
}

/**
 * A tap on "Get the app" by a guest who came through a link: counted for that
 * link once a day (the same mark waitlist.html's ?go=app links use). Sent and
 * forgotten: the tap never waits for it.
 */
export function noteAppTap() {
  if (!web || !isSupabaseConfigured) return;
  const label = savedCampaign();
  if (!label) return;
  const mark = `courtside-seen-app-${label}`;
  const today = new Date().toDateString();
  try { if (localStorage.getItem(mark) === today) return; } catch { return; }
  const visitor = visitorId();
  if (!visitor) return;
  try { localStorage.setItem(mark, today); } catch { /* counted anyway; the server holds to once a day */ }
  void remote.logLinkEvent(label, 'app', visitor).catch(() => undefined);
}

/**
 * Signed in on the website with a link's label kept: tells the server, which
 * counts one sign-up for that link only if this account is brand new and was
 * never counted (migration 165). Let go once answered, counted or not.
 */
export async function noteCampaignSignup() {
  if (!web || !isSupabaseConfigured) return;
  const label = savedCampaign();
  if (!label) return;
  // Not answered (offline, or the server does not have it yet): kept, and tried again next time.
  if ((await remote.noteSignupSource(label)) === 'ok') forgetCampaign();
}
