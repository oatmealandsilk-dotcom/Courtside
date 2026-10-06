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
 */
export function useOpenOutside(post: Pick<Post, 'id' | 'authorId' | 'groupId'> | undefined, me: ID | null | undefined): boolean | null {
  const id = post?.id;
  const group = !!post?.groupId;
  const theirs = !!post && post.authorId !== me;
  const [answer, setAnswer] = useState<{ id: ID; open: boolean } | null>(null);
  useEffect(() => {
    if (!id || group || !theirs) return undefined;
    let on = true;
    void fetchSharePreview('post', id).then(
      (preview) => { if (on) setAnswer({ id, open: preview?.open === true }); },
      () => { if (on) setAnswer({ id, open: false }); },
    );
    return () => { on = false; };
  }, [id, group, theirs]);
  if (!post) return null;
  if (group) return false;
  if (!theirs) return true;
  return answer && answer.id === id ? answer.open : null;
}
