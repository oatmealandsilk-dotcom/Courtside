import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { publicRoute } from '@/features/share/publicRoute';
import { colors } from '@/theme';
import Home from '../(tabs)/index';

/**
 * A post's own address, kept for links, notifications and shares — but there
 * is no separate page for a post: it opens the way it is seen everywhere
 * else, as a page of its author's feed, with comments and buttons in place.
 * An older post the app has not loaded yet is fetched first, so a link never
 * says "gone" about something that is still there.
 */
function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, ready, actions, currentUserId, isGuest } = useApp();
  const post = posts.find((p) => p.id === id);
  const [looked, setLooked] = useState(false);

  useEffect(() => {
    if (!ready || post || looked || !id) return;
    void Promise.resolve(actions.loadPost(String(id))).catch(() => undefined).finally(() => setLooked(true));
  }, [ready, post, looked, id, actions]);

  // An archived post is only ever yours to see, and it opens among your archived
  // ones: your feed of live posts leaves it out, and used to open the newest instead.
  const archivedMine = !!post?.archived && post.authorId === currentUserId;
  if (!post || (post.archived && !archivedMine)) {
    return (
      <Screen title="Post" compactTitle onBack={() => goBack()}>
        {looked || post ? <EmptyState icon="lock-closed-outline" title="This post isn't available" body={post ? 'Whoever posted it has archived it.' : "It was deleted, or it's from a private account you don't follow."} /> : <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View>}
      </Screen>
    );
  }
  // A guest (guest mode, Oct 17) reads it right here, in the same full-screen feed page,
  // opened on this post: the author's other posts a guest may see follow it.
  if (isGuest) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
        <Home scope={{ userId: post.authorId, set: 'own', start: post.id }} />
      </View>
    );
  }
  return <Redirect href={{ pathname: '/posts/[userId]', params: { userId: post.authorId, post: post.id, set: archivedMine ? 'archived' : 'own' } }} />;
}

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('post', PostDetail);
