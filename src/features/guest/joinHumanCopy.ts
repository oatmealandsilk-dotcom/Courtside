import type { JoinAsk } from './joinAsk';
import type { JoinLook } from './joinLook';

/** What one of the four sign-up looks says: a first line and, under it, one more. */
export interface HumanCopy {
  title: string;
  line: string;
}

/**
 * The words for the four sign-up looks (joinLook a-d; Nov 28, owner: "does not
 * seem human and seems like ai toy like"). About the person and their post,
 * by first name, the way a friend would put it: "Like Kai’s clip?", "Kai will
 * see your like when you join." Never a list of features. A clip is a clip, a
 * photo a photo; a post with neither is a post. Anything not listed keeps a
 * plain "Join CourtSide to …".
 */
export function humanCopy(ask: Pick<JoinAsk, 'what' | 'who' | 'target' | 'about'>, look: Exclude<JoinLook, 'today'>): HumanCopy {
  const full = (ask.who || ask.target?.host || ask.about?.person?.name || '').trim();
  const name = full.split(/\s+/)[0] ?? '';
  const thing = ask.about?.post?.kind ?? 'post';
  const theirs = name ? `${name}’s ${thing}` : `this ${thing}`;
  const what = /^join .+ hit$/.test(ask.what) ? 'join this hit' : ask.what;
  const back = 'It’s free, and we’ll bring you straight back here.';
  switch (look) {
    case 'a':
      switch (what) {
        case 'like posts': return { title: `Like ${theirs}?`, line: name ? `Join CourtSide so ${name} knows.` : 'Join CourtSide so they know.' };
        case 'like comments': return { title: name ? `Like ${name}’s comment?` : 'Like this comment?', line: name ? `Join CourtSide so ${name} knows.` : 'Join CourtSide so they know.' };
        case 'comment': return { title: `Comment on ${theirs}?`, line: name ? `Join CourtSide to tell ${name} what you think.` : 'Join CourtSide to say what you think.' };
        case 'reply': return { title: name ? `Reply to ${name}?` : 'Want to reply?', line: 'Join CourtSide to add yours.' };
        case 'follow players': return { title: name ? `Follow ${name}?` : 'Follow this player?', line: name ? `Join CourtSide and ${name}’s clips show up in your feed.` : 'Join CourtSide and their clips show up in your feed.' };
        case 'save posts': return { title: `Save ${theirs}?`, line: 'Join CourtSide to keep it for later.' };
        case 'save threads': return { title: 'Save this thread?', line: 'Join CourtSide to keep it for later.' };
        case 'join this hit': return { title: name ? `Hit with ${name}?` : 'Join this hit?', line: name ? `Join CourtSide to tell ${name} you’re in.` : 'Join CourtSide to say you’re in.' };
        case 'post a hit': return { title: 'Looking for a hit?', line: 'Join CourtSide to post a time and a court.' };
        case 'message players': return { title: name ? `Message ${name}?` : 'Send a message?', line: 'Join CourtSide to say hi or set up a hit.' };
        case 'send this to friends': return { title: 'Send this to a friend?', line: 'Join CourtSide to share it in your chats.' };
        case 'vote': return { title: 'Vote on this?', line: 'Join CourtSide to vote up what helps.' };
        case 'post': return { title: 'Got a clip to share?', line: 'Join CourtSide to post it.' };
        case 'ask a coach': return { title: 'Ask a coach?', line: 'Join CourtSide to ask about your game.' };
        default: return { title: `Join CourtSide to ${ask.what}?`, line: 'It’s free.' };
      }
    case 'b':
      switch (what) {
        case 'like posts': return name ? { title: `${name} will see your like when you join.`, line: back } : { title: `Join to like this ${thing}.`, line: back };
        case 'like comments': return name ? { title: `${name} will see your like when you join.`, line: back } : { title: 'Join to like this comment.', line: back };
        case 'comment': return { title: name ? `Tell ${name} what you think.` : 'Say what you think.', line: `Join CourtSide to comment. We’ll bring you straight back to this ${thing}.` };
        case 'reply': return { title: name ? `Reply to ${name} when you join.` : 'Reply when you join.', line: back };
        case 'follow players': return name ? { title: `Follow ${name} when you join.`, line: `${name}’s clips and sessions will show up in your feed.` } : { title: 'Follow them when you join.', line: 'Their clips and sessions will show up in your feed.' };
        case 'save posts': return { title: `Keep ${theirs} for later.`, line: 'Join CourtSide to save it. We’ll bring you straight back here.' };
        case 'join this hit': return { title: name ? `Hit with ${name} when you join.` : 'Join the hit when you join CourtSide.', line: name ? `It’s free, and ${name} will know you’re in.` : 'It’s free, and the host will know you’re in.' };
        case 'message players': return { title: name ? `Message ${name} when you join.` : 'Send a message when you join.', line: 'It’s free. Set up a hit, or just say hi.' };
        default: return { title: `Join CourtSide to ${ask.what}.`, line: back };
      }
    case 'c':
      switch (what) {
        case 'like posts': return { title: `Join to like ${theirs}`, line: '' };
        case 'like comments': return { title: name ? `Join to like ${name}’s comment` : 'Join to like this comment', line: '' };
        case 'comment': return { title: `Join to comment on ${theirs}`, line: '' };
        case 'reply': return { title: name ? `Join to reply to ${name}` : 'Join to reply', line: '' };
        case 'follow players': return { title: name ? `Join to follow ${name}` : 'Join to follow this player', line: '' };
        case 'save posts': return { title: `Join to save ${theirs}`, line: '' };
        case 'join this hit': return { title: name ? `Join to hit with ${name}` : 'Join to say you’re in', line: '' };
        case 'message players': return { title: name ? `Join to message ${name}` : 'Join to send a message', line: '' };
        default: return { title: `Join CourtSide to ${ask.what}`, line: '' };
      }
    case 'd':
    default:
      switch (what) {
        case 'like posts': return { title: name ? `Join CourtSide to let ${name} know you liked this ${thing}.` : `Join CourtSide to like this ${thing}.`, line: 'It’s free. Once you’re in, we’ll bring you straight back here.' };
        case 'like comments': return { title: name ? `Join CourtSide to let ${name} know you liked their comment.` : 'Join CourtSide to like this comment.', line: 'It’s free. Once you’re in, we’ll bring you straight back here.' };
        case 'comment': return { title: `Join CourtSide to comment on ${theirs}.`, line: 'It’s free. Once you’re in, we’ll bring you straight back here.' };
        case 'reply': return { title: name ? `Join CourtSide to reply to ${name}.` : 'Join CourtSide to reply.', line: 'It’s free. Once you’re in, we’ll bring you straight back here.' };
        case 'follow players': return { title: name ? `Join CourtSide to follow ${name}.` : 'Join CourtSide to follow this player.', line: name ? `${name}’s clips and sessions will show up in your feed.` : 'Their clips and sessions will show up in your feed.' };
        case 'save posts': return { title: `Join CourtSide to keep ${theirs} for later.`, line: 'It’s free. Once you’re in, we’ll bring you straight back here.' };
        case 'join this hit': return { title: name ? `Join CourtSide to hit with ${name}.` : 'Join CourtSide to join this hit.', line: name ? `It’s free, and ${name} will know you’re in.` : 'It’s free, and the host will know you’re in.' };
        case 'message players': return { title: name ? `Join CourtSide to message ${name}.` : 'Join CourtSide to send a message.', line: 'It’s free. Set up a hit, or just say hi.' };
        case 'report this': return { title: 'Join CourtSide to report this.', line: 'Or, without an account, email us and we’ll take a look.' };
        default: return { title: `Join CourtSide to ${ask.what}.`, line: 'It’s free. Once you’re in, we’ll bring you straight back here.' };
      }
  }
}
