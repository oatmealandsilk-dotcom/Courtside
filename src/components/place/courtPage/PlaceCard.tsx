import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { CourtKing } from '@/components/place/CourtKing';
import { HereTag } from '@/components/place/CourtLife';
import { Avatar, Screen } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import type { CourtAccess } from '@/data/types';
import { useCourtHits } from '@/features/places/useCourtHits';
import { openCourtNow } from '@/features/players/courtLink';
import { goBack } from '@/lib/goBack';
import { PULL_GAP } from '@/lib/pullRefresh';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, inkOn, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';

import { CourtActions, NowMark, PrimaryBar, useCourtNow } from './parts';
import { ClipsSection, HitsSection, SaysSection } from './PlaceSections';
import type { CourtView } from './view';

/*
 * A court's page (owner, Oct 10: "Do b."), the place card: the court the
 * way Apple Maps shows a place.
 *
 *   The map of the court, edge to edge, with its pin; a tap opens the full
 *   map there ("See on map" says so).
 *   The page rises over it as a sheet: the name; the town, how far, how many
 *   follow it; who has played here, as faces; how it is right now (a tap
 *   tells players, Update once someone has); the page's one primary, Start a
 *   session here, full width; five round, labelled actions (Directions,
 *   Follow, Play here, Post, Share); the court's facts in one strip.
 *   Then its sections, each opening the same way (SectionHead: a title, one
 *   grey line, at most one link on the right) and 32pt apart: the posts as
 *   a grid, whose head shows above the fold; the open hits; King of the
 *   Court and the regulars; what players say.
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
  const heroH = Math.min(top + (short ? HERO_BODY_SHORT : HERO_BODY), HERO_MAX);
  // The bar turns solid, and the name shows in it, once the sheet's top has gone up under it.
  const solidAt = heroH - SHEET_OVER - (top + BAR_H) + 36;
  const meta = [view.area, view.distance, view.followers ? `${view.followers} ${view.followers === 1 ? 'follower' : 'followers'}` : null].filter(Boolean).join(' · ');
  const nameSize = view.name.length > 30 ? styles.nameLong : null;

  return (
    <View style={styles.root}>
      <Screen bleedTop wash={false} padded={false} onRefresh={view.onRefresh} offsetY={offsetY}>
        <PlaceHero lat={view.here.lat} lng={view.here.lng} top={top} height={heroH} name={view.name} onOpenMap={view.onMap} offsetY={offsetY} strip={strip} rounded={!isPhone} />
        <View style={[styles.sheet, !isPhone && styles.sheetWide]}>
          <View style={styles.gutter}>
            <Text accessibilityRole="header" style={[styles.name, nameSize]} numberOfLines={3}>{view.name}</Text>
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
            {view.extras && view.factsId && view.access !== 'private' ? <PlaceNow courtId={view.factsId} name={view.name} access={view.access} /> : null}
            <View style={[styles.primary, short && styles.primaryShort]}><PrimaryBar session={view.session} /></View>
          </View>
          <View style={[styles.acts, short && styles.actsShort]}><CourtActions view={view} /></View>
          <FactStrip view={view} short={short} />
          <View style={[styles.gutter, styles.sections, short && styles.sectionsShort]}>
            <ClipsSection view={view} />
            <HitsSection view={view} count={hits.length} />
            {/* King of the Court (migration 130): signed in, at a court on the map, never at someone's home court, and only while its switch is on for you (migration 140; admins for now). */}
            {view.factsId && view.currentUserId && view.access !== 'private' ? <CourtKing courtId={view.factsId} name={view.name} refresh={view.kingTick} /> : null}
            {view.extras && view.factsId ? <SaysSection courtId={view.factsId} name={view.name} /> : null}
            {view.factsLine ? <Text style={styles.credit}>Court details from OpenStreetMap</Text> : null}
          </View>
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
function PlaceHero({ lat, lng, top, height, name, onOpenMap, offsetY, strip, rounded }: {
  lat: number; lng: number; top: number; height: number; name: string; onOpenMap: () => void;
  offsetY: SharedValue<number>; strip: number; rounded: boolean;
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
        <CourtMapSnapshots />
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
      <Text pointerEvents="none" style={[styles.osm, { bottom: over + 8 }]}>© OpenStreetMap</Text>
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
  return (
    <View pointerEvents="box-none" style={[styles.bar, { height: top + BAR_H }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.barGround, ground]} />
      <View pointerEvents="box-none" style={[styles.barRow, { marginTop: top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={6} onPress={() => goBack()} style={({ pressed }) => [styles.back, pressed && styles.backPressed]}>
          <Glass radius={19} tint={dark ? colors.surfaceAlt : undefined} style={[styles.backGlass, dark && styles.backGlassDark]}>
            <Ionicons name="chevron-back" size={21} color={colors.text} style={styles.backGlyph} />
          </Glass>
        </Pressable>
        <Animated.Text style={[styles.barTitle, title]} numberOfLines={1} accessibilityElementsHidden={!solid} importantForAccessibility={solid ? 'auto' : 'no-hide-descendants'}>{name}</Animated.Text>
        <View style={styles.barEnd} />
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
  const cols: { label: string; value: string; a11y: string; link?: () => void }[] = [];
  if (access !== 'unknown') cols.push({ label: 'Access', value: ACCESS_SHORT[access], a11y: `Who can play: ${ACCESS_SAID[access]}` });
  if (map) cols.push({ label: map.count === 1 ? 'Court' : 'Courts', value: String(map.count), a11y: `${map.count} ${map.count === 1 ? 'court' : 'courts'}` });
  if (map?.surface) {
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
  pressed: { opacity: 0.6 },
  gutter: { paddingHorizontal: spacing.lg },
  // The map.
  hero: { width: '100%', backgroundColor: colors.bgElevated },
  heroRounded: { borderRadius: 20, overflow: 'hidden' },
  heroMap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  heroTopFade: { position: 'absolute', left: 0, right: 0, top: 0 },
  mapChip: { position: 'absolute', right: spacing.lg, borderRadius: radius.pill, boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.14)' },
  mapChipPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  mapChipGlass: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mapChipText: { ...typography.smallStrong, color: colors.text },
  osm: { position: 'absolute', left: spacing.lg, fontSize: 9, lineHeight: 11, color: colors.textFaint, opacity: 0.9 },
  pin: { position: 'absolute', left: '50%', marginLeft: -PIN_W / 2, width: PIN_W, height: PIN_H, alignItems: 'center' },
  pinGround: { position: 'absolute', bottom: 0, width: 20, height: 7, borderRadius: 4, marginBottom: 0.5 },
  pinBadge: { position: 'absolute', top: 3, left: 3, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  // The sheet over the map: the page's own colour, all the way down.
  sheet: {
    flexGrow: 1, marginTop: -SHEET_OVER, paddingTop: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.bg,
    // It floats over the map, so it keeps an overlay's plain shadow, cast upward.
    boxShadow: '0px -4px 16px rgba(0, 0, 0, 0.07)',
  },
  sheetWide: { marginTop: spacing.lg, borderRadius: 0, boxShadow: 'none' },
  name: { ...font('500'), fontSize: 28, lineHeight: 33, letterSpacing: -0.9, color: colors.text },
  nameLong: { fontSize: 25, lineHeight: 30, letterSpacing: -0.75 },
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
  nowPressed: { backgroundColor: colors.bgElevated },
  nowWords: { flex: 1, minWidth: 0, gap: 2 },
  nowLead: { ...typography.bodyStrong, color: colors.text },
  nowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  nowQuiet: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  nowUpdate: { height: 30, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
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
  stripValue: { ...typography.bodyStrong, color: colors.text, textAlign: 'center', flexShrink: 1 },
  stripLink: { color: colors.brand },
  // The sections: one 32pt step between each.
  sections: { marginTop: spacing.xxl, gap: spacing.xxl, paddingBottom: spacing.sm },
  // A short phone: the first section a step closer to the facts (the sections keep their 32pt between them).
  sectionsShort: { marginTop: spacing.xl },
  credit: { ...typography.caption, letterSpacing: 0.2, color: colors.textFaint, textAlign: 'center', marginTop: -spacing.md },
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
  barTitle: { ...typography.heading, color: colors.text, flex: 1, minWidth: 0 },
  barEnd: { width: 44 },
});
