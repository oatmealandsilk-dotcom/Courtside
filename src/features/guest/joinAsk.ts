import { useSyncExternalStore } from 'react';

import type { Post } from '@/data/types';

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
  /**
   * The post it was about (a like, a comment, a save): the plain look says "this clip" or "this photo"
   * when it has no name, and its "we'll bring you straight back here" brings them back to this post.
   */
  post?: AskedPost;
  /** Counts up on every ask, so the same ask twice still opens the sheet again. */
  at: number;
}

let current: JoinAsk | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** A post an ask was about: its id, and whether it is a clip, a photo or a written post. */
export interface AskedPost {
  id: string;
  kind: 'clip' | 'photo' | 'post';
}

/** The post behind an ask, from the post itself. */
export function askedPost(post?: Pick<Post, 'id' | 'kind' | 'videoUrl' | 'imageUrl' | 'thumbnailUrl' | 'mediaLabel'>): AskedPost | undefined {
  if (!post) return undefined;
  const clip = post.kind === 'clip' || !!post.videoUrl || /·\s*\d+:\d+/.test(post.mediaLabel ?? '');
  return { id: post.id, kind: clip ? 'clip' : post.imageUrl || post.thumbnailUrl ? 'photo' : 'post' };
}

export function openJoinSheet(what: string, options?: { report?: string; who?: string; target?: JoinAsk['target']; post?: AskedPost }) {
  current = { what, report: options?.report, who: options?.who || undefined, target: options?.target, post: options?.post, at: Date.now() };
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
