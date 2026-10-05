import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams, useNavigation, useRoute } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { SessionSheet, SessionSheetHeader } from '@/components/session/SessionSheet';
import { StageRail } from '@/components/StageRail';
import { getStage, markGone, markMounted, setCovered, stageKeyOf, useStageSelect } from '@/features/feed/commentStage';
import { useApp } from '@/store/AppContext';
import { postZones } from '@/features/activity/zones';
import { startRematch } from '@/features/hits/rematch';
import { goHome } from '@/lib/goBack';
import { colors, spacing, typography } from '@/theme';

/**
 * A post's session stats as a sheet. From a clip's "See stats" pill in the
 * Feed it takes the comments' stage (see commentStage): the clip stays
 * playing, with sound, shrunk into the room above the sheet, the small rail
 * beside it and the tab bar out of the way. From a post's card or the strip
 * under a photo, a link or an alert, it is the plain sheet over a dimmed page.
 * The stage is adopted exactly the way the comments adopt it.
 */
export default function SessionStatsSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const { id = '', stage: stageParam } = useLocalSearchParams<{ kind?: string; id?: string; stage?: string }>();
  const key = stageKeyOf('post', id);
  const [adopted] = useState(() => {
    const now = getStage();
    if (!now || now.ending || now.key !== key) return null;
    if (now.mode === 'side') return { id: now.id, geo: null };
    return stageParam === '1' && now.geo ? { id: now.id, geo: now.geo } : null;
  });
  const stage = adopted?.geo ?? null;
  const staged = !!stage;
  const stageNow = useStageSelect((s) => (adopted && s?.id === adopted.id ? (s.lost ? 'lost' : 'up') : 'off'));
  const mine = stageNow !== 'off';
  useLayoutEffect(() => { if (adopted) markMounted(adopted.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (adopted) markGone(adopted.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const focused = useIsFocused();
  useEffect(() => { if (mine) setCovered(!focused); }, [focused, mine]);
  const navigation = useNavigation();
  const route = useRoute();
  const leave = () => {
    if (navigation.isFocused()) {
      // Opened cold (a link, an alert): nothing underneath to go back to, so
      // the post itself, or Home when there is no post.
      if (router.canGoBack()) router.back();
      else if (post) router.replace(`/post/${post.id}`);
      else goHome();
      return;
    }
    navigation.dispatch({ type: 'POP', payload: { count: 1 }, source: route.key, target: navigation.getState()?.key });
  };
  const [closeSignal, setCloseSignal] = useState(0);
  const close = useCallback(() => setCloseSignal((n) => n + 1), []);
  useEffect(() => { if (stageNow === 'lost' && focused) close(); }, [stageNow, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [close]));

  const { posts, users, currentUserId, sessions, sessionTags, detectedActivities, blockedIds, actions } = useApp();
  const post = posts.find((p) => p.id === id);
  // A post opened from a link may not be loaded yet: it is fetched once.
  const [looked, setLooked] = useState(!!post);
  useEffect(() => {
    if (post || !id) { setLooked(true); return undefined; }
    let on = true;
    void Promise.resolve(actions.loadPost(id)).catch(() => undefined).finally(() => { if (on) setLooked(true); });
    return () => { on = false; };
  }, [post, id, actions]);
  // Editing goes to the log's own sheet; this one steps out of the way first.
  const edit = (sessionId: string) => { router.push({ pathname: '/log-session', params: { edit: sessionId } }); };
  const sparse = !post?.session || (!post.session.maxHr && !postZones(post.session) && post.session.strain == null && !post.session.kcal);
  // No zone rows and no "Only you" box: a short sheet, opened only as tall as it needs.
  const ownTracker = !!post?.session?.activityId && post.authorId === currentUserId && detectedActivities.some((a) => a.id === post.session?.activityId);
  const short = !!post?.session && !postZones(post.session) && !ownTracker;
  const [contentH, setContentH] = useState(0);

  return (
    <>
      {staged && focused ? <StatusBar style="light" animated /> : null}
      <DragSheet
        closeSignal={closeSignal}
        onDismissed={leave}
        peekFraction={sparse ? 0.46 : 0.64}
        fitContent={short && !staged}
        contentHeight={short && contentH ? contentH : undefined}
        active={focused}
        side
        stage={stage}
        stageOverlay={staged ? <StageRail kind="post" id={id} /> : undefined}
        header={post ? <SessionSheetHeader post={post} onClose={close} /> : <View style={styles.headPad} />}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} onAccessibilityEscape={close} onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
          {post?.session ? (
            <SessionSheet
              post={post}
              me={currentUserId}
              users={users}
              sessions={sessions}
              sessionTags={sessionTags}
              activities={detectedActivities}
              hidden={blockedIds}
              onEdit={edit}
              onShare={() => router.push({ pathname: '/share-session', params: { post: post.id } })}
              onRematch={startRematch}
              canAsk={actions.canMessage}
            />
          ) : !looked ? (
            <View style={styles.wait}><CourtSpinner size={30} /></View>
          ) : (
            <Text style={styles.gone}>This is no longer available.</Text>
          )}
        </ScrollView>
      </DragSheet>
    </>
  );
}

const styleDefinitions = StyleSheet.create({
  scroll: { paddingTop: spacing.sm },
  headPad: { height: 30 },
  wait: { alignItems: 'center', paddingVertical: spacing.xxl },
  gone: { ...typography.body, color: colors.textMuted, padding: spacing.xl },
});
