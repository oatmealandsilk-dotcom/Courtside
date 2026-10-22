import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import { useCallback, useMemo } from 'react';

import { isLocalMedia, remote, uploadMedia } from '@/data/remote';
import { demoDiscoverGroups, demoGroups } from '@/data/mock/groups';
import { demoGroupInvites } from '@/data/mock/groupInvites';
import { demoNewPlayer } from '@/data/api';
import type { Comment, DiscoverGroup, FeedGroup, FeedGroupCard, FeedGroupInvite, GroupInviteAnswer, GroupLook, ID, Notification, Post } from '@/data/types';
import { plainLook, sameLook } from '@/features/groups/look';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';

/*
 * Groups with a feed of their own (migration 67), as one slice of the app's
 * state, the way store/courtLife is: the state lives in AppContext with
 * everything else, the actions are written here. With a database each one
 * asks the server, which enforces every rule (3 groups each, admins only,
 * who can read a group post). The demo answers the same way from its own two
 * groups (data/mock/groups).
 *
 * Groups are for everyone, teens included (the owner, Oct 6: "Groups can be
 * for anyone"; migration 149). Being in a group together opens nothing else:
 * chats, the map and hits keep their own teen rules, on the server.
 */

/** The most groups one person can be in. The server keeps the same number (feed_group_cap). */
export const MAX_GROUPS = 3;

/** A new group's name: at least this many characters, at most NAME_MAX (the server keeps 40 for older ones). */
export const NAME_MIN = 2;
export const NAME_MAX = 30;
/** The line about a group (the server keeps 140 for older ones). */
export const ABOUT_MAX = 120;

/** A group's name as it will be kept: one line, single spaces, no spaces at the ends. */
export const tidyGroupName = (name: string) => name.replace(/\s+/g, ' ').trim();

export interface FeedGroupsState {
  /** The groups you are in, oldest joined first: the Feed's top row in that order. */
  feedGroups: FeedGroup[];
  /** Groups you asked to join that have not said yes yet. */
  feedGroupsAsked: { id: ID; name: string; look?: GroupLook }[];
  /** Null until first read; false on a database without groups yet (before migration 67). */
  feedGroupsOn: boolean | null;
  /**
   * Whether a group's look (colour, emoji, photo) can be saved: migration 73
   * has run (my_feed_groups says so). Until then the forms leave the Look
   * part out rather than show a face that would not stick. Always on in the demo.
   */
  feedGroupsLooks: boolean;
  /** Invites to groups waiting for your answer, newest first (migration 181). */
  feedGroupInvites: FeedGroupInvite[];
  /**
   * Whether invites go to the server (migration 181 has run; always in the
   * demo). Until then Invite sends the group's link in a chat, as before.
   */
  feedGroupInvitesLive: boolean;
  /** People you invited who haven't answered yet, by group: "Invited" in the picker. */
  feedGroupSentInvites: Record<ID, ID[]>;
}

export const emptyFeedGroups: FeedGroupsState = { feedGroups: [], feedGroupsAsked: [], feedGroupsOn: null, feedGroupsLooks: false, feedGroupInvites: [], feedGroupInvitesLive: false, feedGroupSentInvites: {} };

/** How Join or Not now on an invite went: what happened, or the server's word and its sentence. */
export type InviteAnswerResult = { ok: true; outcome: GroupInviteAnswer } | { ok: false; word: string; error: string };

interface Reads { currentUserId: ID | null; posts: Post[]; comments: Comment[]; notifications: Notification[] }

export interface FeedGroupsActions {
  /** Your groups, their members and (for an admin) their requests. */
  loadFeedGroups: () => Promise<void>;
  /**
   * Starts a group with you as admin; its id. Throws a plain sentence when it
   * cannot. `discoverable` false keeps it out of Find groups. `look` is its
   * colour and emoji, or a photo (one still on this phone is uploaded once
   * the group, and so its folder, exists); if the photo (or, on a database
   * before migration 73, hiding it) fails, the group is still made and a
   * toast says what didn't stick. What was actually saved is in the groups
   * once this returns.
   */
  createFeedGroup: (input: { name: string; description: string; ask: boolean; discoverable?: boolean; look?: GroupLook }) => Promise<ID>;
  /** Find groups (migration 70): groups shown there, near you first. Null when they could not be read. */
  discoverFeedGroups: (q: string) => Promise<DiscoverGroup[] | null>;
  /** What an invite link shows. Null when there is no such group; throws when it could not be asked. */
  feedGroupCard: (id: ID) => Promise<FeedGroupCard | null>;
  /** Joins an open group or asks to join one. Throws a plain sentence when it cannot. */
  joinFeedGroup: (id: ID) => Promise<'joined' | 'requested' | 'already'>;
  /** Leaves a group, or takes back a request. */
  leaveFeedGroup: (id: ID) => Promise<void>;
  /** An admin's yes or no to someone asking. Throws a plain sentence when it cannot. */
  answerFeedGroupRequest: (id: ID, who: ID, accept: boolean) => Promise<void>;
  /** An admin takes someone out. */
  removeFeedGroupMember: (id: ID, who: ID) => Promise<void>;
  /** An admin changes the name, description, open / ask first, whether it shows in Find groups, or its look. */
  updateFeedGroup: (id: ID, patch: { name: string; description: string; ask: boolean; discoverable?: boolean; look?: GroupLook }) => Promise<void>;
  /**
   * A page of a group's feed (everything its members post, and what was
   * shared to it only), newest first, into the app's posts; older ones with
   * `before`. Where the next page starts, or null when there is no more (or
   * it could not be read, or in the demo, whose posts are all loaded).
   */
  loadFeedGroupPosts: (id: ID, before?: string) => Promise<string | null>;
  /** Your invites to groups, and who you invited (migration 181). Also read with loadFeedGroups. */
  loadFeedGroupInvites: () => Promise<void>;
  /**
   * Invites people to a group you are in. Each one invited is told ("Mira
   * invited you to Silver Lake sunrise") and gets a phone alert if they
   * allow them; the server quietly leaves out anyone it may not reach (and
   * never says who or why). Never throws: `error` is a plain sentence.
   */
  inviteToFeedGroup: (id: ID, people: ID[]) => Promise<{ ok: boolean; invited: ID[]; error?: string }>;
  /**
   * Join or Not now on an invite. Join gets you in (or asks the admins for
   * you, when the inviter's say isn't enough there); Not now just clears it,
   * telling nobody. Never throws.
   */
  answerFeedGroupInvite: (id: ID, accept: boolean) => Promise<InviteAnswerResult>;
}

/** The server's word, as a sentence for the person who tapped. */
export function groupSentence(word: string): string {
  switch (word) {
    // A database from before migration 149, when groups were for adults only.
    case 'adults_only':
    case 'their_age': return 'Groups aren’t open to everyone yet. Try again soon.';
    case 'group_limit': return `You're in ${MAX_GROUPS} groups already. Leave one to join another.`;
    case 'their_limit': return `They're in ${MAX_GROUPS} groups already, the most anyone can be in.`;
    case 'not_admin': return 'Only the group’s admin can do that.';
    case 'not_found': return 'This group doesn’t exist any more.';
    case 'name_needed': return 'Give the group a name.';
    case 'slow_down': return 'That’s a lot of groups at once. Try again tomorrow.';
    case 'not_ready': return 'Groups aren’t switched on yet.';
    case 'bad_photo': return 'That photo couldn’t be used. Try another one.';
    case 'bad_look': return 'That look couldn’t be saved. Try another emoji.';
    // A name or description refused for its words (migration 117).
    case 'blocked_words': return BLOCKED_WORDS_NOTE;
    // Invites (migration 181).
    case 'invite_limit': return 'You’ve sent a lot of invites today. Try again tomorrow.';
    case 'not_member': return 'Only people in the group can invite.';
    default: return 'That didn’t go through. Check your connection and try again.';
  }
}

/** An invite that lapsed: the inviter left, say, or it was a month ago. */
export const INVITE_GONE = 'This invite isn’t open anymore.';

const demoId = () => `g-${Date.now().toString(36)}`;
/** A demo group by id: one of the demo's own, or one Find groups lists. */
const demoGroup = (id: ID): FeedGroup | undefined => demoGroups.find((x) => x.id === id) ?? demoDiscoverGroups.find((x) => x.id === id);

export function useFeedGroups<S extends FeedGroupsState & Reads>(
  stateRef: { current: S },
  setState: (update: (prev: S) => S) => void,
  live: (...ids: (ID | null | undefined)[]) => boolean,
): FeedGroupsActions {
  const reload = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    if (!live(me)) {
      if (stateRef.current.feedGroupsOn === null) {
        setState((prev) => ({
          ...prev,
          feedGroups: demoGroups.map((g) => ({ ...g, members: [...g.members], requests: [...g.requests] })),
          feedGroupsOn: true,
          feedGroupsLooks: true,
          // The demo's invites (a brand-new player, ?new=1, has none, as they have no notifications for them).
          feedGroupInvites: demoNewPlayer() ? [] : demoGroupInvites(),
          feedGroupInvitesLive: true,
        }));
      }
      return;
    }
    const [got] = await Promise.all([remote.myFeedGroups().catch(() => null), readInvites()]);
    if (stateRef.current.currentUserId !== me) return;
    setState((prev) => (got
      ? { ...prev, feedGroups: got.groups, feedGroupsAsked: got.asked, feedGroupsOn: true, feedGroupsLooks: got.looks }
      : { ...prev, feedGroupsOn: prev.feedGroupsOn ?? false }));
  }, [stateRef, setState, live]);

  /** Read alongside your groups; a database without invites yet keeps the chat-link invites. */
  async function readInvites() {
    const me = stateRef.current.currentUserId;
    if (!me || !live(me)) return;
    const got = await remote.myFeedGroupInvites().catch(() => null);
    if (!got || stateRef.current.currentUserId !== me) return;
    setState((prev) => ({ ...prev, feedGroupInvites: got.invites, feedGroupSentInvites: got.sent, feedGroupInvitesLive: got.live }));
  }

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

  /**
   * A look onto the server: a photo still on this phone goes up first, into
   * the GROUP's folder (media/<group id>/, migration 73), never yours, so its
   * address never says who runs the group.
   */
  const saveLook = async (id: ID, look: GroupLook) => {
    let photoUrl = look.photoUrl;
    if (photoUrl && isLocalMedia(photoUrl)) photoUrl = await uploadMedia(id, photoUrl, 'photo');
    await remote.setFeedGroupLook(id, plainLook({ ...look, photoUrl }));
  };

  const createFeedGroup = useCallback(async (input: { name: string; description: string; ask: boolean; discoverable?: boolean; look?: GroupLook }) => {
    const name = tidyGroupName(input.name).slice(0, 40);
    const look = plainLook(input.look);
    if (!name) throw new Error(groupSentence('name_needed'));
    const you = me();
    if (!you) throw new Error('Sign in to start a group.');
    if (!live(you)) {
      // The demo says what the server says.
      if (stateRef.current.feedGroups.length >= MAX_GROUPS) throw new Error(groupSentence('group_limit'));
      const id = demoId();
      haptics.commit();
      setState((prev) => ({ ...prev, feedGroups: [...prev.feedGroups, { id, name, description: input.description.trim().slice(0, 140) || undefined, ask: input.ask, discoverable: input.discoverable !== false, look: Object.keys(look).length ? look : undefined, createdAt: new Date().toISOString(), members: [{ id: you, admin: true }], requests: [] }] }));
      return id;
    }
    const id = await run(async () => {
      const discoverable = input.discoverable !== false;
      const colours = plainLook({ color: look.color, emoji: look.emoji });
      let made: ID;
      let lookDone = false;
      try {
        // Everything but a photo in one go (migration 73): a group asked to be hidden is never listed.
        made = await remote.startFeedGroup({ name, description: input.description.trim().slice(0, 140), ask: input.ask, discoverable, look: colours });
        lookDone = true;
      } catch (e) {
        if (!(e instanceof Error && e.message === 'not_ready')) throw e;
        // A database before 73: made as 67 makes it, then hidden (70). If hiding fails, it is said, not swallowed.
        made = await remote.createFeedGroup(name, input.description.trim().slice(0, 140), input.ask);
        if (!discoverable) {
          await remote.setFeedGroupDiscoverable(made, false).catch((err: unknown) => {
            if (err instanceof Error && err.message === 'not_ready') return;
            showToast({ title: 'The group shows in Find groups for now', body: 'Turn it off from Edit on the group’s page.', icon: 'eye-outline', long: true });
            console.warn('[groups] not hidden', err);
          });
        }
      }
      // A photo goes up once the group, and so its folder, exists; a colour and emoji too on a database before 73.
      if (look.photoUrl || (!lookDone && Object.keys(colours).length)) {
        await saveLook(made, look).catch((e: unknown) => {
          if (e instanceof Error && e.message === 'not_ready') return;
          showToast({ title: look.photoUrl ? 'The group’s photo didn’t upload' : 'The group’s look didn’t save', body: 'Try again from Edit on the group’s page.', icon: 'image-outline', long: true });
          console.warn('[groups] look not saved', e);
        });
      }
      return made;
    });
    haptics.commit();
    return id;
  }, [stateRef, setState, live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const feedGroupCard = useCallback(async (id: ID): Promise<FeedGroupCard | null> => {
    const you = me();
    if (!you) return null;
    if (!live(you)) {
      const g = stateRef.current.feedGroups.find((x) => x.id === id) ?? demoGroup(id);
      if (!g) return null;
      const member = g.members.some((m) => m.id === you) && stateRef.current.feedGroups.some((x) => x.id === id);
      return { id: g.id, name: g.name, description: g.description, ask: g.ask, look: g.look, memberCount: g.members.length, member, requested: stateRef.current.feedGroupsAsked.some((a) => a.id === id) };
    }
    return remote.feedGroupCard(id);
  }, [stateRef, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinFeedGroup = useCallback(async (id: ID) => {
    const you = me();
    if (!you) throw new Error('Sign in to join a group.');
    if (!live(you)) {
      // The demo says what the server says.
      const g = demoGroup(id);
      if (!g) throw new Error(groupSentence('not_found'));
      if (stateRef.current.feedGroups.some((x) => x.id === id)) return 'already';
      if (stateRef.current.feedGroups.length >= MAX_GROUPS) throw new Error(groupSentence('group_limit'));
      if (g.ask) { setState((prev) => ({ ...prev, feedGroupsAsked: [...prev.feedGroupsAsked.filter((a) => a.id !== id), { id, name: g.name, look: g.look }] })); return 'requested'; }
      setState((prev) => ({ ...prev, feedGroups: [...prev.feedGroups, { ...g, members: [...g.members.filter((m) => m.id !== you), { id: you, admin: false }], requests: [] }] }));
      return 'joined';
    }
    const out = await run(() => remote.joinFeedGroup(id));
    haptics.commit();
    return out;
  }, [stateRef, setState, live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const discoverFeedGroups = useCallback(async (q: string): Promise<DiscoverGroup[] | null> => {
    const you = me();
    if (!you) return null;
    if (!live(you)) {
      const term = q.trim().toLowerCase();
      const { feedGroups, feedGroupsAsked } = stateRef.current;
      return demoDiscoverGroups
        .filter((g) => !term || `${g.name} ${g.description ?? ''}`.toLowerCase().includes(term))
        .sort((a, b) => Number(b.near) - Number(a.near) || b.members.length - a.members.length)
        .map((g) => {
          const mine = feedGroups.find((x) => x.id === g.id);
          return { id: g.id, name: g.name, description: g.description, ask: g.ask, look: g.look, memberCount: mine?.members.length ?? g.members.length, member: !!mine, requested: feedGroupsAsked.some((a) => a.id === g.id), near: g.near };
        });
    }
    return remote.discoverGroups(q).catch(() => null);
  }, [stateRef, live]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const updateFeedGroup = useCallback(async (id: ID, patch: { name: string; description: string; ask: boolean; discoverable?: boolean; look?: GroupLook }) => {
    const you = me();
    if (!you) return;
    const name = tidyGroupName(patch.name).slice(0, 40);
    if (!name) throw new Error(groupSentence('name_needed'));
    // The group as the server last said it is: what a change is measured against.
    const before = stateRef.current.feedGroups.find((g) => g.id === id);
    const wasListed = before?.discoverable !== false;
    const listed = patch.discoverable ?? wasListed;
    const look = patch.look ? plainLook(patch.look) : before?.look;
    const lookChanged = !!patch.look && !sameLook(look, before?.look);
    patchGroup(id, (g) => ({ ...g, name, description: patch.description.trim().slice(0, 140) || undefined, ask: patch.ask, discoverable: listed, look: look && Object.keys(look).length ? look : undefined }));
    if (!live(you)) return;
    try {
      await run(async () => {
        await remote.updateFeedGroup(id, name, patch.description.trim(), patch.ask);
        if (listed !== wasListed) await remote.setFeedGroupDiscoverable(id, listed);
        if (lookChanged) await saveLook(id, look ?? {});
      });
    } catch (e) {
      // Not saved (or only partly): the group goes back to how it was, then
      // to what the server now holds, so Try again sends whatever didn't stick.
      if (before) patchGroup(id, () => before);
      void reload().catch(() => undefined);
      throw e;
    }
  }, [live, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFeedGroupPosts = useCallback(async (id: ID, before?: string) => {
    const you = me();
    if (!you || !live(you, id)) return null;
    const got = await remote.fetchFeedGroupPosts(id, before).catch(() => null);
    if (!got || stateRef.current.currentUserId !== you) return null;
    setState((prev) => {
      const havePost = new Set(prev.posts.map((p) => p.id));
      const haveComment = new Set(prev.comments.map((c) => c.id));
      const posts = got.posts.filter((p) => !havePost.has(p.id));
      const comments = got.comments.filter((c) => !haveComment.has(c.id));
      return posts.length || comments.length ? { ...prev, posts: [...prev.posts, ...posts], comments: [...prev.comments, ...comments] } : prev;
    });
    return got.next;
  }, [stateRef, setState, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFeedGroupInvites = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    // The demo's are read with its groups.
    if (!live(me)) { if (stateRef.current.feedGroupsOn === null) await reload(); return; }
    await readInvites();
  }, [stateRef, live, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const inviteToFeedGroup = useCallback(async (id: ID, people: ID[]) => {
    const you = me();
    const wanted = [...new Set(people)].filter((p) => p !== you).slice(0, 20);
    if (!you || !wanted.length) return { ok: false, invited: [] as ID[] };
    // Everyone picked reads "Invited" from here: the server never says who it left out.
    const markSent = () => setState((prev) => ({
      ...prev,
      feedGroupSentInvites: { ...prev.feedGroupSentInvites, [id]: [...new Set([...(prev.feedGroupSentInvites[id] ?? []), ...wanted])] },
    }));
    if (!live(you)) {
      if (!stateRef.current.feedGroups.some((g) => g.id === id)) return { ok: false, invited: [] as ID[], error: groupSentence('not_member') };
      markSent();
      haptics.reward();
      return { ok: true, invited: wanted };
    }
    try {
      const invited = await remote.inviteToFeedGroup(id, wanted);
      markSent();
      haptics.reward();
      return { ok: true, invited };
    } catch (e) {
      haptics.reject();
      return { ok: false, invited: [] as ID[], error: groupSentence(e instanceof Error ? e.message : '') };
    }
  }, [stateRef, setState, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const answerFeedGroupInvite = useCallback(async (id: ID, accept: boolean): Promise<InviteAnswerResult> => {
    const you = me();
    if (!you) return { ok: false, word: 'failed', error: groupSentence('failed') };
    const inv = stateRef.current.feedGroupInvites.find((i) => i.groupId === id);
    // The invite gone from the list and its notification read, in one go.
    const settle = (prev: S): S => ({
      ...prev,
      feedGroupInvites: prev.feedGroupInvites.filter((i) => i.groupId !== id),
      notifications: prev.notifications.map((n) => (n.kind === 'group-invite' && n.targetId === id && !n.read ? { ...n, read: true } : n)),
    });
    if (!live(you)) {
      // The demo says what the server says.
      if (!inv) return { ok: false, word: 'not_found', error: INVITE_GONE };
      if (!accept) { setState(settle); return { ok: true, outcome: 'declined' }; }
      if (stateRef.current.feedGroups.some((g) => g.id === id)) { setState(settle); return { ok: true, outcome: 'already' }; }
      if (stateRef.current.feedGroups.length >= MAX_GROUPS) { haptics.reject(); return { ok: false, word: 'group_limit', error: groupSentence('group_limit') }; }
      const g = demoGroup(id);
      const inviterAdmin = !!g?.members.some((m) => m.id === inv.inviterId && m.admin);
      if (inv.ask && !inviterAdmin) {
        setState((prev) => ({ ...settle(prev), feedGroupsAsked: [...prev.feedGroupsAsked.filter((a) => a.id !== id), { id, name: inv.name, look: inv.look }] }));
        haptics.commit();
        return { ok: true, outcome: 'requested' };
      }
      const base: FeedGroup = g ?? { id, name: inv.name, description: inv.description, ask: inv.ask, look: inv.look, createdAt: inv.createdAt, members: [], requests: [] };
      // The one who invited you is in it (the server only lets members invite).
      const members = [
        ...base.members.filter((m) => m.id !== you),
        ...(base.members.some((m) => m.id === inv.inviterId) ? [] : [{ id: inv.inviterId, admin: false }]),
        { id: you, admin: false },
      ];
      setState((prev) => ({ ...settle(prev), feedGroups: [...prev.feedGroups, { ...base, members, requests: [] }], feedGroupsAsked: prev.feedGroupsAsked.filter((a) => a.id !== id) }));
      haptics.commit();
      return { ok: true, outcome: 'joined' };
    }
    try {
      const outcome = await remote.answerFeedGroupInvite(id, accept);
      setState(settle);
      if (accept) haptics.commit();
      await reload().catch(() => undefined);
      return { ok: true, outcome };
    } catch (e) {
      const word = e instanceof Error ? e.message : 'failed';
      // An invite that lapsed (the inviter left, say) leaves the list.
      if (word === 'not_found') { setState(settle); return { ok: false, word, error: INVITE_GONE }; }
      haptics.reject();
      return { ok: false, word, error: groupSentence(word) };
    }
  }, [stateRef, setState, live, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => ({ loadFeedGroups: reload, createFeedGroup, discoverFeedGroups, feedGroupCard, joinFeedGroup, leaveFeedGroup, answerFeedGroupRequest, removeFeedGroupMember, updateFeedGroup, loadFeedGroupPosts, loadFeedGroupInvites, inviteToFeedGroup, answerFeedGroupInvite }),
    [reload, createFeedGroup, discoverFeedGroups, feedGroupCard, joinFeedGroup, leaveFeedGroup, answerFeedGroupRequest, removeFeedGroupMember, updateFeedGroup, loadFeedGroupPosts, loadFeedGroupInvites, inviteToFeedGroup, answerFeedGroupInvite],
  );
}
