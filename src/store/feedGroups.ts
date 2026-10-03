import { useCallback, useMemo } from 'react';

import { remote } from '@/data/remote';
import { demoGroups } from '@/data/mock/groups';
import type { Comment, FeedGroup, FeedGroupCard, ID, Post, User } from '@/data/types';
import { notKnownAdult } from '@/features/players/age';
import * as haptics from '@/lib/haptics';

/*
 * Groups with a feed of their own (migration 67), as one slice of the app's
 * state, the way store/courtLife is: the state lives in AppContext with
 * everything else, the actions are written here. With a database each one
 * asks the server, which enforces every rule (3 groups each, admins only,
 * who can read a group post). The demo answers the same way from its own two
 * groups (data/mock/groups).
 */

/** The most groups one person can be in. The server keeps the same number (feed_group_cap). */
export const MAX_GROUPS = 3;

/**
 * Groups are for adults in this version (the owner's rule: teens get 1:1
 * only). Someone not known to be an adult, a teen or an account with no
 * birthday yet, cannot start, join or ask to join one; the server says the
 * same (migration 67, 'adults_only'). Teens keep the For you feed as it is.
 */
export const groupsOpenTo = (u: Pick<User, 'ageGroup'> | null | undefined) => !!u && !notKnownAdult(u);

/** What someone who cannot use groups yet sees instead of Start or Join. */
export const GROUPS_AGE_LINE = 'Groups open when you’re 18.';

export interface FeedGroupsState {
  /** The groups you are in, oldest joined first: the Feed's top row in that order. */
  feedGroups: FeedGroup[];
  /** Groups you asked to join that have not said yes yet. */
  feedGroupsAsked: { id: ID; name: string }[];
  /** Null until first read; false on a database without groups yet (before migration 67). */
  feedGroupsOn: boolean | null;
}

export const emptyFeedGroups: FeedGroupsState = { feedGroups: [], feedGroupsAsked: [], feedGroupsOn: null };

interface Reads { currentUserId: ID | null; posts: Post[]; comments: Comment[]; users: Pick<User, 'id' | 'name' | 'ageGroup'>[] }

export interface FeedGroupsActions {
  /** Your groups, their members and (for an admin) their requests. */
  loadFeedGroups: () => Promise<void>;
  /** Starts a group with you as admin; its id. Throws a plain sentence when it cannot. */
  createFeedGroup: (input: { name: string; description: string; ask: boolean }) => Promise<ID>;
  /** What an invite link shows. Null when there is no such group. */
  feedGroupCard: (id: ID) => Promise<FeedGroupCard | null>;
  /** Joins an open group or asks to join one. Throws a plain sentence when it cannot. */
  joinFeedGroup: (id: ID) => Promise<'joined' | 'requested' | 'already'>;
  /** Leaves a group, or takes back a request. */
  leaveFeedGroup: (id: ID) => Promise<void>;
  /** An admin's yes or no to someone asking. Throws a plain sentence when it cannot. */
  answerFeedGroupRequest: (id: ID, who: ID, accept: boolean) => Promise<void>;
  /** An admin takes someone out. */
  removeFeedGroupMember: (id: ID, who: ID) => Promise<void>;
  /** An admin changes the name, description or open / ask first. */
  updateFeedGroup: (id: ID, patch: { name: string; description: string; ask: boolean }) => Promise<void>;
  /** A group's posts, newest first, into the app's posts; older ones with `before`. Whether there are more. */
  loadFeedGroupPosts: (id: ID, before?: string) => Promise<boolean>;
}

/** The server's word, as a sentence for the person who tapped. */
export function groupSentence(word: string): string {
  switch (word) {
    case 'adults_only': return GROUPS_AGE_LINE;
    case 'their_age': return 'They can’t join groups yet.';
    case 'group_limit': return `You're in ${MAX_GROUPS} groups already. Leave one to join another.`;
    case 'their_limit': return `They're in ${MAX_GROUPS} groups already, the most anyone can be in.`;
    case 'not_admin': return 'Only the group’s admin can do that.';
    case 'not_found': return 'This group doesn’t exist any more.';
    case 'name_needed': return 'Give the group a name.';
    case 'slow_down': return 'That’s a lot of groups at once. Try again tomorrow.';
    case 'not_ready': return 'Groups aren’t switched on yet.';
    default: return 'That didn’t go through. Check your connection and try again.';
  }
}

const demoId = () => `g-${Date.now().toString(36)}`;

export function useFeedGroups<S extends FeedGroupsState & Reads>(
  stateRef: { current: S },
  setState: (update: (prev: S) => S) => void,
  live: (...ids: (ID | null | undefined)[]) => boolean,
): FeedGroupsActions {
  const reload = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    if (!live(me)) {
      if (stateRef.current.feedGroupsOn === null) setState((prev) => ({ ...prev, feedGroups: demoGroups.map((g) => ({ ...g, members: [...g.members], requests: [...g.requests] })), feedGroupsOn: true }));
      return;
    }
    const got = await remote.myFeedGroups().catch(() => null);
    if (stateRef.current.currentUserId !== me) return;
    setState((prev) => (got
      ? { ...prev, feedGroups: got.groups, feedGroupsAsked: got.asked, feedGroupsOn: true }
      : { ...prev, feedGroupsOn: prev.feedGroupsOn ?? false }));
  }, [stateRef, setState, live]);

  /** Runs a server call, turning its word into a sentence, then reads the groups again. */
  const run = useCallback(async <T,>(call: () => Promise<T>): Promise<T> => {
    try {
      const out = await call();
      await reload();
      return out;
    } catch (e) {
      throw new Error(groupSentence(e instanceof Error ? e.message : ''));
    }
  }, [reload]);

  const me = () => stateRef.current.currentUserId;
  const patchGroup = (id: ID, change: (g: FeedGroup) => FeedGroup | null) => setState((prev) => ({
    ...prev,
    feedGroups: prev.feedGroups.flatMap((g) => { if (g.id !== id) return [g]; const next = change(g); return next ? [next] : []; }),
  }));

  const createFeedGroup = useCallback(async (input: { name: string; description: string; ask: boolean }) => {
    const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) throw new Error(groupSentence('name_needed'));
    const you = me();
    if (!you) throw new Error('Sign in to start a group.');
    if (!live(you)) {
      // The demo says what the server says (migration 67, 'adults_only').
      if (!groupsOpenTo(stateRef.current.users.find((u) => u.id === you))) throw new Error(GROUPS_AGE_LINE);
      if (stateRef.current.feedGroups.length >= MAX_GROUPS) throw new Error(groupSentence('group_limit'));
      const id = demoId();
      haptics.commit();
      setState((prev) => ({ ...prev, feedGroups: [...prev.feedGroups, { id, name, description: input.description.trim().slice(0, 140) || undefined, ask: input.ask, createdAt: new Date().toISOString(), members: [{ id: you, admin: true }], requests: [] }] }));
      return id;
    }
    const id = await run(() => remote.createFeedGroup(name, input.description.trim().slice(0, 140), input.ask));
    haptics.commit();
    return id;
  }, [stateRef, setState, live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const feedGroupCard = useCallback(async (id: ID): Promise<FeedGroupCard | null> => {
    const you = me();
    if (!you) return null;
    if (!live(you)) {
      const g = stateRef.current.feedGroups.find((x) => x.id === id) ?? demoGroups.find((x) => x.id === id);
      if (!g) return null;
      const member = g.members.some((m) => m.id === you) && stateRef.current.feedGroups.some((x) => x.id === id);
      return { id: g.id, name: g.name, description: g.description, ask: g.ask, memberCount: g.members.length, member, requested: stateRef.current.feedGroupsAsked.some((a) => a.id === id) };
    }
    return remote.feedGroupCard(id).catch(() => null);
  }, [stateRef, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinFeedGroup = useCallback(async (id: ID) => {
    const you = me();
    if (!you) throw new Error('Sign in to join a group.');
    if (!live(you)) {
      // The demo says what the server says (migration 67, 'adults_only').
      if (!groupsOpenTo(stateRef.current.users.find((u) => u.id === you))) throw new Error(GROUPS_AGE_LINE);
      const g = demoGroups.find((x) => x.id === id);
      if (!g) throw new Error(groupSentence('not_found'));
      if (stateRef.current.feedGroups.some((x) => x.id === id)) return 'already';
      if (stateRef.current.feedGroups.length >= MAX_GROUPS) throw new Error(groupSentence('group_limit'));
      if (g.ask) { setState((prev) => ({ ...prev, feedGroupsAsked: [...prev.feedGroupsAsked.filter((a) => a.id !== id), { id, name: g.name }] })); return 'requested'; }
      setState((prev) => ({ ...prev, feedGroups: [...prev.feedGroups, { ...g, members: [...g.members.filter((m) => m.id !== you), { id: you, admin: false }], requests: [] }] }));
      return 'joined';
    }
    const out = await run(() => remote.joinFeedGroup(id));
    haptics.commit();
    return out;
  }, [stateRef, setState, live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const leaveFeedGroup = useCallback(async (id: ID) => {
    const you = me();
    if (!you) return;
    // Gone from the row at once; the server's answer follows.
    // Its posts go too (other than your own): they are only for its members.
    setState((prev) => ({
      ...prev,
      feedGroups: prev.feedGroups.filter((g) => g.id !== id),
      feedGroupsAsked: prev.feedGroupsAsked.filter((a) => a.id !== id),
      posts: prev.posts.filter((p) => p.groupId !== id || p.authorId === you),
    }));
    if (!live(you)) return;
    await run(() => remote.leaveFeedGroup(id));
  }, [setState, live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const answerFeedGroupRequest = useCallback(async (id: ID, who: ID, accept: boolean) => {
    const you = me();
    if (!you) return;
    if (!live(you)) {
      patchGroup(id, (g) => ({ ...g, requests: g.requests.filter((r) => r !== who), members: accept ? [...g.members, { id: who, admin: false }] : g.members }));
      return;
    }
    await run(() => remote.answerFeedGroupRequest(id, who, accept));
  }, [live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeFeedGroupMember = useCallback(async (id: ID, who: ID) => {
    const you = me();
    if (!you) return;
    patchGroup(id, (g) => ({ ...g, members: g.members.filter((m) => m.id !== who) }));
    if (!live(you)) return;
    await run(() => remote.removeFeedGroupMember(id, who));
  }, [live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFeedGroup = useCallback(async (id: ID, patch: { name: string; description: string; ask: boolean }) => {
    const you = me();
    if (!you) return;
    const name = patch.name.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) throw new Error(groupSentence('name_needed'));
    patchGroup(id, (g) => ({ ...g, name, description: patch.description.trim().slice(0, 140) || undefined, ask: patch.ask }));
    if (!live(you)) return;
    await run(() => remote.updateFeedGroup(id, name, patch.description.trim(), patch.ask));
  }, [live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFeedGroupPosts = useCallback(async (id: ID, before?: string) => {
    const you = me();
    if (!you || !live(you, id)) return false;
    const got = await remote.fetchFeedGroupPosts(id, before).catch(() => null);
    if (!got || stateRef.current.currentUserId !== you) return false;
    setState((prev) => {
      const havePost = new Set(prev.posts.map((p) => p.id));
      const haveComment = new Set(prev.comments.map((c) => c.id));
      const posts = got.posts.filter((p) => !havePost.has(p.id));
      const comments = got.comments.filter((c) => !haveComment.has(c.id));
      return posts.length || comments.length ? { ...prev, posts: [...prev.posts, ...posts], comments: [...prev.comments, ...comments] } : prev;
    });
    return got.more;
  }, [stateRef, setState, live]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => ({ loadFeedGroups: reload, createFeedGroup, feedGroupCard, joinFeedGroup, leaveFeedGroup, answerFeedGroupRequest, removeFeedGroupMember, updateFeedGroup, loadFeedGroupPosts }),
    [reload, createFeedGroup, feedGroupCard, joinFeedGroup, leaveFeedGroup, answerFeedGroupRequest, removeFeedGroupMember, updateFeedGroup, loadFeedGroupPosts],
  );
}
