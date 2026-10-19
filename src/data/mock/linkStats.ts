import type { FoundViaRow, LinkStatRow } from '../remote';

/**
 * Sample numbers for the admin Links page in the demo (Oct 16), so the page
 * can be looked at without a database. Made up, never anyone's real counts.
 * [label, last 7 days, last 30 days, all time], each [visitors, app, web, emails, sign-ups].
 */
type Five = [visitors: number, app: number, web: number, emails: number, signups: number];
const SAMPLE: [label: string, week: Five, month: Five, all: Five][] = [
  ['fb', [42, 17, 4, 3, 6], [96, 38, 9, 7, 13], [96, 38, 9, 10, 13]],
  ['fbdm', [23, 14, 2, 1, 2], [23, 14, 2, 1, 2], [23, 14, 2, 1, 2]],
  ['instagram', [12, 5, 1, 0, 1], [61, 24, 6, 2, 5], [140, 51, 12, 5, 5]],
  ['courtsidebase', [8, 3, 0, 1, 0], [30, 11, 2, 4, 2], [74, 26, 5, 10, 2]],
  ['qr', [0, 0, 0, 0, 0], [5, 2, 0, 0, 0], [19, 7, 1, 2, 0]],
];

export function demoLinkStats(days: number): LinkStatRow[] {
  return SAMPLE.map(([label, week, month, all]) => {
    const w = days <= 7 ? week : month;
    return {
      label,
      visitors: w[0], appTaps: w[1], webTaps: w[2], emails: w[3], signups: w[4],
      visitorsAll: all[0], appTapsAll: all[1], webTapsAll: all[2], emailsAll: all[3], signupsAll: all[4],
    };
  });
}

/**
 * Sample answers to "How did you find CourtSide?" for the demo's Links page
 * (Oct 18, migration 166): [answer, last 7 days, last 30 days]. Made up.
 * The demo account's own answer this visit, if it gave one, is added on top.
 */
const FOUND_SAMPLE: [FoundViaRow['choice'], number, number][] = [
  ['instagram', 9, 31], ['tiktok', 4, 12], ['facebook', 6, 14], ['friend', 7, 22],
  ['app_store', 3, 9], ['other', 1, 4], ['not_answered', 5, 19],
];
export function demoFoundVia(days: number, mine: FoundViaRow['choice'] | null): FoundViaRow[] {
  return FOUND_SAMPLE.map(([choice, week, month]) => ({ choice, people: (days <= 7 ? week : month) + (mine === choice ? 1 : 0) }));
}
