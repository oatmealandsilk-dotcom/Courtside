import type { HitRequest, Post, Question, User } from '@/data/types';
import { hitShort } from '@/features/hits/format';

/*
 * The line that goes with a link shared outside the app: short, about the
 * person or the court rather than the app, and ending on something to do.
 * The link itself does the explaining once it is opened.
 */

const first = (u?: User | null) => u?.name.trim().split(/\s+/)[0] || (u ? `@${u.handle}` : 'A player');
const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

export function postShareText(post: Post, author: User | undefined, me: string | null): string {
  const words = clip(post.body, 70);
  const what = post.kind === 'clip' || post.videoUrl ? 'clip' : post.imageUrl ? 'photo' : 'post';
  const where = post.court?.name ? ` at ${post.court.name}` : '';
  if (author?.id === me) return words ? `“${words}” · my ${what}${where} on CourtSide` : `My latest ${what}${where}, on CourtSide`;
  return words ? `“${words}” · ${first(author)} on CourtSide` : `${first(author)}'s ${what}${where}, on CourtSide`;
}

export function hitShareText(hit: HitRequest, author: User | undefined, me: string | null): string {
  const left = Math.max(0, hit.spots - hit.joinedIds.length);
  const need = left > 1 ? `${left} players` : 'a hitting partner';
  const when = hitShort(hit.startsAt);
  return author?.id === me
    ? `Need ${need}: ${when} at ${hit.place.name}. You in?`
    : `${first(author)} needs ${need}: ${when} at ${hit.place.name}. You in?`;
}

export function profileShareText(user: User, me: string | null): string {
  return user.id === me ? 'Come hit with me on CourtSide' : `Play with ${first(user)} (@${user.handle}) on CourtSide`;
}

export function questionShareText(question: Question): string {
  return `“${clip(question.title, 80)}” · players are answering on CourtSide`;
}

export function courtShareText(name: string): string {
  return `Who's playing at ${name}? See on CourtSide`;
}
