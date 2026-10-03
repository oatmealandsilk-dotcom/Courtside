import type { Conversation, HitRequest, ID, Message, User } from '@/data/types';
import { isOnlyLink } from '@/lib/links';
import { knownLinkTitle } from './linkPreview';

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
 * Muted for this one message: the chat is muted and the message doesn't
 * @mention you. The server's alert rule (push_for_message, migration 54):
 * a mention still gets through a mute.
 */
export function isMutedFor(c: Conversation, m: Message, myHandle: string | undefined): boolean {
  if (!isMuted(c)) return false;
  if (!myHandle) return true;
  const mine = myHandle.toLowerCase();
  return ![...m.body.matchAll(/@([A-Za-z0-9_]{2,24})/g)].some((hit) => hit[1].toLowerCase() === mine);
}

/**
 * What a message was, in a few words: its own words, or "Sent a court",
 * "Sent a voice message", "Sent 3 photos" for the kinds with none. The
 * inbox's second line and the message banner both say it this way (and the
 * phone alert, from migration 61, in the same words).
 */
export function messageSummary(m?: Message): string {
  if (!m) return 'Say hello';
  if (m.kind === 'photo') return photoWords(m.photos?.length ?? 1);
  if (m.kind === 'court') return 'Sent a court';
  if (m.kind === 'post') return 'Sent a clip';
  if (m.kind === 'question') return 'Sent a discussion';
  if (m.kind === 'profile') return 'Shared a profile';
  if (m.kind === 'voice') return 'Sent a voice message';
  if (m.kind === 'hit-request') return 'Sent a hit';
  // A message that is only a link reads as what it links to ("Sliding on clay…"), never as its address.
  const link = m.kind === 'text' ? isOnlyLink(m.body) : null;
  if (link) return knownLinkTitle(link.url) ?? 'Sent a link';
  return m.body || 'Say hello';
}

/** "Sent a photo", "Sent 3 photos". */
export const photoWords = (count: number) => (count > 1 ? `Sent ${count} photos` : 'Sent a photo');

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

/**
 * You are a group's only admin and others are still in it. Leaving then
 * hands the admin role on: the server gives it to whoever has been in the
 * group longest (ensure_group_admin, migration 54).
 */
export const isOnlyAdmin = (c: Conversation, me: ID | null | undefined) =>
  !!me && isGroupChat(c) && hasGroupControls(c) && isGroupAdmin(c, me) && (c.adminIds?.length ?? 0) === 1 && c.participantIds.length > 1;

/**
 * What "Leave this group?" says, honest about what leaving does there, in a
 * sentence (two at most) so the card stays small. The last one in it: the
 * server deletes the group (leave_group, migration 54), so nobody is left to
 * add you back. In the chat of a hit you are in: your spot goes, and being
 * added back doesn't return it. Its only admin: whoever has been in it
 * longest runs it next.
 */
export function leaveGroupMessage(c: Conversation, hits: HitRequest[], me: ID | null | undefined): string {
  const inHit = holdsHitSpot(hits, c.id, me);
  if (c.participantIds.length <= 1) return `You’re the only one here, so the group and its messages are deleted.${inHit ? ' Your spot in the hit goes too.' : ''}`;
  return `Someone in it can add you back${inHit ? ', but not to your spot in the hit' : ''}.${isOnlyAdmin(c, me) ? ' Whoever’s been in it longest becomes admin.' : ''}`;
}

/**
 * What "Remove June?" says, in one sentence. In a hit's chat, June's "I'm in"
 * goes with them (remove_group_member does the same) and adding June back
 * doesn't bring it back, so it says so rather than suggesting it can all be
 * undone.
 */
export const removeMemberMessage = (who: Named, givesUpSpot: boolean) =>
  `${who.first} won’t get new messages${givesUpSpot ? ' and loses their spot in the hit' : ''}.`;

/** First names in a sentence: "Dev", "Dev and June", "Dev, June and Mira", "Dev, June and 3 others". */
export function nameList(firsts: string[]): string {
  if (!firsts.length) return 'someone';
  if (firsts.length === 1) return firsts[0];
  if (firsts.length <= 3) return `${firsts.slice(0, -1).join(', ')} and ${firsts[firsts.length - 1]}`;
  return `${firsts[0]}, ${firsts[1]} and ${firsts.length - 2} others`;
}

/**
 * How a note names someone: `first` is their first name; `label` is the same
 * with their @handle beside it when someone else here (you included) has
 * that first name too, so a note about one of two William Goodwins, read by
 * a William, says which one. A sentence uses `label` the first time and
 * `first` after that.
 */
export type Named = { first: string; label: string };

const firstNameOf = (u: User) => u.name.trim().split(/\s+/)[0] || u.handle;

export function named(u: User, users: User[]): Named {
  const first = firstNameOf(u);
  const twin = users.some((x) => x.id !== u.id && firstNameOf(x).toLowerCase() === first.toLowerCase());
  return { first, label: twin ? `${first} (@${u.handle})` : first };
}

/*
 * Why someone can't be picked, said where it can be read (the pickers show it
 * as a note that stays, not a toast that slips away). The rule is the
 * server's: someone not known to be an adult (a teen, or an account with no
 * birthday given yet) can only be messaged or put in a group by people they
 * follow. The words name the person and never guess at "he" or "she"; they
 * never say why the account is protected, since that would tell everyone
 * it belongs to a teen. Nor do they tell you to go and ask for a follow: the
 * rule is there to keep strangers from reaching these accounts, so the note
 * only says what the rule is.
 */

/** "Only people Dev follows can message Dev." Without a name: "This player…". */
export const chatLockNote = (who?: Named) =>
  (who ? `Only people ${who.label} follows can message ${who.first}.` : 'This player can only be messaged by people they follow.');

/**
 * "Only people Dev follows can add Dev to a group." With `pickedAlready`,
 * they are among the people ticked, so it also says the way on: take them
 * out. With nobody named (the app couldn't tell who), the rule alone.
 */
export function groupLockNote(whos: Named[], pickedAlready = false): string {
  if (!whos.length) return 'Someone you picked can only be added to a group by people they follow.';
  if (whos.length === 1) {
    const [w] = whos;
    return `Only people ${w.label} follows can add ${w.first} to a group.${pickedAlready ? ` Take ${w.first} out to carry on.` : ''}`;
  }
  return `${nameList(whos.map((w) => w.label))} can only be added to a group by people they follow.${pickedAlready ? ' Take them out to carry on.' : ''}`;
}

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
const names = (ids: ID[], users: User[], me: ID | null) => nameList(ids.map((id) => who(id, users, me, false)));

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
