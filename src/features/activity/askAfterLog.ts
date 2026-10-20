import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import type { PracticeSession, QuestionTopic } from '@/data/types';
import { show as showToast, type ToastMessage } from '@/lib/toast';

/**
 * "Something come up today? · Ask" (Oct 20 sweep, R11: "Questions come up
 * right after a session"). Once the "Logged" note after logging a session by
 * hand has gone by itself or been tapped away (a flick says "not now"), one quiet note
 * follows: Ask opens Ask the community with the session's topic picked
 * (a match: strategy; a practice or drills: technique; a workout: fitness).
 *
 * Only after the log sheet (app/log-session), and only as a note at the top
 * of the page: the activity popup sheet (session-stats / SessionSheet) and
 * the clip handle popup are untouched. Not when the "Logged" note's own
 * Instagram button was used, nor when another note took its place, nor
 * over a new record or a hit's "who else was there" (log-session leaves it
 * out then). At most once a day on this device: never a nag.
 */

const KEY = 'courtside-ask-after-log';
const TOPIC: Record<PracticeSession['kind'], QuestionTopic> = { match: 'strategy', practice: 'technique', drills: 'technique', fitness: 'fitness' };
/** A beat after the "Logged" note has gone. */
const PAUSE_MS = 600;

const today = () => new Date().toDateString();

/** The "Logged" note's onClosed: offers the question once that note is done with. */
export function askAfterLogged(kind: PracticeSession['kind']): ToastMessage['onClosed'] {
  return (how) => {
    if (how !== 'timeout' && how !== 'tap') return;
    void (async () => {
      try { if ((await AsyncStorage.getItem(KEY)) === today()) return; } catch { return; }
      try { await AsyncStorage.setItem(KEY, today()); } catch { /* offered anyway */ }
      setTimeout(() => {
        showToast({
          title: 'Something come up today?',
          body: 'Ask the community about it.',
          icon: 'chatbubbles-outline',
          action: { label: 'Ask', onPress: () => router.push({ pathname: '/ask', params: { topic: TOPIC[kind] } }) },
        });
      }, PAUSE_MS);
    })();
  };
}
