import { useEffect } from 'react';

import { useAutoLog } from '@/features/activity/autoLog';
import { peekShareTarget } from '@/features/invite/referral';
import { TERMS_VERSION } from '@/lib/legal';
import { useApp } from '@/store/AppContext';

/*
 * One honest step count across all of setup (Oct 20 sweep: setup said
 * "2 / 2" and Finish, then showed up to four more pages). The pages a new
 * player can meet, in order: the birthday, the guidelines, About you, Your
 * game, Log your tennis automatically, People you may know. Only the ones
 * this player will really see are counted: a page already passed is
 * remembered for the rest of this run, and a page still ahead is counted
 * only when its own rule says it will open (the same rules the pages use to
 * open or step past themselves).
 */
export type SetupPage = 'birthday' | 'agree' | 'about' | 'game' | 'auto-log' | 'first-move';

/** The pages shown so far in this run of setup (cleared when the app restarts). */
const passed = new Set<SetupPage>();

export interface SetupCount { index: number; total: number }

/**
 * Where this page sits in setup ("Step 3 of 6"), or null when the page was
 * opened outside the first run (the birthday from Settings, new terms for a
 * set-up account, the profile's "finish setting up"): then no count shows.
 */
export function useSetupCount(page: SetupPage, inSetup: boolean): SetupCount | null {
  const { currentUser, currentUserId, termsVersion, onboardingComplete, posts, questions, answers } = useApp();
  const auto = useAutoLog();
  useEffect(() => { if (inSetup) passed.add(page); }, [page, inSetup]);
  // About you and Your game are setup whenever they open as it; the pages around them
  // count only on the way into the app (the gates while About you is still ahead, the
  // last two once it has been passed).
  const throughSetup = page === 'about' || page === 'game' || !onboardingComplete || passed.has('about');
  if (!inSetup || !throughSetup) return null;
  const here = (p: SetupPage) => p === page || passed.has(p);
  const hasPosted = !!currentUserId && (posts.some((p) => p.authorId === currentUserId) || questions.some((q) => q.authorId === currentUserId) || answers.some((a) => a.authorId === currentUserId));
  // The automatic-logging page steps past itself when there is nothing to connect, or it is already connected.
  const autoOffer = !auto.connected && !(auto.known && !auto.apple && !auto.whoop);
  // Someone who has posted, or joined from a shared link, goes straight into the app after Your game.
  const afterSetup = !hasPosted && !peekShareTarget();
  const pages: SetupPage[] = [];
  if (here('birthday') || (!onboardingComplete && !!currentUser && !currentUser.ageGroup && !currentUser.birthdaySkipped && !passed.has('agree'))) pages.push('birthday');
  if (here('agree') || (!onboardingComplete && termsVersion !== undefined && termsVersion !== TERMS_VERSION)) pages.push('agree');
  pages.push('about', 'game');
  if (here('auto-log') || (afterSetup && autoOffer && !passed.has('first-move') && page !== 'first-move')) pages.push('auto-log');
  if (here('first-move') || afterSetup) pages.push('first-move');
  const index = pages.indexOf(page);
  return index < 0 ? null : { index, total: pages.length };
}
