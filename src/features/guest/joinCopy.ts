import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { JoinAsk } from './joinAsk';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface JoinCopy {
  /** The action's own icon, drawn in the brand colour above the headline. */
  icon: IconName;
  /** A short line about the action itself: "Like a clip to cheer them on." */
  headline: string;
  /** One plain line naming the person, when there is one: "Join CourtSide to let Sam know you liked it." */
  line: string;
}

/**
 * What the sign-up prompt says for each thing a visitor tried (Nov 28, owner: "for tapping a like.
 * do what instagram facebook or strava or any big companies like this would do"): the way X's
 * signed-out prompt does it, an icon of that action, a headline about that action, and one line
 * naming the person it was for. Anything not listed keeps the plain "Join CourtSide to …".
 */
export function joinCopy(ask: Pick<JoinAsk, 'what' | 'who' | 'target'>): JoinCopy {
  const what = ask.what;
  const who = (ask.who || ask.target?.host || '').trim();
  const name = who || 'the player';
  switch (what) {
    case 'like posts':
      return { icon: 'heart-outline', headline: 'Like a clip to cheer them on.', line: `Join CourtSide to let ${name} know you liked it.` };
    case 'like comments':
      return { icon: 'heart-outline', headline: 'Like a comment to back it up.', line: `Join CourtSide to let ${name} know you liked it.` };
    case 'comment':
      return { icon: 'chatbubble-outline', headline: 'Join the conversation.', line: who ? `Join CourtSide to comment on ${who}’s post.` : 'Join CourtSide to add your comment.' };
    case 'reply':
      return { icon: 'chatbubble-outline', headline: 'Join the conversation.', line: who ? `Join CourtSide to reply to ${who}.` : 'Join CourtSide to add your reply.' };
    case 'follow players':
      return { icon: 'person-add-outline', headline: who ? `Follow ${who} to see their sessions.` : 'Follow players to see their sessions.', line: 'Join CourtSide so their clips and sessions show up in your feed.' };
    case 'save posts':
      return { icon: 'bookmark-outline', headline: 'Save clips to watch later.', line: who ? `Join CourtSide to keep ${who}’s clip for later.` : 'Join CourtSide to keep the clips you want to watch again.' };
    case 'save threads':
      return { icon: 'bookmark-outline', headline: 'Save threads to read later.', line: 'Join CourtSide to keep the threads you want to come back to.' };
    case 'save or report this':
      return { icon: 'bookmark-outline', headline: 'Save or report this post.', line: 'Join CourtSide to save posts and report anything that breaks the rules.' };
    case 'report this':
      return { icon: 'flag-outline', headline: 'Report this.', line: 'Join CourtSide to report it, or email us and we’ll take a look.' };
    case 'join this hit':
      return { icon: 'tennisball-outline', headline: who ? `Hit with ${who}.` : 'Join this hit.', line: `Join CourtSide to tell ${who || 'the host'} you’re in.` };
    case 'post a hit':
      return { icon: 'tennisball-outline', headline: 'Find someone to hit with.', line: 'Join CourtSide to post a time and a court, and players near you can join.' };
    case 'message players':
      return { icon: 'chatbubbles-outline', headline: who ? `Message ${who}.` : 'Message players.', line: 'Join CourtSide to send messages and set up a hit.' };
    case 'send this to friends':
      return { icon: 'paper-plane-outline', headline: 'Send it to a friend.', line: 'Join CourtSide to share clips and threads in your chats.' };
    case 'vote':
      return { icon: 'arrow-up-outline', headline: 'Vote up what helps.', line: 'Join CourtSide to vote on threads and replies.' };
    default:
      break;
  }
  // "join Sam’s hit" (an open hit's I'm in, GuestFindPlayers).
  if (/^join .+ hit$/.test(what)) return joinCopy({ what: 'join this hit', who: who || undefined });
  return { icon: 'person-circle-outline', headline: `Join CourtSide to ${what}.`, line: 'It’s free. Post your clips, find people to hit with, and ask real coaches about your game.' };
}
