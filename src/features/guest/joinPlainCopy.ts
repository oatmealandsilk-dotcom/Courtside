import type { JoinAsk } from './joinAsk';

/** What the plain sign-up ask says: a first line (two short ones where the person posted it) and one plain line under it. */
export interface PlainCopy {
  title: string;
  line: string;
}

/**
 * The words of the plain sign-up ask (joinLook 'plain'; Nov 28, owner, of four
 * takes: "i think d is solid"). The person first, by first name, then what
 * joining lets them do: "Kai posted this. / Join to like it." Never a list of
 * features. A clip is a clip, a photo a photo; a post with neither is a post.
 *
 * Every line must be true (review, Nov 28):
 * - Nothing they tapped goes through by itself once they are in. So no line
 *   says Kai will see a like, or that a follow or a save will be there: they
 *   come back and it is one tap. An open hit's "I'm in" on the way to a new
 *   account is joined for them (rememberShareTarget's joinHit), but only with
 *   a birthday that says 18 or over (useShareLanding), and not on "Log in": so
 *   it promises the hit's page, not the join.
 * - "we'll bring you straight back here" only when `back`: the page they are
 *   on has its own address, or the post or hit it is about does (JoinPlain
 *   remembers that address; useShareLanding opens it once they are in). On a
 *   tab's own page (the Feed, whose clip is not in its address), with nothing
 *   named, they would land on the tab's top, so it says only that it is free.
 */
export function plainCopy(ask: Pick<JoinAsk, 'what' | 'who' | 'target' | 'post'>, back: boolean): PlainCopy {
  const full = (ask.who || ask.target?.host || '').trim();
  const name = full.split(/\s+/)[0] ?? '';
  const thing = ask.post?.kind ?? 'post';
  const what = /^join .+ hit$/.test(ask.what) ? 'join this hit' : ask.what;
  const free = back ? 'It’s free. Once you’re in, we’ll bring you straight back here.' : 'It’s free.';
  switch (what) {
    case 'like posts': return { title: name ? `${name} posted this.\nJoin to like it.` : `Join to like this ${thing}.`, line: free };
    case 'like comments': return { title: name ? `${name} wrote this.\nJoin to like it.` : 'Join to like this comment.', line: free };
    case 'comment': return { title: name ? `${name} posted this.\nJoin to comment.` : `Join to comment on this ${thing}.`, line: free };
    case 'reply': return { title: name ? `Join to reply to ${name}.` : 'Join to reply.', line: free };
    case 'follow players': return { title: name ? `Join to follow ${name}.` : 'Join to follow this player.', line: name ? `It’s free. Follow ${name} and their clips and sessions show up in your feed.` : 'It’s free. Follow them and their clips and sessions show up in your feed.' };
    case 'save posts': return { title: name ? `${name} posted this.\nJoin to save it.` : `Join to save this ${thing}.`, line: free };
    // An open hit's I'm in (GuestFindPlayers) remembers the hit's own page: that is where they land.
    case 'join this hit': return { title: name ? `Join to hit with ${name}.` : 'Join to say you’re in.', line: ask.target ? `It’s free. Once you’re in, we’ll take you straight to ${name ? `${name}’s` : 'the'} hit.` : free };
    case 'message players': return { title: name ? `Join to message ${name}.` : 'Join to send a message.', line: 'It’s free. Set up a hit, or just say hi.' };
    case 'report this': return { title: 'Join CourtSide to report this.', line: 'Or, without an account, email us and we’ll take a look.' };
    default: return { title: `Join CourtSide to ${ask.what}.`, line: free };
  }
}
