import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';

/**
 * A post's own address, kept for links, notifications and shares — but there
 * is no separate page for a post: it opens the way it is seen everywhere
 * else, as a page of its author's feed, with comments and buttons in place.
 * An older post the app has not loaded yet is fetched first, so a link never
 * says "gone" about something that is still there.
 */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, ready, actions } = useApp();
  const post = posts.find((p) => p.id === id);
  const [looked, setLooked] = useState(false);

  useEffect(() => {
    if (!ready || post || looked || !id) return;
    void Promise.resolve(actions.loadPost(String(id))).catch(() => undefined).finally(() => setLooked(true));
  }, [ready, post, looked, id, actions]);

  if (!post) {
    return (
      <Screen title="Post" compactTitle onBack={() => goBack()}>
        {looked ? <EmptyState icon="lock-closed-outline" title="This post isn't available" body="It was deleted, or it's from a private account you don't follow." /> : <View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View>}
      </Screen>
    );
  }
  return <Redirect href={{ pathname: '/posts/[userId]', params: { userId: post.authorId, post: post.id, set: 'own' } }} />;
}
