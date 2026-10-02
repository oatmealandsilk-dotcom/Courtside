import React, { useEffect, useId, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { NewHereTag } from '@/components/NewHereTag';
import { isNewHere } from '@/features/feed/newHere';
import { RichText } from '@/components/RichText';
import type { Post, User } from '@/data/types';
import { openCourt } from '@/features/players/courtLink';
import { statsLine } from '@/features/activity/format';
import { compactNumber, relativeTime, timeLeft } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useTourBusy } from '@/features/tour/tourStore';
import { font } from '@/theme';
import { tagsNotInCaption } from '@/features/feed/tags';

/*
 * Every word over a clip or an Instant follows one set of rules, the ones
 * TikTok, Reels and Shorts share: white type in three weights (name, words,
 * the small line), a crisp dark edge on each letter rather than a soft glow,
 * and a shade behind them that is darkest exactly where they sit. Over video,
 * white with a shadow is the one exception to the theme's colours (DESIGN.md).
 */

/** The caption's line height. Two of these is a folded caption. */
const LINE = 19;
/**
 * The dark edge every word 14pt and up wears: dark and tight, so white still
 * reads on a white wall or a bright sky without looking smudged. (Darker
 * rather than wider: a wider blur spreads thin and draws no edge at all.)
 */
const EDGE = { textShadowColor: 'rgba(0, 0, 0, 0.62)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.25 } as const;
/** Small words (13pt and under) and small icons get a slightly darker edge. */
export const EDGE_SMALL = { textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.25 } as const;
/** The rail's icons: a firm edge with a short halo, so a thin outline holds on a bright court. */
export const GLYPH_EDGE = { textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } as const;
/**
 * The rail's counts sit high, where the shade is lightest, so they get the
 * darkest edge of all: a "3" under the heart still reads on a white wall or a
 * bright sky without darkening the court around it.
 */
export const COUNT_EDGE = { textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.5 } as const;
/** How far very large accessibility text may grow these words: enough to help, never so much they climb into the picture. */
export const MAX_GROW = 1.2;
/**
 * The small line's ink: the time, the place, who with. One strength for its
 * words and its icons alike, and nearly full white: any fainter and a bright
 * frame takes back what the shade under it gives.
 */
const META_INK = 'rgba(255, 255, 255, 0.94)';
/**
 * The place and "with" are 16pt tall, so their tap area reaches past them:
 * further down, where only the tab bar's 16pt of air is, and a little less
 * up, so a tap on the caption's last line still opens the caption.
 */
const LINK_SLOP = { top: 8, bottom: 12, left: 6, right: 6 } as const;

/** A count on the rail: "1.2k" past a thousand, and nothing at all for none, so a new post is not a column of zeros. The space keeps the line, so the icons never jump when the first like lands. */
export const railCount = (n: number) => (n > 0 ? compactNumber(n) : ' ');

/**
 * The words over a clip, set the way TikTok and Reels set them, so they
 * stay out of the picture's way and read at a glance:
 *   1. who: the face, the @handle and their level;
 *   2. the caption, two lines at most, with its #tags in it and "… more"
 *      at the end of the second line, never on a line of its own;
 *   3. one quiet line: when, where (opens the map), who with.
 * Nothing else stacks up over the video.
 */
export function ReelCaption({ post, author, onAuthor, open, onOpenChange }: { post: Post; author: User; onAuthor: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { users, blockedIds } = useApp();
  // Only the tags the caption does not already say (a challenge entry has its #tag in both).
  const tags = tagsNotInCaption(post.body, post.tags).map((t) => `#${t}`).join(' ');
  const text = [post.body?.trim(), tags].filter(Boolean).join(' ');
  const tagged = (post.taggedUserIds ?? []).filter((id) => !blockedIds.includes(id)).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const first = (name: string) => name.split(' ')[0];
  // Three or more is "Mira +2", not "Mira and 2 others": the court's name keeps the room. The full names are in the label.
  const withWho = tagged.length === 1 ? first(tagged[0].name) : tagged.length === 2 ? `${first(tagged[0].name)} and ${first(tagged[1].name)}` : tagged.length ? `${first(tagged[0].name)} +${tagged.length - 1}` : '';
  const place = post.court?.name ?? post.location ?? '';
  return (
    <View style={styles.wrap}>
      <Who author={author} onAuthor={onAuthor} newHere={isNewHere(post)} />
      {text ? <FoldedWords text={text} open={open} onOpenChange={onOpenChange} /> : null}
      <View style={styles.meta}>
        {/* The time never gives up room: a long court name is what shortens, never "8h" breaking onto two lines.
            No "Edited" over the video (TikTok, Reels and Shorts leave it off too); the clip's own page still says so. */}
        <Text style={[styles.metaText, styles.metaKeep]} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{relativeTime(post.createdAt)}</Text>
        {/* The icons part the items, so no dots between them: one quiet line, not a row of punctuation. */}
        {place ? (
          <Pressable
            accessibilityRole={post.court ? 'link' : undefined}
            accessibilityLabel={post.court ? `${place}, see posts from here` : place}
            disabled={!post.court}
            hitSlop={LINK_SLOP}
            onPress={(e) => { e?.stopPropagation?.(); if (post.court) openCourt(post.court); }}
            style={styles.metaItem}
          >
            <Ionicons name="location-sharp" size={12} color={META_INK} style={EDGE_SMALL} />
            <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{place}</Text>
          </Pressable>
        ) : null}
        {withWho ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`With ${tagged.map((u) => u.name).join(', ')}`}
            hitSlop={LINK_SLOP}
            onPress={(e) => { e?.stopPropagation?.(); if (tagged.length === 1) router.push(`/user/${tagged[0].id}`); else router.push({ pathname: '/likes', params: { id: post.id, set: 'tagged' } }); }}
            style={[styles.metaItem, styles.metaKeep]}
          >
            <Ionicons name="person-sharp" size={11} color={META_INK} style={EDGE_SMALL} />
            <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{withWho}</Text>
          </Pressable>
        ) : null}
      </View>
      {/* The app never posts a clip with tracker stats, but one that carries them still says where they came from. */}
      {post.session?.activityId ? (
        <View style={styles.metaItem}>
          <Ionicons name="tennisball-outline" size={12} color={META_INK} style={EDGE_SMALL} />
          <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{statsLine(post.session)}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The who-line: the face, the @handle, the level and, on a first post, a
 * short "New". It is always one line, so the words over a clip are never
 * more than three rows and the name sits in the same place on every clip.
 * The name is never what gives way to a badge: a hidden copy of the row,
 * allowed to wrap, tells whether "New" fits beside the level, and when it
 * does not, the clip leaves it off (the profile still shows it).
 */
function Who({ author, onAuthor, newHere = false }: { author: User; onAuthor: () => void; newHere?: boolean }) {
  // Unknown until measured, and the tag stays out of sight until then, so it never flashes in the wrong place.
  // The copy lays itself out again whenever the handle or the width changes, so the answer stays current.
  const [tagFits, setTagFits] = useState<boolean | null>(null);
  return (
    <>
      <Pressable accessibilityRole="link" accessibilityLabel={`${author.name}${newHere ? ', new to CourtSide' : ''}, open profile`} onPress={onAuthor} style={styles.who} hitSlop={4}>
        <View style={styles.avatarRing}><Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={32} /></View>
        <Text style={styles.handle} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{author.handle}</Text>
        <LevelPill profile={author.profile} small onMedia style={styles.badge} />
        {newHere && tagFits ? <View style={styles.badge}><NewHereTag onMedia short /></View> : null}
      </Pressable>
      {newHere ? (
        <View
          pointerEvents="none"
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={styles.whoMeasure}
          onLayout={(e) => setTagFits(e.nativeEvent.layout.height < 40)}
        >
          <View style={styles.avatarSpace} />
          <Text style={[styles.handle, styles.keep]} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{author.handle}</Text>
          <LevelPill profile={author.profile} small onMedia style={styles.badge} />
          <View style={styles.badge}><NewHereTag onMedia short /></View>
        </View>
      ) : null}
    </>
  );
}

/** The fold's tail, as TikTok sets it: the "…" in the caption's own weight, only "more" in the name's. */
const MORE_TAIL = <><Text style={{ ...font('400') }}>…</Text>{' more'}</>;

/**
 * Two lines, then "… more" on the end of the second, the way the big apps
 * fold a caption. A hidden copy finds, by halving, the most of the caption
 * that fits two lines with "… more" after it; tapping opens the whole of it.
 * The page can hold the open state (to dim the picture behind an open
 * caption); left alone, the caption keeps its own.
 */
export function FoldedWords({ text, open: openFromPage, onOpenChange }: { text: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openFromPage ?? ownOpen;
  const setOpen = (next: boolean) => { setOwnOpen(next); onOpenChange?.(next); };
  const [fullH, setFullH] = useState(0);
  // The search for the cut: lo fits, hi does not; trial is what is being measured.
  const [cut, setCut] = useState<{ lo: number; hi: number; trial: number } | null>(null);
  const folds = fullH > LINE * 2 + 2;
  useEffect(() => { setCut(null); setFullH(0); setOwnOpen(false); }, [text]);
  useEffect(() => { if (folds && !cut) setCut({ lo: 0, hi: text.length, trial: Math.floor(text.length / 2) }); }, [folds, cut, text.length]);
  const settled = cut && cut.hi - cut.lo <= 1;
  const shown = useMemo(() => {
    if (!folds) return text;
    const at = settled ? cut!.lo : Math.min(text.length, Math.round(text.length * 0.55));
    // End on a whole word when one is close, and never on a comma, a dash or a full stop right before the "…" ("shoulder.…" read as four dots).
    const space = text.lastIndexOf(' ', at);
    return text.slice(0, space > at - 14 && space > 0 ? space : at).trimEnd().replace(/[\s,;:.–—-]+$/u, '');
  }, [folds, settled, cut, text]);
  const more = <Text style={styles.more} onPress={() => setOpen(true)}>{MORE_TAIL}</Text>;
  return (
    <Pressable disabled={!folds} onPress={() => setOpen(!open)} accessibilityRole={folds ? 'button' : undefined} accessibilityLabel={folds ? (open ? 'Show less of the caption' : 'Show the whole caption') : undefined}>
      {open ? (
        <RichText style={styles.caption} hashtagStyle={styles.tag} mentionStyle={styles.tag} numberOfLines={10} maxFontSizeMultiplier={MAX_GROW} after={<Text style={styles.more}>{'  less'}</Text>}>{text}</RichText>
      ) : (
        <RichText style={styles.caption} hashtagStyle={styles.tag} mentionStyle={styles.tag} numberOfLines={2} maxFontSizeMultiplier={MAX_GROW} after={folds ? more : null}>{shown}</RichText>
      )}
      {/* Measuring, out of sight: the full height, and each trial cut with "… more" after it. */}
      <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.measure}>
        <Text style={styles.caption} maxFontSizeMultiplier={MAX_GROW} onLayout={(e) => setFullH(e.nativeEvent.layout.height)}>{text}</Text>
        {cut && !settled ? (
          <Text
            key={cut.trial}
            style={styles.caption}
            maxFontSizeMultiplier={MAX_GROW}
            onLayout={(e) => {
              const fits = e.nativeEvent.layout.height <= LINE * 2 + 2;
              setCut((c) => {
                if (!c || c.trial !== cut.trial) return c;
                const lo = fits ? c.trial : c.lo;
                const hi = fits ? c.hi : c.trial;
                return { lo, hi, trial: Math.floor((lo + hi) / 2) };
              });
            }}
          >
            {text.slice(0, cut.trial).trimEnd()}<Text style={styles.more}>{MORE_TAIL}</Text>
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The who-line on its own, for an Instant: the same face, handle and level as a clip's. */
export function ReelWho({ author, onAuthor }: { author: User; onAuthor: () => void }) {
  return <Who author={author} onAuthor={onAuthor} />;
}

/**
 * An Instant's small line, set like a clip's: that it is an Instant and how
 * long it has left. No posted-at time beside it: an Instant lasts a day, so
 * "4h" next to "20h left" would say the same thing twice. Ticks once a minute.
 */
export function InstantMeta({ expiresAt }: { expiresAt: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(id); }, []);
  return (
    <View style={styles.meta}>
      <View style={[styles.metaItem, styles.metaKeep]}>
        <Ionicons name="time-outline" size={12} color={META_INK} style={EDGE_SMALL} />
        <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{`Instant · ${timeLeft(expiresAt)}`}</Text>
      </View>
    </View>
  );
}

/**
 * How dark the shade behind the words is, as [points above the words' bottom
 * line, darkness]. Nothing up in the picture, easing in so there is no band
 * where it starts (its top 80pt stay at 0.12 or less), darkest where the words
 * sit: about 0.40 behind the name, 0.46 behind the caption, 0.52 behind the
 * time. That holds white words above 3:1 on a white wall or a bright sky. It
 * starts high enough to reach the bottom of the rail too. It is measured from
 * the words, not the screen, so it sits right on every phone.
 */
const SHADE: readonly (readonly [number, number])[] = [[340, 0], [300, 0.05], [260, 0.12], [210, 0.21], [160, 0.3], [120, 0.37], [90, 0.42], [60, 0.47], [30, 0.51], [0, 0.54]];
/** Below the words, down to the screen's edge, behind the tab bar. */
const SHADE_FLOOR = 0.56;

/**
 * A light shade down from the top edge of a clip in the feed, under the mark,
 * the sound disc, the back arrow and the phone's clock, so they hold on a
 * bright sky or a white ceiling (Instagram's is 0.35 at the edge). It reaches
 * `below` points under the safe area and is gone well before the picture's
 * middle. The player draws it, between the video and the sound disc, so it
 * darkens the picture and never the disc.
 */
export const TOP_SHADE = {
  colors: ['rgba(0, 0, 0, 0.32)', 'rgba(0, 0, 0, 0.21)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.03)', 'rgba(0, 0, 0, 0)'],
  locations: [0, 0.3, 0.6, 0.85, 1],
  below: 150,
} as const;

/**
 * The shade behind the words, pure black (a tint reads muddy over a blue
 * court). `bottom` is where the words' bottom line sits above the screen's
 * bottom edge.
 */
export function ReelScrim({ bottom }: { bottom: number }) {
  const shade = useMemo(() => {
    const height = bottom + SHADE[0][0];
    const colors = [...SHADE.map(([, a]) => `rgba(0, 0, 0, ${a})`), `rgba(0, 0, 0, ${SHADE_FLOOR})`] as unknown as readonly [string, string, ...string[]];
    const locations = [...SHADE.map(([d]) => (SHADE[0][0] - d) / height), 1] as unknown as readonly [number, number, ...number[]];
    return { height, colors, locations };
  }, [bottom]);
  return <LinearGradient pointerEvents="none" colors={shade.colors} locations={shade.locations} style={[styles.scrim, { height: shade.height }]} />;
}

/**
 * A soft dark glow behind the top of the rail, as [how far out from its
 * centre, darkness]. The shade behind the words is gone by the height of the
 * heart and the bubble, so on a bright court they had nothing behind them.
 */
const RAIL_SHADE = [[0, 0.3], [0.35, 0.22], [0.65, 0.09], [1, 0]] as const;

/**
 * The rail's own shade: half an oval, 112pt wide and 340pt tall, centred on
 * the screen's right edge about 40pt below the heart, darkest there and gone
 * by its rim, so it never reads as a band or a box. It goes first inside the
 * rail, so it slides, tucks and hides with the buttons. (The oval is a circle
 * in a stretched 100 x 200 box: browsers ignore an oval gradient's two radii.)
 */
export function RailShade() {
  const id = `rail${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={styles.railShade}>
      <Svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse">
            {RAIL_SHADE.map(([at, alpha]) => <Stop key={at} offset={at} stopColor="black" stopOpacity={alpha} />)}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="200" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Behind an opened caption the whole picture dims, the way Reels and TikTok
 * do it, so a long caption reads like a page of its own. A tap anywhere on
 * the picture folds it again.
 */
export function ReelDim({ onClose }: { onClose: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} style={[StyleSheet.absoluteFill, styles.dim]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fold the caption" onPress={onClose} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const HINT_KEY = 'courtside-swipe-hint-shows';
/** How many opens of the app teach the swipes; after that the hint never shows again. */
const HINT_OPENS = 3;
/** Decided once per launch: whether this open still teaches the swipes, and whether it already has. */
let hintThisLaunch: Promise<boolean> | null = null;
let hintShown = false;

/**
 * "↑ Next moment · → Community" just above the first clip's words, for a few
 * seconds, on the first few opens of the app only: a nudge for someone new,
 * not a fixture an everyday player keeps seeing. Community sits to Home's left
 * now, so its arrow points right: the way the finger moves. It floats rather than taking
 * a line, so nothing jumps when it appears or goes.
 */
export function SwipeHint() {
  const [shown, setShown] = useState(false);
  // The first-run tour teaches the same swipes; the hint keeps out of its way, and out from under it.
  const touring = useTourBusy();
  useEffect(() => {
    let on = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    hintThisLaunch ??= (async () => {
      try {
        const opens = Number(await AsyncStorage.getItem(HINT_KEY)) || 0;
        if (opens >= HINT_OPENS) return false;
        await AsyncStorage.setItem(HINT_KEY, String(opens + 1));
        return true;
      } catch { return false; }
    })();
    void hintThisLaunch.then((teach) => {
      if (!on || !teach || hintShown) return;
      hintShown = true;
      setShown(true);
      t = setTimeout(() => { if (on) setShown(false); }, 4000);
    });
    return () => { on = false; if (t) clearTimeout(t); };
  }, []);
  if (!shown || touring) return null;
  return <Animated.Text exiting={FadeOut.duration(400)} style={styles.hint} maxFontSizeMultiplier={MAX_GROW}>↑ Next moment   ·   → Community</Animated.Text>;
}

const styles = StyleSheet.create({
  // The caption sits close under the name (one post's words); the small line keeps a little more air.
  wrap: { gap: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  // No ring: the photo sits on the clip as it is (the owner's call, Oct 1).
  avatarRing: { borderRadius: 16 },
  avatarSpace: { width: 34, height: 34 },
  // The level and the welcome tag never shrink and sit centred on the name's line, 6 apart.
  badge: { alignSelf: 'center', flexShrink: 0, marginLeft: -2 },
  // A copy of the who-line that may wrap: one line tall means "New" fits beside the level.
  whoMeasure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  keep: { flexShrink: 0 },
  handle: { color: '#fff', fontSize: 16, lineHeight: 20, ...font('600'), letterSpacing: -0.2, flexShrink: 1, ...EDGE },
  caption: { color: '#fff', fontSize: 15, lineHeight: LINE, ...font('400'), ...EDGE },
  tag: { color: '#fff', ...font('600') },
  // The one tappable word in the caption: as white as the rest, set in the name's weight.
  more: { color: '#fff', ...font('600') },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, minWidth: 0 },
  metaKeep: { flexShrink: 0 },
  metaText: { color: META_INK, fontSize: 13, lineHeight: 16, ...font('500'), letterSpacing: 0.1, fontVariant: ['tabular-nums'], flexShrink: 1, ...EDGE_SMALL },
  // Out of the words' layout, 10 above the name, in the words' column (16 in from the left, clear of the rail).
  hint: { position: 'absolute', left: 16, right: 72, bottom: '100%', marginBottom: 10, color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 15, ...font('500'), letterSpacing: 0.1, ...EDGE_SMALL },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // From the rail's top, up past the heart and down past the bookmark, to the screen's right edge (the rail stands 12 in).
  railShade: { position: 'absolute', top: -115, right: -12, width: 112, height: 340 },
  dim: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
});
