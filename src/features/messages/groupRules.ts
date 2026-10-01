import type { Conversation, HitRequest, ID, Message, User } from '@/data/types';

/**
 * The rules of group chats, as plain functions with no drawing in them, so
 * the store (src/store/AppContext.tsx) can use them without pulling in the
 * screens' components. Screens import the same names from ./groups, which
 * passes all of these along beside GroupAvatar.
 */

/**
 * The most people a group can hold, you included (the owner's call: 16).
 * The database keeps the same number in group_cap() (migration 54); change
 * both together.
 */
export const GROUP_CAP = 16;

/** What "mute until I turn it back on" is saved as: a moment that never comes. */
export const MUTED_FOREVER = '9999-12-31T00:00:00.000Z';

/** A group chat: marked as one, or simply more than two people in it. */
export const isGroupChat = (c: Conversation) => !!c.isGroup || c.participantIds.length > 2;

/**
 * A one-to-one chat. A group that is down to two people (a hit chat after its
 * first "I'm in", or everyone else left) is still a group, never the private
 * chat between those two.
 */
export const isDirectChat = (c: Conversation) => !isGroupChat(c) && c.participantIds.length === 2;

/** Your one-to-one chat with someone, if there is one. */
export const findDirectChat = (conversations: Conversation[], me: ID, other: ID) =>
  conversations.find((c) => isDirectChat(c) && c.participantIds.includes(me) && c.participantIds.includes(other));

/** Muted right now (a mute that has run out no longer counts). */
export const isMuted = (c: Conversation) => !!c.mutedUntil && Date.parse(c.mutedUntil) > Date.now();

/**
 * The number on the Messages badge: how many chats have something new in
 * them (Instagram counts chats, not messages), never counting a muted one.
 */
export const unreadChatCount = (conversations: Conversation[]) =>
  conversations.filter((c) => c.unreadCount > 0 && !isMuted(c)).length;

/**
 * Whether someone runs a group: can remove people and make others admins.
 * On a database without admins yet (before migration 54), whoever started it.
 */
export const isGroupAdmin = (c: Conversation, userId: ID | null | undefined) =>
  !!userId && (c.adminIds ? c.adminIds.includes(userId) : c.createdBy === userId);

/**
 * Whether a group's database has admins, mute, group photos and removal
 * (migration 54). A group loaded from one without them has no admin list at
 * all (undefined, never empty), so those controls are left out rather than
 * offered and then refused. A one-to-one chat has no admins either way, so
 * it always counts as ready.
 */
export const hasGroupControls = (c: Conversation) => !isGroupChat(c) || c.adminIds !== undefined;

/** Whether you hold a spot in a hit whose chat this is: leaving the chat gives it up (the server does the same). */
export const holdsHitSpot = (hits: HitRequest[], conversationId: ID, me: ID | null | undefined) =>
  !!me && hits.some((h) => h.conversationId === conversationId && h.joinedIds.includes(me));

/** What "Leave this group?" says; in the chat of a hit you are in, that leaving also gives up your spot. */
export const leaveGroupMessage = (givesUpSpot: boolean) =>
  `Everyone sees that you left. Someone in it can add you back.${givesUpSpot ? ' You’ll also give up your spot in the hit.' : ''}`;

/** The others in a chat, as people. */
export const othersIn = (c: Conversation, users: User[], me: ID | null) =>
  c.participantIds.filter((id) => id !== me).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);

/** A group's name: the one it was given, or its people ("Mira, Dev & Nadia", "Mira, Dev + 3"). */
export function groupName(c: Conversation, users: User[], me: ID | null): string {
  if (c.title) return c.title;
  const first = othersIn(c, users, me).map((u) => u.name.split(' ')[0]);
  if (first.length <= 1) return first[0] ?? 'Group';
  if (first.length <= 3) return `${first.slice(0, -1).join(', ')} & ${first[first.length - 1]}`;
  return `${first.slice(0, 2).join(', ')} + ${first.length - 2}`;
}

/** A first name for a line about someone; you are "You" (or "you" mid-sentence). */
function who(id: ID, users: User[], me: ID | null, start: boolean): string {
  if (id === me) return start ? 'You' : 'you';
  const name = users.find((u) => u.id === id)?.name.trim().split(/\s+/)[0];
  return name || (start ? 'Someone' : 'someone');
}

/** Names in a sentence: "Dev", "Dev and June", "Dev, June and Mira", "Dev, June and 3 others" (the server words it the same way). */
function names(ids: ID[], users: User[], me: ID | null): string {
  const list = ids.map((id) => who(id, users, me, false));
  if (!list.length) return 'someone';
  if (list.length === 1) return list[0];
  if (list.length <= 3) return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return `${list[0]}, ${list[1]} and ${list.length - 2} others`;
}

/**
 * An event line, worded for whoever is reading it: "You added Dev and June",
 * "Mira made you an admin", "Dev left". A line the app does not know how to
 * word shows the sentence the server wrote when it happened.
 */
export function eventText(m: Message, users: User[], me: ID | null): string {
  const e = m.event;
  if (m.kind !== 'system' || !e) return m.body;
  const actor = who(m.senderId, users, me, true);
  const targets = names(e.targetIds ?? [], users, me);
  switch (e.type) {
    case 'created': return e.title ? `${actor} created the group “${e.title}”` : `${actor} created the group`;
    case 'added': return `${actor} added ${targets}`;
    case 'removed': return `${actor} removed ${targets}`;
    case 'left': return `${actor} left`;
    case 'renamed': return e.title ? `${actor} named the group “${e.title}”` : `${actor} removed the group name`;
    case 'photo': return e.on === false ? `${actor} removed the group photo` : `${actor} changed the group photo`;
    case 'admin': return e.on === false ? `${actor} removed ${targets} as an admin` : `${actor} made ${targets} an admin`;
    case 'joined': return m.senderId === me ? 'You’re in for the hit' : `${actor} is in for the hit`;
    default: return m.body;
  }
}

/**
 * The line under your last message in a group: "Seen by Mira, Dev",
 * "Seen by Mira, Dev, June +2", "Seen by everyone", or "Sent". Someone who
 * keeps read receipts off is never listed, so "everyone" only shows when
 * every other person in the group has read it and lets that be seen.
 */
export function seenByLabel(m: Message, c: Conversation, users: User[], me: ID | null): string {
  const others = c.participantIds.filter((id) => id !== me && id !== m.senderId);
  const readers = others
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u && u.readReceiptsEnabled !== false && !!m.readAtBy?.[u.id]);
  if (!readers.length) return 'Sent';
  // With only one other person there, their name says more than "everyone".
  if (readers.length === others.length && others.length > 1) return 'Seen by everyone';
  const first = readers.slice(0, 3).map((u) => u.name.trim().split(/\s+/)[0]);
  const more = readers.length - first.length;
  return `Seen by ${first.join(', ')}${more > 0 ? ` +${more}` : ''}`;
}
