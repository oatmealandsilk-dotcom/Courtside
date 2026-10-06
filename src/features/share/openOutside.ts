import { useEffect, useState } from 'react';

import { fetchSharePreview } from '@/data/api';
import type { ID, Post } from '@/data/types';

/**
 * Whether a post may leave CourtSide as a picture (Share as image): never
 * one shared to a group only; your own otherwise; anyone else's only when
 * the server would show it to someone with no account (share_preview,
 * migration 68: a public account known to be an adult, nothing taken down).
 * The app never learns anyone else's age, so it asks. Null while asking;
 * no answer (offline) counts as no.
 *
 * Asked once per post and remembered for a while, and asked ahead
 * (warmOpenOutside) as a post comes on screen in the feed, so a post's menu
 * opens already knowing: its Image button is there from the first frame or
 * not at all, rather than appearing (or vanishing) as the sheet rises.
 */

type Post_ = Pick<Post, 'id' | 'authorId' | 'groupId'>;

/** A real answer holds for ten minutes; no answer (offline, say) only for one, then it is asked again. */
const KEEP_MS = 10 * 60_000;
const KEEP_UNSURE_MS = 60_000;
const answers = new Map<ID, { open: boolean; until: number }>();
const asking = new Map<ID, Promise<boolean>>();

function known(id: ID): boolean | null {
  const hit = answers.get(id);
  if (!hit) return null;
  if (hit.until < Date.now()) { answers.delete(id); return null; }
  return hit.open;
}

function ask(id: ID): Promise<boolean> {
  const now = known(id);
  if (now !== null) return Promise.resolve(now);
  const already = asking.get(id);
  if (already) return already;
  const question = fetchSharePreview('post', id).then(
    (preview) => {
      const open = preview?.open === true;
      answers.set(id, { open, until: Date.now() + (preview ? KEEP_MS : KEEP_UNSURE_MS) });
      return open;
    },
    () => {
      answers.set(id, { open: false, until: Date.now() + KEEP_UNSURE_MS });
      return false;
    },
  ).finally(() => { asking.delete(id); });
  asking.set(id, question);
  return question;
}

/** The answer for a post without asking: true or false when it is settled here, null when the server has to be asked. */
function settled(post: Post_ | undefined, me: ID | null | undefined): boolean | null {
  if (!post) return null;
  if (post.groupId) return false;
  if (post.authorId === me) return true;
  return known(post.id);
}

/** Asks ahead for someone else's post (the feed, as it comes on screen), so its menu already knows. */
export function warmOpenOutside(post: Post_ | undefined, me: ID | null | undefined) {
  if (post && settled(post, me) === null) void ask(post.id);
}

export function useOpenOutside(post: Post_ | undefined, me: ID | null | undefined): boolean | null {
  const id = post?.id;
  const now = settled(post, me);
  const [answer, setAnswer] = useState<{ id: ID; open: boolean } | null>(null);
  useEffect(() => {
    if (!id || now !== null) return undefined;
    let on = true;
    void ask(id).then((open) => { if (on) setAnswer({ id, open }); });
    return () => { on = false; };
  }, [id, now]);
  if (now !== null) return now;
  return answer && answer.id === id ? answer.open : null;
}
