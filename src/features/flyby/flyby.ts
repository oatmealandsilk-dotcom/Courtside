import { router } from 'expo-router';

import type { FlybyPerson, ID, User } from '@/data/types';
import { localDay } from '@/features/practice/stats';
import { show as showToast } from '@/lib/toast';

/*
 * Flyby (owner, Oct 5: "Flyby is good"), Strava's "who else was out there":
 * right after you log or post a session at a court, "3 others were at Alder
 * Park today · Mira, Jo and Sam · See". The server decides who (flyby,
 * migration 130): only when you were there yourself that day, only people
 * the app may show you there, never anyone you played (they are on your
 * session already), and never a time, only the part of the day.
 */

/** How long after "Logged" or "Posted" the Flyby note comes, so the first one is read. */
export const FLYBY_DELAY_MS = 3000;

/** "today", "yesterday", or "on Saturday". */
export function flybyDay(day: string, now = new Date()): string {
  if (day === localDay(now)) return 'today';
  if (day === localDay(now.getTime() - 86_400_000)) return 'yesterday';
  return `on ${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}`;
}

const firstOf = (u: User | undefined) => u?.name.trim().split(/\s+/)[0] || (u ? `@${u.handle}` : '');

/** The people the app has loaded, in the server's order. */
export function flybyPeople(list: FlybyPerson[], users: User[]): { person: FlybyPerson; user: User }[] {
  return list.map((person) => ({ person, user: users.find((u) => u.id === person.userId) })).filter((x): x is { person: FlybyPerson; user: User } => !!x.user);
}

/** "Mira", "Mira and Jo", "Mira, Jo and Sam", "Mira, Jo and 3 others". */
export function flybyNames(users: User[]): string {
  const names = users.map(firstOf).filter(Boolean);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

/** "3 others were at Alder Park today", "Mira was at Alder Park yesterday too". */
export function flybyTitle(users: User[], courtName: string, day: string, now = new Date()): string {
  const when = flybyDay(day, now);
  return users.length === 1 ? `${firstOf(users[0])} was at ${courtName} ${when} too` : `${users.length} others were at ${courtName} ${when}`;
}

/** The short words on a session's pill: "3 others here today", "Mira here yesterday". */
export function flybyPill(users: User[], day: string, now = new Date()): string {
  const when = flybyDay(day, now);
  return users.length === 1 ? `${firstOf(users[0])} here ${when}` : `${users.length} others here ${when}`;
}

/** "this morning", "this afternoon", "this evening" today; "that morning" on another day. */
export function partWords(part: FlybyPerson['part'], day: string, now = new Date()): string {
  return day === localDay(now) ? `this ${part}` : `that ${part}`;
}

/** Opens the list (a sheet): who was there, with Follow. */
export function openFlyby(courtId: string, courtName: string, day: string) {
  router.push({ pathname: '/flyby', params: { court: courtId, name: courtName, day } });
}

/**
 * After a log or a post at a court: a few seconds on, the Flyby note, if
 * anyone you may see was there that day. Says nothing when nobody was, or
 * when it could not be asked.
 */
export function flybyAfter(input: {
  courtId: string | undefined;
  courtName: string | undefined;
  day: string;
  ask: (courtId: string, day: string) => Promise<FlybyPerson[] | null>;
  users: () => User[];
  /** Skip these (the people you just tagged: you played them). */
  skip?: ID[];
  delayMs?: number;
}): void {
  const { courtId, day } = input;
  if (!courtId) return;
  const courtName = input.courtName?.trim() || 'this court';
  // Asked now, said later: the answer is ready by the time "Logged" has been read.
  const asking = input.ask(courtId, day).catch(() => null);
  setTimeout(() => {
    void asking.then((list) => {
      const people = flybyPeople((list ?? []).filter((p) => !input.skip?.includes(p.userId)), input.users()).map((x) => x.user);
      if (!people.length) return;
      showToast({
        glyph: 'flyby',
        title: flybyTitle(people, courtName, day),
        body: flybyNames(people),
        action: { label: 'See', onPress: () => openFlyby(courtId, courtName, day) },
      });
    });
  }, input.delayMs ?? FLYBY_DELAY_MS);
}
