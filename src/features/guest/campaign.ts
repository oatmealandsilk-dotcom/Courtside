import { Platform } from 'react-native';

import { remote } from '@/data/remote';
import { isSupabaseConfigured } from '@/lib/supabase';

import { forgetCampaign, rememberCampaign, savedCampaign } from './campaignLabel';

export { rememberCampaign, savedCampaign };

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

/** The same random id public/waitlist.html makes for this browser. Not tied to any account. */
const VISITOR_KEY = 'courtside-visitor';

const web = Platform.OS === 'web' && typeof window !== 'undefined';

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

/**
 * Campaign labels: a link's ?ref= that names where it was posted, not a person. Keep in step with
 * public/waitlist.html's CAMPAIGNS (and welcome.html's list, and the server's campaign_label, migration 161).
 */
export const CAMPAIGNS: readonly string[] = ['instagram', 'ig', 'insta', 'courtsidebase', 'courtside', 'reddit', 'tiktok', 'facebook', 'fb', 'fbdm', 'fbgroup', 'twitter', 'threads', 'youtube', 'snapchat', 'whatsapp', 'discord', 'linktree', 'linkinbio', 'bio', 'email', 'newsletter', 'qr', 'flyer', 'poster', 'google', 'share', 'web', 'app', 'testflight', 'beta', 'robertzchen', 'robchzn', 'gipsperformance'];

const LANDING_LABEL = /^[a-z0-9_]{2,24}$/;
const CODE = /^[0-9a-f]{8}$/;

/** The visit counted for Admin → Links, once a day per label (the same mark waitlist.html sets, so never twice). */
function noteVisit(label: string) {
  if (!web || !isSupabaseConfigured) return;
  const mark = `courtside-seen-${label}`;
  const today = new Date().toDateString();
  try { if (localStorage.getItem(mark) === today) return; } catch { /* counted anyway; the server holds to once a day */ }
  const visitor = visitorId();
  if (!visitor) return;
  try { localStorage.setItem(mark, today); } catch { /* as above */ }
  // After the page's first work, never in its way.
  setTimeout(() => { void remote.logLinkEvent(label, 'visit', visitor).catch(() => undefined); }, 0);
}

/**
 * What the address the app opened on carries, read once as the page loads (AppShell): the person who
 * shared the link (?ref=handle, or a friend's ?r=code), for crediting a sign-up, and the campaign it
 * came from (?src=fb), kept by rememberCampaign.
 *
 * Straight from courtsidebase.com (Nov 27): Cloudflare's redirect now sends courtsidebase.com/?ref=ig
 * on to app.courtsidebase.com/?ref=ig&from=site itself, skipping the "Opening CourtSide" hop
 * (public/waitlist.html, about half a second). The app then does that page's two jobs: counts the
 * visit, and reads a campaign's ?ref= as the campaign, not a person. Only with from=site: a share
 * link's ?ref=handle inside the app was never a site visit. Without it, as before.
 */
export function readLanding(q: URLSearchParams): string | null {
  rememberCampaign(q.get('src'));
  const ref = q.get('ref');
  const code = (q.get('r') ?? '').toLowerCase();
  const asCode = CODE.test(code) ? `r=${code}` : null;
  if (q.get('from') !== 'site') return ref ? ref : asCode;
  const raw = (ref || q.get('utm_source') || '').trim().toLowerCase().replace(/^@+/, '');
  const label = LANDING_LABEL.test(raw) ? raw : null;
  if (!label) return ref ? ref : asCode;
  noteVisit(label);
  if (CAMPAIGNS.includes(label)) { rememberCampaign(label); return asCode; }
  return ref ? label : asCode;
}
