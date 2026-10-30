import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CourtAccess, User } from '@/data/types';
import { fetchCourts, peekCourts, type Court } from '@/features/players/courts';
import { ageUnknown, notKnownAdult } from '@/features/players/age';
import { canCheckIn, seenByOnMap, yesFirst } from '@/features/players/mapPrivacy';
import { askCourtTime, tillWords } from '@/features/places/courtTime';
import { courtAt, lightUpCourtsOn } from '@/features/places/lightUp';
import type { LatLng } from '@/features/players/positions';
import { getPosition, locationAllowed, recentPosition } from '@/lib/geo';
import { useApp } from '@/store/AppContext';

/*
 * "I'm playing here", in one tap (Oct 29, owner: "There's not a I'm playing
 * here button on the courts page ... Like when you go into map", then "we
 * should really make it easy for ppl to say they are at a court, not a lot of
 * friction because we want the courts to be lit up").
 *
 * One way in, used by every place that offers it (the map's court card, the
 * court sheet's "Playing here?" switch, the "You're at <court>? Light it up"
 * row on Find Players): a yes to "Who can see you on the map?" first when there
 * is none (nothing without a yes; No one cannot), then Location if it is off
 * (the phone's own prompt, only on Light it up), then the check-in itself,
 * for as long as the "How long are you here?" card says (courtTime: 30
 * minutes to 4 hours, 1h 30m to start or your last choice; friends who
 * follow each other with you see your name and until when, anyone else only
 * a count once 2 or more are there). Never automatic
 * (Apple 5.1.2(i)): every check-in is a tap. Never for a teen, never at
 * someone's home court (canCheckIn; the server's own rule, migration 203).
 */

/**
 * "You're at <court>? Light it up" on Find Players (AtCourtPrompt): when the phone already knows where you are
 * (Location on and allowed; this never asks), and that is at a court you could say you're playing at. One tap
 * checks in, exactly as the court card does; nothing is shared until then. At most once a court a day, and
 * closing it puts it away. The owner decides before it ships.
 */
export const AT_COURT_PROMPT = true;

/** Why "I'm playing here" is not on offer, in a short quiet line; null when it is. */
export function playingHereWhy(me: User | null | undefined, access: CourtAccess, seenBy: string | null | undefined): string | null {
  if (!me) return null;
  if (access === 'private') return 'Not at someone’s home court';
  if (ageUnknown(me)) return 'Add your birthday (18+) to say you’re playing here';
  if (notKnownAdult(me)) return '“I’m playing here” is for players 18 and over';
  if (seenBy === 'none') return 'You chose No one on the map, so you can’t show here';
  return null;
}

/**
 * "I'm playing here" at one court: whether it is on offer (and if not, why), whether you are, until when
 * ("till 6:30pm"), and the taps. `name`: the court's, for the "How long are you here?" card.
 */
export function usePlayingHere(courtId: string | null, access: CourtAccess, name?: string) {
  const { actions, courtNow, currentUser, locationEnabled, mapLive, mapVisibility, teenMap } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seenBy = seenByOnMap(mapLive, currentUser, teenMap, mapVisibility);
  const can = !!courtId && canCheckIn(currentUser, access);
  const why = courtId ? playingHereWhy(currentUser, access, seenBy) : null;
  const here = !!courtId && !!courtNow[courtId]?.youHere && locationEnabled;
  const till = here && courtId ? tillWords(courtNow[courtId]?.youUntil) : null;
  const latest = useRef({ mapVisibility, locationEnabled });
  latest.current = { mapVisibility, locationEnabled };

  /** Says you're playing here, after "How long are you here?". Resolves whether it went through (false: put away, or refused). */
  const start = useCallback(async (): Promise<boolean> => {
    if (!courtId || !can) return false;
    setError('');
    setBusy(true);
    try {
      // No yes yet: "Who can see you on the map?" first, and nothing without a yes (Apple 5.1.2(i), migration 191).
      if (!(await yesFirst(latest.current.mapVisibility, 'court'))) {
        // No one on the map: say so rather than nothing happening (the server would refuse it too, 'hidden').
        if (latest.current.mapVisibility === 'none') setError('You chose No one on the map. Change it in Settings → Privacy.');
        return false;
      }
    } finally {
      setBusy(false);
    }
    // How long you're here; Light it up on that card is the check-in itself (anything refused shows on the card).
    const lit = await askCourtTime(name ?? '', async (minutes) => {
      let at: LatLng | undefined;
      if (!latest.current.locationEnabled) {
        // Location off: Light it up turns it on (the phone's own prompt, if it has never been asked), then checks in from that spot.
        const problem = await actions.setLocationEnabled(true);
        if (problem) return `Location is off: ${problem}.`;
        at = (await recentPosition(60_000)) ?? undefined;
        if (!at) return 'Couldn’t find you. Try again.';
      }
      return actions.checkInAtCourt(courtId, at, minutes);
    });
    if (typeof lit === 'string') { setError(lit); return false; }
    return lit;
  }, [courtId, can, actions, name]);

  const leave = useCallback(async () => {
    setError('');
    await actions.checkOutOfCourt();
  }, [actions]);

  return { can, why, here, till, busy, error, seenBy, start, leave };
}

/* ------------------------------------------------- "You're at <court>?" */

const PROMPT_KEY = 'courtside-at-court-prompt';
/** Asked again at most this often while Find Players stays open. */
const LOOK_EVERY_MS = 5 * 60_000;
const today = () => new Date().toDateString();

/** The courts already offered today, on this phone ({ day, ids }). */
async function readOffered(): Promise<string[]> {
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(PROMPT_KEY) : await AsyncStorage.getItem(PROMPT_KEY);
    const got = raw ? (JSON.parse(raw) as { day?: string; ids?: string[] }) : null;
    return got?.day === today() && Array.isArray(got.ids) ? got.ids : [];
  } catch {
    return [];
  }
}
async function markOffered(id: string) {
  const ids = [...new Set([...(await readOffered()), id])].slice(-20);
  const raw = JSON.stringify({ day: today(), ids });
  try {
    if (Platform.OS === 'web') localStorage.setItem(PROMPT_KEY, raw);
    else await AsyncStorage.setItem(PROMPT_KEY, raw);
  } catch { /* it may come once more today; nothing else depends on it */ }
}

/** The court the prompt is up for in this app session, so leaving Find Players and coming back finds it still there. */
let offered: Court | null = null;
const closed = new Set<string>();

/**
 * The court to offer "Light it up" at, or null: only for someone who may check in (an adult who did not choose
 * No one, courts lighting up for them), with Location on and already allowed on this phone (read quietly: never
 * a prompt), standing at a court (lightUp's courtAt: a club's too, never someone's home court) where they are
 * not already playing, once a court a day. Reading where the phone is stays on the phone; nothing is sent.
 */
export function useAtCourtPrompt(active: boolean) {
  const { currentUser, locationEnabled, mapVisibility, courtNow, courtFacts } = useApp();
  const [court, setCourt] = useState<Court | null>(offered);
  const eligible = AT_COURT_PROMPT && active && lightUpCourtsOn(currentUser) && canCheckIn(currentUser) && mapVisibility !== 'none' && locationEnabled;
  const lookedAt = useRef(0);
  const facts = useRef(courtFacts);
  facts.current = courtFacts;

  useEffect(() => {
    if (!eligible) return undefined;
    let gone = false;
    const look = async () => {
      if (offered || Date.now() - lookedAt.current < LOOK_EVERY_MS) return;
      lookedAt.current = Date.now();
      // Only a spot the phone gives without asking anything.
      if (!(await locationAllowed())) return;
      const fix = await getPosition({ quiet: true, recentMs: 2 * 60_000 });
      if (!fix.ok || gone) return;
      const at = { lat: fix.lat, lng: fix.lng };
      const list = peekCourts(at) ?? await fetchCourts(at).catch(() => [] as Court[]);
      const found = courtAt(at, list);
      if (!found || gone || closed.has(found.id)) return;
      const said = facts.current[found.id]?.access;
      if (!canCheckIn(currentUser, said && said !== 'unknown' ? said : found.access)) return;
      if ((await readOffered()).includes(found.id) || gone) return;
      void markOffered(found.id);
      offered = found;
      setCourt(found);
    };
    void look();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void look(); });
    return () => { gone = true; sub.remove(); };
  }, [eligible, currentUser]);

  const close = useCallback(() => {
    if (offered) closed.add(offered.id);
    offered = null;
    setCourt(null);
  }, []);

  // Already playing there (from here, the court card or anywhere else): nothing to ask.
  const shown = eligible && court && !courtNow[court.id]?.youHere ? court : null;
  return { court: shown, close };
}
