import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { Avatar } from '@/components/ui/Avatar';
import { Glass } from '@/components/ui/Glass';
import { GroupAvatar, groupName, isGroupChat, isMutedFor, messageSummary, named, nameList, othersIn } from '@/features/messages/groups';
import { bannerReducer, emptyQueue, keepNews, newsCount, type ChatNews, type Keep, type News } from '@/features/messages/bannerQueue';
import { setBannerReach } from '@/features/messages/bannerSpace';
import { judgeIncoming, subscribeIncoming } from '@/features/messages/incoming';
import { useCurtainDown } from '@/features/feed/warmup';
import { useTourBusy } from '@/features/tour/tourStore';
import * as haptics from '@/lib/haptics';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import type { User } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

/** How long a banner stays, the way Instagram's does. */
const SHOW_MS = 4000;
/** With VoiceOver or TalkBack on, long enough to hear it and reach it. */
const SCREEN_READER_MS = 9000;
/**
 * However often a busy chat updates it, a banner is gone this long after it
 * dropped in, so it never sits over a page's header (its Back button) for good.
 */
const MAX_MS = 8000;
const SCREEN_READER_MAX_MS = 15000;
/** A breath between one banner leaving and the next arriving, so they read as two. */
const GAP_MS = 140;
/** A gentle drop: settles with the faintest give, no bounce. */
const SPRING = { damping: 22, stiffness: 260, mass: 0.9, reduceMotion: ReduceMotion.Never };
/** Our own Reduce Motion handling picks the animation, so Reanimated is told not to second-guess it. */
const NEVER = ReduceMotion.Never;
/**
 * Pages where you are writing something. A banner waits until you leave, so
 * it never drops over the Share or Back button just as you reach for it.
 */
const WRITING = new Set(['/compose', '/edit-post', '/ask', '/ask-coach', '/log-session', '/pick-session', '/court-report', '/court-now', '/hit-request/new']);

/**
 * The demo in a browser (no database): `?banner=demo` has a message arrive a
 * moment after the app opens, `?banner=group` one in a group, `?banner=pile`
 * several chats at once, so the banner can be seen and photographed without
 * a second phone. Never with a real database, never on a phone.
 */
const DEMO: 'one' | 'group' | 'pile' | null = (() => {
  if (isSupabaseConfigured || Platform.OS !== 'web') return null;
  try {
    const asked = new URLSearchParams(window.location.search).get('banner');
    return asked === 'group' || asked === 'pile' ? asked : asked ? 'one' : null;
  } catch { return null; }
})();

type Face = { kind: 'person'; user: User; group?: { photoUrl?: string; name: string } } | { kind: 'people'; people: User[]; photoUrl?: string; name: string } | { kind: 'none' };

/**
 * A new message, dropping in at the top while the app is open, the way
 * Instagram's does: who it is from, what they said, a tap to open the chat.
 * A flick up puts it away; it goes by itself after four seconds, and waits
 * while a finger (or, on a computer, the pointer) rests on it. More from the
 * same chat updates it ("2 new messages"); other chats wait their turn, and
 * a pile of them folds into one. On a computer it is a small card in the
 * top-right corner instead of a strip across the top.
 *
 * Fed by src/features/messages/incoming.ts (the store's live messages, and a
 * phone alert landing while the app is open), and quiet for your own
 * messages, a muted chat (unless it @mentions you), anyone you blocked, the
 * chat or inbox you are already looking at, the splash curtain, the
 * tutorial, and the pages the shell keeps to themselves (`enabled`: sign-in,
 * setup, the camera, a story). While you write a post or a question it waits.
 *
 * On an iPhone it is drawn on the window's own overlay, above the pages iOS
 * slides up over the app (comments, share, a post's menu).
 *
 * There is no browser twin of this file: the gestures and the drawing are
 * the same everywhere, and the few differences (hover, the close button on
 * a computer) are checks below.
 */
export function MessageBanner({ enabled }: { enabled: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const { id: routeId } = useGlobalSearchParams<{ id?: string }>();
  const tourBusy = useTourBusy();
  const curtainDown = useCurtainDown();
  const { conversations, users, currentUserId, currentUser, blockedIds, actions } = useApp();
  const [q, dispatch] = useReducer(bannerReducer, emptyQueue);

  // The chat on screen: its thread, or its details page.
  const openChat = pathname === '/messages/group' ? routeId ?? null : pathname.startsWith('/messages/') ? pathname.slice('/messages/'.length) : null;
  const onInbox = pathname === '/messages';
  // Whether a banner can be seen at all. Not under the splash curtain, which
  // would hide it until its four seconds ran out, nor the tutorial.
  const ready = enabled && !tourBusy && curtainDown;
  // The inbox already shows every chat's news, so nothing drops in over it.
  const allowed = ready && !onInbox;
  const writing = WRITING.has(pathname);
  const handle = currentUser?.handle;

  /** Whether a chat's news may still show, given what is on screen and what you have muted or blocked. */
  const keep = useCallback<Keep>((news) => {
    if (news.conversationId === openChat) return null;
    const chat = conversations.find((c) => c.id === news.conversationId);
    // A phone alert in a muted chat only ever comes for an @mention, so alerts are left as they are.
    const messages = news.messages.filter((m) => !blockedIds.includes(m.senderId) && !(chat && isMutedFor(chat, m, handle)));
    return messages.length === news.messages.length ? news : { ...news, messages };
  }, [openChat, conversations, blockedIds, handle]);
  const keepRef = useRef(keep);
  keepRef.current = keep;
  // Whether the banner is drawn on screen now (set as it comes in, cleared once it has gone).
  const onScreen = useRef(false);
  // While you write, news waits its turn; one already down stays while it leaves.
  // A banner on its way out keeps its last words until it has gone.
  const visible = allowed && q.current && (!writing || onScreen.current)
    ? (q.leaving ? (onScreen.current ? q.current : null) : keepNews(q.current, keep))
    : null;

  // How the banner decides, asked for every new message and phone alert
  // (incoming.ts), so what it would never show never reaches the queue, and
  // the phone shows its own alert whenever this can't. Your own messages and
  // event lines ("Mira added Dev") never show; nor does anything while the
  // app is out of sight.
  const gate = useRef({ ready, onInbox, openChat, me: currentUserId });
  gate.current = { ready, onInbox, openChat, me: currentUserId };
  useEffect(() => judgeIncoming((conversationId, message) => {
    const g = gate.current;
    // That chat (or the inbox) on screen: nothing at all, not even the phone's own alert (Oct 4, owner).
    if (AppState.currentState === 'active' && (g.onInbox || conversationId === g.openChat)) return 'here';
    if (!g.ready || AppState.currentState !== 'active') return 'off';
    if (message) {
      if (message.senderId === g.me || message.kind === 'system') return 'off';
      const kept = keepRef.current({ kind: 'chat', id: 0, conversationId, messages: [message], alertNewest: false, alerts: 0 });
      if (!kept?.messages.length) return 'off';
    }
    return 'show';
  }), []);
  useEffect(() => subscribeIncoming(dispatch), []);
  // Opening that chat, muting it or blocking its sender takes its banner away, and its place in line.
  useEffect(() => { dispatch({ type: 'keep', keep }); }, [keep, q.current, q.waiting]);
  useEffect(() => { if (!allowed) dispatch({ type: 'clear' }); }, [allowed]);
  // The app put away (home screen, another tab): a banner from before is stale by the time it comes back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') dispatch({ type: 'clear' }); });
    return () => sub.remove();
  }, []);

  // Only the phone is asked: a browser cannot tell.
  const screenReader = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => { screenReader.current = on; });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on: boolean) => { screenReader.current = on; });
    return () => sub.remove();
  }, []);

  // The timer, which stands still while a finger or the pointer rests on the banner.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);
  const holds = useRef(new Set<'finger' | 'pointer'>());
  const leftWhenHeld = useRef(0);
  const stopTimer = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const startTimer = useCallback((ms: number) => {
    stopTimer();
    if (holds.current.size) { leftWhenHeld.current = ms; return; }
    deadline.current = Date.now() + ms;
    timer.current = setTimeout(() => dispatch({ type: 'dismiss' }), ms);
  }, [stopTimer]);
  const hold = useCallback((by: 'finger' | 'pointer') => {
    const first = holds.current.size === 0;
    holds.current.add(by);
    if (first && timer.current) { leftWhenHeld.current = Math.max(1500, deadline.current - Date.now()); stopTimer(); }
  }, [stopTimer]);
  const letGo = useCallback((by: 'finger' | 'pointer') => {
    holds.current.delete(by);
    if (holds.current.size || !leftWhenHeld.current) return;
    const ms = leftWhenHeld.current;
    leftWhenHeld.current = 0;
    startTimer(ms);
  }, [startTimer]);
  const dismiss = useCallback(() => { stopTimer(); leftWhenHeld.current = 0; dispatch({ type: 'dismiss' }); }, [stopTimer]);
  // Starting to write: a banner already down goes, off the page's buttons; the rest wait.
  useEffect(() => { if (writing && onScreen.current) dismiss(); }, [writing, dismiss]);

  // In from above the screen on a phone; on a computer it drops a few points into its corner.
  const y = useSharedValue(0);
  const shown = useSharedValue(0);
  const away = isPhone ? -(insets.top + 120) : -14;
  /** When the banner on show first dropped in, for MAX_MS. */
  const shownAt = useRef(0);
  /** A flick has already sent it on its way, from the gesture itself. */
  const flung = useRef(false);

  const view = visible ? describe(visible) : null;

  // How far down it reaches, so the toast and the posting strip sit under it rather than behind it.
  const top = isPhone ? 6 : spacing.lg;
  const [cardHeight, setCardHeight] = useState(0);
  const reaching = !!view && !q.leaving && cardHeight > 0;
  useEffect(() => { setBannerReach(reaching ? top + cardHeight : 0); }, [reaching, top, cardHeight]);
  useEffect(() => () => setBannerReach(0), []);

  // A new banner arrives; one updated with a new message starts its four
  // seconds again (never past MAX_MS from when it dropped in), and is read out.
  useEffect(() => {
    if (!visible || !view || q.leaving) return;
    if (!onScreen.current) {
      onScreen.current = true;
      shownAt.current = Date.now();
      if (reduced) {
        y.value = 0;
        shown.value = 0;
        shown.value = withTiming(1, { duration: 200, reduceMotion: NEVER });
      } else {
        y.value = away;
        shown.value = 0;
        y.value = withSpring(0, SPRING);
        shown.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: NEVER });
      }
      haptics.arrive();
    }
    // VoiceOver doesn't read something that slides in; TalkBack and the browser
    // read it from the live region. Queued, so it waits for VoiceOver to
    // finish what it is saying rather than cutting in.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(view.label, { queue: true });
    const reader = screenReader.current;
    const until = shownAt.current + (reader ? SCREEN_READER_MAX_MS : MAX_MS);
    // Never 0: to a finger resting on it, 0 would read as no clock at all.
    startTimer(Math.max(1, Math.min(reader ? SCREEN_READER_MS : SHOW_MS, until - Date.now())));
  }, [visible?.id, q.stamp, q.leaving]); // eslint-disable-line react-hooks/exhaustive-deps

  // On its way out: up and away (or a fade), then the next in line.
  useEffect(() => {
    if (!q.leaving) return;
    stopTimer();
    leftWhenHeld.current = 0;
    // A finger or pointer still counted as resting here would stop the next banner's clock for good.
    holds.current.clear();
    const next = () => { onScreen.current = false; setTimeout(() => dispatch({ type: 'gone', keep: keepRef.current }), GAP_MS); };
    const wasFlung = flung.current;
    flung.current = false;
    // Never drawn (it was no longer wanted before it showed): nothing to animate.
    if (!onScreen.current) { next(); return; }
    const done = () => { 'worklet'; runOnJS(next)(); };
    // A flick already sent it up at the finger's own speed: only its fade is waited for.
    if (wasFlung) shown.value = withTiming(0, { duration: 160, reduceMotion: NEVER }, done);
    else if (reduced) shown.value = withTiming(0, { duration: 180, reduceMotion: NEVER }, done);
    else {
      y.value = withTiming(away, { duration: 240, easing: Easing.in(Easing.cubic), reduceMotion: NEVER });
      shown.value = withTiming(0, { duration: 240, easing: Easing.in(Easing.quad), reduceMotion: NEVER }, done);
    }
  }, [q.leaving]); // eslint-disable-line react-hooks/exhaustive-deps

  // The demo's messages wait until a banner could show (past the splash and the tutorial).
  const demoSent = useRef(false);
  useEffect(() => {
    if (!DEMO || demoSent.current || !allowed) return;
    const t = setTimeout(() => { demoSent.current = true; actions.demoIncoming(DEMO); }, 1500);
    return () => clearTimeout(t);
  }, [allowed, actions]);

  // A flick up sends it away; a drag down just resists. Touching it stops the clock.
  const fling = useCallback(() => { flung.current = true; dismiss(); }, [dismiss]);
  const flick = useMemo(() => Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onBegin(() => { runOnJS(hold)('finger'); })
    .onUpdate((e) => { y.value = e.translationY < 0 ? e.translationY : e.translationY * 0.15; })
    .onEnd((e) => {
      if (e.translationY < -20 || e.velocityY < -450) {
        // It carries on at the flick's own speed, started right here on the
        // animation thread, so it never stops dead under the finger first.
        if (!reduced) y.value = withSpring(away, { velocity: Math.min(e.velocityY, -800), stiffness: 300, damping: 30, overshootClamping: true, reduceMotion: NEVER });
        shown.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.quad), reduceMotion: NEVER });
        runOnJS(fling)();
      } else y.value = withSpring(0, SPRING);
    })
    .onFinalize(() => { runOnJS(letGo)('finger'); }), [hold, letGo, fling, y, shown, away, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: y.value }] }));

  /** Who, what and how it looks, for one banner. */
  function describe(news: News): { title: string; body: string; count: number; label: string; face: Face; href: string } {
    const count = newsCount(news);
    if (news.kind === 'pile') {
      const senders: User[] = [];
      const names = news.chats.map((c) => {
        const chat = conversations.find((x) => x.id === c.conversationId);
        const last = c.messages[c.messages.length - 1];
        // Who wrote the newest: its live copy says; a phone alert alone only
        // says it in a one-to-one chat. Never the alert's whole title.
        const who = last && (!c.alertNewest || !c.alerts) ? users.find((u) => u.id === last.senderId)
          : chat && !isGroupChat(chat) ? othersIn(chat, users, currentUserId)[0] : undefined;
        if (who && !senders.includes(who)) senders.push(who);
        if (who) return named(who, users).first;
        return chat ? groupName(chat, users, currentUserId) : 'someone';
      });
      const from = nameList([...new Set(names)]);
      return { title: `${count} new messages`, body: `From ${from}`, count, label: `${count} new messages from ${from}`, face: { kind: 'people', people: senders, name: 'Messages' }, href: '/messages' };
    }
    return describeChat(news, count);
  }

  function describeChat(news: ChatNews, count: number) {
    const href = `/messages/${news.conversationId}`;
    const chat = conversations.find((c) => c.id === news.conversationId);
    const group = !!chat && isGroupChat(chat);
    const chatName = chat && group ? groupName(chat, users, currentUserId) : '';
    const last = news.messages[news.messages.length - 1];
    // A phone alert's own words: while its message is still on its way, and
    // after it arrives, so the card doesn't change under you as you read.
    if (!last || (news.alertNewest && news.alert)) {
      const title = news.alert?.title || 'New message';
      const body = news.alert?.body ?? '';
      const other = chat ? othersIn(chat, users, currentUserId) : [];
      const face: Face = group && chat ? { kind: 'people', people: other, photoUrl: chat.photoUrl, name: chatName }
        : other[0] ? { kind: 'person', user: other[0] } : { kind: 'none' };
      return { title, body, count, label: body ? `${title}: ${body}` : title, face, href };
    }
    const sender = users.find((u) => u.id === last.senderId);
    const said = messageSummary(last);
    // Their @handle is added only if someone else in this chat (you included)
    // shares their first name, the way the chat's own notes name people.
    const people = chat ? [...othersIn(chat, users, currentUserId), ...(currentUser ? [currentUser] : [])] : [];
    const who = sender ? (group ? named(sender, people).label : sender.name) : 'Someone';
    // A named group reads "June in Saturday hitters"; one with no name is
    // called by its people, so June goes in front of her words instead
    // (the phone's alert words it the same way).
    const title = !group ? who : chat?.title ? `${who} in ${chat.title}` : chatName;
    const body = group && !chat?.title ? `${who}: ${said}` : said;
    const about = group ? `${who} in ${chatName}` : who;
    const label = count > 1 ? `${count} new messages from ${about}. Latest: ${said}` : `Message from ${about}: ${said}`;
    const face: Face = sender ? { kind: 'person', user: sender, group: group ? { photoUrl: chat?.photoUrl, name: chatName } : undefined } : { kind: 'none' };
    return { title, body, count, label, face, href };
  }

  const open = () => {
    if (!view) return;
    dismiss();
    router.push(view.href as never);
  };

  const wrap = [styles.wrap, isPhone ? styles.wrapPhone : styles.wrapWide, { paddingTop: insets.top + top }];
  const card = view ? (
    <GestureDetector gesture={flick}>
      <Animated.View
        pointerEvents={q.leaving ? 'none' : 'auto'}
        onLayout={(e) => setCardHeight(Math.round(e.nativeEvent.layout.height))}
        style={[isPhone ? styles.cardPhone : styles.cardWide, style]}
      >
        <View style={styles.shadow}>
          <Glass radius={22} tint={colors.surface} style={styles.card}>
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={view.label}
                accessibilityHint={visible?.kind === 'pile' ? 'Opens your messages' : 'Opens the chat'}
                accessibilityActions={[{ name: 'escape' }, { name: 'dismiss', label: 'Dismiss' }]}
                onAccessibilityAction={dismiss}
                onPress={open}
                onHoverIn={() => hold('pointer')}
                onHoverOut={() => letGo('pointer')}
                style={({ pressed }) => [styles.info, pressed && styles.pressed]}
              >
                <FaceView face={view.face} />
                <View style={styles.words}>
                  <View style={styles.top}>
                    <Text style={styles.title} numberOfLines={1}>{view.title}</Text>
                    {view.count > 1 && visible?.kind === 'chat' ? <Text style={styles.count} numberOfLines={1}>{view.count} new messages</Text> : null}
                  </View>
                  {view.body ? <Text style={styles.body} numberOfLines={1}>{view.body}</Text> : null}
                </View>
              </Pressable>
              {/* A computer has no flick: a small close button, as on the computer's own notifications. */}
              {!isPhone ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={dismiss} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </Glass>
        </View>
      </Animated.View>
    </GestureDetector>
  ) : null;

  if (Platform.OS === 'ios') {
    // iOS draws the pages that slide up over the app (comments, share, a
    // post's menu) in a layer of its own, above the app's, so the banner goes
    // on the window's own overlay, above them too. It is there only while a
    // banner is, and lets every touch around the card through to the page.
    // Gestures need a root of their own there. Not a dialog: VoiceOver can
    // still reach the page under it.
    return card ? (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        <GestureHandlerRootView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="box-none" style={wrap}>{card}</View>
        </GestureHandlerRootView>
      </FullWindowOverlay>
    ) : null;
  }
  // Always there, even empty, so a screen reader's live region (TalkBack, a browser) hears each banner arrive.
  return <View pointerEvents="box-none" accessibilityLiveRegion="polite" style={wrap}>{card}</View>;
}

/** The picture on the left: the sender's face (with the group's mark on its corner in a group), or a group's faces. */
function FaceView({ face }: { face: Face }) {
  const styles = useThemedStyles(styleDefinitions);
  if (face.kind === 'none') {
    return (
      <View style={styles.blank}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.textMuted} />
      </View>
    );
  }
  if (face.kind === 'people') return <GroupAvatar people={face.people} size={FACE} photoUrl={face.photoUrl} name={face.name} />;
  const { user, group } = face;
  return (
    <View style={styles.face}>
      <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={FACE} />
      {group ? (
        <View style={styles.badge}>
          {group.photoUrl
            ? <Avatar name={group.name} seed={group.photoUrl} uri={group.photoUrl} size={BADGE - 4} />
            : <Ionicons name="people" size={11} color={colors.textMuted} />}
        </View>
      ) : null}
    </View>
  );
}

const FACE = 40;
const BADGE = 20;

const styleDefinitions = StyleSheet.create({
  // Over everything the app draws, the bar included; under the phone's own status bar and island.
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, elevation: 12 },
  wrapPhone: { paddingHorizontal: spacing.sm, alignItems: 'center' },
  wrapWide: { paddingHorizontal: spacing.lg, alignItems: 'flex-end' },
  cardPhone: { width: '100%', maxWidth: 520 },
  cardWide: { width: 360 },
  // The shadow on a rounded layer of its own, so it follows the card's corners. Floating, so neutral (DESIGN.md: overlay shadows).
  shadow: { borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  row: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingLeft: spacing.md, paddingRight: spacing.lg, minHeight: 64 },
  pressed: { opacity: 0.7 },
  words: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  count: { ...typography.small, fontSize: 12, color: colors.textFaint, flexShrink: 0, marginLeft: 'auto' },
  body: { ...typography.body, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  close: { alignSelf: 'stretch', justifyContent: 'center', paddingLeft: spacing.xs, paddingRight: spacing.md },
  face: { width: FACE, height: FACE },
  badge: {
    position: 'absolute', right: -3, bottom: -3, width: BADGE, height: BADGE, borderRadius: BADGE / 2,
    backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  blank: { width: FACE, height: FACE, borderRadius: FACE / 2, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
