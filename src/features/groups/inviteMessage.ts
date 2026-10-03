import type { ID } from '@/data/types';
import { shareLink } from '@/lib/shareLink';

/*
 * A group invite sent in a chat (Start a group's last step, and Invite on a
 * group's page) is a plain text message: "Join Sunday hitters on CourtSide:"
 * and the group's link. An app from before invites existed (a TestFlight or
 * phone build that hasn't updated) shows exactly that, a readable line with
 * a link that works, and the phone's alert reads it too. This app spots the
 * line and draws it as the group's invite card instead (GroupInviteCard).
 */

const LEAD = 'Join ';
const MIDDLE = ' on CourtSide: ';

/** The words of an invite to a group. */
export const groupInviteText = (name: string, id: ID) => `${LEAD}${name}${MIDDLE}${shareLink('group', id)}`;

const INVITE_RE = /^Join (.{1,60}) on CourtSide: https:\/\/(?:app|share)\.courtsidebase\.com\/g\/([A-Za-z0-9_-]{1,64})(?:\?ref=[a-z0-9_]{2,24})?$/;

/** The group a message invites to, when it is exactly an invite's words; otherwise null. */
export function readGroupInvite(body: string | undefined): { id: ID; name: string } | null {
  const m = body ? INVITE_RE.exec(body.trim()) : null;
  return m ? { name: m[1], id: m[2] } : null;
}
