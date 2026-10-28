import { PRESS_DIM } from '@/theme/press';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { MapCreditDot } from '@/components/map/MapCreditDot';
import { CourtKing } from '@/components/place/CourtKing';
import { HereTag } from '@/components/place/CourtLife';
import { SurfaceAsk } from '@/components/place/SurfaceAsk';
import { Avatar, Screen } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import type { CourtAccess } from '@/data/types';
import { useCourtHits } from '@/features/places/useCourtHits';
import { openCourtNow } from '@/features/players/courtLink';
import { goBack } from '@/lib/goBack';
import { holdLightStatusBar } from '@/lib/statusBarStyle';
import { useArrived } from '@/lib/useArrived';
import { usePressV2 } from '@/features/navigation/pressV2';
import { PULL_GAP } from '@/lib/pullRefresh';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { buttonShape, colors, font, inkOn, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';

import { ClipHero } from './ClipHero';
import { CourtActions, NowMark, PrimaryBar, useCourtNow } from './parts';
import { ClipsSection, HitsSection, SaysSection } from './PlaceSections';
import { courtPageLook } from './look';
import { FactsLine, NameHeart, NowRow, OpenHits, PlayAndSquares, PlayersSay, canSayNow } from './final';
import type { CourtView } from './view';
import { LESS_AI_COURTS, corner } from '@/theme/look';
import { surfaceTint } from '@/components/place/SurfaceTag';
import { surfaceAdjective, surfaceKind, surfaceLabel, type SurfaceKind } from '@/features/places/courtSurface';

/*
 * A court's page, the place card: the court the way Apple Maps shows a place
 * (owner, Oct 10: "Do b."; made whole Oct 25, look.ts 'final').
 *
 *   The map of the court, edge to edge, with its pin; a tap opens the full
 *   map there ("See on map" says so), its credit a tiny ⓘ in the corner.
 *   The page rises over it as a sheet: the name with Follow's heart beside
 *   it; the facts in one line ("4 courts · ● Hard · Lights · Public"); the
 *   town, how far, how many follow it; who has played here, as faces; how it
 *   is right now, as one row; the page's one primary, Start a session here;
 *   Play here (tinted) with Directions and Share as two small squares; "What
 *   surface?" where the map does not say.
 *   Then its sections, each opening the same way (SectionHead) and every
 *   empty one a single line: the open hits first, the clips, King of the
 *   Court, what players say (the map's ⓘ credits the facts too).
 *
 * The page before it (look.ts 'now': five round actions, a facts strip,
 * the clips first) is kept one switch away.
 *
 * The route (app/court/[id]) works out what is shown, by the court's own
 * rules, and hands it over (CourtView); this only lays it out. Back, and
 * the name once the sheet has scrolled up under it, ride in a bar over the
 * top.
 */

/** How much of the map shows under the status bar, before the sheet rises over it. */
const HERO_BODY = 150;
/** The map's whole height, status bar and all, at most: the posts' head then shows above the fold. */
const HERO_MAX = 200;
/** A short phone (an iPhone SE, 667pt): a shorter map and a tighter top, so Posts and Watch all still show above the tab bar. */
const SHORT_SCREEN = 740;
const HERO_BODY_SHORT = 104;
/** How far the sheet rises over the map, its rounded top. */
const SHEET_OVER = 24;
/**
 * With a clip at the top (Oct 28, owner: "the pull up is too high rn. We can show more of the clip on
 * the background"): the sheet rests lower, its name starting a little past half way down the screen
 * (a short phone, a little higher, so Start a session here still shows). A computer: a taller card.
 */
const CLIP_SHARE = 0.57;
const CLIP_SHARE_SHORT = 0.52;
const CLIP_WIDE = 360;
/** The bar over the top: back, and the name once the sheet has gone up under it. */
const BAR_H = 52;
/** How close in the map is: the court's own block and the streets round it. */
const MAP_ZOOM = 15.5;

export function PlaceCard({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { height: screenH } = useWindowDimensions();
  const short = isPhone && screenH < SHORT_SCREEN;
  const offsetY = useSharedValue(0);
  // Hits at this court, as the section lists them, for its count.
  const hits = useCourtHits(view.here);
  // The pull's strip above the page on a phone (Screen's own), so "the top" is where the page rests.
  const strip = Platform.OS !== 'web' && view.onRefresh ? PULL_GAP : 0;
  const top = isPhone ? insets.top : 0;
  // The court's most-watched clip, when it has one, in place of the map; none, the map as before.
  const clip = view.heroClip;
  const heroH = clip
    ? (isPhone ? Math.round(screenH * (short ? CLIP_SHARE_SHORT : CLIP_SHARE)) : CLIP_WIDE)
    : Math.min(top + (short ? HERO_BODY_SHORT : HERO_BODY), HERO_MAX);
  // The bar turns solid, and the name shows in it, once the sheet's top has gone up under it.
  const solidAt = heroH - SHEET_OVER - (top + BAR_H) + 36;
  // The sheet has gone up over the clip (the bar has turned solid): it holds still until the sheet comes down again.
  const [covered, setCovered] = useState(false);
  useAnimatedReaction(() => offsetY.value - strip > solidAt, (now, was) => { if (now !== was) runOnJS(setCovered)(now); }, [strip, solidAt]);
  // Over a clip the status bar's words are light, as on the Feed; once the sheet covers it, the theme's own again.
  const lightTop = !!clip && isPhone && !covered;
  useFocusEffect(useCallback(() => (lightTop ? holdLightStatusBar() : undefined), [lightTop]));
  const meta = [view.area, view.distance, view.followers ? `${view.followers} ${view.followers === 1 ? 'follower' : 'followers'}` : null].filter(Boolean).join(' · ');
  const nameSize = view.name.length > 30 ? styles.nameLong : null;
  // The page (look.ts: 'final', or the one before it, 'now').
  const look = courtPageLook();
  const nowOK = canSayNow(view);
  // On a phone the page can only start to slide in once all of it is built (Oct 24, owner: "Buttons
  // need to be way more responsive. They are way to delayed when I click them"). So the sections
  // under the posts (King of the Court, what players say; the old page's open hits too)
  // are built once it has slid in (useArrived), as notifications and messages do. Only with two rows
  // of posts or more: then they are under the bar on every phone, out of sight; with fewer they can
  // show on the first screen, and come with the page as before. A computer or an iPad can show them
  // at once: always. Once built, they stay (posts landing later never take them away again).
  // With the quicker press feel only (pressV2: admins first): the court's picture then comes about
  // a third of a second later on a first visit, a change he sees, so everyone else keeps it all at once.
  const arrived = useArrived(usePressV2());
  const belowBuilt = useRef(false);
  const below = belowBuilt.current || arrived || !isPhone || view.posts.length <= 3;
  belowBuilt.current = below;
  const nameText = <Text accessibilityRole="header" style={[styles.name, nameSize, look === 'final' && styles.nameGrow]} numberOfLines={3}>{view.name}</Text>;

  return (
    <View style={styles.root}>
      <Screen bleedTop wash={false} padded={false} onRefresh={view.onRefresh} offsetY={offsetY}>
        {clip ? (
          <ClipHero
            post={clip} top={top} height={heroH} over={isPhone ? SHEET_OVER : 0} name={view.name}
            by={view.users.find((u) => u.id === clip.authorId)?.name ?? 'a player'} covered={covered}
            onOpen={() => view.onOpenReel(clip)} onOpenMap={view.onMap} offsetY={offsetY} strip={strip} rounded={!isPhone}
          />
        ) : (
          <PlaceHero lat={view.here.lat} lng={view.here.lng} top={top} height={heroH} name={view.name} onOpenMap={view.onMap} offsetY={offsetY} strip={strip} rounded={!isPhone} drawMap={arrived || !isPhone} />
        )}
        <View testID="court-sheet" style={[styles.sheet, !isPhone && styles.sheetWide]}>
          <View style={styles.gutter}>
            {look === 'final' ? <View style={styles.nameRow}>{nameText}<NameHeart view={view} /></View> : nameText}
            {look === 'final' ? <FactsLine view={view} /> : null}
            {meta || view.areaPending ? <Text style={styles.meta} numberOfLines={2}>{meta || ' '}</Text> : null}
            {view.players.length ? (
              <View style={styles.people}>
                <View style={styles.faces}>
                  {view.players.slice(0, 3).map((u, i) => (
                    <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${u.name}, open profile`} hitSlop={4} onPress={() => router.push(`/user/${u.id}`)} style={({ pressed }) => [i > 0 && styles.faceOver, pressed && styles.pressed]}>
                      <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={22} style={styles.face} />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.peopleText} numberOfLines={1}>Played here by <Text style={styles.peopleNames}>{view.playedBy}</Text></Text>
              </View>
            ) : null}
            {look === 'final' ? (
              <>
                {nowOK ? <NowRow view={view} /> : null}
                <View style={[styles.primary, short && styles.primaryShort]}><PrimaryBar session={view.session} /></View>
                <PlayAndSquares view={view} />
                {view.askSurface ? <View style={styles.ask}><SurfaceAsk courtId={view.askSurface} onRegistered={view.onSurface} ruled /></View> : null}
              </>
            ) : (
              <>
                {nowOK && view.factsId ? <PlaceNow courtId={view.factsId} name={view.name} access={view.access} /> : null}
                <View style={[styles.primary, short && styles.primaryShort]}><PrimaryBar session={view.session} /></View>
              </>
            )}
          </View>
          {look === 'final' ? (
            <View style={[styles.gutter, styles.finalSections, short && styles.sectionsShort]}>
              {/* Open hits first (owner, Oct 25), then the clips; the rest once the page has slid in, when it is out of sight. */}
              <OpenHits view={view} count={hits.length} />
              <ClipsSection view={view} quiet />
              {/* King of the Court (migration 130): signed in, at a court on the map, never at someone's home court, and only while its switch is on for you (migration 140; admins for now). */}
              {below && view.factsId && view.currentUserId && view.access !== 'private' ? <CourtKing courtId={view.factsId} name={view.name} refresh={view.kingTick} look="line" /> : null}
              {below && view.extras && view.factsId ? <PlayersSay courtId={view.factsId} name={view.name} /> : null}
            </View>
          ) : (
            <>
              <View style={[styles.acts, short && styles.actsShort]}><CourtActions view={view} /></View>
              <FactStrip view={view} short={short} />
              {view.askSurface ? <SurfaceAsk courtId={view.askSurface} onRegistered={view.onSurface} /> : null}
              <View style={[styles.gutter, styles.sections, short && styles.sectionsShort]}>
                <ClipsSection view={view} />
                {below ? <HitsSection view={view} count={hits.length} /> : null}
                {/* King of the Court (migration 130): signed in, at a court on the map, never at someone's home court, and only while its switch is on for you (migration 140; admins for now). */}
                {below && view.factsId && view.currentUserId && view.access !== 'private' ? <CourtKing courtId={view.factsId} name={view.name} refresh={view.kingTick} /> : null}
                {below && view.extras && view.factsId ? <SaysSection courtId={view.factsId} name={view.name} /> : null}
              </View>
            </>
          )}
        </View>
      </Screen>
      <TopBar name={view.name} top={top} offsetY={offsetY} strip={strip} solidAt={solidAt} />
    </View>
  );
}

/* ------------------------------ The top ------------------------------ */

/**
 * The court's map, edge to edge under the status bar, its spot a little
 * above the middle of what shows (the sheet covers the foot), with the
 * court's pin dropping onto it once. The whole map opens the full map
 * there, and "See on map" says so. Scrolling, it drifts up slower than the
 * page; pulled down on a phone, it stretches to fill the gap.
 */
function PlaceHero({ lat, lng, top, height, name, onOpenMap, offsetY, strip, rounded, drawMap }: {
  lat: number; lng: number; top: number; height: number; name: string; onOpenMap: () => void;
  offsetY: SharedValue<number>; strip: number; rounded: boolean;
  /** Whether the hidden web view that draws a court's picture may start: on a phone, once the page has slid in. */
  drawMap: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [w, setW] = useState(0);
  // Where the court sits: the middle of the map that shows, between the status bar and the sheet.
  // On a computer the map is a rounded card of its own, with nothing laid over its foot.
  const over = rounded ? 0 : SHEET_OVER;
  const spotY = Math.round((top + height - over) / 2) + 6;
  const mapH = Math.max(height, spotY * 2);
  const mapTop = spotY - mapH / 2;
  // A phone draws the drift and the stretch frame by frame; a browser pays for each frame, so there it stays put.
  const drift = useAnimatedStyle(() => {
    if (Platform.OS === 'web') return {};
    const y = offsetY.value - strip;
    if (y < 0) return { transform: [{ translateY: y / 2 }, { scale: (height - y) / height }] };
    return { transform: [{ translateY: y * 0.45 }] };
  }, [height, strip]);
  return (
    <View style={[styles.hero, { height }, rounded && styles.heroRounded]} onLayout={(e) => { const next = Math.round(e.nativeEvent.layout.width); if (next && next !== w) setW(next); }}>
      <Animated.View style={[styles.heroMap, rounded && styles.heroRounded, drift]}>
        {/* First, so the map covers it: where a phone draws the map's picture (a browser needs nothing here). */}
        {/* Its web view is started once the page has slid in (drawMap), not mid-slide; the map's stand-in shows until the picture comes, as before. */}
        {drawMap ? <CourtMapSnapshots /> : null}
        {w ? <View style={{ position: 'absolute', left: 0, top: mapTop }}><CourtMapThumb lat={lat} lng={lng} width={w} height={mapH} zoom={MAP_ZOOM} /></View> : null}
        {/* The status bar's words keep their ground at the very top. */}
        {top ? <LinearGradient pointerEvents="none" colors={[withAlpha(colors.bg, 0.92), withAlpha(colors.bg, 0)]} style={[styles.heroTopFade, { height: top + 30 }]} /> : null}
        <PlacePin spotY={spotY} />
      </Animated.View>
      <Pressable accessibilityRole="button" accessibilityLabel={`See ${name} on the map`} onPress={onOpenMap} style={StyleSheet.absoluteFill}>
        {({ pressed }) => (
          <View style={[styles.mapChip, { bottom: over + spacing.md }, pressed && styles.mapChipPressed]}>
            <Glass radius={radius.pill} style={styles.mapChipGlass}>
              <Ionicons name="map-outline" size={15} color={colors.text} />
              <Text style={styles.mapChipText}>See on map</Text>
            </Glass>
          </View>
        )}
      </Pressable>
      {/* The map's licence asks for its credit on the map: a tiny ⓘ in the corner that shows it on a tap (Oct 25, owner: "For open street map
          can you just put a small dot instead of the full word"). It names the court's facts too, so the page needs no credit line at its foot. */}
      <MapCreditDot align="left" label="Map and court data © OpenStreetMap contributors" style={[styles.osm, { bottom: over + 5 }]} />
    </View>
  );
}

/** The court's pin: a drop in the court's colour with the court glyph in its head, dropping onto the spot once (still under Reduce Motion). */
const PIN_W = 40;
const PIN_H = 52;
const PIN_TIP = 48.5;
const PIN_PATH = 'M20 48.5 C14.3 41.3 3 31.8 3 20 A17 17 0 1 1 37 20 C37 31.8 25.7 41.3 20 48.5 Z';
function PlacePin({ spotY }: { spotY: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const drop = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { drop.value = 1; return; }
    drop.value = withDelay(220, withTiming(1, { duration: 560, easing: Easing.out(Easing.exp) }));
  }, [reduced, drop]);
  const pin = useAnimatedStyle(() => ({ opacity: Math.min(1, drop.value * 2), transform: [{ translateY: (1 - drop.value) * -26 }] }));
  const ground = useAnimatedStyle(() => ({ opacity: drop.value, transform: [{ scaleX: 0.4 + drop.value * 0.6 }] }));
  return (
    <View pointerEvents="none" style={[styles.pin, { top: Math.round(spotY - PIN_TIP) }]}>
      <Animated.View style={[styles.pinGround, { backgroundColor: withAlpha(colors.court, 0.32) }, ground]} />
      <Animated.View style={pin}>
        <Svg width={PIN_W} height={PIN_H} viewBox={`0 0 ${PIN_W} ${PIN_H}`}>
          {/* A mark over the map keeps a plain dark shadow, as the chat's court card draws one: the map is its ground. */}
          <Path d={PIN_PATH} fill="rgba(0, 0, 0, 0.22)" transform="translate(0 1.8)" />
          <Path d={PIN_PATH} fill={colors.court} stroke={colors.surface} strokeWidth={2.5} strokeLinejoin="round" />
        </Svg>
        <View style={styles.pinBadge}><CourtGlyph size={15} color={inkOn(colors.court)} /></View>
      </Animated.View>
    </View>
  );
}

/**
 * The bar over the top: the way back, as a round button on frosted glass
 * with a hairline edge (so it stands off the map's dark tiles on Night);
 * once the sheet has gone up under it, the bar fills with the page's colour
 * and the court's name comes into it.
 */
function TopBar({ name, top, offsetY, strip, solidAt }: { name: string; top: number; offsetY: SharedValue<number>; strip: number; solidAt: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const [solid, setSolid] = useState(false);
  useAnimatedReaction(() => offsetY.value - strip > solidAt, (now, was) => { if (now !== was) runOnJS(setSolid)(now); }, [strip, solidAt]);
  const fill = useSharedValue(0);
  useEffect(() => { fill.value = withTiming(solid ? 1 : 0, { duration: reduced ? 0 : 200, easing: Easing.out(Easing.exp) }); }, [solid, reduced, fill]);
  const ground = useAnimatedStyle(() => ({ opacity: fill.value }));
  const title = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ translateY: (1 - fill.value) * 6 }] }));
  const dark = pageIsDark();
  // Over the map, only Back takes a tap: the rest of the bar lets it through, so a tap on the
  // pin opens the map. Once solid, the whole bar takes taps, so none lands on a post hidden under it.
  return (
    <View pointerEvents="box-none" style={[styles.bar, { height: top + BAR_H }]}>
      <Animated.View pointerEvents={solid ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.barGround, ground]} />
      <View pointerEvents="box-none" style={[styles.barRow, { marginTop: top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={6} onPress={() => goBack()} style={({ pressed }) => [styles.back, pressed && styles.backPressed]}>
          <Glass radius={19} tint={dark ? colors.surfaceAlt : undefined} style={[styles.backGlass, dark && styles.backGlassDark]}>
            <Ionicons name="chevron-back" size={21} color={colors.text} style={styles.backGlyph} />
          </Glass>
        </Pressable>
        <View pointerEvents="none" style={styles.barTitleWrap}>
          <Animated.Text style={[styles.barTitle, title]} numberOfLines={1} accessibilityElementsHidden={!solid} importantForAccessibility={solid ? 'auto' : 'no-hide-descendants'}>{name}</Animated.Text>
        </View>
        <View pointerEvents="none" style={styles.barEnd} />
      </View>
    </View>
  );
}

/* ---------------------------- Right now ---------------------------- */

/**
 * How it is right now, as one card a tap opens ("How is it right now?":
 * Free, A wait, Full, Wet, Locked, and I'm playing here, by that sheet's own
 * rules). The status's own icon leads it, so its state reads at a glance on
 * every court; then the answer and how long ago, and who is on court now as
 * much as the server lets you see (words only, never a face). Nobody has
 * said: it asks. Checked in here: "You're here · Check out" under it.
 */
function PlaceNow({ courtId, name, access }: { courtId: string; name: string; access: CourtAccess }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const now = useCourtNow(courtId, access);
  return (
    <View style={styles.nowWrap}>
      <Pressable accessibilityRole="button" accessibilityLabel={now.a11y} onPress={() => openCourtNow({ id: courtId, name, access })} style={({ pressed }) => [styles.now, pressed && styles.nowPressed]}>
        <NowMark icon={now.icon} size={38} />
        <View style={styles.nowWords}>
          <Text style={styles.nowLead} numberOfLines={1}>{now.title}</Text>
          {now.sub ? (
            <View style={styles.nowSubRow}>
              {now.said && now.playing ? <View style={styles.liveDot} /> : null}
              <Text style={styles.nowQuiet} numberOfLines={1}>{now.sub}</Text>
            </View>
          ) : null}
        </View>
        {now.said ? (
          <View style={styles.nowUpdate}><Text style={styles.nowUpdateText}>Update</Text></View>
        ) : (
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        )}
      </Pressable>
      {now.youHere ? <HereTag onCheckOut={() => { void actions.checkOutOfCourt(); }} /> : null}
    </View>
  );
}

/* ------------------------------ Facts ------------------------------ */

const ACCESS_SHORT: Record<Exclude<CourtAccess, 'unknown'>, string> = { public: 'Public', members: 'Members', pay: 'Pay to play', private: 'Private' };
const ACCESS_SAID: Record<Exclude<CourtAccess, 'unknown'>, string> = { public: 'Anyone can play', members: 'Members only', pay: 'Pay to book', private: 'Someone’s home' };

/**
 * The court's facts in one strip, the way a place card shows its hours and
 * price: who may play, how many courts, the surface; "Has lights" from the
 * map only while no player has said (then What players say is the one
 * place lights are mentioned, so the two never disagree); Book when a booking link is
 * known. Each says what it is above its value. Nothing known: no strip.
 * A column's share of the row follows its longest word, so five across on a
 * small phone still keep "Artificial" whole: a longer value ("Pay to play",
 * "Artificial grass") takes a second line between words, never inside one.
 */
function FactStrip({ view, short }: { view: CourtView; short: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { access, bookUrl, map } = view;
  const cols: { label: string; value: string; a11y: string; link?: () => void; dot?: SurfaceKind }[] = [];
  if (access !== 'unknown') cols.push({ label: 'Access', value: ACCESS_SHORT[access], a11y: `Who can play: ${ACCESS_SAID[access]}` });
  if (map) cols.push({ label: map.count === 1 ? 'Court' : 'Courts', value: String(map.count), a11y: `${map.count} ${map.count === 1 ? 'court' : 'courts'}` });
  // The surface in the same words and colours as everywhere else a court is listed ("Hard", "Clay"), when it is one we know (Oct 24).
  const kind = LESS_AI_COURTS ? surfaceKind(map?.surface) : null;
  if (map?.surface && kind) {
    cols.push({ label: 'Surface', value: surfaceLabel[kind], a11y: `${surfaceAdjective[kind]} court${map.count === 1 ? '' : 's'}`, dot: kind });
  } else if (map?.surface) {
    const s = map.surface.replace(/_/g, ' ');
    cols.push({ label: 'Surface', value: s.charAt(0).toUpperCase() + s.slice(1), a11y: `Surface: ${s}` });
  }
  if (map?.lit && !view.playersOnLights) cols.push({ label: 'At night', value: 'Has lights', a11y: 'Has lights: lit at night' });
  if (bookUrl) cols.push({ label: 'Booking', value: 'Book', a11y: 'Book a court (opens the booking site)', link: () => { void Linking.openURL(bookUrl); } });
  if (!cols.length) return null;
  // How much room a column asks for, in letters: its label, its value's longest word, or half a
  // longer value and a little (it may take two lines); Book carries its icon too.
  const share = (c: { label: string; value: string; link?: unknown }) => Math.max(
    c.label.length,
    ...c.value.split(' ').map((w) => w.length + (c.link ? 2 : 0)),
    c.value.includes(' ') ? Math.ceil(c.value.length / 2) + 1 : 0,
  );
  return (
    <View style={[styles.strip, short && styles.stripShort]}>
      {cols.map((c, i) => {
        const body = (
          <>
            <Text style={styles.stripLabel} numberOfLines={1}>{c.label}</Text>
            <View style={styles.stripValueRow}>
              {c.dot ? <View style={[styles.stripDot, { backgroundColor: surfaceTint(c.dot) }]} /> : null}
              <Text style={[styles.stripValue, c.link && styles.stripLink]} numberOfLines={2}>{c.value}</Text>
              {c.link ? <Ionicons name="open-outline" size={13} color={colors.brand} /> : null}
            </View>
          </>
        );
        return (
          <React.Fragment key={c.label}>
            {i > 0 ? <View style={styles.stripRule} /> : null}
            {c.link ? (
              <Pressable accessibilityRole="link" accessibilityLabel={c.a11y} hitSlop={6} onPress={c.link} style={({ pressed }) => [styles.stripCol, { flexGrow: share(c) }, pressed && styles.pressed]}>{body}</Pressable>
            ) : (
              <View style={[styles.stripCol, { flexGrow: share(c) }]} accessible accessibilityLabel={c.a11y}>{body}</View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pressed: { opacity: PRESS_DIM },
  gutter: { paddingHorizontal: spacing.lg },
  // The map.
  hero: { width: '100%', backgroundColor: colors.bgElevated },
  heroRounded: { borderRadius: corner(20), overflow: 'hidden' },
  heroMap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  heroTopFade: { position: 'absolute', left: 0, right: 0, top: 0 },
  mapChip: { position: 'absolute', right: spacing.lg, borderRadius: radius.pill, boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.14)' },
  mapChipPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  mapChipGlass: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mapChipText: { ...typography.smallStrong, color: colors.text },
  osm: { left: 10 },
  pin: { position: 'absolute', left: '50%', marginLeft: -PIN_W / 2, width: PIN_W, height: PIN_H, alignItems: 'center' },
  pinGround: { position: 'absolute', bottom: 0, width: 20, height: 7, borderRadius: 4, marginBottom: 0.5 },
  pinBadge: { position: 'absolute', top: 3, left: 3, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  // The sheet over the map: the page's own colour, all the way down.
  sheet: {
    flexGrow: 1, marginTop: -SHEET_OVER, paddingTop: 20, borderTopLeftRadius: corner(24), borderTopRightRadius: corner(24), backgroundColor: colors.bg,
    // It floats over the map, so it keeps an overlay's plain shadow, cast upward.
    boxShadow: '0px -4px 16px rgba(0, 0, 0, 0.07)',
  },
  sheetWide: { marginTop: spacing.lg, borderRadius: 0, boxShadow: 'none' },
  name: { ...font('500'), fontSize: 28, lineHeight: 33, letterSpacing: -0.5, color: colors.text },
  nameLong: { fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  // The name shares its row with the heart.
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  nameGrow: { flex: 1, minWidth: 0 },
  meta: { ...typography.body, color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  // Played here by: the faces, then the words.
  people: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 10 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  faceOver: { marginLeft: -7 },
  face: { borderWidth: 2, borderColor: colors.bg, borderRadius: 13 },
  peopleText: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  peopleNames: { ...font('600'), color: colors.text },
  // Right now.
  nowWrap: { marginTop: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  now: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingLeft: 11, paddingRight: 14, paddingVertical: 11, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  nowPressed: { backgroundColor: colors.surfaceAlt },
  nowWords: { flex: 1, minWidth: 0, gap: 2 },
  nowLead: { ...typography.bodyStrong, color: colors.text },
  nowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  nowQuiet: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  nowUpdate: { height: 30, paddingHorizontal: 13, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  nowUpdateText: { ...typography.smallStrong, color: colors.brand },
  // The one primary, then the round actions.
  primary: { marginTop: spacing.lg },
  acts: { marginTop: 20, paddingHorizontal: spacing.sm },
  // A short phone: a little less air above the primary, the actions and the facts.
  primaryShort: { marginTop: spacing.md },
  actsShort: { marginTop: 14 },
  // The facts strip.
  strip: { flexDirection: 'row', alignItems: 'stretch', marginTop: 20, marginHorizontal: spacing.lg, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  stripShort: { marginTop: 14 },
  stripCol: { flexBasis: 0, flexShrink: 1, minWidth: 0, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  stripRule: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
  stripLabel: { ...typography.small, fontSize: 12, color: colors.textMuted },
  stripValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, maxWidth: '100%' },
  stripDot: { width: 7, height: 7, borderRadius: 4, marginRight: 2 },
  stripValue: { ...typography.bodyStrong, color: colors.text, textAlign: 'center', flexShrink: 1 },
  stripLink: { color: colors.brand },
  // The sections: one 32pt step between each.
  sections: { marginTop: spacing.xxl, gap: spacing.xxl, paddingBottom: spacing.sm },
  // A short phone: the first section a step closer to the facts (the sections keep their 32pt between them).
  sectionsShort: { marginTop: spacing.xl },
  // The sections: one-line empties, so a step closer together than the old page's.
  finalSections: { marginTop: 28, gap: 28, paddingBottom: spacing.sm },
  // Below the Play here row: the surface question, a row of its own.
  ask: { marginTop: spacing.lg },
  // The bar over the top.
  bar: { position: 'absolute', left: 0, right: 0, top: 0 },
  barGround: { backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barRow: { height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backPressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  backGlass: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)' },
  // On a dark court the map's tiles are dark too: a lighter frost and a firmer edge keep the button found.
  backGlassDark: { borderWidth: 1, borderColor: colors.borderStrong, boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.45)' },
  backGlyph: { marginLeft: -2 },
  barTitleWrap: { flex: 1, minWidth: 0, justifyContent: 'center' },
  barTitle: { ...typography.heading, color: colors.text },
  barEnd: { width: 44 },
});
