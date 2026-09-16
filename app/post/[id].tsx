import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';

/**
 * A post's own address, kept for links, notifications and shares — but there
 * is no separate page for a post: it opens the way it is seen everywhere
 * else, as a page of its author's feed, with comments and buttons in place.
 */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, ready } = useApp();
  const post = posts.find((p) => p.id === id);

  if (!post) {
    return (
      <Screen title="Post" compactTitle onBack={() => goBack()}>
        <EmptyState icon="alert-circle-outline" title={ready ? 'This post is gone' : 'Loading…'} />
      </Screen>
    );
  }
  return <Redirect href={{ pathname: '/posts/[userId]', params: { userId: post.authorId, post: post.id, set: 'own' } }} />;
}
