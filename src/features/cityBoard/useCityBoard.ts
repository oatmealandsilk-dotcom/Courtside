import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CityBoard, CityBoardCity, CityPage } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { boardMonth, sessionsSince, thisMonth, withMine } from './board';
import { cityBoardOn } from './flag';

/**
 * Where a board or a page stands:
 *   'off'     not open to you (CITY_BOARD_FOR_EVERYONE, the server's flag) or no city boards on the database yet;
 *   'loading' asked, nothing here yet;
 *   'ready'   here (maybe the last one, when `stale`: the newest ask did not come back);
 *   'error'   could not be loaded, and there is no earlier one to show.
 */
export type BoardStatus = 'off' | 'loading' | 'ready' | 'error';

/** The month every board screen shows: the phone's own, last month's final board on the 1st (see boardMonth). */
let fellBack: { from: string; to: string } | null = null;

/** How many sessions of yours this phone holds (logging one asks for the board again). */
const useMySessionCount = () => {
  const { sessions, currentUserId } = useApp();
  return useMemo(() => sessions.reduce((n, s) => n + (s.userId === currentUserId ? 1 : 0), 0), [sessions, currentUserId]);
};

/**
 * The month's city board for you, with your own city's row holding your
 * sessions up to the minute (the server's numbers are as of yesterday; see
 * withMine). `cities`: the ranked cities with yours adjusted; `mySessions`:
 * your counted sessions this month; `countsHere`: your month counts for the
 * city on your profile (false after a move: it stays where it began).
 */
export function useCityBoard(enabled = true): {
  on: boolean;
  status: BoardStatus;
  stale: boolean;
  month: string;
  board: CityBoard | null;
  cities: CityBoardCity[];
  mySessions: number;
  countsHere: boolean;
  retry: () => void;
} {
  const { currentUser, currentUserId, sessions, cityBoards, actions } = useApp();
  // `enabled` false: never asked for (a page that only sometimes wants the board, such as sign-up's last step).
  const on = enabled && cityBoardOn(currentUser);
  // Worked out on every draw, never kept: Find Players stays open for days on a phone, and the board must
  // move on to the new month (and ask again on a new day) without the app being closed first.
  const first = boardMonth();
  const today = new Date().toDateString();
  const [, redraw] = useState(0);
  const month = fellBack && fellBack.from === first ? fellBack.to : first;
  const mine = useMySessionCount();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!on) return;
    let live = true;
    actions.loadCityBoard(month, tries > 0).then((b) => {
      // The 1st: last month's final board, unless it has nothing on it (then this month's, which has begun).
      if (live && b && month !== thisMonth() && !b.cities.length && !b.me.sessions) {
        fellBack = { from: month, to: thisMonth() };
        redraw((n) => n + 1);
      }
    }, () => undefined);
    return () => { live = false; };
  }, [on, month, today, mine, tries, actions]);
  const entry = on ? cityBoards[month] : undefined;
  const board = entry?.board ?? null;
  const status: BoardStatus = !on ? 'off' : !entry ? 'loading' : board ? 'ready' : entry.failed ? 'error' : 'off';
  const adjusted = useMemo(() => {
    if (!board || !currentUserId) return { cities: [] as CityBoardCity[], mySessions: 0, countsHere: false };
    return withMine(board, sessionsSince(sessions, currentUserId, board.month, board.refreshedAt));
  }, [board, sessions, currentUserId]);
  const retry = useCallback(() => setTries((n) => n + 1), []);
  return { on, status, stale: !!entry?.failed && !!board, month, board, ...adjusted, retry };
}

/**
 * One city's page for you (city_page), for the board's month. `page.city`
 * null: a city you may not open (not ranked, and not yours). `mySessions`:
 * yours up to the minute, as on the board.
 */
export function useCityPage(cityId: string | null, month: string): { status: BoardStatus; stale: boolean; page: CityPage | null; mySessions: number; retry: () => void } {
  const { currentUser, currentUserId, sessions, cityPages, actions } = useApp();
  const on = cityBoardOn(currentUser) && !!cityId;
  const mine = useMySessionCount();
  const today = new Date().toDateString();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!on || !cityId) return;
    actions.loadCityPage(cityId, month, tries > 0).catch(() => undefined);
  }, [on, cityId, month, today, mine, tries, actions]);
  const entry = on && cityId ? cityPages[`${month}|${cityId}`] : undefined;
  const page = entry?.page ?? null;
  const status: BoardStatus = !on ? 'off' : !entry ? 'loading' : page ? 'ready' : entry.failed ? 'error' : 'off';
  const mySessions = useMemo(() => {
    if (!page?.me || !currentUserId) return 0;
    return page.me.sessions + sessionsSince(sessions, currentUserId, page.month, page.refreshedAt);
  }, [page, sessions, currentUserId]);
  const retry = useCallback(() => setTries((n) => n + 1), []);
  return { status, stale: !!entry?.failed && !!page, page, mySessions, retry };
}
