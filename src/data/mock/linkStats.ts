import type { LinkStatRow } from '../remote';

/**
 * Sample numbers for the admin Links page in the demo (Oct 16), so the page
 * can be looked at without a database. Made up, never anyone's real counts.
 * [label, last 7 days, last 30 days, all time], each [visitors, app, web, emails].
 */
type Four = [visitors: number, app: number, web: number, emails: number];
const SAMPLE: [label: string, week: Four, month: Four, all: Four][] = [
  ['fb', [42, 17, 4, 3], [96, 38, 9, 7], [96, 38, 9, 10]],
  ['fbdm', [23, 14, 2, 1], [23, 14, 2, 1], [23, 14, 2, 1]],
  ['instagram', [12, 5, 1, 0], [61, 24, 6, 2], [140, 51, 12, 5]],
  ['courtsidebase', [8, 3, 0, 1], [30, 11, 2, 4], [74, 26, 5, 10]],
  ['qr', [0, 0, 0, 0], [5, 2, 0, 0], [19, 7, 1, 2]],
];

export function demoLinkStats(days: number): LinkStatRow[] {
  return SAMPLE.map(([label, week, month, all]) => {
    const w = days <= 7 ? week : month;
    return {
      label,
      visitors: w[0], appTaps: w[1], webTaps: w[2], emails: w[3],
      visitorsAll: all[0], appTapsAll: all[1], webTapsAll: all[2], emailsAll: all[3],
    };
  });
}
