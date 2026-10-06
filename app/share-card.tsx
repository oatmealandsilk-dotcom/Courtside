import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { ShareCard } from '@/components/ShareCard';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useOpenOutside } from '@/features/share/openOutside';
import { shareCard, warmShareCard } from '@/features/share/shareCard';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * A post as an image, previewed as it will look, then shared: made for
 * Instagram Stories. Only a post that may leave CourtSide (useOpenOutside):
 * never one shared to a group only, and someone else's only when the server
 * would show it to a stranger.
 */
export default function ShareCardScreen() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { posts, users, currentUserId } = useApp();
  const post = posts.find((p) => p.id === id);
  const open = useOpenOutside(post, currentUserId);
  const author = post ? users.find((u) => u.id === post.authorId) : undefined;
  const { width, height } = useWindowDimensions();
  // As wide as the screen allows, and short enough that the button stays in view.
  const cardW = Math.floor(Math.min(360, width - spacing.lg * 2, ((height - 260) * 9) / 16));
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // In a browser the card's drawing kit comes down now, so Share is instant.
  useEffect(() => { warmShareCard(); }, []);

  const share = async () => {
    if (!post || !open) return;
    setBusy(true);
    setNote('');
    try {
      const said = await shareCard(card.current, author ? `${author.name} on CourtSide` : 'CourtSide');
      if (said) setNote(said);
      else haptics.commit();
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : 'The image could not be made. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Share as image" compactTitle onBack={() => goBack()}>
      {!post ? (
        <EmptyState icon="image-outline" title="This post is not here any more" body="It may have been deleted or archived." />
      ) : open === null ? (
        <View style={styles.wait}><CourtSpinner size={28} /></View>
      ) : !open ? (
        <EmptyState icon="lock-closed-outline" title="This post stays on CourtSide" body={post.groupId ? 'It was shared with a group only.' : 'Only posts from public accounts can be shared as an image.'} />
      ) : (
        <View style={styles.body}>
          <View style={styles.frame}>
            <View ref={card} collapsable={false}>
              <ShareCard post={post} author={author} width={cardW} />
            </View>
          </View>
          <Button label="Share" onPress={() => { void share(); }} loading={busy} full />
          <Text style={note ? styles.note : styles.fine}>{note || (Platform.OS === 'android' ? 'Post it to your Instagram story or send it to an app.' : 'Post it to your Instagram story, send it, or save it to your photos.')}</Text>
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { gap: spacing.lg, alignItems: 'center', paddingBottom: spacing.xxl },
  wait: { alignItems: 'center', paddingVertical: spacing.xxl },
  frame: { borderRadius: 18, overflow: 'hidden', boxShadow: '0px 8px 28px rgba(0, 0, 0, 0.28)' },
  fine: { ...typography.caption, color: colors.textFaint, textAlign: 'center', letterSpacing: 0 },
  note: { ...typography.small, color: colors.text, textAlign: 'center' },
});
