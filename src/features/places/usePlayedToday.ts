import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { nearestKey } from '@/features/places/lightUp';
import { PLAYED_TODAY_GLOW, dayKey, playedTodayIds } from '@/features/places/playedToday';
import type { MapModel } from '@/features/players/mapModel';
import { useApp } from '@/store/AppContext';

/** How often a map left open asks again. */
const REFRESH_MS = 5 * 60_000;

/**
 * The full map's courts played on today (features/places/playedToday): asked for the courts nearest where
 * the map came to rest, again every few minutes while it stays open and once more past midnight. Null while
 * it is switched off, and on the still card (as the lit courts: useCourtGlow), so the map is as before.
 */
export function usePlayedToday(model: MapModel, expanded: boolean, card?: { full: boolean; seen: () => boolean }): Set<string> | null {
  const on = PLAYED_TODAY_GLOW && (expanded || !!card?.full);
  const seen = useRef(card?.seen);
  seen.current = card?.seen;
  const { courtToday, actions, blockedIds, mutedIds } = useApp();
  const pool = model.courts;
  const key = useMemo(() => (on ? nearestKey(pool) : ''), [on, pool]);
  // Which day it is: a map left open past midnight drops yesterday's and asks again.
  const [day, setDay] = useState(() => dayKey());
  const { loadCourtsToday } = actions;
  useEffect(() => {
    if (!key) return undefined;
    const ids = key.split(',');
    void loadCourtsToday(ids);
    const timer = setInterval(() => {
      const nowDay = dayKey();
      setDay(nowDay);
      if (AppState.currentState === 'active' && (seen.current?.() ?? true)) void loadCourtsToday(ids);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [key, loadCourtsToday]);
  return useMemo(() => {
    if (!on) return null;
    const hidden = new Set([...blockedIds, ...mutedIds]);
    // `day` keeps this fresh past midnight (playedTodayIds reads the clock).
    void day;
    return playedTodayIds(courtToday, hidden);
  }, [on, courtToday, blockedIds, mutedIds, day]);
}
