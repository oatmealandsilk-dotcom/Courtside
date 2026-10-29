import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { router } from 'expo-router';

import { show as showToast, type ToastMessage } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { connectChoices, useAutoLog } from './autoLog';

/*
 * "Want this to log itself next time?" (owner, Oct 28: "Auto log should be very pushed hard"). After a session is
 * logged by hand, for a player with nothing connected that could bring sessions in: once the "Logged" note has
 * gone by itself or been tapped away, one quiet note follows, "Want this to log itself next time? · Connect your
 * watch", whose Connect opens the Health page (each source's own explanation and Connect, Apple Health's words said
 * before Apple's sheet; nothing about who sees it is chosen there by Apple Health).
 *
 * Never inside the log-session sheet, the activity popup sheet or the clip handle popup: only as the note after
 * "Logged". Not after a new record (that note is the moment), nor when the "Logged" note's Instagram button was used
 * or it was flicked away. At most once a day on this phone; on that day it takes the place of "Something come up
 * today?" (askAfterLog), which comes on another day.
 *
 * Whether the player has anything to connect is heard by the tabs (useAfterLogConnectWatch), so the note, shown from
 * outside React, knows at once.
 */

const KEY = 'courtside-connect-after-log';
/** A beat after the "Logged" note has gone. */
const PAUSE_MS = 600;
const today = () => new Date().toDateString();

/** The signed-in player can connect something and nothing is connected (null: not known yet). */
let offerFor: { userId: string; on: boolean } | null = null;

/** Kept up to date while the tabs are open (app/(tabs)/_layout). */
export function useAfterLogConnectWatch() {
  const auto = useAutoLog();
  const { currentUserId } = useApp();
  const on = auto.ready && !auto.connected && connectChoices(auto).length > 0;
  useEffect(() => {
    offerFor = currentUserId && auto.ready ? { userId: currentUserId, on } : null;
  }, [currentUserId, auto.ready, on]);
}

/**
 * The "Logged" note's onClosed: the connect note when it is due, else `next` (log-session's "Something come up
 * today?"). Unchanged when there is nothing to connect.
 */
export function connectAfterLogged(next?: ToastMessage['onClosed']): ToastMessage['onClosed'] {
  if (!offerFor?.on) return next;
  return (how, upMs) => {
    if (how !== 'timeout' && how !== 'tap') { next?.(how, upMs); return; }
    void (async () => {
      let shownToday = false;
      try { shownToday = (await AsyncStorage.getItem(KEY)) === today(); } catch { shownToday = true; }
      // Connected meanwhile, or shown already today: what would have come anyway.
      if (shownToday || !offerFor?.on) { next?.(how, upMs); return; }
      try { await AsyncStorage.setItem(KEY, today()); } catch { /* offered anyway */ }
      setTimeout(() => {
        showToast({
          title: 'Want this to log itself next time?',
          body: 'Connect your watch',
          icon: 'watch-outline',
          action: { label: 'Connect', onPress: () => router.push('/health') },
        });
      }, PAUSE_MS);
    })();
  };
}
