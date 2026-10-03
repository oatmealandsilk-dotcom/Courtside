import { asTabRoute } from '@/features/navigation/tabFocus';
import { COUNT_EDGE, FoldedWords, GLYPH_EDGE, InstantMeta, MAX_GROW, RailShade, railCount, ReelCaption, ReelScrim, ReelWho, SwipeHint } from '@/components/ReelCaption';
import { useSuggestedPlayers } from '@/features/people/suggestions';
import { ThreadReplies } from '@/components/ThreadReplies';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router, useFocusEffect, useIsFocused as useRouteFocused, useNavigation } from 'expo-router';
import { FeedTopRow } from '@/features/groups/FeedTopRow';
import { onOpenGroupFeed, tookGroupFeed } from '@/features/groups/openGroupFeed';
import { GroupTile } from '@/features/groups/GroupTile';
import { inGroupFeed } from '@/features/groups/groupFeed';
import { TOP_BAND_DROP, TOP_BAND_HEIGHT, TOP_BAND_TOP, TopBandContext } from '@/features/feed/topBand';
import { shareLink } from '@/lib/shareLink';
import { shareOutside } from '@/lib/shareOutside';
import { show as showToast } from '@/lib/toast';
import { useIsFocused } from '@/lib/useIsFocused';
import { useTourOpen } from '@/features/tour/tourStore';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { PinchZone } from '@/components/PinchZone';
import Reanimated, { ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import * as haptics from '@/lib/haptics';

import { Avatar, Button, EmptyState } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { FollowPill } from '@/components/FollowPill';
import { QuestionCard } from '@/components/QuestionCard';
import { PostCard } from '@/components/PostCard';
import { BrandMark } from '@/components/BrandMark';
import { MarkDraw } from '@/components/MarkDraw';
import { Wash } from '@/components/Wash';
import { Heart } from '@/components/Heart';
import { MediaPostPage } from '@/components/MediaPostPage';
import { Tappable } from '@/components/Tappable';
import { VerticalPager, type VerticalPagerHandle } from '@/components/VerticalPager';
import { subscribeReveal, subscribeScrollToTop } from '@/features/navigation/scrollToTop';
import { LikeButton } from '@/components/LikeButton';
import { wantsOn } from '@/lib/useOptimisticToggle';
import { setFeedWarm, useCurtainDown } from '@/features/feed/warmup';
import { connectionIsQuick } from '@/lib/netSpeed';
import { CourtSpinner } from '@/components/CourtSpinner';
import { subscribeFeedRefresh } from '@/features/feed/feedBus';
import { BAR_TUCK, barCompact, setBarCompact } from '@/features/navigation/barShrink';
import { BAR_OVERLAY_PX, useBarInset } from '@/features/navigation/barInset';
import { hasSessionStats } from '@/features/activity/format';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { TipPage } from '@/components/TipPage';
import { isLive } from '@/features/stories/stories';
import { ClipPlayback } from '@/components/ClipPlayback';
import { NEWEST_FIRST, rankFeed, type FeedItem, type RankContext } from '@/features/feed/rankFeed';
import { challengeFor, entriesFor } from '@/features/challenge/weekly';
import { ChallengePage } from '@/components/ChallengePage';
import { lockPageSwipe } from '@/features/navigation/swipeLock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/store/AppContext';
import { confirmUnfollow } from '@/lib/confirm';
import { isSupabaseConfigured } from '@/lib/supabase';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { useSidePanel } from '@/features/feed/sidePanel';
import { CLOSE_MS, PAUSE_AT_FULL, SIDE_MIN_WINDOW, STAGE_EASING, STAGE_ON_ANDROID, begin as beginStage, clear as clearStage, currentY, getStage, markEnding, markLost, place as placeStage, stageGeometry, stageKeyOf, stageTop, useStageSelect, type StageSubject } from '@/features/feed/commentStage';
import { StageChromeContext, useStageMotion, useStagePageChrome } from '@/features/feed/useStageMotion';
import { colors, radius, typography, spacing, font, lift } from '@/theme';
import { isTaggedIn } from '@/features/activity/sessionTags';

/**
 * The heart that blooms when you double tap a clip.
 *
 * Keyed on a counter rather than a boolean so tapping twice in a row replays
 * it — a boolean would already be true and the second tap would show nothing.
 */
/**
 * Something that can be tapped away: it shrinks and fades in one short move,
 * then tells its page it is gone. The page decides how long to remember that.
 */
/** Media the internet can reach: a file:// link only ever worked on the phone that made it. */
const reachable = (p: { imageUrl?: string; videoUrl?: string }) => [p.imageUrl, p.videoUrl].every((u) => !u || /^(https?:|data:|blob:)/.test(u));

/** When each page's post, thread or Instant was made, for putting new ones newest first. */
/** What the ranking may know about you: who you follow, who follows you, profiles, and what you have seen this visit. */
function rankContext(data: Pick<RankContext, 'users'> & { followingIds: string[]; followEdges: { followerId: string; followingId: string }[] }, seen: Set<string>): RankContext {
  return { followingIds: data.followingIds, followEdges: data.followEdges, users: data.users, seen };
}

function madeAt(data: { posts: { id: string; createdAt: string }[]; questions: { id: string; createdAt: string }[]; stories: { id: string; createdAt: string }[] }) {
  const at = new Map<string, number>();
  for (const p of data.posts) at.set(`p:${p.id}`, Date.parse(p.createdAt));
  for (const q of data.questions) at.set(`q:${q.id}`, Date.parse(q.createdAt));
  for (const st of data.stories) at.set(`h:${st.id}`, Date.parse(st.createdAt));
  return (key: string) => at.get(key) ?? 0;
}

function TapAway({ onHidden, label, children, style }: { onHidden: () => void; label: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const gone = useSharedValue(0);
  const press = useSharedValue(0);
  const pop = useSharedValue(0);
  const hover = useSharedValue(0);
  // Touch down: it gives a hair, like a button. Release: a small lift, then
  // gone in one short fade-and-shrink — between a plain snap and a bounce.
  const anim = useAnimatedStyle(() => ({
    opacity: 1 - gone.value,
    transform: [{ scale: (1 - 0.04 * press.value + 0.02 * pop.value + 0.04 * hover.value) * (1 - 0.2 * gone.value) }, { translateY: -3 * gone.value }],
  }));
  return (
    <Reanimated.View style={anim}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={style}
        onHoverIn={() => { hover.value = withTiming(1, { duration: 120 }); }}
        onHoverOut={() => { hover.value = withTiming(0, { duration: 120 }); }}
        onPressIn={() => { haptics.untap(); press.value = withTiming(1, { duration: 50 }); }}
        onPressOut={() => { press.value = withTiming(0, { duration: 80 }); }}
        onPress={() => {
          pop.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 80 }));
          gone.value = withDelay(50, withTiming(1, { duration: 220 }, (finished) => { if (finished) runOnJS(onHidden)(); }));
        }}
      >{children}</Pressable>
    </Reanimated.View>
  );
}


function LikeBurst({ token }: { token: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!token) return;
    scale.setValue(0.5);
    opacity.setValue(1);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 12 }),
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]),
    ]).start();
  }, [token, scale, opacity]);

  if (!token) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity }]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name="heart" size={112} color="rgba(255,255,255,0.94)" />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Show one player's things as a feed of their own (clips, posts or tagged
 * posts; or, for yourself, the posts you archived), or a given list of posts
 * in that order (a court's).
 */
export type FeedScope =
  | { userId: string; set: 'own' | 'clips' | 'tagged' | 'archived'; start?: string; ids?: undefined; groupId?: undefined }
  | { ids: string[]; start?: string; userId?: undefined; set?: undefined; groupId?: undefined }
  // A group's own feed (migrations 67 and 74): everything its members post, and what was shared to it only, newest first, under the Feed's top row.
  | { groupId: string; start?: undefined; ids?: undefined; userId?: undefined; set?: undefined };

/** What the Feed's top row needs to know from the feed under it: whether a picture fills the top, and whether the chrome is put away. */
export interface FeedChrome { picture: boolean; hidden: boolean }

/** Only a post shared with everyone is dealt into For you; one shared to a group only stays in that group's feed. */
const forYou = (p: { imageUrl?: string; videoUrl?: string; groupId?: string }) => reachable(p) && !p.groupId;

// On a phone — the app or a phone's browser — a vertical clip fills the whole
// page, edge to edge. The tall 9:16 box in the middle is for computer windows.
const phone = Platform.OS !== 'web' || !isDesktopBrowser();

/**
 * The rail's icons and their sizes, matched by eye rather than by number: a
 * heart, a bubble, an arrow, a bookmark and three dots each read as about
 * 26pt of glyph at these sizes, where equal sizes made the heart look biggest.
 */
const RAIL_ICONS = [['heart-outline', 31], ['chatbubble-outline', 29], ['arrow-redo-outline', 30], ['bookmark-outline', 28], ['ellipsis-horizontal', 26]] as const;
/** The rail's last item (the three dots) centres on the words' small bottom line rather than standing on its baseline. */
const RAIL_DROP = -6;

/**
 * A hit's photo at its own shape. A tall one fills the page; a wide one (a
 * computer's camera, say) sits in a wide box across the middle rather than
 * being cropped down to a strip of it. `onShape` tells the page which, so the
 * comments stage shrinks the box rather than the whole page.
 */
function HitPicture({ uri, onShape }: { uri: string; onShape?: (wide: boolean) => void }) {
  const [wide, setWide] = useState<boolean | null>(null);
  const latestShape = useRef(onShape);
  latestShape.current = onShape;
  useEffect(() => {
    let live = true;
    const known = (isWide: boolean) => { if (!live) return; setWide(isWide); latestShape.current?.(isWide); };
    Image.getSize(uri, (w, h) => known(w > h), () => known(false));
    return () => { live = false; };
  }, [uri]);
  if (wide) {
    return (
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', backgroundColor: '#000' }]}>
        <ExpoImage accessibilityIgnoresInvertColors source={{ uri }} style={{ width: '100%', aspectRatio: 4 / 3 }} contentFit="contain" cachePolicy="memory-disk" />
      </View>
    );
  }
  return <ExpoImage accessibilityIgnoresInvertColors source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />;
}

/** A feed page's key: "p:<id>", "h:<id>", "q:<id>", or the page's kind ("tip", "challenge"). */
const keyOf = (i: FeedItem) => (i.type === 'post' ? `p:${i.post.id}` : i.type === 'hit' ? `h:${i.story.id}` : i.type === 'question' ? `q:${i.question.id}` : i.type);

/** Where a view sits in the window right now, read straight from it (no wait); null if it can't say. */
function readRect(node: unknown): { x: number; y: number; width: number; height: number } | null {
  const box = (node as { getBoundingClientRect?: () => { x?: number; left?: number; y?: number; top?: number; width: number; height: number } } | null)?.getBoundingClientRect?.();
  if (!box || !(box.width > 0) || !(box.height > 0)) return null;
  return { x: box.x ?? box.left ?? 0, y: box.y ?? box.top ?? 0, width: box.width, height: box.height };
}

/**
 * In a browser, the words that opened the comments get the focus back after
 * only if they had it from the keyboard: given back after a click, the focus
 * would sit on them and the space bar would open the comments again instead
 * of pausing the clip.
 */
function keyboardFocus(node: unknown): unknown {
  const el = node as { matches?: (selector: string) => boolean } | null;
  try { return el?.matches?.(':focus-visible') ? el : null; } catch { return null; }
}

/** The words, buttons and mark over a clip fade as it goes onto the comments stage; a browser finds them by this mark, inside the page on the stage only (useStageMotion.web). */
const STAGE_CHROME = (Platform.OS === 'web' ? { dataSet: { stageChrome: '1' } } : {}) as object;

/**
 * Every clip, photo and Instant page that is built (the one on screen and
 * those either side) sits in one of these, always (adding or taking away a
 * parent around a player rebuilds it, and the video with it). On the comments
 * stage the page shrinks into the room above the sheet, all of it as one
 * picture, with black behind it: the same black in every theme, a video
 * frame's own (DESIGN.md). The black is there from the tap, on the animation
 * thread, before Home has redrawn; the page covers it until it moves. Never
 * clipped or rounded: a clipped box around a moving native video froze its
 * picture (see VerticalPager).
 *
 * It also works out, once for the page, how faded the words, buttons, mark
 * and sound disc over it are (StageChromeContext): only the page on the
 * stage, and only this Home's, ever fades.
 */
function StagePage({ owner, stageKey, staged, onNode, children }: { owner: string; stageKey: string; staged: boolean; onNode: (key: string, node: unknown) => void; children: React.ReactNode }) {
  const motion = useStageMotion('page', { owner, stageKey });
  const black = useStageMotion('black', { owner, stageKey });
  const chrome = useStagePageChrome(owner, stageKey);
  const motionRef = motion.ref;
  const setNode = useCallback((node: unknown) => { motionRef?.(node); onNode(stageKey, node); }, [motionRef, onNode, stageKey]);
  return (
    <StageChromeContext.Provider value={chrome}>
      <Reanimated.View ref={black.ref as never} pointerEvents="none" style={[stageStyles.blackStage, black.style]} />
      <Reanimated.View ref={setNode as never} style={[stageStyles.page, staged && Platform.OS === 'web' ? (stageStyles.moving as object) : null, motion.style]}>
        {children}
      </Reanimated.View>
    </StageChromeContext.Provider>
  );
}

/**
 * The words and buttons over a page, or its mark: they fade as their own page
 * goes onto the comments stage (see StagePage), and the words and buttons go
 * with a pinch-out too (`immersion`).
 */
function ChromeLayer({ immersion, style, pointerEvents, children }: { immersion?: SharedValue<number>; style?: StyleProp<ViewStyle>; pointerEvents?: 'box-none' | 'none'; children: React.ReactNode }) {
  const chrome = useContext(StageChromeContext);
  const fade = useAnimatedStyle(() => {
    const gone = immersion ? immersion.value : 0;
    return { opacity: (1 - gone) * (chrome ? chrome.value : 1), transform: [{ translateY: 14 * gone }] };
  });
  return <Reanimated.View {...STAGE_CHROME} pointerEvents={pointerEvents} style={[style, fade]}>{children}</Reanimated.View>;
}

const stageStyles = StyleSheet.create({
  page: { flex: 1 },
  // Only while it moves: a browser keeps the moving page on its own layer.
  moving: { willChange: 'transform' } as object,
  // Unseen until the page on top of it is on the stage.
  blackStage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: 0 },
});

function Home({ scope, topRow, paused, onChrome }: {
  previewSection?: string;
  scope?: FeedScope;
  /** The For you / groups row sits over the top: the per-page mark gives it the room. */
  topRow?: boolean;
  /** Another feed (a group's) is over this one: nothing plays. */
  paused?: boolean;
  onChrome?: (chrome: FeedChrome) => void;
} = {}) {
  const styles = useThemedStyles(styleDefinitions);
  // The US Open ground is navy; the green wordmark sinks into it, white does not.
  const { theme } = useTheme();
  const app = useApp();
  const { posts, questions, comments, stories, users, currentUserId, saved, actions, ready, followingIds, mutedIds, blockedIds, conversations } = app;
  const currentUser = users.find((u) => u.id === currentUserId);
  // Everyone by id, so each page finds its author in one step rather than scanning every player.
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const [active, setActive] = useState(0);
  const orderRef = useRef<string[]>([]);
  // The words over a clip end 16pt above the floating tab bar on every phone:
  // the bar stands on the home-indicator inset, which differs phone to phone,
  // so the words (and the rail beside them) are placed from the same number.
  // A computer has no bar there and keeps the phone's usual spot.
  const barInset = useBarInset();
  const wordsBottom = (barInset || BAR_OVERLAY_PX) + 6;
  // A swipe on to the next clip tucks the bar down a little (labels fade); the
  // words and the rail go down with it, so the gap stays 16 rather than
  // growing to 28 and lifting the words into the picture. Phones only.
  const follow = barInset > 0 ? BAR_TUCK : 0;
  const tuckStyle = useAnimatedStyle(() => ({ transform: [{ translateY: follow * barCompact.value }] }));
  useEffect(() => { const k = orderRef.current[active]; if (k) seenNow.current.add(k); setQuick(connectionIsQuick()); }, [active]);

  // Pinch out on a clip or hit and everything but the picture goes away —
  // caption, buttons, wordmark, sound disc; pinch in brings it all back.
  const [immersive, setImmersive] = useState(false);
  const pager = useRef<VerticalPagerHandle>(null);
  // Comments docked on the right of a computer screen: the clip slides left
  // by half their width, so it sits centred in the space that is left.
  const viewer = useRef<View>(null);
  const sidePanel = useSidePanel();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = viewer.current as unknown as HTMLElement | null;
    if (!node?.style) return;
    node.style.transition = 'transform 300ms cubic-bezier(.22,.61,.36,1)';
    node.style.transform = sidePanel ? `translateX(${-sidePanel / 2}px)` : '';
  }, [sidePanel]);
  useEffect(() => subscribeScrollToTop((tab) => { if (tab === '/') pager.current?.scrollToTop(); }), []);
  // Locking in has a feel to it: the picture gives a small push and settles
  // with a spring while the overlays sink away; locking out is the reverse.
  const immersion = useSharedValue(0);
  const punch = useSharedValue(1);
  const lock = (on: boolean) => {
    if (on === immersive) return;
    setImmersive(on);
    haptics.tap();
    if (on) setBarCompact(true);
    // One quick snap: the overlays go, the picture gives a short push and settles — no bounce.
    immersion.value = withTiming(on ? 1 : 0, { duration: 180 });
    punch.value = withSequence(withTiming(on ? 1.03 : 0.97, { duration: 80 }), withTiming(1, { duration: 110 }));
  };
  // The wordmark and the thread logo can be tapped away, page by page: the
  // one you tapped goes; the next page still has its own.
  const [hiddenMarks, setHiddenMarks] = useState<Set<string>>(() => new Set());
  const hideMark = (key: string) => setHiddenMarks((prev) => new Set(prev).add(key));
  const pictureStyle = useAnimatedStyle(() => ({ transform: [{ scale: punch.value }] }));
  useEffect(() => { setImmersive(false); immersion.value = 0; punch.value = 1; }, [active, immersion, punch]);
  const [visit, setVisit] = useState(0);
  const focused = useIsFocused();
  // The comments stage (see commentStage): which page, if any, is on it.
  // `owner` tells this Home from another one under or over it (a scoped feed).
  const owner = useRef(`home:${Math.random().toString(36).slice(2)}`).current;
  // Read as one short line of what Home acts on, so it redraws only when one of those changes.
  const stageLine = useStageSelect((s) => (s && s.owner === owner ? `${s.key}|${s.mode}|${s.covered}|${s.lost}|${PAUSE_AT_FULL && s.full}` : ''));
  const myStage = useMemo(() => (stageLine ? getStage() : null), [stageLine]);
  // A scoped feed's back tile fades with the words when this feed's page goes onto the stage.
  const scopeBackFade = useStageMotion('chrome', { owner });
  // Whether this Home is the page on show, for a stage's checks that run later (a timer).
  const focusedNow = useRef(focused);
  focusedNow.current = focused;
  const navigation = useNavigation();
  // Gone (a scoped feed closed with pages over it, say): a stage it put up goes with it, so no other feed is left faded or unable to open comments.
  useEffect(() => () => { if (getStage()?.owner === owner) clearStage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // While the tutorial's tips sit over the Feed, its clips hold still and
  // silent under the dim, and their clock doesn't count that time as watched.
  // The clip starts once the dim lifts.
  const touring = useTourOpen();
  // Whether Home has been the tab on screen at all yet this time round.
  const shownOnce = useRef(false);
  if (focused) shownOnce.current = true;
  // In a browser the Feed is built out of sight shortly after the app opens
  // (see the tabs' web layout). Until you first come to it, only the first
  // clip fetches, and only its opening: enough to start at once, without
  // spending anyone's data on clips they may never open. A picture of the
  // Feed sliding in under a finger is not this (its route is the one on screen).
  const routeFocused = useRouteFocused();
  const warming = Platform.OS === 'web' && !scope && !routeFocused && !shownOnce.current;
  const latest = useRef(app);
  latest.current = app;
  const [order, setOrder] = useState<string[]>([]);
  orderRef.current = order;
  // Every page you have rested on this session; a refresh sends these to the back.
  const seenNow = useRef(new Set<string>());
  // Feed signals, for a smarter feed later: how long each page is on your
  // screen while the feed is in front and the app is open, and whether you
  // swiped past it within a second and a half. Sent when you move on.
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', (next) => setAppActive(next === 'active')); return () => sub.remove(); }, []);
  const viewing = useRef<{ key: string; since: number } | null>(null);
  const signalKind = (key: string) => (key.startsWith('p:') ? 'post' : key.startsWith('h:') ? 'hit' : key.startsWith('q:') ? 'question' : null);
  const endViewing = useRef(() => undefined as void);
  endViewing.current = () => {
    const view = viewing.current;
    viewing.current = null;
    if (!view) return;
    const kind = signalKind(view.key);
    if (!kind) return;
    const seconds = (Date.now() - view.since) / 1000;
    actions.noteFeedSignal({ kind, id: view.key.slice(2), seen: true, watched: seconds, skipped: seconds < 1.5 });
  };
  const tappedAuthor = (key: string) => {
    const kind = signalKind(key);
    if (kind) actions.noteFeedSignal({ kind, id: key.slice(2), profileTap: true });
  };
  useEffect(() => () => endViewing.current(), []);

  // Re-rank when the session itself changes, not every time this screen regains
  // focus — otherwise stepping into a thread and back would reshuffle the feed
  // and throw you to the top.
  const rankedFor = useRef<string | null>(null);
  // When the main feed was last dealt, so a pull knows what is new since.
  const dealtAt = useRef<number | null>(null);
  // Builds the page order from whatever is loaded; a pull-to-refresh asks for it again.
  const seen = seenNow;
  const rerank = useCallback((remount = true, fresh = false) => {
      const data = latest.current;
      if (scope) {
        // One person's things, newest first, opened on the one that was tapped;
        // or a court's posts, in exactly the order its grid shows them.
        const { ids, userId, set, groupId } = scope;
        const byId = ids ? new Map(data.posts.map((p) => [p.id, p])) : null;
        const group = groupId ? data.feedGroups.find((g) => g.id === groupId) : undefined;
        const mine = groupId
          ? data.posts.filter((p) => inGroupFeed(p, groupId, group) && reachable(p)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          : ids && byId
          ? ids.flatMap((id) => { const p = byId.get(id); return p && !p.archived ? [p] : []; })
          : data.posts
            // Archived posts only ever in your own archive's set, opened from the Archive page.
            .filter((p) => (set === 'archived'
              ? p.archived && p.authorId === userId && userId === data.currentUserId
              : !p.archived && !p.groupId && (set === 'tagged' ? isTaggedIn(p, userId) : p.authorId === userId && (set !== 'clips' || p.kind === 'clip'))))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        setOrder(mine.map((p) => `p:${p.id}`));
        setActive(Math.max(0, mine.findIndex((p) => p.id === scope.start)));
        setVisit((v) => v + 1);
        return;
      }
      // A post whose picture or video is a link only its author's phone could
      // open (an upload that never finished) is left out of the deal.
      const ranked = rankFeed(data.posts.filter(forYou), data.questions.filter((q) => !q.source), data.comments, data.currentUserId, data.stories.filter((st) => isLive(st)), rankContext(data, seen.current)).flatMap((i) =>
        i.type === 'post' ? [`p:${i.post.id}`] : i.type === 'question' ? [`q:${i.question.id}`] : i.type === 'hit' ? [`h:${i.story.id}`] : [],
      );
      // Something of yours from the last few minutes goes first, so a fresh post
      // is right there. Newest first there is no such hold: what you post goes
      // to the top the moment it has landed (liftToTop, below), and from then
      // on it sits by its time like everyone else's. Holding your own day's posts
      // above everything put other people's newer posts pages down after a pull.
      const justMine: string[] = NEWEST_FIRST ? [] : data.posts
        .filter((p) => p.authorId === data.currentUserId && !p.archived && !p.groupId && Date.now() - Date.parse(p.createdAt) < 5 * 60_000)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((p) => `p:${p.id}`);
      // The ranking already puts what you have watched this visit lower down
      // and new players' first posts higher up, and it deals the same order
      // from the same data, so a pull never reshuffles at random.
      const final = [...justMine, ...ranked.filter((k) => !justMine.includes(k))];
      // The feed always opens on a clip (unless something of yours just
      // landed): the first clip in the order is brought to the front.
      // Newest first, the newest post leads whatever it is.
      if (!justMine.length && !NEWEST_FIRST) {
        const postKind = new Map(data.posts.map((p) => [`p:${p.id}`, p.kind]));
        const storyVideo = new Set(data.stories.filter((st) => st.videoUrl).map((st) => `h:${st.id}`));
        const isClip = (k: string) => postKind.get(k) === 'clip' || storyVideo.has(k);
        // A refresh opens on a different clip from the one just watched: one
        // not yet watched when there is one, otherwise any other clip; only
        // with a single clip in the whole feed does the same one lead again.
        const previous = fresh ? orderRef.current[0] : undefined;
        let first = final.findIndex((k) => isClip(k) && k !== previous && !seen.current.has(k));
        if (first < 0) first = final.findIndex((k) => isClip(k) && k !== previous);
        if (first < 0) first = final.findIndex(isClip);
        if (first > 0) final.unshift(...final.splice(first, 1));
      }
      // After a pull, everything made since the feed was last dealt leads,
      // newest first — a new thread or Instant too, not left in its usual slot
      // a few pages down. Something older that has only just reached this
      // phone (a profile or a search brought it in) keeps its place by date.
      if (fresh && dealtAt.current !== null) {
        const had = new Set(orderRef.current);
        const made = madeAt(data);
        const since = dealtAt.current - 30 * 60_000;
        const lead = final.filter((k) => !had.has(k) && made(k) > since).sort((a, b) => made(b) - made(a));
        if (lead.length) { const rest = final.filter((k) => !lead.includes(k)); final.splice(0, final.length, ...lead, ...rest); }
      }
      dealtAt.current = Date.now();
      setOrder(final);
      setActive(0);
      if (remount) setVisit((v) => v + 1);
  }, [scope?.userId, scope?.set, scope?.start, scope?.ids?.join(','), scope?.groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Something of yours has just landed (saved, its picture or video hosted),
  // or "Posted — tap to see it" on the strip: its page goes to the very top
  // and the feed is taken there. Only that page moves; nothing else is dealt
  // again. A post still going up is never in the feed: it plays from the
  // internet once it is there, never from the file still being shrunk and
  // sent on this phone (two readers of one big video at once is how a phone
  // runs out of memory). The strip across the top shows how it is going.
  const liftToTop = useCallback((key: string) => {
    setOrder((prev) => [key, ...prev.filter((k) => k !== key)]);
    setActive(0);
    setVisit((v) => v + 1);
  }, []);
  useEffect(() => subscribeReveal((id) => {
    if (scope) return;
    const data = latest.current;
    // A post shared to a group never goes into For you (the row switches to its group instead).
    if (data.posts.some((p) => p.id === id && p.groupId)) return;
    const key = data.posts.some((p) => p.id === id) ? `p:${id}` : data.stories.some((st) => st.id === id) ? `h:${id}` : null;
    offStage(() => { if (key) liftToTop(key); else rerank(); });
  }), [scope, rerank, liftToTop]); // eslint-disable-line react-hooks/exhaustive-deps
  const dealOnce = useCallback(() => {
    const stamp = `${ready}:${currentUserId}:${scope?.userId ?? ''}:${scope?.set ?? ''}:${scope?.ids?.join(',') ?? ''}:${scope?.groupId ?? ''}`;
    if (rankedFor.current === stamp) return;
    rankedFor.current = stamp;
    rerank();
  }, [ready, currentUserId, scope?.userId, scope?.set, scope?.ids?.join(','), scope?.groupId, rerank]);
  // A group's feed takes its posts as they arrive: the first page from the
  // server deals it; after that, an older page goes on the end and anything
  // newer goes in just after the page on screen, so nothing moves under you.
  const groupOf = scope?.groupId ? app.feedGroups.find((g) => g.id === scope.groupId) : undefined;
  const groupKeys = useMemo(() => {
    const g = scope?.groupId;
    if (!g) return '';
    return posts.filter((p) => inGroupFeed(p, g, groupOf) && reachable(p)).map((p) => p.id).sort().join(',');
  }, [posts, scope?.groupId, groupOf]);
  useEffect(() => {
    if (!scope?.groupId || !groupKeys) return;
    if (!orderRef.current.length || activeRef.current === 0) { rerank(); return; }
    const data = latest.current;
    const byId = new Map(data.posts.map((p) => [p.id, p]));
    const made = (k: string) => Date.parse(byId.get(k.slice(2))?.createdAt ?? '') || 0;
    setOrder((prev) => {
      const have = new Set(prev);
      const add = groupKeys.split(',').map((id) => `p:${id}`).filter((k) => !have.has(k)).sort((a, b) => made(b) - made(a));
      if (!add.length) return prev;
      const last = made(prev[prev.length - 1]);
      const older = add.filter((k) => made(k) <= last);
      const newer = add.filter((k) => made(k) > last);
      const at = Math.min(prev.length, activeRef.current + 1);
      return [...prev.slice(0, at), ...newer, ...prev.slice(at), ...older];
    });
  }, [groupKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening a group's feed asks the server for its newest page; nearing the
  // end of what is loaded asks for the next, older one, until there is no more.
  const groupNext = useRef<string | null | undefined>(undefined);
  const groupAsking = useRef(false);
  const askGroupPage = useCallback((before?: string) => {
    const g = scope?.groupId;
    if (!g || groupAsking.current) return;
    groupAsking.current = true;
    void latest.current.actions.loadFeedGroupPosts(g, before)
      .then((next) => { groupNext.current = next; })
      .finally(() => { groupAsking.current = false; });
  }, [scope?.groupId]);
  useEffect(() => { if (scope?.groupId) askGroupPage(); }, [scope?.groupId, askGroupPage]);
  useEffect(() => {
    if (!scope?.groupId || !ready) return;
    const next = groupNext.current;
    if (!next || active < order.length - 5) return;
    askGroupPage(next);
  }, [active, order.length, scope?.groupId, ready, askGroupPage]);
  useFocusEffect(dealOnce);
  // In a browser the Feed is built out of sight a moment after the app opens
  // (see the tabs' web layout), before you have been to it. It is dealt then
  // too, as it is on the phone, so its first clip loads before you arrive;
  // only from the account's own posts, never the stand-in demo ones, which
  // are dropped once the real ones are in and would leave the Feed empty.
  const dataIn = !isSupabaseConfigured || app.remoteLoaded || app.snapshotShown;
  useEffect(() => { if (Platform.OS === 'web' && !scope && !routeFocused && dataIn) dealOnce(); }, [dealOnce, routeFocused, scope, dataIn]);
  /**
   * Nearing the end of what is loaded: the next page of older posts is asked
   * for and dealt onto the end. The pages already in front of you are left
   * exactly as they are — re-ranking here would throw you back to the top.
   */
  useEffect(() => {
    if (scope || !ready) return;
    if (!order.length || active < order.length - 5) return;
    let dropped = false;
    void latest.current.actions.loadMorePosts().then((fresh) => {
      if (dropped || !fresh.length) return;
      const hidden = new Set([...latest.current.blockedIds, ...latest.current.mutedIds]);
      // The new page is ranked on its own and added to the end; nothing
      // already in the feed moves.
      const data = latest.current;
      const dealt = rankFeed(fresh.filter((p) => !p.archived && !hidden.has(p.authorId) && forYou(p)), [], data.comments, data.currentUserId, [], rankContext(data, seenNow.current))
        .flatMap((i) => (i.type === 'post' ? [`p:${i.post.id}`] : []));
      setOrder((prev) => {
        const have = new Set(prev);
        const keys = dealt.filter((k) => !have.has(k));
        return keys.length ? [...prev, ...keys] : prev;
      });
    });
    return () => { dropped = true; };
    // The feed's own actions never change; asking for them by name here would
    // re-run this on every render for nothing.
  }, [active, order.length, scope, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened on the saved copy from last time: when the fresh load lands, what
  // is new is dealt in just ahead of where you are. The page in front of you
  // and the ones you have seen stay exactly where they were.
  const dealtFromCopy = useRef(false);
  useEffect(() => { if (app.snapshotShown && !app.remoteLoaded && order.length) dealtFromCopy.current = true; }, [app.snapshotShown, app.remoteLoaded, order.length]);
  useEffect(() => {
    if (!app.remoteLoaded || !dealtFromCopy.current || scope) return;
    dealtFromCopy.current = false;
    offStage(dealFresh);
  }, [app.remoteLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const dealFresh = () => {
    const data = latest.current;
    const hidden = new Set([...data.blockedIds, ...data.mutedIds]);
    const have = new Set(orderRef.current);
    const fresh = rankFeed(data.posts.filter((p) => forYou(p) && !p.archived && !hidden.has(p.authorId)), data.questions, data.comments, data.currentUserId, data.stories.filter((st) => isLive(st)), rankContext(data, seenNow.current))
      .flatMap((i) => (i.type === 'post' ? [`p:${i.post.id}`] : i.type === 'question' ? [`q:${i.question.id}`] : i.type === 'hit' ? [`h:${i.story.id}`] : []))
      .filter((k) => !have.has(k));
    if (!fresh.length) return;
    // Newest first, with nothing shown yet (Home has not been on screen, or
    // its first clip has not started): the feed is simply dealt again, so the
    // newest is the first thing you see. The app opens on Community, so the
    // feed can be loaded and ready long before anyone has looked at it.
    // Otherwise the new pages go in right after the one on screen, newest first.
    if (NEWEST_FIRST && activeRef.current === 0 && (!playable || !shownOnce.current)) { rerank(); return; }
    const made = madeAt(data);
    const dealt = NEWEST_FIRST ? [...fresh].sort((a, b) => made(b) - made(a)) : fresh;
    setOrder((prev) => {
      const at = Math.min(prev.length, activeRef.current + (NEWEST_FIRST ? 1 : 2));
      return [...prev.slice(0, at), ...dealt.filter((k) => !prev.includes(k)), ...prev.slice(at)];
    });
  };

  // Something of yours just landed: straight to the top (see liftToTop). With
  // no page named, the feed is dealt again.
  useEffect(() => subscribeFeedRefresh((key) => {
    if (scope) return;
    if (key?.startsWith('p:') && latest.current.posts.some((p) => p.id === key.slice(2) && p.groupId)) return;
    offStage(() => { if (key) liftToTop(key); else rerank(); });
  }), [scope, rerank, liftToTop]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pulling down on the first page fetches what is new and starts the feed over from the top.
  // Pull-to-refresh: fetch what is new, rank the pages again in place (the
  // pager is holding the feed down and brings it back itself), and give the
  // new first pages a short beat to draw before the feed comes back up.
  // The brand on a page that is not built or loaded yet. Built once, so the
  // dozens of held pages cost nothing when the feed re-renders on a tap.
  const holdMark = useMemo(() => <BrandMark size={72} />, []);
  const holdWord = useMemo(() => <Text style={styles.holdWord}>CourtSide</Text>, [styles]);
  // The shape of a page before it is in: a round stand-in where the picture
  // will be, the name beside it, and the column of buttons down the right.
  const insets = useSafeAreaInsets();
  // A written or photo post's shape: who at the top, the picture in its frame
  // with the mark on it, the words, and the row of buttons under them.
  const skeletonPost = useMemo(() => (
    <View style={[styles.holdPost, { paddingTop: insets.top + 66 }]}>
      <View style={[styles.author, { alignSelf: 'stretch', marginBottom: 10 }]}>
        <View style={[styles.boneAvatar, { width: 40, height: 40, borderRadius: 20 }]} />
        <View style={{ gap: 6 }}><View style={[styles.bone, { width: 130 }]} /><View style={[styles.bone, { width: 90, height: 10 }]} /></View>
      </View>
      <View style={styles.boneFrame}>{holdMark}</View>
      <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}><View style={[styles.bone, { width: '80%' }]} /><View style={[styles.bone, { width: '55%' }]} /></View>
      <View style={styles.boneRow}>
        <Ionicons name="heart-outline" size={32} color={colors.textMuted} />
        <Ionicons name="chatbubble-outline" size={29} color={colors.textMuted} />
        <Ionicons name="arrow-redo-outline" size={29} color={colors.textMuted} />
        <Ionicons name="bookmark-outline" size={28} color={colors.textMuted} />
        <Ionicons name="ellipsis-horizontal" size={28} color={colors.textMuted} />
      </View>
    </View>
  ), [styles, holdMark, insets.top]);
  // A clip's or hit's shape: the name in the middle, who at the bottom left, the buttons down the right.
  const skeletonClip = useMemo(() => (
    <>
      {holdWord}
      {/* The same boxes the live page uses, so every stand-in sits exactly where the real thing lands (tucked with the bar, too). */}
      <Reanimated.View style={[styles.caption, { bottom: wordsBottom }, tuckStyle]}>
        <View style={styles.author}>
          <View style={styles.boneAvatar} />
          <View style={[styles.bone, { width: 110, height: 14 }]} />
        </View>
        <View style={{ gap: 6 }}><View style={[styles.bone, { width: '85%' }]} /><View style={[styles.bone, { width: '55%' }]} /></View>
        <View style={[styles.bone, { width: 90, height: 10 }]} />
      </Reanimated.View>
      <Reanimated.View style={[styles.actions, { bottom: wordsBottom + RAIL_DROP }, tuckStyle]}>
        {RAIL_ICONS.map(([name, size]) => (
          <View key={name} style={styles.action}>
            {/* No shadow here: the shadow lifts white glyphs off a video, and on the plain page it only reads as a smudge. */}
            <Ionicons name={name} size={size} color={colors.textFaint} />
            <Text style={styles.actionLabel}> </Text>
          </View>
        ))}
      </Reanimated.View>
    </>
  ), [styles, holdWord, wordsBottom, tuckStyle]);
  const warmWaiters = useRef<(() => void)[]>([]);
  // Quick or slow connection, read again whenever a new page comes up. Each
  // page's cover takes the reading once, the first time it is drawn (off
  // screen, while the page is built ahead), and keeps it, so a page that is
  // waiting never switches from one loading screen to another in view.
  const [quick, setQuick] = useState(connectionIsQuick);
  const coverQuick = useRef(new Map<string, boolean>());
  const firstReadyRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const refreshFeed = useCallback(async () => {
    // This resolves only once the fresh load has been drawn (the store waits
    // for that itself), so the ranking below reads the new posts. Waiting here
    // for "any change at all" used to give up early — a message or a like
    // arriving mid-fetch counted — and ranked the old list.
    await actions.refresh();
    // How to wait is chosen once, here, from how quickly clips have been
    // loading: on a quick connection the feed holds until the new first clip
    // is ready (about a second at most) and lands on it playing; on a slow one
    // it comes straight back and waits on the CourtSide loading page. Either
    // way there is one waiting screen, never two.
    const quickNow = connectionIsQuick();
    coverQuick.current.clear();
    setQuick(quickNow);
    rerank(false, true);
    // In a browser the scroller snaps back to the page it was resting on —
    // the old first page, now further down below the new ones — so the feed
    // is taken back up to the newest. A phone's own scroller never does this.
    if (Platform.OS === 'web') setTimeout(() => { if (activeRef.current !== 0) pager.current?.scrollToTop(); }, 150);
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(t); resolve(); };
      // A pull that holds longer than a beat feels stuck: about a second at most, then the feed comes back.
      const t = setTimeout(done, quickNow ? 1200 : 400);
      setTimeout(() => { if (firstReadyRef.current) done(); else warmWaiters.current.push(done); }, 80);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
  }, [actions, rerank]);

  /**
   * People worth following, best first: anyone who has interacted with you
   * (liked or commented on your posts, or messaged you), then coaches, then
   * players from your city. Never anyone you already follow or have blocked.
   */
  // Someone you follow from the strip stays on it, now saying Following, the
  // way Instagram does — vanishing the moment you tap read as the tap failing.
  // The strip forgets them when the feed is dealt again.
  const [followedHere, setFollowedHere] = useState<string[]>([]);
  useEffect(() => { setFollowedHere([]); }, [visit]);
  const suggestions = useSuggestedPlayers({ keep: followedHere });

  // Blocked and muted players disappear from the feed entirely.
  const feedItems = useMemo<FeedItem[]>(() => {
    const hidden = new Set([...blockedIds, ...mutedIds]);
    const following = new Set(followingIds);
    // A private account is only in your feed once they have let you follow.
    // In a group's feed the server has already decided: being in a group together lets members see each other's posts (migration 74).
    if (!scope?.groupId) for (const u of users) if (u.isPrivate && u.id !== currentUserId && !following.has(u.id)) hidden.add(u.id);
    // Found by id in one step each, not by scanning every post for every page.
    const postById = new Map(posts.map((p) => [p.id, p]));
    const storyById = new Map(stories.map((st) => [st.id, st]));
    const questionById = new Map(questions.map((q) => [q.id, q]));
    return order.flatMap<FeedItem>((key) => {
      const id = key.slice(2);
      if (key.startsWith('p:')) {
        const post = postById.get(id);
        // In your archive's own set an archived post is the point, and one you
        // unarchive from there stays on screen rather than vanishing under you.
        // A post shared to a group only is only ever in that group's feed,
        // whatever else asked for it; a group's feed also holds its members'
        // posts to everyone.
        if (post && post.groupId && post.groupId !== scope?.groupId && !scope?.userId && !scope?.ids) return [];
        return post && !hidden.has(post.authorId) && (!post.archived || scope?.set === 'archived') ? [{ type: 'post' as const, post }] : [];
      }
      if (key.startsWith('h:')) {
        // A hit leaves the feed the moment it expires or is put away.
        const story = storyById.get(id);
        return story && !hidden.has(story.authorId) && isLive(story) ? [{ type: 'hit' as const, story }] : [];
      }
      const question = questionById.get(id);
      return question && !hidden.has(question.authorId) ? [{ type: 'question' as const, question }] : [];
    });
  }, [order, posts, questions, stories, blockedIds, mutedIds, users, currentUserId, followingIds, scope?.set, scope?.groupId]);
  // This week's challenge, and its top clips so far. They are settled once
  // per visit: a like arriving mid-scroll must not reshuffle the pages.
  const challenge = useMemo(() => challengeFor(), []);
  const featured = useRef<string[] | null>(null);
  if (featured.current === null && feedItems.length) {
    featured.current = entriesFor(challenge, feedItems.flatMap((i) => (i.type === 'post' ? [i.post] : []))).slice(0, 3).map((p) => p.id);
  }
  // While the app is young, a page a few swipes in asks early users for a
  // tip; a few more in, the challenge, with its top clips straight after it.
  const feed = useMemo<FeedItem[]>(() => {
    if (scope || !feedItems.length) return feedItems;
    const top = featured.current ?? [];
    const lead = top.flatMap((id) => feedItems.filter((i) => i.type === 'post' && i.post.id === id));
    const rest = feedItems.filter((i) => !(i.type === 'post' && top.includes(i.post.id)));
    const tipAt = Math.min(3, rest.length);
    const withTip: FeedItem[] = [...rest.slice(0, tipAt), { type: 'tip' as const }, ...rest.slice(tipAt)];
    const at = Math.min(7, withTip.length);
    return [...withTip.slice(0, at), { type: 'challenge' as const }, ...lead, ...withTip.slice(at)];
  }, [feedItems, scope]);

  // The page on the comments stage keeps playing while the comments are up
  // (the stage is this Home's, it is the page on screen, and nothing has been
  // opened over the comments). Read by the page's key in `feed`, which is
  // what `active` counts: `order` has no tip or challenge page.
  const activeKey = feed[active] ? keyOf(feed[active]) : undefined;
  const held = !!myStage && myStage.key === activeKey && !myStage.covered && !(PAUSE_AT_FULL && myStage.full);
  const playing = (focused || held) && !touring && !paused;
  // A new page on screen (or the feed coming back to the front): the last one
  // is closed off and the new one's clock starts. Reading the comments under
  // a clip that is still playing counts as watching it.
  const viewedKey = playing && appActive ? order[active] : undefined;
  useEffect(() => {
    endViewing.current();
    if (viewedKey) viewing.current = { key: viewedKey, since: Date.now() };
  }, [viewedKey]);

  /*
   * The comments stage. A tap on a clip's or an Instant's words, or on its
   * speech bubble, opens the comments with the clip still playing above them,
   * shrunk into the room the sheet leaves (on a phone; a wide computer window
   * docks the comments beside the clip instead, still playing; a narrower one
   * keeps the centred box, the clip paused under it).
   *
   * The order matters: the stage is noted before the comments page is pushed,
   * in the same tap, so there is never a frame where Home is neither on top
   * nor holding its clip (that would be a blink of pause). It is cleared only
   * once Home is back on top, for the same reason on the way out.
   */
  const { width: winW, height: winH } = useWindowDimensions();
  // Each page's stage box, to measure at the tap; and each wide Instant photo's shape.
  const pageNodes = useRef(new Map<string, unknown>());
  const notePageNode = useCallback((key: string, node: unknown) => { if (node) pageNodes.current.set(key, node); else pageNodes.current.delete(key); }, []);
  const hitShapes = useRef(new Map<string, boolean>());
  // The same stage for a clip's comments and for its session stats (See stats): only the page pushed differs.
  const openStage = (route: '/comments' | '/session-stats', kind: 'post' | 'hit', id: string, subject: StageSubject, from?: unknown) => {
    const params = { kind, id };
    const now = getStage();
    // A second tap while this feed's comments are opening, open or closing does nothing.
    if (now && now.owner === owner) return;
    // Another feed's stage is still up under the pages opened over it (its
    // comments, a profile, then this feed): these comments open as the plain sheet.
    if (now) { router.push({ pathname: route, params }); return; }
    const key = stageKeyOf(kind, id);
    const ownerOnTop = () => focusedNow.current;
    if (Platform.OS === 'web' && isDesktopBrowser() && typeof window !== 'undefined' && window.innerWidth >= 700) {
      // A computer: the docked panel keeps the clip playing beside it; the centred box does not.
      if (window.innerWidth >= SIDE_MIN_WINDOW) beginStage({ owner, key, mode: 'side', focusBack: keyboardFocus(from), ownerOnTop });
      router.push({ pathname: route, params });
      return;
    }
    const rect = readRect(pageNodes.current.get(key)) ?? { x: 0, y: 0, width: winW, height: winH };
    const geo = phone && (Platform.OS !== 'android' || STAGE_ON_ANDROID) ? stageGeometry(winW, winH, insets.top, rect, subject, owner, key) : null;
    if (!geo) { router.push({ pathname: route, params }); return; }
    beginStage({ owner, key, mode: 'stage', geo, focusBack: Platform.OS === 'web' ? keyboardFocus(from) : from, ownerOnTop });
    // Everything on the stage reads the sheet's top: at the bottom edge, the
    // page exactly as it is. The sheet starts the rise itself once it has
    // drawn, so the clip and the sheet move as one.
    if (Platform.OS !== 'web') stageTop.value = geo.H;
    router.push({ pathname: route, params: { ...params, stage: '1' } });
    // The comments never came: the push went nowhere and this feed is still
    // the page in front. The page goes back as it was. (A push that landed
    // but is slow to draw is left to finish: the feed is no longer in front.)
    setTimeout(() => {
      const still = getStage();
      if (still && still.owner === owner && still.key === key && !still.mounted && navigation.isFocused()) endStage();
    }, 600);
  };
  const openComments = (kind: 'post' | 'hit', id: string, subject: StageSubject, from?: unknown) => openStage('/comments', kind, id, subject, from);
  // The stage is over (or never got going): the page grows back to full size
  // if it is not there already (the comments went without their own close: a
  // browser's Back, a tab tapped from a page on top), then it is cleared.
  // Marked as ending first, so comments arriving now open plain, not onto it.
  const endStage = () => {
    const now = getStage();
    if (!now || now.owner !== owner) return;
    const G = now.geo;
    const finish = () => { if (getStage()?.id === now.id) clearStage(); };
    if (now.mode !== 'stage' || !G) { clearStage(); return; }
    if (Platform.OS === 'web') {
      const y = currentY();
      if (y >= G.H - 0.5) { clearStage(); return; }
      markEnding();
      placeStage({ fromY: y, toY: G.H, ms: CLOSE_MS });
      setTimeout(finish, CLOSE_MS + 20);
      return;
    }
    if (stageTop.value >= G.H - 0.5) { clearStage(); return; }
    markEnding();
    // Cleared however the move ends (cut short too), never left half done.
    stageTop.value = withTiming(G.H, { duration: CLOSE_MS, easing: STAGE_EASING, reduceMotion: ReduceMotion.Never }, () => { runOnJS(finish)(); });
  };
  // Back on top: the stage is over. The words that opened it get the screen reader's focus back.
  const wasFocused = useRef(focused);
  useEffect(() => {
    const cameBack = focused && !wasFocused.current;
    wasFocused.current = focused;
    const now = getStage();
    if (!cameBack || !now || now.owner !== owner) return;
    const back = now.focusBack as { focus?: (o?: { preventScroll?: boolean }) => void } | null;
    if (back) {
      if (Platform.OS === 'web') back.focus?.({ preventScroll: true });
      else AccessibilityInfo.sendAccessibilityEvent(back as never, 'focus');
    }
    endStage();
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps
  // The page on the stage went away under it (an Instant ran out, its author
  // was blocked): the comments close the normal way.
  useEffect(() => {
    if (myStage && !myStage.lost && !feed.some((item) => keyOf(item) === myStage.key)) markLost();
  }, [feed, myStage]);
  // While a page is on the stage the feed is not dealt again under it (that
  // would rebuild the page and its player); the last such request waits and
  // runs once the stage is over. Pages added at the end are no trouble.
  const heldDeal = useRef<(() => void) | null>(null);
  const offStage = (deal: () => void) => {
    const now = getStage();
    if (now && now.owner === owner) { heldDeal.current = deal; return; }
    deal();
  };
  useEffect(() => {
    if (myStage || !heldDeal.current) return;
    const deal = heldDeal.current;
    heldDeal.current = null;
    deal();
  }, [myStage]);
  // A page above the one you are on went away (an upload that failed, an
  // Instant that expired): a phone's scroller keeps its place in points, so
  // every page below would move up one and the next clip would play instead
  // of yours. The feed is taken back to the page you were on. Arrivals (a
  // pull, more loaded, a post going to the top) are left alone: those move
  // the feed on purpose. A browser keeps the page in view by itself.
  const drawnPages = useRef<{ keys: string[]; visit: number }>({ keys: [], visit: -1 });
  useLayoutEffect(() => {
    const keyOf = (i: FeedItem) => (i.type === 'post' ? `p:${i.post.id}` : i.type === 'hit' ? `h:${i.story.id}` : i.type === 'question' ? `q:${i.question.id}` : i.type);
    const before = drawnPages.current;
    const keys = feed.map(keyOf);
    drawnPages.current = { keys, visit };
    if (scope || Platform.OS === 'web' || before.visit !== visit) return;
    const had = new Set(before.keys);
    if (keys.some((k) => !had.has(k))) return;
    const now = keys.indexOf(before.keys[active] ?? '');
    if (now >= 0 && now < active) { setActive(now); setVisit((v) => v + 1); }
  }, [feed]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Which page carries the who-to-follow strip: the first thread or written
   * post past the opening clip, and only that one. It sits at the top of the
   * page, under the eyebrow, rather than riding along the bottom.
   */
  const suggestHost = useMemo(
    () => (scope ? -1 : feed.findIndex((item, index) => index >= 1 && (item.type === 'question' || (item.type === 'post' && item.post.kind !== 'clip')))),
    [feed, scope],
  );

  const suggestStrip = suggestions.length ? (
    <View style={styles.strip}>
      <View style={styles.stripHead}>
        <Text style={styles.stripTitle}>Players you might know</Text>
        <Text style={styles.stripSub}>Based on who you talk to and where you play.</Text>
      </View>
      {/* Its own sideways bar: nativeID keeps the page swipe off it. */}
      <ScrollView
        horizontal
        nativeID="who-to-follow"
        onTouchStart={() => lockPageSwipe(true)}
        onTouchEnd={() => lockPageSwipe(false)}
        onTouchCancel={() => lockPageSwipe(false)}
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginHorizontal: -20 }}
        contentContainerStyle={styles.stripRow}
      >
        {suggestions.slice(0, 6).map(({ user, reason }) => (
          <View key={user.id} style={styles.stripCard}>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={styles.stripBody}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} ring={user.isCoach} />
              <View style={styles.stripWords}>
                <Text style={styles.stripName} numberOfLines={1}>{user.name}</Text>
                <Text style={styles.stripReason} numberOfLines={1}>{reason}</Text>
              </View>
              <LevelPill profile={user.profile} small />
            </Pressable>
            <FollowPill following={followingIds.includes(user.id)} userId={user.id} onPress={() => { setFollowedHere((h) => (h.includes(user.id) ? h : [...h, user.id])); if (followingIds.includes(user.id)) confirmUnfollow(user, () => actions.toggleFollow(user.id)); else actions.toggleFollow(user.id); }} small name={user.name} />
          </View>
        ))}
      </ScrollView>
    </View>
  ) : null;

  const [burst, setBurst] = useState({ id: '', n: 0 });

  /**
   * Double tap only ever likes, the way every app that does this behaves —
   * tapping twice on something you already liked should not take it away.
   */
  // Whether it is liked is read at the moment of the tap, not from the
  // handler's closure: the players keep the first handler they were given,
  // and a second double tap through a stale one took the like away again.
  const likedNow = useRef({ posts, stories: app.stories, me: currentUserId });
  likedNow.current = { posts, stories: app.stories, me: currentUserId };
  const likeByTap = (postId: string, _alreadyLiked?: boolean) => {
    const { posts: all, me } = likedNow.current;
    const post = all.find((p) => p.id === postId);
    if (post && me && !(wantsOn(`p:${postId}`) ?? post.likedBy.includes(me))) actions.toggleLike(postId);
    setBurst((b) => ({ id: postId, n: b.n + 1 }));
  };
  const likeHitByTap = (storyId: string, _alreadyLiked?: boolean) => {
    const { stories, me } = likedNow.current;
    const story = stories.find((s) => s.id === storyId);
    if (story && me && !(wantsOn(`h:${storyId}`) ?? story.likedBy.includes(me))) actions.toggleLikeStory(storyId);
    setBurst((b) => ({ id: storyId, n: b.n + 1 }));
  };
  const lastHitTap = useRef(0);

  // Pressable has no double tap, so count taps inside a short window.
  const lastTap = useRef({ id: '', at: 0 });
  const doubleTapFor = (postId: string, alreadyLiked: boolean) => () => {
    const now = Date.now();
    const quick = lastTap.current.id === postId && now - lastTap.current.at < 280;
    lastTap.current = quick ? { id: '', at: 0 } : { id: postId, at: now };
    if (quick) likeByTap(postId, alreadyLiked);
  };

  const share = (kind: 'post' | 'question', id: string) =>
    router.push(`/share?kind=${kind}&id=${id}`);

  /**
   * How many items either side of the current one stay mounted.
   *
   * Everything outside this becomes an empty page of the same height, so the
   * scrollbar and snap points are unchanged but the work per swipe stops
   * growing with the length of the feed. Two is enough that you never catch a
   * page mid-build, even swiping fast.
   */
  const WINDOW = 1;
  /** How many pages ahead stay mounted and buffering, so the feed is never caught out. */
  const AHEAD = 2;
  /** How many of those the first clip (and a pull-to-refresh) waits for; the rest load in behind the feed. */
  const FIRST = 1;

  // The warm-up: the first seven pages load (a video's first seconds, a
  // photo, a thread's words) before the first clip plays — or for six
  // seconds at most, whichever is first. The app opens on Community, so this
  // usually happens out of sight. Only the main feed waits.
  const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set());
  // Clips whose player has been freed since they were ready (the page went
  // out of reach): a rebuilt page fetches from nothing, so its cover comes
  // back and a refresh landing on it waits for it again. readyIds itself only
  // grows; it is what the opening warm-up waits on.
  const [goneIds, setGoneIds] = useState<Set<string>>(() => new Set());
  // `ok` true: the page's picture is in (a picture that failed counts as done
  // too: nothing waits on it, and its cover lifts). False: its video player was freed.
  const markReady = useCallback((id: string, ok: boolean) => {
    if (ok) {
      setReadyIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      setGoneIds((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
    } else {
      setGoneIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    }
  }, []);
  /** The page's picture is in right now, in the player that is actually built. */
  const inNow = (id: string) => readyIds.has(id) && !goneIds.has(id);
  // Whatever is on screen is shown within a few seconds, ready or not: a
  // picture that never arrives is the page's problem to explain, not a
  // reason to hold the reader on a placeholder.
  useEffect(() => {
    const item = feed[active];
    if (!item) return undefined;
    const id = item.type === 'post' ? item.post.id : item.type === 'question' ? item.question.id : item.type === 'hit' ? item.story.id : null;
    if (!id || readyIds.has(id)) return undefined;
    const timer = setTimeout(() => markReady(id, true), 6000);
    return () => clearTimeout(timer);
  }, [active, feed, readyIds, markReady]);
  // A post whose video only ever existed on the phone that made it will never
  // report ready: its page is shown at once so it can at least be opened and
  // deleted, rather than sitting behind the placeholder for good.
  useEffect(() => {
    for (const item of feed) {
      if (item.type === 'post' && !reachable(item.post) && !readyIds.has(item.post.id)) markReady(item.post.id, true);
    }
  }, [feed, readyIds, markReady]);
  const [warmTimedOut, setWarmTimedOut] = useState(false);
  useEffect(() => {
    if (!ready || !feed.length || !(!isSupabaseConfigured || app.remoteLoaded || app.snapshotShown)) return;
    // On the saved copy the pictures are already on the phone: a clip still
    // buffering shows its cover rather than holding the logo up for long.
    const t = setTimeout(() => setWarmTimedOut(true), app.snapshotShown && !app.remoteLoaded ? 1500 : 6000);
    return () => clearTimeout(t);
  }, [ready, feed.length, app.remoteLoaded, app.snapshotShown]);
  const warmTargets = useMemo(() => feed.slice(0, FIRST).flatMap((item) => {
    if (item.type === 'hit') return item.story.videoUrl || item.story.imageUrl ? [item.story.id] : [];
    if (item.type === 'post') return item.post.videoUrl || item.post.imageUrl || item.post.thumbnailUrl ? [item.post.id] : [];
    return [];
  }), [feed]); // eslint-disable-line react-hooks/exhaustive-deps
  const warmDone = warmTargets.filter((id) => readyIds.has(id)).length;
  // A refresh waits for the new first page as it is now: one that was ready
  // earlier but whose player has since been freed is fetching again.
  const firstReady = warmTargets.every(inNow);
  firstReadyRef.current = firstReady;
  // A pull-to-refresh holding the feed down is let go once the new first pages are in.
  useEffect(() => { if (firstReady && warmWaiters.current.length) { const w = warmWaiters.current; warmWaiters.current = []; w.forEach((fn) => fn()); } }, [firstReady]);
  const warmed = !!scope || warmTimedOut || (ready && dataIn && feed.length > 0 && warmDone >= warmTargets.length);
  // When the app opens on the feed, the shell keeps the splash curtain up
  // until this says the first pages are in.
  useEffect(() => { if (warmed && !scope) setFeedWarm(true); }, [warmed, scope]);
  // Playback starts only once the splash curtain has actually left the
  // screen (it says so itself), a beat after — never while it is still
  // fading over the player. The app opens on Community: the curtain there
  // lifts once Community has drawn (see warmup), not when the feed is in.
  const curtainDown = useCurtainDown();
  const [playable, setPlayable] = useState(!!scope);
  useEffect(() => {
    if (scope) { setPlayable(true); return; }
    if (!warmed) { setPlayable(false); return; }
    // The curtain says when it is gone; if it went up but never got to lift
    // (an alert's page opened over the launch, say), playback starts after a short wait instead.
    const t = setTimeout(() => setPlayable(true), curtainDown ? 120 : 1500);
    return () => clearTimeout(t);
  }, [warmed, curtainDown, scope]);
  // Photos and clip covers are fetched outright; a page reports itself ready when its picture lands.
  useEffect(() => {
    for (const item of feed.slice(0, AHEAD)) {
      if (item.type === 'post' && !item.post.videoUrl) {
        const uri = item.post.imageUrl ?? item.post.thumbnailUrl;
        if (uri) Image.prefetch(uri).then(() => markReady(item.post.id, true)).catch(() => markReady(item.post.id, true));
      }
      if (item.type === 'hit' && !item.story.videoUrl && item.story.imageUrl) {
        Image.prefetch(item.story.imageUrl).then(() => markReady(item.story.id, true)).catch(() => markReady(item.story.id, true));
      }
    }
  }, [feed, markReady]);

  // Warm the covers on either side so a swipe never lands on a grey rectangle.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    for (const offset of [1, -1, 2]) {
      const item = feed[active + offset];
      const url = item?.type === 'post' ? item.post.thumbnailUrl : undefined;
      if (url) {
        const img = new window.Image();
        img.src = url;
      }
    }
  }, [active, feed]);

  // Whatever is settled on screen counts as watched, once per session.
  const showing = feed[active];
  // A clip or a hit fills the page with a picture; a written post or thread does not.
  // Only clips and hits fill the screen with their picture; a photo or video post sits on the
  // page's own ground, so anything drawn at the top (the back arrow) stays dark there.
  const activeOnPicture = showing?.type === 'hit' || (showing?.type === 'post' && showing.post.kind === 'clip');
  // The top row reads white over a picture and in the theme's ink on a written page, and steps aside while pinched in.
  const chromeHidden = immersive || myStage?.mode === 'stage';
  // A real picture, that is: the demo's court cards are the page's own light ground.
  const topOnPicture = showing?.type === 'hit'
    ? !!(showing.story.imageUrl || showing.story.videoUrl)
    : showing?.type === 'post' && showing.post.kind === 'clip' && !!(showing.post.videoUrl || showing.post.thumbnailUrl || showing.post.imageUrl);
  useEffect(() => { onChrome?.({ picture: topOnPicture, hidden: chromeHidden }); }, [onChrome, topOnPicture, chromeHidden]);
  // A group's feed calls its posts after the group, where For you's say "For you".
  const groupName = scope?.groupId ? app.feedGroups.find((g) => g.id === scope.groupId)?.name : undefined;
  const scopedBack = !!scope && !scope.groupId;
  useEffect(() => {
    if (!focused || !showing) return;
    // A hit counts as watched through the story viewer, not here.
    if (showing.type === 'hit' || showing.type === 'tip' || showing.type === 'challenge') return;
    actions.recordView(
      showing.type === 'post' ? 'post' : 'question',
      showing.type === 'post' ? showing.post.id : showing.question.id,
    );
  }, [focused, showing, actions]);

  // The last page of the main feed: a small congratulations for getting
  // there this early, a way to post, and a way back to the top.
  // Kept quiet on purpose: a dark page nobody is told about, found only by
  // scrolling all the way down.
  const endPage = (
    <View key="the-end" style={styles.endPage}>
      <View style={styles.endCard}>
        <Wash height={300} strength={0.65} fade={colors.surface} />
        <View style={styles.endTile}><MarkDraw size={30} /></View>
        <Text style={styles.endTitle}>You found the bottom of CourtSide.</Text>
        <Text style={styles.endBody}>Almost nobody scrolls this far. You are one of the first people ever on here — remember this page, it will mean something later.</Text>
        <View style={styles.endActions}>
          <Button label="Leave something here" onPress={() => router.push('/compose')} full />
          <Pressable accessibilityRole="button" onPress={() => pager.current?.scrollToTop()} hitSlop={8} style={styles.endBackWrap}>
            <Text style={styles.endBack}>↑ Back to the top</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  // A feed with the For you / groups row keeps its band clear; the empty page centres in what is left, above the floating bar.
  const banded = !!topRow || !!scope?.groupId;
  const inviteToGroup = async (groupId: string, name: string) => {
    const link = shareLink('group', groupId);
    try { const said = await shareOutside(`Join ${name} on CourtSide`, link); if (said) showToast({ title: said, icon: 'link-outline' }); } catch { showToast({ title: `Share this link: ${link}`, icon: 'link-outline' }); }
  };

  return (
    <TopBandContext.Provider value={banded ? TOP_BAND_DROP : 0}>
    <View style={styles.root}>
      {!ready || !feed.length ? (
        <View style={[styles.emptyWrap, { paddingTop: banded ? insets.top + TOP_BAND_TOP + TOP_BAND_HEIGHT : insets.top, paddingBottom: barInset }]}>
          {scope?.groupId && ready ? (
            // An empty group: its face, one line, and the two things to do about it.
            // Its feed is everything its members post, so more people is the way to fill it.
            <View style={styles.groupEmpty}>
              <GroupTile name={groupName ?? 'Group'} size={72} />
              <Text style={styles.groupEmptyTitle}>When members post, it shows up here</Text>
              <Text style={styles.groupEmptyBody}>{`${groupName ?? 'A group'}’s feed shows everything its members post.`}</Text>
              <View style={styles.groupEmptyActions}>
                <Button label="Invite people" onPress={() => { void inviteToGroup(scope.groupId, groupName ?? 'my group'); }} full />
                <Button label="Post something" variant="secondary" onPress={() => router.push('/compose')} full />
              </View>
            </View>
          ) : (
            <EmptyState
              title={scope?.groupId ? 'Loading the group' : scope ? 'Nothing here yet' : ready ? 'Your court is quiet' : 'Loading your clips'}
              body={scope ? undefined : 'Be the first on it: a clip, a photo, or an instant after you play.'}
              action={!scope && ready ? { label: 'Share something', onPress: () => router.push('/compose') } : undefined}
            />
          )}
        </View>
      ) : (
        // While a page is on the comments stage, TalkBack reads the comments only, not the feed behind them.
        <View ref={viewer} style={styles.viewer} importantForAccessibility={myStage?.mode === 'stage' ? 'no-hide-descendants' : 'auto'}>
          {/* Pull-to-refresh is for phones: the app and a phone's browser (`phone`, above). Asking
              isDesktopBrowser() alone took it off the iPhone app: the app has no browser to read,
              so the check answered "computer" there, and the pull strip was never built. */}
          <VerticalPager ref={pager} key={visit} initialIndex={active} onIndex={setActive} onRefresh={scope || !phone ? undefined : refreshFeed} pullHeader={scope || !currentUser ? undefined : (
            <View style={styles.pullGreeting}>
              <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={28} />
              <Text style={styles.pullGreetingText}>{`${currentUser.name.split(' ')[0]}'s homepage`}</Text>
            </View>
          )}>
            {[...feed.map((item, index) => {
              const distance = Math.abs(index - active);
              const ahead = index - active;
              const pageKey = item.type === 'post' ? item.post.id : item.type === 'question' ? item.question.id : item.type === 'hit' ? item.story.id : item.type;
              // Two pages behind and seven ahead stay built; the rest hold their slot.
              if (ahead < -WINDOW || ahead > AHEAD) {
                // A page not built yet holds its slot with the brand on it, so a
                // fast scroll lands on the mark (a post) or the name (a clip or thread).
                return <View key={pageKey} style={styles.holdPage}>{item.type === 'post' && item.post.kind !== 'clip' ? skeletonPost : skeletonClip}</View>;
              }
              // The same over a built page whose picture has not landed yet.
              const cover = (id: string, kind: 'mark' | 'word', poster?: string, wide?: boolean) => {
                if (inNow(id)) { coverQuick.current.delete(id); return null; }
                let quickCover = coverQuick.current.get(id);
                if (quickCover === undefined) { quickCover = quick; coverQuick.current.set(id, quickCover); }
                if (kind === 'word' && quickCover && poster) {
                  return (
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: wide || !phone ? '#000' : colors.bg }]}>
                      <ExpoImage accessibilityIgnoresInvertColors source={{ uri: poster }} style={StyleSheet.absoluteFill} cachePolicy="memory-disk" contentFit={wide || !phone ? 'contain' : 'cover'} />
                      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><CourtSpinner ink="white" /></View>
                    </View>
                  );
                }
                return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.holdPage]}>{kind === 'mark' ? skeletonPost : skeletonClip}</View>;
              };
              // On a phone, the page behind and two ahead keep their video buffered.
              // In a browser (where every video decodes on the same machine as the
              // scroll) only the page on screen and the next one do: the first clip
              // buffers while the feed is still warming up instead of waiting for
              // it, the one you are most likely to land on starts instantly, and
              // scrolling stays smooth.
              const near = Platform.OS === 'web' ? (ahead === 0 || ahead === 1) && (!warming || ahead === 0) : distance <= 1 || (ahead > 0 && ahead <= AHEAD);
              const strip = index === suggestHost ? suggestStrip : null;

              if (item.type === 'tip') return <TipPage key="tip" onSubmit={actions.submitTip} />;
              if (item.type === 'challenge') return <ChallengePage key="challenge" challenge={challenge} />;

              if (item.type === 'hit') {
                const story = item.story;
                const author = usersById.get(story.authorId);
                if (!author) return <View key={story.id} />;
                const hitLiked = !!currentUserId && story.likedBy.includes(currentUserId);
                const hitKey = `h:${story.id}`;
                // A video or a tall photo fills the page; a wide photo shrinks as its own box.
                const openHitComments = (from?: unknown) => openComments('hit', story.id, !story.videoUrl && story.imageUrl && hitShapes.current.get(story.id) ? 'wide-photo' : 'portrait', from);
                return (
                  <View key={story.id} style={styles.clip}>
                   <PinchZone onPinchOut={() => lock(true)} onPinchIn={() => lock(false)}><Reanimated.View style={[StyleSheet.absoluteFill, pictureStyle]}>
                    <View accessibilityLabel={`${author.name}'s instant`} style={styles.clipFrame}>
                      <View style={phone ? StyleSheet.absoluteFill : styles.clipPortrait}>
                        {story.videoUrl ? (
                          <ClipPlayback uri={story.videoUrl} poster={story.thumbnailUrl} active={playing && active === index && warmed && playable} held={held && myStage?.key === hitKey} onStage={myStage?.key === hitKey} preload={near} warmOnly={warming} bare={immersive} onDoubleTap={() => likeHitByTap(story.id, hitLiked)} discInk={theme === 'us-open' ? '#FFFFFF' : colors.brand} discPinned={index === 0 && !scope} onReady={(ok) => markReady(story.id, ok)} />
                        ) : (
                          // Two quick taps like a hit, the way they like a clip.
                          <Pressable accessibilityRole="image" accessibilityLabel={`${author.name}'s instant`} onPress={() => { const now = Date.now(); if (now - lastHitTap.current < 280) { lastHitTap.current = 0; likeHitByTap(story.id, hitLiked); } else lastHitTap.current = now; }} style={StyleSheet.absoluteFill}>
                            {story.imageUrl ? (
                              <HitPicture uri={story.imageUrl} onShape={(wide) => hitShapes.current.set(story.id, wide)} />
                            ) : (
                              <MediaPlaceholder label={story.mediaLabel ?? 'Instant'} seed={story.id} portrait fill />
                            )}
                          </Pressable>
                        )}
                      </View>
                    </View>
                    {burst.id === story.id ? <LikeBurst token={burst.n} /> : null}
                    <ChromeLayer immersion={immersion} style={StyleSheet.absoluteFill} pointerEvents={immersive ? 'none' : 'box-none'}>
                    {/* An Instant's words are set exactly like a clip's: the same shade, the same who-line, the same small line. */}
                    <ReelScrim bottom={wordsBottom} />
                    <Reanimated.View style={[styles.caption, { bottom: wordsBottom }, tuckStyle]}>
                      <View style={styles.words}>
                        <ReelWho author={author} onAuthor={() => { tappedAuthor(`h:${story.id}`); router.push(author.id === currentUserId ? '/profile' : `/user/${author.id}`); }} />
                        {/* The words and the small line open the comments, the whole caption at their top. */}
                        {story.caption ? <FoldedWords text={story.caption} onPress={openHitComments} /> : null}
                        <InstantMeta expiresAt={story.expiresAt} onPress={openHitComments} />
                      </View>
                      {/* Only while Home is the tab on show: on the phone it is built
                          beside Community at launch, and the hint's few showings
                          would run out off screen. */}
                      {index === 0 && !scope && focused ? <SwipeHint /> : null}
                    </Reanimated.View>
                    <Reanimated.View style={[styles.actions, { bottom: wordsBottom + RAIL_DROP }, tuckStyle]}>
                      <RailShade />
                      <LikeButton ledgerKey={`h:${story.id}`} liked={hitLiked} count={story.likedBy.length} onToggle={() => actions.toggleLikeStory(story.id)} likesRoute={{ pathname: '/likes', params: { id: story.id, kind: 'hit' } }} pop={burst.id === story.id ? burst.n : 0} what="hit" size={RAIL_ICONS[0][1]} style={styles.action} glyphStyle={styles.actionGlyph} labelStyle={styles.actionLabel} />
                      <Tappable accessibilityLabel="Hit comments" onPress={() => openHitComments()} scaleTo={0.78} style={styles.action}>
                        <Ionicons name="chatbubble-outline" size={RAIL_ICONS[1][1]} color="white" style={styles.actionGlyph} />
                        <Text style={styles.actionLabel} maxFontSizeMultiplier={MAX_GROW}>{railCount(story.commentIds.length)}</Text>
                      </Tappable>
                      <Tappable accessibilityLabel="More options" onPress={() => router.push({ pathname: '/post-menu', params: { id: story.id, kind: 'hit' } })} scaleTo={0.78} style={styles.action}>
                        <Ionicons name="ellipsis-horizontal" size={RAIL_ICONS[4][1]} color="white" style={styles.actionGlyph} />
                      </Tappable>
                    </Reanimated.View>
                    </ChromeLayer>
                   </Reanimated.View></PinchZone>
                    {story.videoUrl ? cover(story.id, 'word', story.thumbnailUrl) : null}
                  </View>
                );
              }

              if (item.type === 'question') {
                const isSaved = saved.questionIds.includes(item.question.id);
                return (
                  <View key={item.question.id} style={[styles.article, styles.threadArticle, scope && styles.articleScoped]}>
                    <Wash height={300} strength={0.6} />
                    <View style={styles.eyebrowRow}>
                      <Text style={styles.eyebrow}>From the community</Text>
                      {hiddenMarks.has(item.question.id) ? <View style={{ width: 34, height: 34 }} /> : <TapAway label="Hide the CourtSide logo" onHidden={() => hideMark(item.question.id)} style={styles.threadMark}><BrandMark size={34} /></TapAway>}
                    </View>
                    {strip}
                    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', justifyContent: 'flex-start' }}>
                      <QuestionCard
                        showBody
                        brandCorner
                        question={item.question}
                        author={usersById.get(item.question.authorId)}
                        answered={Boolean(item.question.acceptedAnswerId)}
                        saved={isSaved}
                        onToggleSave={() => actions.toggleSaveQuestion(item.question.id)}
                        onShare={() => share('question', item.question.id)}
                        onPress={() => router.push(`/question/${item.question.id}`)}
                      />
                      <Pressable accessibilityRole="link" accessibilityLabel="Read full thread" onPress={() => router.push(`/question/${item.question.id}`)}>
                        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                          <ThreadReplies questionId={item.question.id} preview/>
                        </View>
                      </Pressable>
                      {/* The replies run on to the bottom and fade into the page: plainly more below, a tap away, without a line saying so. */}
                      <LinearGradient pointerEvents="none" colors={[`${colors.bg}00`, colors.bg]} style={styles.threadFade} />
                    </View>
                  </View>
                );
              }

              const post = item.post;
              const author = usersById.get(post.authorId);
              if (!author) return <View key={post.id} />;
              const isSaved = saved.postIds.includes(post.id);

              if (post.kind !== 'clip' && (post.imageUrl || post.videoUrl)) {
                // A photo or video post: the picture up top, the words and
                // buttons below it in the app's own type, like every other page.
                const liked = !!currentUserId && post.likedBy.includes(currentUserId);
                return (
                  <View key={post.id} style={styles.clip}>
                    <MediaPostPage
                      post={post}
                      author={author}
                      liked={liked}
                      saved={isSaved}
                      active={playing && active === index && warmed && playable}
                      preload={near}
                      topInset={insets.top + 66}
                      onDoubleTap={() => likeByTap(post.id, liked)}
                      onToggleLike={() => actions.toggleLike(post.id)}
                      onToggleSave={() => actions.toggleSavePost(post.id)}
                      onComment={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })}
                      onShare={() => share('post', post.id)}
                      onMore={() => router.push({ pathname: '/post-menu', params: { id: post.id } })}
                      discInk={theme === 'us-open' ? '#FFFFFF' : colors.brand}
                      burst={burst.id === post.id ? <LikeBurst token={burst.n} /> : null}
                      pop={burst.id === post.id ? burst.n : 0}
                      onReady={(ok) => markReady(post.id, ok)}
                    />
                    {cover(post.id, 'mark')}
                  </View>
                );
              }

              if (post.kind !== 'clip') {
                return (
                  // A session posted with no photo is its card: the page keeps clear of the
                  // floating tab bar, so the caption and buttons under the card stay in view.
                  <View key={post.id} style={[styles.article, scopedBack && styles.articleScoped, !phone && styles.articleCentred, (topRow || !!scope?.groupId) && { paddingTop: insets.top + 64 }, barInset > 0 && post.session && hasSessionStats(post.session) && !post.imageUrl && !post.videoUrl ? { paddingBottom: barInset + 8 } : null]}>
                    <Wash height={300} strength={0.6} />
                    {strip}
                    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', justifyContent: 'flex-start' }}>
                      <PostCard
                        post={post}
                        author={author}
                        liked={!!currentUserId && post.likedBy.includes(currentUserId)}
                        onToggleLike={() => actions.toggleLike(post.id)}
                        saved={isSaved}
                        onToggleSave={() => actions.toggleSavePost(post.id)}
                        onShare={() => share('post', post.id)}
                        onComment={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })}
                        onPress={() => router.push(`/post/${post.id}`)}
                        onPressAuthor={() => router.push(`/user/${author.id}`)}
                        clamp={8}
                        active={active === index && focused}
                      />
                    </View>
                  </View>
                );
              }

              const liked = !!currentUserId && post.likedBy.includes(currentUserId);
              // A landscape clip shrinks as its wide band; anything else, the whole page.
              const openClipComments = (from?: unknown) => openComments('post', post.id, post.orientation === 'landscape' ? 'landscape' : 'portrait', from);
              return (
                <View key={post.id} style={styles.clip}>
                 <PinchZone onPinchOut={() => lock(true)} onPinchIn={() => lock(false)}><Reanimated.View style={[StyleSheet.absoluteFill, pictureStyle]}>
                  {post.videoUrl ? (
                    // A clip keeps its own shape on every screen: a vertical clip is a
                    // tall box, a landscape one a wide box, centred, with the theme
                    // colour around it rather than black bars or a crop.
                    <View style={[styles.clipFrame, post.orientation === 'landscape' && { backgroundColor: '#000' }]}>
                      <View style={post.orientation === 'landscape' || phone ? StyleSheet.absoluteFill : styles.clipPortrait}>
                        <ClipPlayback
                          letterbox={post.orientation === 'landscape'}
                          uri={post.videoUrl}
                          poster={post.thumbnailUrl}
                          active={playing && active === index && warmed && playable}
                          preload={near}
                          warmOnly={warming}
                          onDoubleTap={() => likeByTap(post.id, liked)}
                          trimStart={post.trimStart}
                          trimEnd={post.trimEnd}
                          speed={post.speed}
                          volume={post.volume}
                          crop={post.crop}
                          silent={post.muted}
                          bare={immersive}
                          discInk={theme === 'us-open' ? '#FFFFFF' : colors.brand}
                          discPinned={index === 0 && !scope}
                          onReady={(ok) => markReady(post.id, ok)}
                          held={held && myStage?.key === `p:${post.id}`}
                          onStage={myStage?.key === `p:${post.id}`}
                        />
                      </View>
                    </View>
                  ) : post.thumbnailUrl ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Double tap to like"
                      onPress={doubleTapFor(post.id, liked)}
                      style={StyleSheet.absoluteFill}
                    >
                      <ExpoImage
                        accessibilityIgnoresInvertColors
                        source={{ uri: post.thumbnailUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover" cachePolicy="memory-disk"
                      />
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Double tap to like"
                      onPress={doubleTapFor(post.id, liked)}
                      style={styles.preview}
                    >
                      <View style={styles.court}>
                        <View style={styles.net} />
                        <View style={styles.service} />
                      </View>
                      <Ionicons name="cloud-offline-outline" size={54} color={colors.court} />
                      <Text style={styles.previewTitle}>{post.mediaLabel}</Text>
                      <Text style={styles.previewNote}>
                        This clip didn’t finish uploading
                      </Text>
                    </Pressable>
                  )}

                  {burst.id === post.id ? <LikeBurst token={burst.n} /> : null}

                  <ChromeLayer immersion={immersion} style={StyleSheet.absoluteFill} pointerEvents={immersive ? 'none' : 'box-none'}>

                  <ReelScrim bottom={wordsBottom} />

                  <Reanimated.View style={[styles.caption, { bottom: wordsBottom }, tuckStyle]}>
                    <ReelCaption post={post} author={author} onAuthor={() => { tappedAuthor(`p:${post.id}`); router.push(`/user/${author.id}`); }} onOpenComments={openClipComments} onOpenStats={() => openStage('/session-stats', 'post', post.id, post.orientation === 'landscape' ? 'landscape' : 'portrait')} active={active === index && focused} />
                    {/* Only while Home is on show (see the Instant's hint above). */}
                    {index === 0 && !scope && focused ? <SwipeHint /> : null}
                  </Reanimated.View>

                  {/* The rail stands on the words' bottom line, as on TikTok and Reels, so it rises only as high as it must. */}
                  <Reanimated.View style={[styles.actions, { bottom: wordsBottom + RAIL_DROP }, tuckStyle]}>
                    <RailShade />
                    <LikeButton ledgerKey={`p:${post.id}`} liked={liked} count={post.likedBy.length} onToggle={() => actions.toggleLike(post.id)} likesRoute={{ pathname: '/likes', params: { id: post.id } }} pop={burst.id === post.id ? burst.n : 0} what="clip" size={RAIL_ICONS[0][1]} style={styles.action} glyphStyle={styles.actionGlyph} labelStyle={styles.actionLabel} />
                    <Tappable
                      accessibilityLabel="Clip comments"
                      onPress={() => openClipComments()}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="chatbubble-outline" size={RAIL_ICONS[1][1]} color="white" style={styles.actionGlyph} />
                      <Text style={styles.actionLabel} maxFontSizeMultiplier={MAX_GROW}>{railCount(post.commentIds.length)}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="Send this clip to someone"
                      onPress={() => share('post', post.id)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="arrow-redo-outline" size={RAIL_ICONS[2][1]} color="white" style={styles.actionGlyph} />
                      <Text style={styles.actionLabel} maxFontSizeMultiplier={MAX_GROW}>{railCount(post.shares ?? 0)}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this clip'}
                      onPress={() => actions.toggleSavePost(post.id)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={RAIL_ICONS[3][1]} color="white" style={styles.actionGlyph} />
                      <Text style={styles.actionLabel} maxFontSizeMultiplier={MAX_GROW}>{railCount(post.savedBy?.length ?? 0)}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="More options"
                      onPress={() => router.push({ pathname: '/post-menu', params: { id: post.id } })}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="ellipsis-horizontal" size={RAIL_ICONS[4][1]} color="white" style={styles.actionGlyph} />
                    </Tappable>
                  </Reanimated.View>
                  </ChromeLayer>
                 </Reanimated.View></PinchZone>
                  {post.videoUrl ? cover(post.id, 'word', post.thumbnailUrl, post.orientation === 'landscape') : null}
                </View>
              );
            }).map((page, index) => {
              // The wordmark rides every full-screen moment — a clip or a hit —
              // inside its own page, so it leaves with that page as you swipe
              // instead of hanging in place and then vanishing. Written posts
              // and threads have their own eyebrow and go without.
              const item = feed[index];
              const media = item?.type === 'hit' || (item?.type === 'post' && (item.post.kind === 'clip' || !!item.post.imageUrl || !!item.post.videoUrl));
              // The fade only belongs on a real picture or video; the demo court cards do without.
              const picture = item?.type === 'hit'
                ? !!(item.story.imageUrl || item.story.videoUrl)
                : item?.type === 'post' && item.post.kind === 'clip' && !!(item.post.videoUrl || item.post.thumbnailUrl || item.post.imageUrl);
              if (!media && item) return page;
              const key = item?.type === 'post' ? item.post.id : item?.type === 'hit' ? item.story.id : 'first';
              const pageKey = item ? keyOf(item) : 'first';
              // Only a built page (the one on screen and those either side) can go onto the stage.
              const built = index - active >= -WINDOW && index - active <= AHEAD;
              const markStyle = [styles.wordmarkOverlay, { top: insets.top + 24 }, media && picture && styles.clipMarkOverlay];
              /* A tap on the mark tucks it away for this page only. Over a clip or hit it is the
                 small mark at the top left, part of the picture; on a post, the wordmark. */
              const markTile = media && picture ? (
                <TapAway label="Hide the CourtSide mark" onHidden={() => hideMark(key)} style={styles.markPill}>
                  <BrandMark size={30} color={theme === 'us-open' ? '#FFFFFF' : colors.brand} />
                </TapAway>
              ) : (
                <TapAway label="Hide the CourtSide wordmark" onHidden={() => hideMark(key)}>
                  <Text style={[styles.wordmark, theme === 'us-open' && { color: '#FFFFFF' }]}>CourtSide</Text>
                </TapAway>
              );
              // Over a picture the wordmark sits in a small pill of the theme's own
              // background, so it reads on anything without touching the picture.
              const mark = scope || topRow || hiddenMarks.has(key) || (immersive && index === active) ? null
                : built ? <ChromeLayer pointerEvents="box-none" style={markStyle}>{markTile}</ChromeLayer>
                  : <View pointerEvents="box-none" style={markStyle}>{markTile}</View>;
              return (
                <React.Fragment key={key}>
                  {built ? (
                    <StagePage owner={owner} stageKey={pageKey} staged={myStage?.mode === 'stage' && myStage.key === pageKey} onNode={notePageNode}>
                      {page}
                      {mark}
                    </StagePage>
                  ) : (
                    <View style={stageStyles.page}>
                      {page}
                      {mark}
                    </View>
                  )}
                </React.Fragment>
              );
            }), ...(scope ? [] : [endPage])]}
          </VerticalPager>

          {scopedBack ? (
            // The same plain chevron every other page has. Over a picture it sits on the mark's tile, in
            // the mark's ink: a bare white arrow vanished on a bright sky or a white ceiling.
            <Reanimated.View ref={scopeBackFade.ref as never} pointerEvents="box-none" style={[styles.scopeBackLayer, scopeBackFade.style]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => goBack()} style={[styles.scopeBack, activeOnPicture && styles.scopeBackTile, { top: insets.top + (activeOnPicture ? 7 : 10) }]}>
                <Ionicons name="chevron-back" size={22} color={activeOnPicture ? (theme === 'us-open' ? '#FFFFFF' : colors.brand) : colors.text} />
              </Pressable>
            </Reanimated.View>
          ) : null}
          {/* Over a clip or an Instant the phone's clock and battery turn white, as on TikTok, Reels and Shorts:
              the theme's dark clock sank into a dark court, and the top shade keeps a white one clear of a bright sky.
              Only once the picture is in (the cover before it is the page's own ground), and only while this page is in front:
              For you held still under a group's feed keeps quiet, or its white clock vanished on the group's light page. */}
          {focused && !paused && activeOnPicture && showing && (showing.type === 'hit' ? inNow(showing.story.id) : showing.type === 'post' && inNow(showing.post.id)) ? <StatusBar style="light" animated /> : null}
        </View>
      )}
    </View>
    </TopBandContext.Provider>
  );
}

/** "INSTANT · 22h left", ticking once a minute so it never reads stale. */
const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  // An empty feed: centred in the room between the top row's band and the floating bar, on the page's own ground.
  emptyWrap: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  groupEmpty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, width: '100%', maxWidth: 360 },
  groupEmptyTitle: { ...typography.title, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  groupEmptyBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  groupEmptyActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  scopeBack: { position: 'absolute', left: 12, padding: 6, zIndex: 6 },
  // Its own layer over the feed, so it can fade as a clip goes onto the comments stage.
  scopeBackLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6 },
  // Over a picture: the mark's tile, 40 square (the sound disc's size), the chevron nudged right of centre to sit centred by eye.
  scopeBackTile: { width: 40, height: 40, padding: 0, paddingRight: 2, borderRadius: 12, backgroundColor: `${colors.bg}E6`, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  wordmarkOverlay: {
    // top comes from the safe-area inset at render; a fixed value put the
    // wordmark under the Dynamic Island on a phone.
    position: 'absolute', width: '100%',
    paddingHorizontal: 20, zIndex: 5, alignItems: 'center',
  },
  pullGreeting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // The mark sits at the far left of the gap, level with the greeting; the greeting and disc in the middle.
  pullGreetingText: { ...typography.bodyStrong, color: colors.text },
  wordmark: {
    color: colors.brand, ...typography.title, fontSize: 23, ...font('600'), letterSpacing: -0.6,
  },
  // Kept as a hook for anything the wordmark needs over video; the shadow that
  // used to live here was doing more harm than good.
  // Over a clip: the mark alone, top left, with the same soft shadow the caption wears.
  clipMarkOverlay: { alignItems: 'flex-start', paddingLeft: 34 },
  // The mark sits in the same pale tile the sound disc wears: nearly solid, so the green mark stays
  // crisp (fading the whole tile faded the mark too), with a hairline so it holds on a white sky.
  markPill: { width: 46, height: 46, borderRadius: 13, backgroundColor: `${colors.bg}E6`, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, width: '100%', minHeight: 0 },
  clip: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  holdPage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  holdWord: { ...typography.display, fontSize: 34, ...font('600'), color: colors.brand, letterSpacing: -1.2 },
  bone: { height: 12, borderRadius: 6, backgroundColor: colors.border },
  holdPost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 16 + BAR_OVERLAY_PX, alignItems: 'center' },
  boneFrame: { alignSelf: 'stretch', aspectRatio: 4 / 5, maxHeight: '58%', borderRadius: 16, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boneRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginTop: 14 },
  boneAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },
  clipFrame: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  clipPortrait: { height: '100%', aspectRatio: 9 / 16, maxWidth: '100%', overflow: 'hidden', backgroundColor: colors.bg },
  clipLandscape: { width: '100%', aspectRatio: 16 / 9, maxHeight: '100%', overflow: 'hidden', backgroundColor: '#000' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 },
  court: {
    position: 'absolute',
    top: '15%',
    bottom: '25%',
    left: '12%',
    right: '12%',
    borderWidth: 1,
    borderColor: colors.court,
  },
  net: { position: 'absolute', top: '50%', height: 1, width: '100%', backgroundColor: colors.court },
  service: { position: 'absolute', top: '20%', bottom: '20%', left: '50%', width: 1, backgroundColor: colors.court },
  previewTitle: {
    color: colors.text,
    fontSize: 16,
    ...font('600'),
    textAlign: 'center',
    backgroundColor: '#203E2ACC',
    padding: 8,
  },
  previewNote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 230,
    backgroundColor: '#203E2ACC',
  },
  // The words' column: 16 in from the left, as Reels and Shorts sit, and
  // stopping 72 from the right (the rail's 48, its 12 from the edge, 12 of
  // air), so a caption never runs under the rail. `bottom` is set per phone.
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingLeft: 16,
    paddingRight: 72,
    backgroundColor: 'transparent',
    gap: 8,
  },
  words: { gap: 6 },
  author: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  // The rail: 12 from the edge, one item every 63pt or so (TikTok's and Reels' rhythm). `bottom` is set per phone.
  actions: { position: 'absolute', right: 12, gap: 16 },
  action: { alignItems: 'center', gap: 2, minWidth: 48 },
  // Plain white outlines with a crisp dark edge, as Reels sets them, rather than a heavier icon or a soft smudge.
  actionGlyph: GLYPH_EDGE,
  // Counts in the name's weight (TikTok's newest rail), figures all one width so "9" to "10" does not shift.
  // They sit high, where the words' shade is lightest (the rail's own shade is behind them), so they wear the darkest edge (COUNT_EDGE); the heart's count takes this too.
  actionLabel: { color: 'white', fontSize: 13, lineHeight: 16, ...font('600'), letterSpacing: 0.1, fontVariant: ['tabular-nums'], ...COUNT_EDGE },
  // The feed's pages hold their size while the bar ducks, so the bottom few
  // points can sit under a full-size bar: written pages keep that much clear.
  article: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 64, paddingBottom: 32, gap: 20 },
  // In a scoped feed the back chevron has its own line above the words.
  articleScoped: { paddingTop: 116 },
  // On a computer a written post is a centred column like a photo post, not
  // a card stretched across the whole window with its words at the far left.
  articleCentred: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  strip: { gap: 8, paddingBottom: 2 },
  stripHead: { gap: 2 },
  stripTitle: { ...typography.heading, fontSize: 16, color: colors.text },
  stripSub: { ...typography.small, color: colors.textMuted },
  stripRow: { gap: 10, paddingHorizontal: 20, paddingVertical: 6 },
  // A card per player: the picture first, the name, the level in its colour, why they're here.
  stripCard: {
    width: 136,
    padding: 12,
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stripBody: { alignItems: 'center', gap: 6 },
  stripWords: { alignItems: 'center', gap: 2 },
  stripName: { ...typography.bodyStrong, fontSize: 14, color: colors.text, textAlign: 'center' },
  stripReason: { ...typography.small, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  threadArticle: { gap: 8, paddingBottom: BAR_OVERLAY_PX + 12 },
  eyebrow: { ...typography.smallStrong, color: colors.textMuted },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  threadMark: { marginRight: 6, marginTop: 6 },
  threadFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 },
  // The theme's own colours, so the page belongs to whichever look is on.
  endPage: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  // Centred in its page on every screen size (it sat to the left on a wide computer window).
  endCard: { ...lift, alignSelf: 'center', maxWidth: 520, width: '100%', gap: spacing.lg, padding: spacing.xl, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  endTile: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  endTitle: { ...typography.title, color: colors.text },
  endBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  endActions: { gap: spacing.md, paddingTop: spacing.xs },
  endBackWrap: { alignSelf: 'center' },
  endBack: { ...typography.smallStrong, color: colors.textMuted },
});

/**
 * The Feed tab: For you, and a feed for each group you are in (migration 67),
 * picked from the words across the top. For you stays built underneath a
 * group's feed (held still), so coming back finds it where you left it. One
 * person's or one court's feed (a scope) is the plain feed, with no row.
 */
function FeedTab({ scope, previewSection }: { previewSection?: string; scope?: FeedScope } = {}) {
  if (scope) return <Home scope={scope} previewSection={previewSection} />;
  return <GroupedFeed />;
}

function GroupedFeed() {
  const app = useApp();
  const { feedGroups, currentUserId, actions } = app;
  const [groupId, setGroupId] = useState<string | null>(null);
  const [chrome, setChrome] = useState<FeedChrome>({ picture: false, hidden: false });
  useEffect(() => { if (currentUserId) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  // A group you left (or were taken out of) goes back to For you.
  useEffect(() => { if (groupId && !feedGroups.some((g) => g.id === groupId)) setGroupId(null); }, [feedGroups, groupId]);
  // Opened from a group's page ("See the feed").
  useEffect(() => onOpenGroupFeed((id) => { tookGroupFeed(); setGroupId(id); }), []);
  const forYouChrome = useCallback((c: FeedChrome) => { if (!groupId) setChrome(c); }, [groupId]);
  const groupChrome = useCallback((c: FeedChrome) => setChrome(c), []);
  const waiting = feedGroups.some((g) => g.requests.length > 0 && g.members.some((m) => m.id === currentUserId && m.admin));
  return (
    <View style={{ flex: 1, alignSelf: 'stretch' }}>
      <Home topRow paused={!!groupId} onChrome={forYouChrome} />
      {groupId ? (
        <View style={StyleSheet.absoluteFill}>
          <Home key={groupId} scope={{ groupId }} onChrome={groupChrome} />
        </View>
      ) : null}
      {currentUserId ? (
        <FeedTopRow
          groups={feedGroups}
          selected={groupId}
          onSelect={(next) => { if (next !== groupId) { haptics.tap(); setGroupId(next); } }}
          onPlus={() => router.push('/find-groups')}
          onPicture={chrome.picture}
          hidden={chrome.hidden}
          waiting={waiting}
        />
      ) : null}
    </View>
  );
}

export default asTabRoute<{ previewSection?: string; scope?: FeedScope }>(FeedTab);
