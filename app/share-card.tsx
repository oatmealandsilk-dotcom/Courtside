import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtSpinner } from '@/components/CourtSpinner';
import { ShareCard } from '@/components/ShareCard';
import { ShareActions } from '@/components/share/ShareActions';
import { EmptyState, Screen } from '@/components/ui';
import { inviteLink } from '@/features/invite/referral';
import { useOpenOutside } from '@/features/share/openOutside';
import { exportStory, stageSize, storyNoteOk, warmStory, type StoryAction } from '@/features/share/storyImage';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing } from '@/theme';

/** What the page keeps for everything but the picture: the title and the buttons. */
const CHROME_H = 250;

/**
 * A post as an image, previewed as it will look, then shared: made for
 * Instagram Stories. The same page as sharing a session (share-session):
 * the picture in the room at the top, the same round buttons at the bottom
 * (Stories, Copy, Save, More), your invite link going along as words with
 * Copy and More, never on the picture (Oct 5, Strava's way), and what a
 * button did said in a toast. Only a post that may leave CourtSide
 * (useOpenOutside): never one shared to a group only, and someone else's
 * only when the server would show it to a stranger.
 *
 * The picture is drawn twice: small to look at, and once more out of sight
 * at exactly 1080 × 1920 pixels, which is the one photographed (storyImage.ts).
 */
export default function ShareCardScreen() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { posts, users, currentUser, currentUserId } = useApp();
  const post = posts.find((p) => p.id === id);
  const open = useOpenOutside(post, currentUserId);
  const author = post ? users.find((u) => u.id === post.authorId) : undefined;
  const { width, height } = useWindowDimensions();
  // As wide as the screen allows, and short enough that the buttons stay in view under it.
  const cardW = Math.floor(Math.max(160, Math.min(320, width - spacing.lg * 2, ((height - CHROME_H - insets.top - insets.bottom) * 9) / 16)));
  const stage = useRef<View>(null);
  const size = stageSize();
  const [busy, setBusy] = useState<StoryAction | null>(null);
  // In a browser the picture's drawing kit comes down now, so the first tap is quick.
  useEffect(() => { warmStory(); }, []);

  const run = async (action: StoryAction) => {
    if (!post || !open || busy) return;
    setBusy(action);
    try {
      const said = await exportStory(stage.current, action, author ? `${author.name} on CourtSide` : 'CourtSide', { sticker: false, top: colors.brand.slice(0, 7), bottom: colors.bg.slice(0, 7) }, currentUser?.handle ? inviteLink(currentUser.handle) : undefined);
      if (!said) haptics.commit();
      else if (storyNoteOk(said)) { haptics.commit(); showToast({ title: said, icon: 'checkmark-circle-outline', long: said.length > 40 }); }
      else showToast({ title: 'That didn’t work', body: said, icon: 'alert-circle-outline', long: true });
    } catch (error) {
      showToast({ title: 'That didn’t work', body: error instanceof Error && error.message ? error.message : 'The image could not be made. Try again.', icon: 'alert-circle-outline', long: true });
    } finally {
      setBusy(null);
    }
  };

  if (!post || open !== true) {
    return (
      <Screen title="Share as image" compactTitle onBack={() => goBack()} bar={false}>
        {!post ? (
          <EmptyState icon="image-outline" title="This post is not here any more" body="It may have been deleted or archived." />
        ) : open === null ? (
          <View style={styles.wait}><CourtSpinner size={28} /></View>
        ) : (
          <EmptyState icon="lock-closed-outline" title="This post stays on CourtSide" body={post.groupId ? 'It was shared with a group only.' : 'Only posts from public accounts can be shared as an image.'} />
        )}
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      {/* The copy that is photographed: full size, out of sight under the page. */}
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, size]}>
        <View ref={stage} collapsable={false} style={size}>
          <ShareCard post={post} author={author} width={size.width} />
        </View>
      </View>
      <View style={styles.page}>
        <Screen title="Share as image" compactTitle onBack={() => goBack()} bar={false} padded={false} scroll={false}>
          <View style={styles.body}>
            <View style={styles.top}>
              <View style={styles.frame}>
                <ShareCard post={post} author={author} width={cardW} />
              </View>
            </View>
            <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
              <ShareActions busy={busy} onRun={(a) => { void run(a); }} />
            </View>
          </View>
        </Screen>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  wait: { alignItems: 'center', paddingVertical: spacing.xxl },
  stage: { position: 'absolute', left: 0, top: 0 },
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg },
  body: { flex: 1 },
  top: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  bottom: { paddingTop: spacing.md },
  frame: { borderRadius: 18, overflow: 'hidden', boxShadow: '0px 8px 28px rgba(0, 0, 0, 0.28)' },
});
