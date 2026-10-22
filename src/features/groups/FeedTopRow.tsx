import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GLYPH_EDGE } from '@/components/ReelCaption';
import * as haptics from '@/lib/haptics';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { showRow } from '@/features/feed/topRowScroll';
import { colors, font } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * The words across the top of the Feed, the way Reels has them: "Activities", "For you",
 * then each group you are in, then a "+" that opens Find groups (a sheet:
 * join a group, or start one). Plain words, no
 * pills: the one you are on is bold and full strength, the rest are dimmer.
 * Over a clip they are white with the rail's dark edge, so they read on any
 * picture; on a written post they take the theme's own ink. They sit in a
 * band of their own just under the clock (features/feed/topBand): a page's
 * words start below it, an empty feed centres under it, and a clip's sound
 * disc steps down out of it.
 *
 * The "+" is always on screen (Oct 7): it rides at the row's end until that
 * end would run past the right edge (2 groups or more, or Activities in the
 * middle), then it stays put at the edge, over the clip's sound disc, and the
 * words pass behind it, cut off just before it the way they leave the left
 * edge of the screen.
 *
 * Where each word sits, and so where the "+" goes, is added up from the
 * words' widths, never read from where each one was last seen: on the web a
 * thing that only moves (a group's name arriving in front of the "+", the
 * font coming in) is never reported again, and the "+" stayed at the old end
 * of the row, on top of the first group's name (UI audit, Oct 11).
 */

/** The "+": its box, and how far it keeps from the right edge once it stops there (over the sound disc's middle). */
const PLUS = 28;
const PLUS_RIGHT = 24;
/** The words stop this far short of a "+" kept at the edge (the row's own gap before the "+" is 15). */
const PLUS_ROOM = 12;
/** Everything right of this many points from the right edge belongs to a "+" kept there. */
const PLUS_ZONE = PLUS_RIGHT + PLUS + PLUS_ROOM;
/** The space either side of a dot, and the "+"'s extra space after the last word (15 in all). */
const GAP = 9;
const PLUS_GAP = 6;
/** The widest a word gets; a longer name ends in "…". */
const WORD_MAX = 150;
/** Where a "+" that has not been placed yet waits: at its stop by the edge, where it can never cover a word. */
const PLUS_UNPLACED = 100_000;

interface Props {
  groups: { id: string; name: string }[];
  /** The group on show, or null for For you. */
  selected: string | null;
  onSelect: (groupId: string | null) => void;
  onPlus: () => void;
  /** A clip or a hit fills the top of the page. */
  onPicture: boolean;
  /** Pinched in, or comments open: the row steps aside with the rest of the chrome. */
  hidden: boolean;
  /** A dot on the "+": someone is asking to join a group you run. */
  waiting?: boolean;
  /** Invites to groups waiting for your answer (migration 181): the same dot. */
  invites?: number;
  /**
   * How far the row is away, 0 shown to 1 gone: the feed on show moves it with
   * its own scroll, the way Instagram's header goes and comes (Oct 22, owner;
   * features/feed/topRowScroll). A tap on the strip where it lives brings it back.
   */
  row?: SharedValue<number>;
}

/** How far the row rides up as it goes: past its own top, into the clock's strip, gone by the time it gets there. */
const AWAY_LIFT = TOP_BAND_TOP + TOP_BAND_HEIGHT - 10;
/** The strip that brings the row back when tapped: the clock's band and the row's, short of a clip's sound disc just under it. */
const TAP_BAND = TOP_BAND_TOP + TOP_BAND_HEIGHT - 4;

/**
 * VoiceOver or TalkBack is on: the row then never tucks, so its words can always be reached and tapped.
 * A browser cannot tell (react-native-web always answers yes), so there the row comes back whenever
 * one of its words gets the focus instead.
 */
/**
 * Focus from the keyboard (or a screen reader) keeps the row in; a tap that leaves a word
 * focused in a browser does not, or the row would never leave again after picking a feed.
 */
function keyFocus(e: unknown) {
  if (Platform.OS !== 'web') return true;
  const target = (e as { target?: { matches?: (q: string) => boolean } } | undefined)?.target;
  try { return !!target?.matches?.(':focus-visible'); } catch { return true; }
}

function useScreenReader() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then((v) => { if (live) setOn(v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}

export function FeedTopRow({ groups, selected, onSelect, onPlus, onPicture, hidden, waiting, invites = 0, row }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  // Over a picture: white, as Reels does. The New York ground is navy, so its ink is white too.
  const ink = onPicture || theme === 'us-open' ? '#FFFFFF' : colors.text;
  const edge = onPicture ? GLYPH_EDGE : null;
  // Activities sits left of For you (Oct 4): sessions with stats, as Strava's feed.
  const words = [{ id: 'activities' as string | null, name: 'Activities' }, { id: null as string | null, name: 'For you' }, ...groups];
  // The camera's mode picker (Oct 4, owner): the word on show always sits in
  // the middle of the screen, and a tap slides the row so the new one glides
  // there, the others passing left or right. "+" rides at the row's end.
  const [viewW, setViewW] = useState(0);
  // Each word's width, and the dots' (all alike): a change of size is always reported, on every platform.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [dotW, setDotW] = useState(0);
  // Where each word sits along the row and where the "+" goes after the last one, added up
  // the way the row lays them out: word, gap, dot, gap, word … gap, "+". Null until all are measured.
  const layout = (() => {
    const at = new Map<string, { x: number; w: number }>();
    let x = 0;
    for (const [i, w] of words.entries()) {
      const width = widths[w.id ?? 'for-you'];
      if (width === undefined || (i > 0 && !dotW)) return null;
      if (i > 0) x += GAP + dotW + GAP;
      at.set(w.id ?? 'for-you', { x, w: width });
      x += width;
    }
    return { at, plusAt: x + GAP + PLUS_GAP };
  })();
  const shift = useSharedValue(0);
  const placed = useRef(false);
  const target = useRef(0);
  const home = layout?.at.get(selected ?? 'for-you');
  const homeMid = home ? home.x + home.w / 2 : null;
  useEffect(() => {
    if (homeMid === null || !viewW) return;
    const to = viewW / 2 - homeMid;
    if (!placed.current) { placed.current = true; target.current = to; shift.value = to; return; }
    // Already heading there (the tap began it): leave the glide running untouched.
    if (Math.abs(target.current - to) < 0.5) return;
    target.current = to;
    // One smooth glide, Apple's ease-out, no bounce: a spring re-aimed mid-flight read as a jolt.
    shift.value = withTiming(to, { duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [homeMid, viewW, shift]);
  // The glide starts on the tap itself; the feed underneath switches a frame later,
  // so its heavy first draw never holds the row back.
  // The feed underneath is switched only once the glide has landed: building a
  // whole new feed mid-glide froze the screen for a few frames (Oct 4, owner: "smoother, by a lot").
  const glideTo = (key: string, then: () => void) => {
    const at = layout?.at.get(key);
    if (!at || !viewW) { then(); return; }
    target.current = viewW / 2 - (at.x + at.w / 2);
    shift.value = withTiming(target.current, { duration: 320, easing: Easing.bezier(0.22, 1, 0.36, 1) }, (done) => { if (done) runOnJS(then)(); });
  };
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));
  // Where the "+" would sit at the row's end; it goes no further right than its stop at the edge.
  // A word just added and not measured yet keeps the "+" at its stop for that moment.
  const plusAt = layout ? layout.plusAt : PLUS_UNPLACED;
  const plusStop = viewW - PLUS_RIGHT - PLUS;
  const plusSlide = useAnimatedStyle(() => ({ transform: [{ translateX: Math.min(shift.value + plusAt, plusStop) }] }));
  // Shown once everything has been measured, and kept shown while a new group's name is measured.
  const shown = useRef(false);
  useEffect(() => { if (viewW && layout) shown.current = true; });
  const ready = viewW && (layout || shown.current) ? 1 : 0;
  // Away with the scroll: it rides up and fades with the finger, frame by frame, and settles in
  // or out when the feed comes to rest (features/feed/topRowScroll). With Reduce Motion it only
  // fades. VoiceOver keeps it in, as does one of its words holding the focus. Nothing in the row
  // is glass, so fading it is safe.
  const reduceMotion = useReducedMotion();
  const screenReader = useScreenReader();
  const [focusIn, setFocusIn] = useState(false);
  const held = screenReader || focusIn;
  const fallback = useSharedValue(0);
  const away = row ?? fallback;
  useEffect(() => { if (held) showRow(away); }, [held, away]);
  // Untouchable while it is more out than in, and then the strip it lives in brings it back on a tap.
  const [gone, setGone] = useState(false);
  useAnimatedReaction(() => away.value > 0.5, (now, before) => { if (now !== before) runOnJS(setGone)(now); }, [away]);
  const outOfWay = gone && !held;
  const awayStyle = useAnimatedStyle(() => {
    const p = held ? 0 : away.value;
    return {
      // Gone a little before it reaches the clock, so its words never sit over the time.
      opacity: hidden ? 0 : interpolate(p, [0, 0.85], [1, 0], 'clamp'),
      transform: [{ translateY: reduceMotion ? 0 : -AWAY_LIFT * p }],
    };
  }, [hidden, reduceMotion, held]);
  return (
    <>
    {outOfWay && !hidden ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show the feed's tabs"
        onPress={() => showRow(away)}
        style={[styles.tapBand, { height: insets.top + TAP_BAND }]}
      />
    ) : null}
    <Animated.View pointerEvents={hidden || outOfWay ? 'none' : 'box-none'} style={[styles.layer, { top: insets.top + TOP_BAND_TOP }, awayStyle]}>
      <View style={styles.clip} onLayout={(e) => setViewW(e.nativeEvent.layout.width)} pointerEvents="box-none">
        {/* The words, cut off just short of the "+" at its stop. While the "+" rides at the row's end, no word reaches the cut. */}
        <View style={styles.words} pointerEvents="box-none">
          <Animated.View style={[styles.row, slide, { opacity: ready }]}>
            {words.map((w, i) => {
              const on = w.id === selected;
              const key = w.id ?? 'for-you';
              return (
                <React.Fragment key={key}>
                  {i > 0 ? (
                    <Text
                      maxFontSizeMultiplier={TextScale.TITLE}
                      style={[styles.dot, { color: ink }, edge]}
                      onLayout={(e) => { const width = e.nativeEvent.layout.width; setDotW((d) => (d === width ? d : width)); }}
                    >·</Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={w.id === 'activities' ? 'Activities' : w.id ? `${w.name}, group feed` : 'For you'}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                    onFocus={(e) => { if (keyFocus(e)) setFocusIn(true); }}
                    onBlur={() => setFocusIn(false)}
                    onPress={() => { if (on) return; haptics.tap(); const id = w.id; glideTo(key, () => onSelect(id)); }}
                    onLayout={(e) => { const width = e.nativeEvent.layout.width; setWidths((m) => (m[key] === width ? m : { ...m, [key]: width })); }}
                  >
                    <Word name={w.name} at={layout?.at.get(key)} shift={shift} viewW={viewW} style={[styles.word, { color: ink }, edge]} />
                  </Pressable>
                </React.Fragment>
              );
            })}
          </Animated.View>
        </View>
        <Animated.View style={[styles.plusSpot, plusSlide, { opacity: ready }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Find or start a group${invites ? `, ${invites} ${invites === 1 ? 'invite' : 'invites'}` : ''}${waiting ? ', someone is asking to join yours' : ''}`} hitSlop={10} onFocus={(e) => { if (keyFocus(e)) setFocusIn(true); }} onBlur={() => setFocusIn(false)} onPress={onPlus} style={styles.plusHit}>
            <Ionicons name="add" size={22} color={ink} style={[{ opacity: 0.85 }, edge]} />
            {waiting || invites ? <View style={styles.waiting} /> : null}
          </Pressable>
        </Animated.View>
        {/* The camera's marker: a short bar that stays in the middle while the words pass over it. */}
        <View pointerEvents="none" style={[styles.marker, { backgroundColor: ink, left: viewW / 2 - 8 }, edge ? styles.markerEdge : null]} />
      </View>
    </Animated.View>
    </>
  );
}

/**
 * One word of the row. Its brightness and size follow how near the middle it
 * is, frame by frame on the animation thread, so the highlight travels with
 * the glide instead of jumping when the tap lands. Every word keeps one weight:
 * a word turning bold changed its width and moved the row's target mid-glide.
 */
function Word({ name, at, shift, viewW, style }: { name: string; at: { x: number; w: number } | undefined; shift: SharedValue<number>; viewW: number; style: object }) {
  const centre = at ? at.x + at.w / 2 : -1000;
  const look = useAnimatedStyle(() => {
    const away = Math.abs(shift.value + centre - viewW / 2);
    return { opacity: interpolate(away, [0, 60], [1, 0.5], 'clamp'), transform: [{ scale: interpolate(away, [0, 60], [1, 0.92], 'clamp') }] };
  });
  return <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.TITLE} style={[style, look]}>{name}</Animated.Text>;
}

const styleDefinitions = StyleSheet.create({
  tapBand: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 8 },
  layer: { position: 'absolute', left: 0, right: 0, height: TOP_BAND_HEIGHT, zIndex: 8, alignItems: 'center', justifyContent: 'center' },
  clip: { alignSelf: 'stretch', overflow: 'hidden', height: TOP_BAND_HEIGHT },
  words: { position: 'absolute', left: 0, top: 0, bottom: 0, right: PLUS_ZONE, overflow: 'hidden' },
  row: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: GAP, height: TOP_BAND_HEIGHT },
  word: { fontSize: 16, lineHeight: 22, ...font('600'), letterSpacing: -0.2, maxWidth: WORD_MAX, paddingVertical: 2 },
  marker: { position: 'absolute', bottom: 3, width: 16, height: 2.5, borderRadius: 2 },
  markerEdge: { boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.35)' },
  wordOn: { ...font('700') },
  dot: { fontSize: 14, lineHeight: 22, opacity: 0.3 },
  plusSpot: { position: 'absolute', left: 0, top: (TOP_BAND_HEIGHT - PLUS) / 2, width: PLUS, height: PLUS },
  plusHit: { width: PLUS, height: PLUS, alignItems: 'center', justifyContent: 'center' },
  waiting: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, borderWidth: 1.5, borderColor: colors.bg },
});

