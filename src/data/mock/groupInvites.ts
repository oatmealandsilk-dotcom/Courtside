import type { FeedGroupInvite, Notification } from '../types';
import { demoDiscoverGroups } from './groups';
import { CURRENT_USER_ID } from './users';

/*
 * The demo's invites to groups (migration 181): Mira asked you into Silver
 * Lake sunrise a couple of hours ago, Dev into Venice rallies yesterday.
 * Both groups are ones Find groups lists. Join one and you're in (the
 * demo's player is in two groups already, so joining the second says you're
 * in three). Each left its notification, as the server files it. Only
 * without a database; a real account's come from my_feed_group_invites().
 */

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const invite = (groupId: string, inviterId: string, hours: number): FeedGroupInvite => {
  const g = demoDiscoverGroups.find((x) => x.id === groupId)!;
  return { groupId, name: g.name, description: g.description, ask: g.ask, look: g.look, memberCount: g.members.length, inviterId, createdAt: hoursAgo(hours) };
};

export const demoGroupInvites = (): FeedGroupInvite[] => [invite('g-silverlake', 'u-mira', 2), invite('g-venice', 'u-dev', 26)];

export const demoGroupInviteNotifications = (): Notification[] => demoGroupInvites().map((i) => ({
  id: `n-group-invite-${i.groupId}`,
  userId: CURRENT_USER_ID,
  actorId: i.inviterId,
  kind: 'group-invite',
  targetId: i.groupId,
  targetKind: 'group',
  createdAt: i.createdAt,
  read: false,
  preview: i.name,
}));
