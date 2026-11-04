import { setOpenRewrite } from '@/features/navigation/oneOpen';
import { tapFastOn } from '@/features/navigation/pressV2';

/**
 * A post opens in one slide (Nov 4, owner: "There's still way too much latency delay"). A post's own address
 * (/post/<id>: a notification, Search, Saved, a post shared in a chat, Your sessions, a city page, the admin pages)
 * has no page of its own: it slid in an empty "Post" page first, which then swapped itself for the post's feed page
 * (app/post/[id].tsx's Redirect), two pages built and two moves for one tap. When the app already has the post,
 * the router is asked for the feed page itself, in the tap's own call, so the real post is what slides in.
 *
 * Only for a post the app has, live, or archived and yours (the same choice the Redirect makes); anything else (a
 * post still to fetch, someone else's archived post, a guest on the website) goes through /post/<id> as before.
 * Changes when things happen on an iPhone, so behind taps answering sooner (TAP_FAST, admins first).
 */
export type PostSeen = { authorId: string; archived: boolean; mine: boolean };

const POST_HREF = /^\/post\/([^/?#]+)$/;

/** The feed page to open for /post/<id>, or null to open the address as asked. */
export function postFeedHref(href: string, find: (id: string) => PostSeen | null): string | null {
  const m = POST_HREF.exec(href);
  if (!m) return null;
  let id: string;
  try { id = decodeURIComponent(m[1]); } catch { return null; }
  const post = find(id);
  if (!post || (post.archived && !post.mine)) return null;
  const set = post.archived ? 'archived' : 'own';
  return `/posts/${encodeURIComponent(post.authorId)}?post=${encodeURIComponent(id)}&set=${set}`;
}

/** Called once by AppContext with a way to look a post up in what the app has now (null when signed out or a guest). */
export function setPostLookup(find: ((id: string) => PostSeen | null) | null) {
  setOpenRewrite(find ? (href) => (tapFastOn() ? postFeedHref(href, find) : null) : null);
}
