import React, { startTransition, use, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContext } from 'expo-router/build/react-navigation/core/NavigationContext';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { BrandWash } from '@/components/ui/BrandWash';
import { followAsSeen, useApp, useUsers } from '@/store/AppContext';
import { buttonShape, colors, readsOn, typography, withAlpha } from '@/theme';
import { reduceMotionEnabled } from '@/lib/useReducedMotion';
import { TextScale } from '@/theme/textScale';
import { useTapFast } from '@/features/navigation/pressV2';
import { tapMark } from '@/features/navigation/tapTiming';
import { useIsGuest } from '@/features/guest/guestStatus';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** What a Follow button says: you follow them, you have asked to (a private account), or neither. */
export type FollowShown = 'following' | 'requested' | 'none';

/**
 * A Follow button that turns on the tap itself, with taps answering sooner (pressV2's TAP_FAST, admins first):
 * Follow becomes Following (or Requested, for a private account), and Requested goes back to Follow, in the
 * very next frame, while the app's own redraw for it goes on as background work, the way a like already does.
 * It used to wait for every page in the app to redraw first (Nov 2, owner: "There's also a delay on clicking
 * buttons for them to respond. Clicking should respond much faster"). Following itself asks before it
 * unfollows (its own sheet), so that tap goes exactly as before; so does a guest's (it only asks them to join)
 * and one on a button that does not know whose it is. A second tap while the first is still going through, on
 * any button for the same person, is a double tap, not a change of mind: it is let go (quickFollows). The quick state belongs to the person it was tapped for:
 * a button handed someone else (the map card's, when you move to another pin) shows what the app says for them,
 * never the last person's Following. `stored` is what the app says now; returns what to show, the press to run in
 * place of `onPress`, and `delta`, what to add to their follower count shown beside it (+1 while Follow has
 * turned to Following ahead of the app, 0 otherwise), so a count moves with the button, as a like's does.
 *
 * `settleMs`: a button whose change animates (the pill's colour fade, the map card's draw-in) has the app's
 * follow (its redraw, the database write) sent only once that has played, this long after the tap; the button
 * buzzes on the tap, so the follow's own buzz is left out then. Sent at once, the redraw landed part way through
 * and the fade stood still for two to three frames (Nov 3, Simulator, real taps: 12 of 14 list Follows held 30 to
 * 43 ms part way through the fade with this on; with it off, 9 of 24 held 30 to 35 ms, all near the fade's start).
 * The button itself still answers on the tap.
 *
 * A follow is a toggle, so the one sent later goes through only if the app still says what the button showed on
 * the tap (followAsSeen): followed some other way in between (first-move's Follow all, the same person's Follow
 * elsewhere on the page), sending it undid that follow, with an "Unfollowed" toast (Nov 3 review).
 *
 * Nothing waits on the settle when something needs the follow in: it is sent at once when a page decides from
 * whom you follow (flushQuickFollows: first-move's Continue and Follow all, the map card's ⋯), when the button
 * leaves the screen or a page opens over it, and when the app is put away (Nov 3 review: Follow, then Continue a
 * quarter of a second later, saved the first move as "later").
 */
export function useQuickFollow(stored: FollowShown, userId: string | undefined, onPress: () => void, settleMs = 0) {
  const fast = useTapFast();
  const isGuest = useIsGuest();
  const users = useUsers();
  // What this button shows ahead of the app, for whom; cleared in the same background redraw that brings the
  // app's own answer, so the two hand over in one frame (no flicker back, even if the database said no meanwhile).
  const [quick, setQuick] = useState<{ id: string; shown: FollowShown; mark: object } | null>(null);
  const shown: FollowShown = quick && quick.id === userId ? quick.shown : stored;
  // This button's entry in quickFollows (see there), let go once the app's redraw for it has landed.
  const mine = useRef<{ id: string; entry: QuickFollow } | null>(null);
  useLayoutEffect(() => {
    if (quick || !mine.current) return;
    letGo(mine.current.id, mine.current.entry);
    mine.current = null;
  }, [quick]);
  // Its follow still waiting to be sent when the button leaves the screen, or a page opens over it: sent now,
  // so whatever happens next (the page it opens, a decision made there) finds the app already following.
  const navigation = use(NavigationContext);
  useEffect(() => {
    if (!quick || !navigation) return undefined;
    return navigation.addListener('blur', () => { if (mine.current) sendNow(mine.current.id); });
  }, [quick, navigation]);
  useEffect(() => () => { if (mine.current) sendNow(mine.current.id); }, []);
  // The simulator's tap timing (tapTiming): the button's change committed. Nothing outside the proof build.
  const drawn = useRef(shown);
  useLayoutEffect(() => { if (drawn.current !== shown) { drawn.current = shown; tapMark('follow'); } }, [shown]);
  const press = () => {
    if (!fast || isGuest || !userId || stored === 'following') { onPress(); return; }
    // A second tap while the first is still going through, on this button or any other for the same person,
    // is a double tap, not a change of mind: it is let go (a second toggle would undo the first).
    if (quickFollows.has(userId)) return;
    const next: FollowShown = stored === 'requested' ? 'none' : users.find((u) => u.id === userId)?.isPrivate ? 'requested' : 'following';
    const id = userId;
    // What the app said for them on the tap: the follow goes out only if it still says so when sent (followAsSeen).
    const seen = stored;
    const entry: QuickFollow = { shown: next, send: null };
    quickFollows.set(id, entry);
    mine.current = { id, entry };
    setQuick({ id, shown: next, mark: entry });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Sent once only: by its timer, or sooner by sendNow (flushQuickFollows), as the app's own work, not a transition then.
    const send = (later: boolean, now: boolean) => {
      if (timer !== undefined) clearTimeout(timer);
      entry.send = null;
      const run = () => {
        try {
          // Sent later, its buzz is left out: the button buzzed on the tap (a second one came a third of a second after).
          // Followed some other way meanwhile (first-move's Follow all), it changes nothing: a toggle then undid the follow.
          followAsSeen(id, seen, () => (later ? haptics.quietly(onPress) : onPress()));
        } finally {
          // Whatever the press did, the button hands back to what the app says (never stuck on Following).
          setQuick((q) => (q && q.mark === entry ? null : q));
        }
      };
      if (now) run(); else startTransition(run);
    };
    if (settleMs > 0) {
      entry.send = () => send(true, true);
      timer = setTimeout(() => send(true, false), settleMs);
    } else send(false, false);
    // Gone from the screen before its redraw landed (its layout effect never runs): let go once that surely has.
    setTimeout(() => letGo(id, entry), settleMs + LET_GO_MS);
  };
  const delta = (shown === 'following' ? 1 : 0) - (stored === 'following' ? 1 : 0);
  return { shown, press, delta };
}

/** A quick Follow going through: what its button shows, and its send while that still waits (the settle). */
type QuickFollow = { shown: FollowShown; send: (() => void) | null };

/**
 * The people with a quick Follow still going through (useQuickFollow), whichever button it was tapped on: a
 * list's pill, the map card's or a player's page. Until the app's redraw for it lands, every other button for
 * them still says Follow, and a quick press there would send a second toggle that undoes the first.
 */
const quickFollows = new Map<string, QuickFollow>();
/** Lets go of `id` only if it is still that press's (a later press for them has an entry of its own). */
const letGo = (id: string, entry: QuickFollow) => { if (quickFollows.get(id) === entry) quickFollows.delete(id); };
/** Sends the follow for `id` now if it is still waiting for its button's change to play. */
const sendNow = (id: string) => { quickFollows.get(id)?.send?.(); };

const NONE_WAITING: ReadonlyMap<string, FollowShown> = new Map();

/**
 * Every quick Follow still going through (taps answering sooner, admins first), sent now, and what each one's
 * button shows, by person: the app catches up with them only once its redraw lands, so code that decides from
 * whom you follow on a tap (first-move's Continue and Follow all) counts these as well (Nov 3 review: Follow, then
 * Continue a quarter of a second later, saved the first move as "later"). The follows are sent as the app's own
 * work, ahead of whatever the caller does next; one already sent is not sent again. Empty, and nothing sent, with
 * taps answering sooner off.
 */
export function flushQuickFollows(): ReadonlyMap<string, FollowShown> {
  if (!quickFollows.size) return NONE_WAITING;
  const waiting = new Map<string, FollowShown>();
  for (const [id, entry] of [...quickFollows]) {
    waiting.set(id, entry.shown);
    entry.send?.();
  }
  return waiting;
}

// The app put away (the home screen, the app switcher): the follows still waiting go now, not lost with it.
AppState.addEventListener('change', (state) => { if (state !== 'active') flushQuickFollows(); });

/** How long after its redraw was sent a quick Follow from a button no longer on screen is let go: well after it lands. */
const LET_GO_MS = 2000;
/** The pill's colour fade, and the map card's draw-in, below; their redraws wait this much longer (a frame or so to start, and a margin). */
const FADE_MS = 280;
const SHRINK_MS = 320;
const SETTLE_PAD_MS = 60;

/**
 * Follow, and then Following: the pill dips slightly on the tap, settles, and
 * goes quiet (the brand colour drains away) as the check slides in. Under Reduce Motion the
 * colour still changes; nothing moves. A private account (given `userId`)
 * does exactly the same and reads "Requested" until they accept; tapping
 * it again takes the ask back.
 */
export function FollowPill({ following, onPress, small = false, name, userId, wide = false, soft = false }: { following: boolean; onPress: () => void; small?: boolean; name?: string; userId?: string; /** Fills the width it is given (a suggestion card's button). */ wide?: boolean; /** The quiet look for a list row (Oct 25, "Quiet Follow: green word with a thin outline"): no fill, a thin brand outline, the word in the brand colour (the text's where the brand does not read on the page), no wash. Same size and tap area. */ soft?: boolean }) {
  useTheme();
  const { followRequests, currentUserId } = useApp();
  const asked = !following && !!userId && !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === userId);
  // On the tap itself, with taps answering sooner (useQuickFollow); otherwise exactly what the app says.
  // The app's redraw for it waits until the colour fade below has played.
  const quick = useQuickFollow(following ? 'following' : asked ? 'requested' : 'none', userId, onPress, FADE_MS + SETTLE_PAD_MS);
  const requested = quick.shown === 'requested';
  const filled = quick.shown !== 'none';
  const said = quick.shown === 'following' ? 'Following' : requested ? 'Requested' : 'Follow';
  const on = useSharedValue(filled ? 1 : 0);
  const bump = useSharedValue(1);
  const reduced = useRef(false);
  useEffect(() => { reduceMotionEnabled().then((r) => { reduced.current = r; }).catch(() => {}); }, []);
  useEffect(() => { on.value = withTiming(filled ? 1 : 0, { duration: FADE_MS, easing: EASE }); }, [filled, on]);

  // The theme's colours are read here, on each draw, and handed to the animation as plain values.
  // Read inside it, they were copied once, from whichever theme the pill first drew in (it stayed
  // Paris orange in every other theme until the app restarted).
  const { surfaceAlt, brand, borderStrong, text, brandInk, surface } = colors;
  // Quiet: the fill is the page showing through (a see-through brand, so the colour change into Following stays smooth).
  const softInk = readsOn(brand, surface) ? brand : text;
  const rest = soft ? withAlpha(brand, 0) : brand;
  const restInk = soft ? softInk : brandInk;
  // Follow is the coloured one, the thing to tap; once you follow (or have asked to), the pill
  // goes quiet, the way Instagram does it (Oct 2, William: reverse the colours).
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [rest, surfaceAlt]),
    borderColor: interpolateColor(on.value, [0, 1], [brand, surfaceAlt]),
    transform: [{ scale: bump.value }],
  }), [surfaceAlt, rest, brand, borderStrong]);
  const label = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [restInk, text]) }), [text, restInk]);
  const wash = useAnimatedStyle(() => ({ opacity: 1 - on.value }));

  const press = () => {
    // A small, quick press: a slight dip and a settle with no wobble (a deeper dip and a loose spring read as a bounce).
    if (!reduced.current) bump.value = withSequence(withTiming(0.96, { duration: 60, easing: EASE }), withSpring(1, { damping: 20, stiffness: 320 }));
    haptics.tap();
    quick.press();
  };

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: filled }} accessibilityLabel={`${said}${name ? ` ${name}` : ''}`} onPress={press} hitSlop={6} style={wide ? styles.wide : undefined}>
      <Animated.View style={[styles.pill, small && styles.small, wide && styles.wide, pill]}>
        {soft ? null : <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, wash]}><BrandWash radius={buttonShape.smallRadius} curve /></Animated.View>}
        {filled ? <Ionicons name="checkmark" size={14} color={colors.text} /> : null}
        <Animated.Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.text, small && styles.textSmall, label]}>{said}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Follow on the map's player card, in a row with Ask to hit, Message and ⋯
 * (Oct 7): the word until you follow, then a small round button.
 *
 * Not following, it is a pill that says "Follow", ringed in the brand's
 * colour on the card's own colour: easy to find (following is how friends
 * see each other on the map) without a second filled green pill beside Ask
 * to hit. The word takes the brand's colour where that reads at 4.5:1 on the
 * card, and the palette's ink where it does not (Melbourne's sky blue).
 *
 * Tap it and the pill draws in to the quiet disc of the buttons beside it:
 * a person in ink with a tick, or with dots while a private account's ask
 * waits ("Requested"). Unfollow (from the disc or the ⋯ menu) and it opens
 * back out into the word. The pills beside it take up the room it gives
 * back as it goes, and hand it back as it opens.
 * Reduce Motion: no change of size is animated; the faces only fade.
 *
 * `room` is how much wider than the disc the row lets it grow. Where the
 * word does not fit (a narrow phone, or iPhone's larger text sizes) it is
 * the same ringed disc with a person and a plus, rather than cutting the
 * words beside it short ("Ask to h…"). Left out, the word always shows.
 *
 * `followsYou` changes only what it says to a screen reader ("Follow back"):
 * the words "Follow back" do not fit in the row on a small phone.
 */
export function FollowShrink({ following, onPress, name, userId, followsYou = false, size = 44, room }: { following: boolean; onPress: () => void; name?: string; userId?: string; followsYou?: boolean; size?: number; room?: number }) {
  useTheme();
  const { followRequests, currentUserId } = useApp();
  const asked = !following && !!userId && !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === userId);
  // On the tap itself, with taps answering sooner (useQuickFollow); otherwise exactly what the app says.
  // The app's redraw for it waits until the draw-in below has played.
  const quick = useQuickFollow(following ? 'following' : asked ? 'requested' : 'none', userId, onPress, SHRINK_MS + SETTLE_PAD_MS);
  const requested = quick.shown === 'requested';
  const filled = quick.shown !== 'none';
  // How wide the word is, measured from a hidden copy of it, so the pill knows the width to open
  // back out to and the word is never squeezed into "Fo…" while the pill draws in. 0 until
  // measured: the pill then sizes itself around the word.
  const [wordText, setWordText] = useState(0);
  const wordWidth = wordText ? wordText + 2 * SHRINK_PAD + 2 : 0;
  // Until both are known, the word: most phones have the room, and a first frame of disc would flash.
  const roomy = room === undefined || wordWidth === 0 || wordWidth - size <= room;
  const closed = filled || !roomy;
  // `on` crosses the faces and colours over; `shut` draws the width in (0 = the word's width, 1 = the disc).
  const on = useSharedValue(filled ? 1 : 0);
  const shut = useSharedValue(closed ? 1 : 0);
  const bump = useSharedValue(1);
  const motion = useSharedValue(1);
  const reduced = useRef(false);
  const wasFilled = useRef(filled);
  useEffect(() => { reduceMotionEnabled().then((r) => { reduced.current = r; if (r) motion.value = 0; }).catch(() => {}); }, [motion]);
  useEffect(() => {
    // A follow (or the database turning one down) animates; the row's room changing (the phone
    // turned, the text size changed) just puts it right.
    const tapped = wasFilled.current !== filled;
    wasFilled.current = filled;
    on.value = tapped ? withTiming(filled ? 1 : 0, { duration: 260, easing: EASE }) : filled ? 1 : 0;
    shut.value = tapped && !reduced.current ? withTiming(closed ? 1 : 0, { duration: SHRINK_MS, easing: EASE }) : closed ? 1 : 0;
  }, [filled, closed, on, shut]);

  // Read on each draw and handed in as plain values (see FollowPill: read inside, they stick to the first theme).
  const { surface, surfaceAlt, brand, borderStrong, text } = colors;
  const wordInk = readsOn(brand, surface) ? brand : text;
  const box = useAnimatedStyle(() => {
    const look = {
      backgroundColor: interpolateColor(on.value, [0, 1], [surface, surfaceAlt]),
      borderColor: interpolateColor(on.value, [0, 1], [brand, borderStrong]),
      transform: [{ scale: bump.value }],
    };
    if (wordWidth > 0) return { ...look, width: wordWidth + (size - wordWidth) * shut.value };
    return shut.value > 0.5 ? { ...look, width: size } : look;
  }, [wordWidth, size, surface, surfaceAlt, brand, borderStrong]);
  // The word goes before the pill is too narrow for it, and comes back once there is room.
  const word = useAnimatedStyle(() => ({ opacity: roomy ? Math.max(0, 1 - on.value * 1.8) : 0 }), [roomy]);
  // No room for the word: a person and a plus in its place, crossing over to the tick the same way.
  const add = useAnimatedStyle(() => ({ opacity: roomy ? 0 : 1 - on.value, transform: [{ scale: 1 - on.value * 0.2 * motion.value }] }), [roomy]);
  const done = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 1 - (1 - on.value) * 0.2 * motion.value }] }));

  // A second tap while it is still drawing in is a double tap, not a change of mind: without this,
  // it followed and unfollowed at once, and said "Unfollowed" for a follow you meant.
  const lastPress = useRef(0);
  const press = () => {
    const now = Date.now();
    if (now - lastPress.current < 450) return;
    lastPress.current = now;
    if (!reduced.current) bump.value = withSequence(withTiming(0.95, { duration: 60, easing: EASE }), withSpring(1, { damping: 20, stiffness: 320 }));
    haptics.tap();
    quick.press();
  };

  const said = quick.shown === 'following' ? 'Following' : requested ? 'Requested' : followsYou ? 'Follow back' : 'Follow';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: filled }} accessibilityLabel={`${said}${name ? ` ${name}` : ''}`} onPress={press} hitSlop={4}>
      <Animated.View style={[styles.shrink, { height: size, borderRadius: size / 2 }, box]}>
        <Animated.Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.shrinkWord, { color: wordInk }, wordText ? { width: wordText } : null, word]} numberOfLines={1}>Follow</Animated.Text>
        <Animated.View pointerEvents="none" style={[styles.face, add]}>
          <Ionicons name="person-add-outline" size={19} color={wordInk} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.face, done]}>
          <View style={styles.person}>
            <Ionicons name="person-outline" size={18} color={text} />
            <View style={[styles.badge, { backgroundColor: text, borderColor: surfaceAlt }]}>
              <Ionicons name={requested ? 'ellipsis-horizontal' : 'checkmark'} size={8} color={surfaceAlt} />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
      {/* The measure: the same word, unsqueezed, never seen or read out. */}
      <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.shrinkWord} numberOfLines={1} onLayout={(e) => {
          const w = Math.ceil(e.nativeEvent.layout.width);
          if (w > 0 && w !== wordText) setWordText(w);
        }}>Follow</Text>
      </View>
    </Pressable>
  );
}

/** The word pill's padding either side of "Follow". */
const SHRINK_PAD = 12;

const styles = StyleSheet.create({
  // FollowShrink: the word pill, which draws in to a disc. Clipped, so the word never shows past it.
  shrink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SHRINK_PAD, borderWidth: 1, overflow: 'hidden' },
  shrinkWord: { ...typography.smallStrong, fontSize: 14, flexShrink: 0 },
  // A width of its own, reaching back over the row (unseen, untouchable): left to fit inside the
  // button, an iPhone measures the word no wider than the 44pt disc when the card opens on someone
  // you already follow, and unfollowing then opens out to a clipped "Follo…".
  measure: { position: 'absolute', right: 0, top: 0, width: 240, alignItems: 'flex-end', opacity: 0 },
  face: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  // The tick sits on the person's shoulder, cut out of it by a ring of the button's own colour.
  person: { width: 18, height: 18, marginRight: 3 },
  badge: { position: 'absolute', right: -6, bottom: -3, width: 13, height: 13, borderRadius: 6.5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  // One width whatever it says, like Instagram: Follow, Following and Requested never change
  // the pill's size, so nothing beside it shifts when you tap (Oct 2). Sized for "✓ Following".
  // Instagram's shape (Oct 22): a compact rounded rectangle with Apple's smooth corner.
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, width: 116, minHeight: buttonShape.smallHeight, paddingVertical: 6, paddingHorizontal: 10, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, borderWidth: 1 },
  small: { width: 104, minHeight: 32, paddingVertical: 5, paddingHorizontal: 8 },
  wide: { alignSelf: 'stretch', width: 'auto' },
  text: { ...typography.smallStrong, fontSize: 14 },
  textSmall: { fontSize: 13 },
});
