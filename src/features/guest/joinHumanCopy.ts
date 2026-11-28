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
 * by first name, the way a friend would put it: "Like Kai’s clip?", "Kai
 * posted this." Never a list of features. A clip is a clip, a photo a photo;
 * a post with neither is a post.
 *
 * Nothing they tapped is waiting for them after they sign up: only an open
 * hit's join is carried through (rememberShareTarget's joinHit, from the
 * peek). So no line promises that Kai will see a like, or that a follow or
 * a save will be there: they come back to the post and it is one tap (review,
 * Nov 28: "Kai will see your like when you join" was not true).
 */
export function humanCopy(ask: Pick<JoinAsk, 'what' | 'who' | 'target' | 'about'>, look: Exclude<JoinLook, 'today'>): HumanCopy {
  const full = (ask.who || ask.target?.host || ask.about?.person?.name || '').trim();
  const name = full.split(/\s+/)[0] ?? '';
  const thing = ask.about?.post?.kind ?? 'post';
  const theirs = name ? `${name}’s ${thing}` : `this ${thing}`;
  const what = /^join .+ hit$/.test(ask.what) ? 'join this hit' : ask.what;
  // Only an open hit's join waits for them through sign-up (the peek's "I'm in").
  const carried = !!ask.target?.joinHit;
  const back = 'It’s free, and we’ll bring you straight back here.';
  const oneTap = 'Join and it’s one tap. We’ll bring you straight back here.';
  const letterBack = 'It’s free. Once you’re in, we’ll bring you straight back here.';
  switch (look) {
    case 'a':
      switch (what) {
        case 'like posts': return { title: `Like ${theirs}?`, line: name ? `Join CourtSide to cheer ${name} on.` : 'Join CourtSide to cheer them on.' };
        case 'like comments': return { title: name ? `Like ${name}’s comment?` : 'Like this comment?', line: name ? `Join CourtSide to cheer ${name} on.` : 'Join CourtSide to cheer them on.' };
        case 'comment': return { title: `Comment on ${theirs}?`, line: name ? `Join CourtSide to tell ${name} what you think.` : 'Join CourtSide to say what you think.' };
        case 'reply': return { title: name ? `Reply to ${name}?` : 'Want to reply?', line: 'Join CourtSide to add yours.' };
        case 'follow players': return { title: name ? `Follow ${name}?` : 'Follow this player?', line: name ? `Join CourtSide to see ${name}’s clips in your feed.` : 'Join CourtSide to see their clips in your feed.' };
        case 'save posts': return { title: `Save ${theirs}?`, line: 'Join CourtSide to keep it for later.' };
        case 'save threads': return { title: 'Save this thread?', line: 'Join CourtSide to keep it for later.' };
        case 'join this hit': return { title: name ? `Hit with ${name}?` : 'Join this hit?', line: carried ? (name ? `Join CourtSide and ${name} will know you’re in.` : 'Join CourtSide and the host will know you’re in.') : (name ? `Join CourtSide to tell ${name} you’re in.` : 'Join CourtSide to say you’re in.') };
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
        case 'like posts': return { title: `Like ${theirs}?`, line: oneTap };
        case 'like comments': return { title: name ? `Like ${name}’s comment?` : 'Like this comment?', line: oneTap };
        case 'comment': return { title: name ? `Tell ${name} what you think.` : 'Say what you think.', line: `Join CourtSide to comment. We’ll bring you straight back to this ${thing}.` };
        case 'reply': return { title: name ? `Reply to ${name}?` : 'Want to reply?', line: `Join CourtSide to add yours. ${back}` };
        case 'follow players': return { title: name ? `Follow ${name}?` : 'Follow this player?', line: name ? `Join and it’s one tap. Then ${name}’s clips show up in your feed.` : 'Join and it’s one tap. Then their clips show up in your feed.' };
        case 'save posts': return { title: `Save ${theirs}?`, line: oneTap };
        case 'join this hit': return carried
          ? { title: name ? `Hit with ${name} when you join.` : 'Join the hit when you join CourtSide.', line: name ? `It’s free, and ${name} will know you’re in.` : 'It’s free, and the host will know you’re in.' }
          : { title: name ? `Hit with ${name}?` : 'Join this hit?', line: oneTap };
        case 'message players': return { title: name ? `Message ${name}?` : 'Send a message?', line: 'Join CourtSide to say hi or set up a hit. It’s free.' };
        default: return { title: `Join CourtSide to ${ask.what}.`, line: back };
      }
    case 'c':
      // One short line beside the two buttons: a question, as a friend would ask it.
      switch (what) {
        case 'like posts': return { title: `Like ${theirs}?`, line: '' };
        case 'like comments': return { title: name ? `Like ${name}’s comment?` : 'Like this comment?', line: '' };
        case 'comment': return { title: name ? `Comment on ${theirs}?` : 'Add a comment?', line: '' };
        case 'reply': return { title: name ? `Reply to ${name}?` : 'Want to reply?', line: '' };
        case 'follow players': return { title: name ? `Follow ${name}?` : 'Follow this player?', line: '' };
        case 'save posts': return { title: `Save ${theirs}?`, line: '' };
        case 'join this hit': return { title: name ? `Hit with ${name}?` : 'Join this hit?', line: '' };
        case 'message players': return { title: name ? `Message ${name}?` : 'Send a message?', line: '' };
        default: return { title: `Join to ${ask.what}?`, line: '' };
      }
    case 'd':
    default:
      // The person first, then what joining lets them do; two short lines where the person posted it.
      switch (what) {
        case 'like posts': return { title: name ? `${name} posted this.\nJoin to like it.` : `Join to like this ${thing}.`, line: letterBack };
        case 'like comments': return { title: name ? `${name} wrote this.\nJoin to like it.` : 'Join to like this comment.', line: letterBack };
        case 'comment': return { title: name ? `${name} posted this.\nJoin to comment.` : `Join to comment on this ${thing}.`, line: letterBack };
        case 'reply': return { title: name ? `Join to reply to ${name}.` : 'Join to reply.', line: letterBack };
        case 'follow players': return { title: name ? `Join to follow ${name}.` : 'Join to follow this player.', line: name ? `It’s free. Follow ${name} and their clips and sessions show up in your feed.` : 'It’s free. Follow them and their clips and sessions show up in your feed.' };
        case 'save posts': return { title: name ? `${name} posted this.\nJoin to save it.` : `Join to save this ${thing}.`, line: letterBack };
        case 'join this hit': return { title: name ? `Join to hit with ${name}.` : 'Join to say you’re in.', line: carried ? (name ? `It’s free, and ${name} will know you’re in.` : 'It’s free, and the host will know you’re in.') : letterBack };
        case 'message players': return { title: name ? `Join to message ${name}.` : 'Join to send a message.', line: 'It’s free. Set up a hit, or just say hi.' };
        case 'report this': return { title: 'Join CourtSide to report this.', line: 'Or, without an account, email us and we’ll take a look.' };
        default: return { title: `Join CourtSide to ${ask.what}.`, line: letterBack };
      }
  }
}
