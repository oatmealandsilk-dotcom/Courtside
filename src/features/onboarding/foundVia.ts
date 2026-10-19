import type { FoundVia } from '@/data/types';

/*
 * "How did you find CourtSide?" (Oct 18, owner: "Can we see where the sign up
 * users are coming from", then "Add the question, as long as it's for the
 * benefit of the app and does not take away"). One optional row of chips at
 * the bottom of setup's last page (Your game, above Finish); nobody has to answer. Saved by set_found_via
 * (migration 166), counted on Admin -> Links.
 */

/** The chips, in the order they show. The server takes exactly these ids. */
export const FOUND_VIA: { value: FoundVia; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'friend', label: 'A friend' },
  { value: 'app_store', label: 'App Store' },
  { value: 'other', label: 'Other' },
];

/** The Links page's words for each answer, and for no answer. */
export const FOUND_VIA_WORDS: Record<FoundVia | 'not_answered', string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', friend: 'A friend',
  app_store: 'App Store', other: 'Other', not_answered: 'Didn’t answer',
};

/** Our own link labels (?src=fb, ?ref=ig…) that name one of the chips. */
const LABEL_CHIP: Record<string, FoundVia> = {
  fb: 'facebook', facebook: 'facebook', fbdm: 'facebook', fbgroup: 'facebook',
  ig: 'instagram', insta: 'instagram', instagram: 'instagram',
  tt: 'tiktok', tiktok: 'tiktok',
};

/**
 * Our campaign labels (migration 161's campaign_label list): a ?ref= carrying
 * one of these is a link we posted, not a friend's invite.
 */
const CAMPAIGN_WORDS = new Set([
  'instagram', 'ig', 'insta', 'courtsidebase', 'courtside', 'reddit', 'tiktok', 'tt', 'facebook', 'fb',
  'twitter', 'threads', 'youtube', 'snapchat', 'whatsapp', 'discord', 'linktree', 'linkinbio', 'bio',
  'email', 'newsletter', 'qr', 'flyer', 'poster', 'google', 'share', 'web', 'app', 'testflight', 'beta',
  'fbdm', 'fbgroup',
]);

/**
 * The chip to start on, from the link they came through: our Facebook,
 * Instagram or TikTok link picks that one; a friend's invite (their handle
 * or waitlist code, or an inviter already credited) picks "A friend".
 * Nothing known: none is picked. Always theirs to change or clear.
 */
export function guessFoundVia({ campaign, referrer, invited }: { campaign?: string | null; referrer?: string | null; invited?: boolean }): FoundVia | null {
  const c = campaign?.trim().toLowerCase().replace(/^@+/, '');
  if (c && LABEL_CHIP[c]) return LABEL_CHIP[c];
  const r = referrer?.trim().toLowerCase().replace(/^@+/, '');
  if (r && LABEL_CHIP[r]) return LABEL_CHIP[r];
  if (r && !CAMPAIGN_WORDS.has(r)) return 'friend';
  return invited ? 'friend' : null;
}
