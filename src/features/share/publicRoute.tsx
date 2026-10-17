import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import type { ShareKind } from '@/data/types';
import { SharedPage } from '@/features/share/SharedPage';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/**
 * A page that a shared link can open: signed in, the page itself; signed
 * out, its public look (SharedPage) instead of a bounce to sign-in. AppShell
 * lets these addresses through without an account (see publicPaths).
 */
export function publicRoute(kind: ShareKind, Screen: React.ComponentType): React.ComponentType {
  function PublicRoute() {
    const { currentUserId, ready, authResolved, isGuest } = useApp();
    const { id } = useLocalSearchParams<{ id?: string }>();
    if (currentUserId) return <Screen />;
    if (!ready || !authResolved) return <Waiting />;
    // A guest reads a thread in the app itself, replies and all (guest mode, Oct 17).
    if (isGuest && kind === 'question') return <GuestThread id={String(id ?? '')} Screen={Screen} />;
    // And a clip or photo from a link plays in the app's own feed page (found in review, Oct 17:
    // the owner's "clicked a Reddit link ... view videos" case used to get only a still card).
    if (isGuest && kind === 'post') return <GuestPost id={String(id ?? '')} Screen={Screen} />;
    return <SharedPage kind={kind} id={String(id ?? '')} />;
  }
  PublicRoute.displayName = `PublicRoute(${kind})`;
  return PublicRoute;
}

const Waiting = () => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><CourtSpinner size={32} /></View>;

/**
 * A thread for a guest: the real thread page when it is one a guest may read
 * (guest_thread, migration 164), else the shared link's calm locked card,
 * which says nothing about whose it was.
 */
function GuestThread({ id, Screen }: { id: string; Screen: React.ComponentType }) {
  const { questions, actions } = useApp();
  const [looked, setLooked] = useState(false);
  const loadThread = actions.loadThread;
  useEffect(() => { let live = true; setLooked(false); void loadThread(id).finally(() => { if (live) setLooked(true); }); return () => { live = false; }; }, [id, loadThread]);
  if (questions.some((q) => q.id === id)) return <Screen />;
  return looked ? <SharedPage kind="question" id={id} /> : <Waiting />;
}

/**
 * A post for a guest: the real post page, the clip playing, when it is one
 * a guest may see (guest_post, migration 164), else the shared link's calm
 * locked card, which says nothing about whose it was.
 */
function GuestPost({ id, Screen }: { id: string; Screen: React.ComponentType }) {
  const { posts, actions } = useApp();
  const [looked, setLooked] = useState(false);
  const loadPost = actions.loadPost;
  useEffect(() => { let live = true; setLooked(false); void Promise.resolve(loadPost(id)).catch(() => false).finally(() => { if (live) setLooked(true); }); return () => { live = false; }; }, [id, loadPost]);
  if (posts.some((p) => p.id === id)) return <Screen />;
  return looked ? <SharedPage kind="post" id={id} /> : <Waiting />;
}
