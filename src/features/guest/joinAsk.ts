import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { Post, User } from '@/data/types';
import { joinLook } from './joinLook';

/**
 * The one "Join CourtSide to …" sheet a guest sees (Oct 17, owner: "it's
 * just when you want to actually do something that requires profile it will
 * make you sign up"). Anything a guest tries that needs a profile asks
 * through here: the app's actions (AppContext's guest gate), the + button,
 * and pages a guest cannot open (AppShell). One shared value and a list of
 * who to tell, the way tourStore and pendingTab share theirs.
 */
export interface JoinAsk {
  /** What they tried, finishing "Join CourtSide to …": "like posts", "reply". */
  what: string;
  /** Set when they tried to report something: its kind and id ("post:…"), for the no-account way to report. */
  report?: string;
  /** The person it was about, by their display name (a clip's author, the player they tried to follow): the prompt names them. */
  who?: string;
  /** Where to land once they are in, when not the page they are on: an open hit's page, joined for them (as the peek does). */
  target?: { href: string; joinHit?: string; host?: string };
  /** The person and the post it was about, for the looks that show them (joinLook a, b): their face, the post's cover. */
  about?: JoinAbout;
  /** Where on the screen the button they tapped is (joinLook a, whose bubble points at it). Web only. */
  anchor?: { x: number; y: number; width: number; height: number };
  /** Counts up on every ask, so the same ask twice still opens the sheet again. */
  at: number;
}

let current: JoinAsk | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Who and what an ask was about: the person's face, and whether it was a clip, a photo or a written post. */
export interface JoinAbout {
  person?: { id: string; name: string; seed: string; photo?: string };
  post?: { kind: 'clip' | 'photo' | 'post'; cover?: string };
}

/** The person and post behind an ask about a post (a like, a comment, a save): for joinLook b and c. */
export function aboutPost(post?: Pick<Post, 'kind' | 'videoUrl' | 'imageUrl' | 'thumbnailUrl' | 'mediaLabel'>, author?: Pick<User, 'id' | 'name' | 'avatarSeed' | 'avatarUrl'>): JoinAbout | undefined {
  if (!post && !author) return undefined;
  const clip = !!post && (post.kind === 'clip' || !!post.videoUrl || /·\s*\d+:\d+/.test(post.mediaLabel ?? ''));
  const kind = !post ? undefined : clip ? 'clip' as const : post.imageUrl || post.thumbnailUrl ? 'photo' as const : 'post' as const;
  return {
    person: aboutPerson(author)?.person,
    post: post && kind ? { kind, cover: post.thumbnailUrl ?? post.imageUrl } : undefined,
  };
}

/** The person behind an ask about them (a follow, a message). */
export function aboutPerson(user?: Pick<User, 'id' | 'name' | 'avatarSeed' | 'avatarUrl'>): JoinAbout | undefined {
  return user ? { person: { id: user.id, name: user.name, seed: user.avatarSeed || user.id, photo: user.avatarUrl } } : undefined;
}

// joinLook a points its bubble at the button that was tapped: the last thing pressed, if it was just now.
let pressed: { el: Element; at: number } | null = null;
let watching = false;
function watchPresses() {
  if (watching || Platform.OS !== 'web' || typeof document === 'undefined' || joinLook() !== 'a') return;
  watching = true;
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Element | null;
    const el = target?.closest?.('[role="button"], [role="link"], button, a[href], [tabindex]');
    if (el) pressed = { el, at: Date.now() };
  }, true);
}
watchPresses();

function anchorNow(): JoinAsk['anchor'] {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || joinLook() !== 'a') return undefined;
  const recent = pressed && Date.now() - pressed.at < 2000 && pressed.el.isConnected ? pressed.el : null;
  const focused = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const el = recent ?? focused;
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : undefined;
}

export function openJoinSheet(what: string, options?: { report?: string; who?: string; target?: JoinAsk['target']; about?: JoinAbout }) {
  // The other looks (a-d) leave the same ask be while it shows: a second tap on the heart under look a's
  // bubble (or under c's bar) would otherwise close it and pop it straight back up. Today's dims the page, so it never comes up.
  if (current && joinLook() !== 'today' && current.what === what && current.who === (options?.who || undefined) && current.report === options?.report) return;
  current = { what, report: options?.report, who: options?.who || undefined, target: options?.target, about: options?.about, anchor: anchorNow(), at: Date.now() };
  emit();
}

export function closeJoinSheet() {
  if (!current) return;
  current = null;
  emit();
}

export function useJoinSheet(): JoinAsk | null {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/**
 * The iPhone app while it is in TestFlight (owner, Oct 17); the App Store link once it is approved.
 * public/waitlist.html has its own copy (APP_URL, for courtsidebase.com/?ref=fb&go=app links): change
 * both together (the auto-tester checks they match).
 */
export const IPHONE_APP_URL = 'https://testflight.apple.com/join/21UJPuny';
