import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Reanimated, { runOnJS, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { SectionPager } from '@/components/SectionPager';
import { TileCover } from '@/components/TileCover';
import { EmptyState, Screen } from '@/components/ui';
import { barCompact } from '@/features/navigation/barShrink';
import { useBarInset } from '@/features/navigation/barInset';
import { isPageDragging, subscribePageDragging } from '@/features/navigation/swipeLock';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { archivedStories } from '@/features/stories/stories';
import { useApp } from '@/store/AppContext';
import { colors, font, radius, spacing, typography, lift } from '@/theme';

type Tab = 'stories' | 'posts';
/** Left to right. Instants first: they land here on their own, so that is where most things are. */
const TABS: Tab[] = ['stories', 'posts'];
const LABEL: Record<Tab, string> = { stories: 'Instants', posts: 'Posts' };
const KIND: Record<string, string> = { clip: 'Clip', match: 'Set play', session: 'Session', note: 'Note', gear: 'Gear', milestone: 'Milestone' };
/** The space between Instant tiles. */
const GAP = 3;
const WEB = Platform.OS === 'web';
/**
 * A browser picks which gesture a touch is from the scroller it lands in, so
 * a sideways swipe that starts on a tile would be the browser's. Saying the
 * scroller only moves up and down leaves sideways swipes to the sections.
 */
const verticalOnlyTouch = WEB ? ({ touchAction: 'pan-y' } as unknown as ViewStyle) : null;

/**
 * Everything you have put away. Instants land here on their own after a
 * day; posts only when you archive them. Nobody else can see any of it.
 *
 * Two sections under a tab row that stays put, the way Community and your
 * profile switch theirs: the line under the tabs follows the finger, a swipe
 * slides between them and a tap glides. Each section scrolls on its own, so
 * each keeps its place.
 */
export default function Archive() {
  const styles = useThemedStyles(styleDefinitions);
  const { posts, stories, currentUserId, actions } = useApp();
  // Your own posts, put-away ones included; the feed never carries those.
  useEffect(() => { if (currentUserId) void actions.loadPostsOf(currentUserId); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<Tab>('stories');
  const index = TABS.indexOf(tab);
  const [tabWidth, setTabWidth] = useState(0);
  const underline = useTabUnderline(index, TABS.length, tabWidth);
  // How far down each section was left (see Section).
  const [places] = useState(() => new Map<Tab, number>());
  // Tiles in plain pixels, three across the section's measured width, as the
  // profile grid does: a percentage width has been known to draw nothing on a phone.
  const { width: windowWidth } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const tileW = Math.floor(((gridW || windowWidth - spacing.lg * 2) - GAP * 2) / 3);
  const tileH = Math.round((tileW * 16) / 9);

  const myStories = archivedStories(stories, currentUserId);
  const myPosts = posts
    .filter((p) => p.authorId === currentUserId && p.archived)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const counts: Record<Tab, number> = { stories: myStories.length, posts: myPosts.length };

  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const instants = (
    // Keyed, so a browser builds each section afresh rather than handing one
    // section's scroller (and how far down it was) to the other.
    <Section key="stories" id="stories" places={places} active={tab === 'stories'}>
      <Text style={styles.note}>Instants come here after 24 hours, or sooner if you archive them. Only you can see this.</Text>
      {myStories.length ? (
        <View style={styles.grid} onLayout={(e) => { const w = Math.floor(e.nativeEvent.layout.width); if (w > 0 && w !== gridW) setGridW(w); }}>
          {myStories.map((story) => (
            <Pressable
              key={story.id}
              accessibilityRole="button"
              accessibilityLabel={`Instant from ${day(story.createdAt)}`}
              onPress={() => router.push({ pathname: `/story/${story.authorId}`, params: { story: story.id } })}
              style={({ pressed }) => [styles.storyTile, { width: tileW, height: tileH }, pressed && styles.pressed]}
            >
              {story.thumbnailUrl || story.imageUrl ? (
                <TileCover accessibilityIgnoresInvertColors uri={story.thumbnailUrl ?? story.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={StyleSheet.absoluteFill}>
                  <MediaPlaceholder label={story.mediaLabel ?? 'Instant'} seed={story.id} portrait fill />
                </View>
              )}
              <View style={media.scrim} pointerEvents="none" />
              <Text style={media.date}>{day(story.createdAt)}</Text>
              {story.archived ? <Ionicons name="archive" size={14} color="#FFFFFF" style={media.mark} /> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState icon="time-outline" title="No instants yet" body="Instants you share are kept here after their day is up." />
      )}
    </Section>
  );

  const archivedPosts = (
    <Section key="posts" id="posts" places={places} active={tab === 'posts'}>
      <Text style={styles.note}>Archived posts leave your profile and the feed, and keep their likes and comments. Only you can see this.</Text>
      {myPosts.length ? (
        <View style={styles.list}>
          {myPosts.map((post, i) => (
            <View key={post.id} style={[styles.postRow, i > 0 && styles.line]}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open archived ${post.kind}`}
                // Opens among your archived posts, starting on this one.
                onPress={() => router.push({ pathname: '/posts/[userId]', params: { userId: post.authorId, post: post.id, set: 'archived' } })}
                style={styles.postBody}
              >
                <View style={styles.postThumb}>
                  {post.thumbnailUrl ? (
                    <TileCover accessibilityIgnoresInvertColors uri={post.thumbnailUrl} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <Ionicons name={post.kind === 'clip' ? 'play' : 'document-text-outline'} size={18} color={colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.postKind}>{KIND[post.kind] ?? 'Post'} · {day(post.createdAt)}</Text>
                  <Text numberOfLines={2} style={styles.postText}>{post.body}</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unarchive post"
                onPress={() => actions.toggleArchivePost(post.id)}
                style={styles.restore}
              >
                <Text style={styles.restoreText}>Unarchive</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState icon="archive-outline" title="No archived posts" body="Open one of your posts and choose Archive to put it away." />
      )}
    </Section>
  );

  return (
    <Screen title="Archive" compactTitle onBack={() => goBack()} scroll={false} padded={false} scrollsInside>
      <View style={styles.tabs} accessibilityRole="tablist" onLayout={(e) => setTabWidth(e.nativeEvent.layout.width / TABS.length)}>
        {TABS.map((t) => (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={`${LABEL[t]}, ${counts[t]}`} onPress={() => setTab(t)} style={styles.tab}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelOn]}>{LABEL[t]}<Text style={[styles.tabCount, tab === t && styles.tabCountOn]}>  {counts[t]}</Text></Text>
          </Pressable>
        ))}
        {tabWidth > 0 ? <Reanimated.View pointerEvents="none" style={[styles.tabLine, { width: tabWidth }, underline.style]} /> : null}
      </View>
      {/* Side by side under the tabs, each section its own scroller. A swipe
          right on Instants, or from the screen's left edge on either, is the
          way back rather than a turn. */}
      <SectionPager
        fill
        index={index}
        panes={[instants, archivedPosts]}
        progress={underline.progress}
        depth={1}
        delegateRight
        edgeBack
        slideOnTap
        onIndex={(i) => setTab(TABS[i])}
      />
    </Screen>
  );
}

/**
 * One section's own scroller. On the phone both stay built side by side, so
 * each simply stays where it was left. A browser rebuilds the one that slid
 * away when it comes back, so where it was is noted as it scrolls and put
 * back before it is drawn.
 */
function Section({ id, places, active, children }: { id: Tab; places: Map<Tab, number>; active: boolean; children: ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  // The end of the section clears the floating bar it scrolls behind.
  const barInset = useBarInset();
  // While a sideways swipe is under way the scroller stands down, as a page's own does (Screen).
  const swiping = useSyncExternalStore(subscribePageDragging, isPageDragging, () => false);
  const scroller = useRef<ScrollView | null>(null);
  useLayoutEffect(() => {
    const y = places.get(id) ?? 0;
    if (y > 0) scroller.current?.scrollTo({ y, animated: false });
    // Only when built: after that it is where the finger left it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remember = useCallback((y: number) => { places.set(id, y); }, [places, id]);
  // The bottom bar ducks as the section scrolls, worked out on the animation
  // thread the same way a scrolling page does it (Screen).
  const lastY = useSharedValue(-1);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      if (WEB) runOnJS(remember)(y);
      // The first report is just where it already sat.
      if (lastY.value < 0) { lastY.value = y; return; }
      const dy = y - lastY.value;
      lastY.value = y;
      if (Math.abs(dy) > 0.3 && y >= 0) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
    },
  });
  return (
    <Reanimated.ScrollView
      ref={(node: unknown) => { scroller.current = node as ScrollView | null; }}
      style={styles.flex}
      contentContainerStyle={[styles.section, verticalOnlyTouch, { paddingBottom: barInset + spacing.xxxl }]}
      scrollEnabled={!swiping}
      // A tap on an iPhone's clock takes the section on show to its top. Only
      // one scroller may say yes to that, or the phone does nothing at all.
      scrollsToTop={active}
      directionalLockEnabled
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScroll}
    >
      {children}
    </Reanimated.ScrollView>
  );
}

const styleDefinitions = StyleSheet.create({
  flex: { flex: 1 },
  // The profile's tab row: two words, a count beside each, one line that slides.
  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabLabel: { ...typography.body, color: colors.textMuted },
  tabLabelOn: { ...font('600'), color: colors.text },
  tabCount: { ...typography.smallStrong, fontSize: 12, color: colors.textFaint },
  tabCountOn: { color: colors.brand },
  tabLine: { position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: colors.brand, borderRadius: 1 },
  section: { paddingHorizontal: spacing.lg },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 19, paddingVertical: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  storyTile: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, justifyContent: 'flex-end', padding: 8 },
  pressed: { opacity: 0.85 },
  // One grouped list, a shade off the page, hairlines between.
  list: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  postBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  postThumb: { width: 52, height: 52, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  postKind: { ...typography.small, color: colors.textMuted },
  postText: { ...typography.small, color: colors.text, lineHeight: 19 },
  restore: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  restoreText: { ...typography.smallStrong, color: colors.text },
});

/**
 * What sits on an Instant's picture: white over a soft dark shade, the pairing
 * that reads over any photo, so it does not follow the theme. Kept out of the
 * themed styles above, which would swap the white for a theme's own colour
 * (New York's is a dark blue, and the dates vanished).
 */
const media = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  date: { ...typography.caption, color: '#FFFFFF', letterSpacing: 0, textShadowColor: '#0009', textShadowRadius: 3 },
  mark: { position: 'absolute', top: 8, right: 8, textShadowColor: '#0009', textShadowRadius: 3 },
});
