import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { FadeOut } from 'react-native-reanimated';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { NewHereTag } from '@/components/NewHereTag';
import { isNewHere } from '@/features/feed/newHere';
import { RichText } from '@/components/RichText';
import type { Post, User } from '@/data/types';
import { openCourt } from '@/features/players/courtLink';
import { hasSessionStats } from '@/features/activity/format';
import { StatsPill } from '@/components/session/StatsPill';
import { agoInWords, compactNumber, timeLeft } from '@/lib/format';
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
 * "With" and an Instant's time are 16pt tall, so their tap area reaches past them:
 * further down, where only the tab bar's 16pt of air is, and a little less
 * up, so a tap on the caption's last line still opens the caption.
 */
const LINK_SLOP = { top: 8, bottom: 12, left: 6, right: 6 } as const;
/** The handle's tap area: a little above it, and only a little below, where the place starts. */
const NAME_SLOP = { top: 8, bottom: 2, left: 4, right: 4 } as const;
/** The place line under the handle: a little more room, never so much it reaches the handle or the caption's first line. */
const PLACE_SLOP = { top: 2, bottom: 4, left: 6, right: 10 } as const;
/** The words' own tap area: a little above them, nothing below (the small line has its own buttons there). */
const WORDS_SLOP = { top: 6, bottom: 0, left: 0, right: 0 } as const;

/** A count on the rail: "1.2k" past a thousand, and nothing at all for none, so a new post is not a column of zeros. The space keeps the line, so the icons never jump when the first like lands. */
export const railCount = (n: number) => (n > 0 ? compactNumber(n) : ' ');

/**
 * The words over a clip, set the way Instagram and TikTok set them, so they
 * stay out of the picture's way and read at a glance:
 *   1. who: the face, the @handle and their level, and under the handle,
 *      where it was (Instagram's location line: the whole name on its own
 *      line, a tap opens the court's page);
 *   2. the caption, two lines at most, with its #tags in it and "… more"
 *      at the end of the second line, never on a line of its own;
 *   3. who with, when someone is tagged ("Mira", a tap opens them).
 * Nothing else stacks up over the video. No posted-at time until the caption
 * is opened, as on Reels and TikTok: a tap on the words opens them in place,
 * the whole caption with "24 minutes ago" under it, and a second tap folds
 * them again. The name, the place, "with" and each #tag keep their own taps.
 */
export function ReelCaption({ post, author, onAuthor, onOpenStats, active = false }: { post: Post; author: User; onAuthor: () => void; /** Kept for the feed's call; the comments open from the rail. */ onOpenComments?: (from?: unknown) => void; onOpenStats?: () => void; active?: boolean }) {
  const { users, blockedIds } = useApp();
  const touring = useTourBusy();
  const { height: screenH } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  // A clip scrolled away folds its words again, so the next time it comes round it is as it was.
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  // Only the tags the caption does not already say (a challenge entry has its #tag in both).
  const tags = tagsNotInCaption(post.body, post.tags).map((t) => `#${t}`).join(' ');
  const text = [post.body?.trim(), tags].filter(Boolean).join(' ');
  const tagged = (post.taggedUserIds ?? []).filter((id) => !blockedIds.includes(id)).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const first = (name: string) => name.split(' ')[0];
  // Three or more is "Mira +2", not "Mira and 2 others". The full names are in the label.
  const withWho = tagged.length === 1 ? first(tagged[0].name) : tagged.length === 2 ? `${first(tagged[0].name)} and ${first(tagged[1].name)}` : tagged.length ? `${first(tagged[0].name)} +${tagged.length - 1}` : '';
  const place = post.court?.name ?? post.location ?? '';
  return (
    <View style={styles.wrap}>
      {/* An opened caption gets a deeper shade behind it, reaching up past its top line, so long words read on any frame. */}
      {open ? <LinearGradient pointerEvents="none" colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.42)', 'rgba(0, 0, 0, 0.42)']} locations={[0, 0.2, 1]} style={styles.openShade} /> : null}
      <Who author={author} onAuthor={onAuthor} newHere={isNewHere(post)} place={place} court={post.court} />
      {text ? (
        open ? (
          <ScrollView style={{ maxHeight: Math.round(screenH * 0.4) }} nestedScrollEnabled showsVerticalScrollIndicator={false} bounces={false}>
            <Pressable
              disabled={touring}
              onPress={(e) => { e?.stopPropagation?.(); setOpen(false); }}
              accessibilityRole="button"
              accessibilityLabel={`${text}. ${spokenWhen(post.createdAt)}`}
              accessibilityHint="Folds the caption again"
              style={({ pressed }) => [styles.wordsButton, pressed && styles.pressed]}
            >
              <RichText style={styles.caption} hashtagStyle={styles.tag} mentionStyle={styles.tag} maxFontSizeMultiplier={MAX_GROW}>{text}</RichText>
              <Text style={[styles.metaText, styles.when]} maxFontSizeMultiplier={MAX_GROW}>{agoInWords(post.createdAt)}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <FoldedWords text={text} onPress={() => setOpen(true)} hint="Shows the whole caption and when it was posted" />
        )
      ) : null}
      {withWho ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`With ${tagged.map((u) => u.name).join(', ')}`}
          hitSlop={LINK_SLOP}
          onPress={(e) => { e?.stopPropagation?.(); if (tagged.length === 1) router.push(`/user/${tagged[0].id}`); else router.push({ pathname: '/likes', params: { id: post.id, set: 'tagged' } }); }}
          style={({ pressed }) => [styles.metaItem, styles.withLine, pressed && styles.pressed]}
        >
          <Ionicons name="person-sharp" size={11} color={META_INK} style={EDGE_SMALL} />
          <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{withWho}</Text>
        </Pressable>
      ) : null}
      {/* A clip with a session attached: one glass pill under the words, "1h 24m · Won · 171 bpm | See stats".
          A tap raises the stats with the clip still playing above them (session-stats); the names are in there, not here. */}
      {post.session && hasSessionStats(post.session) ? (
        <View style={styles.pill}>
          <StatsPill session={post.session} hidden={blockedIds} onPress={onOpenStats} active={active} />
        </View>
      ) : null}
    </View>
  );
}

/** "Posted 2 hours ago", for a screen reader: the opened caption's time said as a sentence. */
function spokenWhen(iso: string): string {
  const words = agoInWords(iso);
  return /ago$|^Just now$/.test(words) ? `Posted ${words.toLowerCase()}` : `Posted on ${words}`;
}

/**
 * The who-line: the face, the @handle, the level and, on a first post, a
 * short "New", with where it was on a small line under the handle, the way
 * Instagram sets a post's location under the username. The handle's line is
 * always one line, so the name sits in the same place on every clip.
 * The name is never what gives way to a badge: a hidden copy of the row,
 * allowed to wrap, tells whether "New" fits beside the level, and when it
 * does not, the clip leaves it off (the profile still shows it). The place
 * has the whole width under the handle and only shortens at its very end.
 */
function Who({ author, onAuthor, newHere = false, place = '', court }: { author: User; onAuthor: () => void; newHere?: boolean; place?: string; court?: Post['court'] }) {
  const { currentUserId, followingIds, followRequests, actions } = useApp();
  // Instagram's Follow beside the name, for someone you do not follow yet (Oct 4); asked once, it steps away.
  const canFollow = !!currentUserId && author.id !== currentUserId && !followingIds.includes(author.id)
    && !followRequests.some((r) => r.fromId === currentUserId && r.toId === author.id);
  // Unknown until measured, and the tag stays out of sight until then, so it never flashes in the wrong place.
  // The copy lays itself out again whenever the handle or the width changes, so the answer stays current.
  const [tagFits, setTagFits] = useState<boolean | null>(null);
  return (
    <>
      <View style={styles.who}>
        {/* The face opens the profile too; the handle beside it is the one a screen reader hears. */}
        <Pressable accessible={false} importantForAccessibility="no" onPress={onAuthor} hitSlop={4} style={styles.avatarRing}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={32} />
        </Pressable>
        <View style={styles.whoWords}>
          <Pressable accessibilityRole="link" accessibilityLabel={`${author.name}${newHere ? ', new to CourtSide' : ''}, open profile`} onPress={onAuthor} style={styles.nameRow} hitSlop={NAME_SLOP}>
            <Text style={styles.handle} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{author.handle}</Text>
            <LevelPill profile={author.profile} small onMedia style={styles.badge} />
            {newHere && tagFits ? <View style={styles.badge}><NewHereTag onMedia short /></View> : null}
            {canFollow ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Follow ${author.handle}`} hitSlop={8} onPress={(e) => { e?.stopPropagation?.(); actions.toggleFollow(author.id); }} style={({ pressed }) => [styles.follow, pressed && styles.pressed]}>
                <Text style={styles.followText} maxFontSizeMultiplier={MAX_GROW}>Follow</Text>
              </Pressable>
            ) : null}
          </Pressable>
          {place ? (
            <Pressable
              accessibilityRole={court ? 'link' : 'text'}
              accessibilityLabel={court ? `${place}, see posts from here` : place}
              disabled={!court}
              hitSlop={PLACE_SLOP}
              onPress={(e) => { e?.stopPropagation?.(); if (court) openCourt(court); }}
              style={({ pressed }) => [styles.placeRow, pressed && styles.pressed]}
            >
              <Ionicons name="location-sharp" size={10} color={META_INK} style={EDGE_SMALL} />
              <Text style={styles.placeText} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{place}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
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
 * that fits two lines with "… more" after it. The whole block is one button:
 * it opens the comments, where the whole caption is at the top (it no longer
 * unfolds over the picture). "… more" stays as the visible cue and does the same.
 * It sits only as wide as its words, so the air beside a short line does nothing.
 */
export function FoldedWords({ text, onPress, hint = 'Opens the comments, with the whole caption' }: { text: string; onPress?: (from?: unknown) => void; /** What a tap does, for a screen reader. */ hint?: string }) {
  // The tutorial is teaching the swipes: the words stay still under it.
  const touring = useTourBusy();
  const button = useRef<View>(null);
  const press = () => onPress?.(button.current);
  const [fullH, setFullH] = useState(0);
  // The search for the cut: lo fits, hi does not; trial is what is being measured.
  const [cut, setCut] = useState<{ lo: number; hi: number; trial: number } | null>(null);
  const folds = fullH > LINE * 2 + 2;
  useEffect(() => { setCut(null); setFullH(0); }, [text]);
  useEffect(() => { if (folds && !cut) setCut({ lo: 0, hi: text.length, trial: Math.floor(text.length / 2) }); }, [folds, cut, text.length]);
  const settled = cut && cut.hi - cut.lo <= 1;
  const shown = useMemo(() => {
    if (!folds) return text;
    const at = settled ? cut!.lo : Math.min(text.length, Math.round(text.length * 0.55));
    // End on a whole word when one is close, and never on a comma, a dash or a full stop right before the "…" ("shoulder.…" read as four dots).
    const space = text.lastIndexOf(' ', at);
    return text.slice(0, space > at - 14 && space > 0 ? space : at).trimEnd().replace(/[\s,;:.–—-]+$/u, '');
  }, [folds, settled, cut, text]);
  const more = <Text style={styles.more} onPress={onPress && !touring ? press : undefined}>{MORE_TAIL}</Text>;
  return (
    <View>
      <Pressable
        ref={button}
        disabled={!onPress || touring}
        onPress={press}
        hitSlop={WORDS_SLOP}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={text}
        accessibilityHint={onPress ? hint : undefined}
        // Feedback at once and nothing more: no shrink, no buzz, no wait.
        style={({ pressed }) => [styles.wordsButton, pressed && styles.pressed]}
      >
        <RichText style={styles.caption} hashtagStyle={styles.tag} mentionStyle={styles.tag} numberOfLines={2} maxFontSizeMultiplier={MAX_GROW} after={folds ? more : null}>{shown}</RichText>
      </Pressable>
      {/* Measuring, out of sight, across the words' whole column (not the button, which is only as wide as
          what it shows): the full height, and each trial cut with "… more" after it. */}
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
    </View>
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
 * Like a clip's time, it opens the comments.
 */
export function InstantMeta({ expiresAt, onPress }: { expiresAt: string; onPress?: (from?: unknown) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(id); }, []);
  const touring = useTourBusy();
  const button = useRef<View>(null);
  const left = timeLeft(expiresAt);
  return (
    <View style={styles.meta}>
      <Pressable
        ref={button}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`Instant, ${left}. ${onPress ? 'Opens the comments' : ''}`.trim()}
        disabled={!onPress || touring}
        hitSlop={LINK_SLOP}
        onPress={() => onPress?.(button.current)}
        style={({ pressed }) => [styles.metaItem, styles.metaKeep, pressed && styles.pressed]}
      >
        <Ionicons name="time-outline" size={12} color={META_INK} style={EDGE_SMALL} />
        <Text style={styles.metaText} numberOfLines={1} maxFontSizeMultiplier={MAX_GROW}>{`Instant · ${left}`}</Text>
      </Pressable>
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
  // The face, then the handle's line with the place under it, both lines centred on the face.
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  whoWords: { flex: 1, minWidth: 0, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  // Instagram's location line: small, the whole width under the handle, shortening only at its end.
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', maxWidth: '100%' },
  placeText: { color: META_INK, fontSize: 12.5, lineHeight: 16, ...font('500'), letterSpacing: 0, opacity: 0.9, flexShrink: 1, ...EDGE_SMALL },
  // Instagram's outlined Follow: white hairline, white words, no fill.
  follow: { height: 24, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.75)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  followText: { color: '#fff', fontSize: 13, ...font('600'), letterSpacing: -0.1, ...EDGE_SMALL },
  // The time under an opened caption, 4 below its last line.
  when: { marginTop: 4 },
  // Who with: its own small line under the caption, only as wide as its words.
  withLine: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 2 },
  // Behind an opened caption: from 48 above it down past the tab bar to the screen's foot, edge to edge (the column stands 16 in, 72 from the right).
  openShade: { position: 'absolute', left: -16, right: -72, top: -48, bottom: -200 },
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
  // A player's handle in the stats line: the line's own ink, a step bolder, so it reads as a name to tap.
  metaHandle: { color: META_INK, ...font('600') },
  // The session's pill: 10 under the small line.
  pill: { marginTop: 10 },
  // Out of the words' layout, 10 above the name, in the words' column (16 in from the left, clear of the rail).
  hint: { position: 'absolute', left: 16, right: 72, bottom: '100%', marginBottom: 10, color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 15, ...font('500'), letterSpacing: 0.1, ...EDGE_SMALL },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // From the rail's top, up past the heart and down past the bookmark, to the screen's right edge (the rail stands 12 in).
  railShade: { position: 'absolute', top: -115, right: -12, width: 112, height: 340 },
  // The words as a button: only as wide as they are.
  wordsButton: { alignSelf: 'flex-start', maxWidth: '100%' },
  pressed: { opacity: 0.6 },
});
