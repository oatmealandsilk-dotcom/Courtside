import { brandShadow } from '@/theme/fillMode';
import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useGrowAway, useGrowLabels } from '@/features/players/mapGrow';
import Animated, { Easing, FadeIn, FadeOut, LayoutAnimationConfig, interpolateColor, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, type SharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { SwipeArea } from '@/features/navigation/swipePress';

import { Avatar, BrandWash } from '@/components/ui';
import { MapGlass } from '@/components/map/MapGlass';
import { useRestKey, useRestLength } from '@/components/ui/restMotion';
import { FollowShrink } from '@/components/FollowPill';
import { MenuSheet, type MenuSheetItem } from '@/components/MenuSheet';
import { afterMenu } from '@/lib/confirm';
import { TileCover } from '@/components/TileCover';
import { LevelPill } from '@/components/LevelPill';
import { Tappable } from '@/components/Tappable';
import * as haptics from '@/lib/haptics';
import { isClosedCourt, type Court, type CourtRow } from '@/features/players/courts';
import { courtSurfaceWord } from '@/features/places/courtSurface';
import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import type { HitRequest, Post } from '@/data/types';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { PLAYED_TODAY_GLOW, playedTodayTone, todayClip } from '@/features/places/playedToday';
import { joinedCount } from '@/features/hits/audience';
import { FORMAT_LABEL, hitShort } from '@/features/hits/format';
import { isMapCourtId, labelOf } from '@/features/places/courtName';
import { useCourtHits } from '@/features/places/useCourtHits';
import { directionsTo } from '@/features/players/openInMaps';
import { useApp } from '@/store/AppContext';
import { TipBubble } from '@/components/TipBubble';
import { releaseTip, useTip } from '@/features/tips/tips';
import { REASK_SHOW_MS, noteReaskNotNow, noteReaskShown, noteReaskYes } from '@/features/players/noOneReask';
import { TIP_SHOW_MS as UTH_TIP_SHOW_MS } from '@/features/players/upToHitTip';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { formatMiles } from '@/features/players/geo';
import { relativeTime } from '@/lib/format';
import { hitsWithinLine, isOpenToHit, tillLabel } from '@/features/players/openToHit';
import { useOpenClock } from '@/features/players/useOpenClock';
import { LevelPill as Level } from '@/components/LevelPill';
import type { User } from '@/data/types';
import { countLabel } from '@/features/places/court';
import { useCourtPosts } from '@/features/places/useCourtPosts';
import { openCourt, openCourtReel, playHere, postFromCourt, sendCourtToChat } from '@/features/players/courtLink';
import { Toggle } from '@/components/ui';
import type { Listed, MapFilter, Placed } from '@/features/players/mapModel';
import type { Weather } from '@/lib/weather';
import { buttonShape, TextScale, colors, oneLine, font, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';
import { levelBadge } from '@/lib/badges';
import { agoLabel, agoShort } from '@/components/map/markers';
import { MAP_CREDITS } from '@/components/map/credits';
import { AccessTag, CourtFactsLine, FollowHeart, NowTags, RegularsRow } from '@/components/place/CourtLife';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { sheetFling } from '@/components/map/sheetFling';
import { useGlideHeight } from '@/components/map/glide';
import { CrownFade, CrownLead } from '@/components/map/stageLayers';
import { LIST_PAD_BOTTOM, TRAY_FACE, TRAY_GAP, TRAY_ITEM_W, TRAY_PAD, listHeadroom, useListStops, type ListRoom } from '@/components/map/listStops';
import { OpenRing } from '@/components/map/OpenRing';
import { mix } from '@/components/map/look';
import { notKnownAdult } from '@/features/players/age';
import { askWhoSeesYou, dismissHideTip, saidYes, useHideTip, useHideTipText, visibilityLabel, type NearbyLock, type TipSpot } from '@/features/players/mapPrivacy';
import type { CheckInControl } from '@/features/players/useLocationToggle';
import { UpToHitPill, UpToHitRound } from '@/components/map/UpToHit';
import { formatSpotMiles } from '@/features/players/geo';
import type { MapVisibility } from '@/data/types';
import type { FoundPlace } from '@/features/places/geocode';
import type { PlaceSearch } from '@/features/places/usePlaceSearch';
import { plain } from '@/features/search/words';
import { isOfficial } from '@/features/players/official';

// Kept here too, for the screens that already import it from the map's chrome.
export { CourtGlyph };

/*
 * Everything laid over the map that is not the map: the same on a phone and
 * in a browser, so the two canvases only draw tiles and pins.
 */

/**
 * How far under the status bar the map keeps clear when it zooms to fit a
 * "+N" (the pins' own `pad`), the same on a phone and in a browser. Measured
 * on the two-row top (Oct 11, at 390 wide): the bar ends 52 down, the chips
 * 92, and a face reaches 24 above its spot (26 for yours), so 120 keeps a
 * face just clear of the chips. The old three-row top ran to 134, past it.
 */
export const PIN_FIT_TOP = 120;

/**
 * Back, the search, and the location switch across the top. While the search
 * names courts (`results`), they list under it: a pick takes the map there
 * with the court's card up. Places come under them (a city, a neighbourhood,
 * an address, a park: `places`), a pick taking the map there with that
 * place's courts listed. Return picks a court or place named exactly what
 * was typed ("Raleigh" is the city, not The Raleigh Racquet Club), else the
 * top row. Players still filter the pins and the players list as before (`players`
 * says how many match, so "No places found" never hangs over a name that found someone).
 *
 * The map's top is two rows (Oct 11, owner: "Two rows weather in search"):
 * this one, and the filter chips under it. The city and its weather live in
 * the bar itself, "Search Los Angeles" with "☁ 69°" at its end behind a
 * hairline, so no chip of their own sits under the filters. Typing (or the
 * bar just tapped) the weather steps aside for the words, and the bar says
 * what it finds; the three across are 44 points tall, a finger's width.
 *
 * Its buttons, the bar and the list under it are the map's one fixed
 * see-through fill (MapGlass, Oct 22): never Apple's glass, so never put up
 * again, and the same every time the map opens.
 */
export function MapTopBar({ onBack, query, onQuery, checkIn, results, onPickCourt, places, onPickPlace, players = 0, cityName = '', weather = null }: { onBack?: () => void; query: string; onQuery: (next: string) => void; /** The Check in button (useCheckIn, migration 189): the only way your spot is shared. */ checkIn?: CheckInControl; results?: CourtRow[]; onPickCourt?: (c: Court) => void; /** The place search as you type (usePlaceSearch). */ places?: PlaceSearch; onPickPlace?: (p: FoundPlace) => void; /** Players whose names match what is typed. */ players?: number; /** The town the bar names ("Search Los Angeles"); none yet, the bar's own words. */ cityName?: string; /** What it's like to play there today, at the bar's end. */ weather?: Weather | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const key = plain(query);
  const typed = !!key;
  const allCourts = onPickCourt && typed ? (results ?? []) : [];
  // A place that is one of the courts listed is already there, as the court.
  const courtNames = new Set(allCourts.slice(0, 5).map((r) => plain(labelOf(r.c))));
  const placeRows = onPickPlace && typed && places ? places.places.filter((p) => !courtNames.has(plain(p.title))).slice(0, 4) : [];
  // Fewer courts when places are listed too, so the list never runs down over the map's buttons.
  const found = allCourts.slice(0, placeRows.length ? 3 : 5);
  const placeNote = !onPickPlace || !typed || !places ? null
    : places.failed ? 'Search isn’t working right now'
      : places.done && !placeRows.length && !found.length && !players ? 'No places found'
        : null;
  const searching = !!onPickPlace && typed && !!places?.searching && !placeRows.length && !found.length && !players;
  // Picking something ends the search: the bar goes back to the town and its weather at once, on every
  // phone (Oct 11: on iPhone it could stay in its typing look after a pick, green edge and all).
  const done = () => { input.current?.blur(); setFocused(false); };
  const submit = () => {
    done();
    const sameCourt = found.find((r) => plain(labelOf(r.c)) === key);
    const samePlace = placeRows.find((p) => plain(p.title) === key);
    if (sameCourt && onPickCourt) onPickCourt(sameCourt.c);
    else if (samePlace && onPickPlace) onPickPlace(samePlace);
    else if (found[0] && onPickCourt) onPickCourt(found[0].c);
    else if (placeRows[0] && onPickPlace) onPickPlace(placeRows[0]);
  };
  // The town in the bar's words ("you" is the list's stand-in for a town not named yet, never a name).
  const city = cityName && cityName !== 'you' ? cityName : '';
  // "Search Kapolei" where it fits whole; where it doesn't ("Search Los Angeles" on a 390-point phone), the town alone,
  // the magnifier before it still saying what the bar is for; a town too long even alone trails off "…".
  // No town named yet (its name still being looked up, or never found): the old bar's "Search a place or park"
  // where it fits, else "Search places", which fits beside the weather (Oct 11: the long one read "Search a place o…").
  const [fieldW, setFieldW] = useState(0);
  const [sayW, setSayW] = useState(0);
  const say = city ? `Search ${city}` : 'Search a place or park';
  const short = city || 'Search places';
  const hint = focused ? 'Players, courts or places' : fieldW && sayW > fieldW ? short : say;
  // The list under the bar: courts, then places, or why there are none.
  const listUp = !!(found.length || placeRows.length || placeNote || searching);
  return (
    // Above the filter chips under it, so the location tip hangs over them.
    <View style={{ zIndex: 5 }}>
    <View style={styles.topRow}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={({ pressed }) => [styles.barRoundHit, pressed && styles.barPressed]}>
          <MapGlass radius={22} style={styles.barRound}><Ionicons name="chevron-back" size={22} color={colors.text} /></MapGlass>
        </Pressable>
      ) : null}
      {/* The whole bar is the search: a tap anywhere on it (its weather too) puts the cursor in. */}
      <Pressable accessible={false} focusable={false} onPress={() => input.current?.focus()} style={styles.searchLift}>
        <MapGlass radius={22} style={[styles.search, focused && styles.searchOn]}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <View style={styles.searchField} onLayout={(e) => setFieldW(Math.floor(e.nativeEvent.layout.width))}>
            {/* "Search <town>" (or "Search a place or park") laid out unseen at its own width, to know whether it fits. */}
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.searchMeasure}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.searchHint} onLayout={(e) => setSayW(Math.ceil(e.nativeEvent.layout.width))}>{say}</Text>
            </View>
            {/* The bar's words, drawn here rather than as the field's placeholder, so a long town trails off "…" on every phone. */}
            {!query ? (
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.searchHintBox}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.searchHint} numberOfLines={1}>{hint}</Text>
              </View>
            ) : null}
            <TextInput maxFontSizeMultiplier={TextScale.TITLE}
              ref={input}
              accessibilityLabel="Search players, courts, or a city, address or park"
              accessibilityHint={city ? `Around ${city}` : undefined}
              value={query}
              onChangeText={onQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              onSubmitEditing={submit}
              style={styles.searchInput}
            />
          </View>
          {query ? (
            // Faded in and out the way the weather it takes the place of is (never snapped in on the first letter).
            <Animated.View key="clear" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={14} onPress={() => onQuery('')} style={styles.searchClear}>
                <Ionicons name="close-circle" size={17} color={colors.textFaint} />
              </Pressable>
            </Animated.View>
          ) : weather && !focused ? (
            // Quiet, after a hairline: the sky and the temperature, the way a phone's weather reads.
            <Animated.View key="weather" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} pointerEvents="none" style={styles.searchWeather}>
              <View style={styles.searchWeatherRule} />
              <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={15} color={colors.textMuted} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.searchWeatherText} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>{weather.tempF}°</Text>
            </Animated.View>
          ) : null}
        </MapGlass>
      </Pressable>
      {checkIn ? (
        <View>
          <TipPulse where="map" size={44} />
          {/* Inside the full map, the round arrow (Oct 27, owner: "when we clicked into the map to make it the circle
              arrow. On the map cover it was fine"): outlined while you are not up to hit, filled on green while you
              are; a tap turns it on or off (UpToHit: it fills from the middle and bounces once). The Find Players
              card keeps its pill. */}
          <UpToHitRound control={checkIn} />
          <HideTip where="map" style={{ top: 52, right: 0 }} />
        </View>
      ) : null}
    </View>
    {/* Fades in and out (a pick, the box cleared or emptied) as it grows and shrinks, the chips under it gliding with it, and glides to its new height as what is typed narrows it. */}
    <SearchList up={listUp}>
          {found.map(({ c, miles }, i) => {
            const meta = [formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ');
            return (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${labelOf(c)}, ${meta}. Show on the map`} onPress={() => { haptics.tap(); done(); onPickCourt?.(c); }} style={({ pressed }) => [styles.resultRow, i > 0 && styles.listRule, pressed && styles.listPressed]}>
                <View style={styles.resultTile}><CourtGlyph size={13} color={colors.brand} /></View>
                <View style={styles.listWords}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.listName} numberOfLines={1}>{labelOf(c)}</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{meta}</Text>
                </View>
              </Pressable>
            );
          })}
          {placeRows.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.title}${p.sub ? `, ${p.sub}` : ''}. Show its courts on the map`} onPress={() => { haptics.tap(); done(); onPickPlace?.(p); }} style={({ pressed }) => [styles.resultRow, (found.length > 0 || i > 0) && styles.listRule, pressed && styles.listPressed]}>
              <View style={styles.placeTile}><Ionicons name={p.kind === 'area' ? 'map-outline' : 'location-outline'} size={15} color={colors.textMuted} /></View>
              <View style={styles.listWords}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.listName} numberOfLines={1}>{p.title}</Text>
                {p.sub ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{p.sub}</Text> : null}
              </View>
            </Pressable>
          ))}
          {searching ? (
            <View style={styles.placeNote}><ActivityIndicator size="small" color={colors.textFaint} /><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.placeNoteText}>Looking for places…</Text></View>
          ) : placeNote ? (
            <View style={[styles.placeNote, found.length + placeRows.length > 0 ? styles.listRule : null]}>
              <Ionicons name={places?.failed ? 'cloud-offline-outline' : 'search-outline'} size={15} color={colors.textFaint} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.placeNoteText}>{placeNote}</Text>
            </View>
          ) : null}
    </SearchList>
    </View>
  );
}

/**
 * The search's list under the bar (Oct 22 sweep: it vanished in one frame). It grows open and fades in,
 * glides to each new height as what is typed narrows it, and on a pick, or the box cleared or emptied,
 * fades out as it shrinks away (still showing what it last listed, taking no taps), the filter chips
 * under it riding up with it. Reduce Motion: it only fades.
 */
function SearchList({ up, children }: { up: boolean; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(up);
  // While it closes, what it last listed.
  const kept = useRef<React.ReactNode>(children);
  if (up) kept.current = children;
  const open = useSharedValue(0);
  const natural = useRef(0);
  // The glass's height: React holds it at rest (useRestLength), so an iPhone that drops a settled
  // animation value can never put the list back to an older height on a later re-render.
  const glass = useRestLength('height', 0);
  const ease = useCallback((to: number, done: (finished?: boolean) => void) => withTiming(to, LIST_EASE, done), []);
  // Open and still: see `resting` below.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (up) {
      setShown(true);
      open.value = withTiming(1, { duration: LIST_IN_MS }, (done) => { if (done) runOnJS(setOpened)(true); });
      if (natural.current) { if (reduce) glass.jump(natural.current); else glass.glide(natural.current, ease); }
      return;
    }
    // Taken down once shut, and only then not at rest: the draw that starts the close keeps the plain open look.
    const gone = () => { setShown(false); setOpened(false); };
    if (reduce) { open.value = withTiming(0, { duration: LIST_OUT_MS }, (done) => { 'worklet'; if (done) runOnJS(gone)(); }); return; }
    open.value = withTiming(0, { duration: LIST_OUT_MS });
    glass.glide(0, ease, gone);
  }, [up]); // eslint-disable-line react-hooks/exhaustive-deps
  // Unmounted, it starts from nothing the next time.
  useEffect(() => { if (!shown) { natural.current = 0; glass.jump(0); } }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const wrap = useAnimatedStyle(() => ({ opacity: open.value, marginTop: spacing.sm * open.value }));
  if (!shown) return null;
  // Open and still, on a phone: the list's open look is said by a plain style as well, so a phone that drops
  // the settled animation values (Reanimated keeps the first frame's: clear) can never take an open list
  // away on a later re-render. Kept while it closes (the close's own values win over it as they run).
  const resting = Platform.OS !== 'web' && opened;
  return (
    <Animated.View style={[styles.resultsWrap, wrap, !up && styles.noTouch, resting && LIST_REST]}>
      <MapGlass dense radius={18} style={[styles.results, glass.style]}>
        <View
          onLayout={(e) => {
            const next = Math.round(e.nativeEvent.layout.height * 2) / 2;
            if (next <= 0 || next === natural.current) return;
            natural.current = next;
            if (!up) return;
            if (reduce) glass.jump(next); else glass.glide(next, ease);
          }}
        >
          {up ? children : kept.current}
        </View>
        {/* The hairline edge drawn inside the glass (not its border), so the glide starts and ends at nothing rather than 2 points. */}
        <View pointerEvents="none" style={styles.resultsEdge} />
      </MapGlass>
    </Animated.View>
  );
}

/** The search's list open and still: after its animated style, so it wins at rest. */
const LIST_REST = { opacity: 1, marginTop: spacing.sm };

/** How the search's list grows, shrinks and glides between heights. */
const LIST_EASE = { duration: 220, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };

/** The search's list fading in under the bar, and out again. */
const LIST_IN_MS = 140;
const LIST_OUT_MS = 160;

// A chip's touch reaches 6 above and below it, inside the row's own room (a scroll view takes no touch outside itself).
const CHIP_REACH = { top: 6, bottom: 6 };

const FILTERS: { key: MapFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  // Only the people you follow, named on their pins.
  { key: 'following', label: 'Following' },
  { key: 'open', label: 'Open to hit' },
  { key: 'near', label: 'Near me' },
  { key: 'level', label: 'My level' },
  { key: 'coaches', label: 'Coaches' },
];

/**
 * Who to show, plus the courts layer, as one row of chips: the map top's
 * second row (Oct 11). The row runs to the screen's edge, the chips sliding
 * out under it rather than stopping short, and each chip takes a touch 44
 * points tall though it shows 32.
 */
// A chip's words take the pill's colour exactly as far as the pill covers that chip, frame by frame, so a label never goes cream-on-cream (or dark-on-green) while the pill is still sliding.
function ChipLabel({ label, x, w, spot, style }: { label: string; x: SharedValue<number>; w: SharedValue<number>; spot: { x: number; w: number }; style: any }) {
  const off = colors.text;
  const on = colors.brandInk;
  const sx = spot.x;
  const sw = Math.max(1, spot.w);
  const tint = useAnimatedStyle(() => {
    const cover = Math.max(0, Math.min(x.value + w.value, sx + sw) - Math.max(x.value, sx)) / sw;
    return { color: interpolateColor(Math.min(1, cover), [0, 1], [off, on]) };
  });
  return <Animated.Text maxFontSizeMultiplier={TextScale.TITLE} style={[style, tint]}>{label}</Animated.Text>;
}

export function FilterChips({ filter, onFilter, onAgain, courtsOn, onCourts, courtsLoading }: { filter: MapFilter; onFilter: (next: MapFilter) => void; /** The chip already on, tapped again (a people chip opens its tray again). */ onAgain?: (key: MapFilter) => void; courtsOn: boolean; onCourts: () => void; courtsLoading: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  // Where each chip sits, so one filled pill can slide from the old choice to the new, the way a segmented control does.
  const spots = useRef<Partial<Record<MapFilter, { x: number; w: number }>>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const [measured, setMeasured] = useState(false);
  // The chip lights up the moment it is tapped; the map (the heavy part)
  // follows a beat later, so the sliding pill never waits on it.
  const [active, setActive] = useState(filter);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveTo = (key: MapFilter, animate: boolean) => {
    const spot = spots.current[key];
    if (!spot) return;
    const ease = { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
    x.value = animate ? withTiming(spot.x, ease) : spot.x;
    w.value = animate ? withTiming(spot.w, ease) : spot.w;
  };
  // A filter set from outside (a search clearing it, say) moves the pill too.
  useEffect(() => { if (filter !== active) { setActive(filter); moveTo(filter, true); } }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));
  const courtsV = useLit(courtsOn);
  const courtsLit = useLitText(courtsV.v, courtsV.bump);
  const pick = (key: MapFilter) => {
    if (key === active) { onAgain?.(key); return; }
    haptics.tap();
    setActive(key);
    moveTo(key, true);
    if (pending.current) clearTimeout(pending.current);
    // In a browser the animation shares the page's one thread with the map, so the map waits for the pill to land.
    pending.current = setTimeout(() => { pending.current = null; onFilter(key); }, Platform.OS === 'web' ? 200 : 16);
  };
  return (
    <View style={styles.chipsRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
        {measured ? FILTERS.map((f) => { const spot = spots.current[f.key]; return spot ? <View key={`plate-${f.key}`} pointerEvents="none" style={[styles.chipPlate, { left: spot.x, width: spot.w }]} /> : null; }) : null}
        {measured ? <Animated.View pointerEvents="none" style={[styles.chipPill, pill]}><BrandWash /></Animated.View> : null}
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            hitSlop={CHIP_REACH}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === f.key }}
            onPress={() => pick(f.key)}
            onLayout={(e) => {
              const { x: cx, width } = e.nativeEvent.layout;
              spots.current[f.key] = { x: cx, w: width };
              if (f.key === active) { moveTo(f.key, false); if (!measured) setMeasured(true); }
            }}
            style={[styles.chip, measured ? styles.chipClear : active === f.key && styles.chipOn]}
          >
            {measured && spots.current[f.key] ? <ChipLabel label={f.label} x={x} w={w} spot={spots.current[f.key]!} style={styles.chipText} /> : <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.chipText, active === f.key && styles.chipTextOn]}>{f.label}</Text>}
          </Pressable>
        ))}
        {/* Courts is an on/off switch, not one of the choices: a hairline sets it apart, and it scrolls with the row so nothing is ever tucked behind it. */}
        <View style={styles.chipGap} />
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: courtsOn }} accessibilityLabel="Show courts" hitSlop={CHIP_REACH} onPress={() => { haptics.tap(); onCourts(); }} style={styles.chip}>
          {/* The green fades in and out over 180 ms, in step with the filter pill sliding beside it. */}
          <GreenFill key={`fill${courtsV.key}`} v={courtsV.v} radius={999} edge={1} />
          {courtsLoading ? <ActivityIndicator size="small" color={courtsOn ? colors.brandInk : colors.text} /> : <TwoTone key={`icon${courtsV.key}`} v={courtsV.v} off={<CourtGlyph size={15} color={colors.text} />} lit={<CourtGlyph size={15} color={colors.brandInk} />} />}
          <Animated.Text key={`words${courtsV.key}`} maxFontSizeMultiplier={TextScale.TITLE} style={[styles.chipText, courtsLit]}>Courts</Animated.Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** How long a control's green fill takes to come and go (Oct 22 sweep: it switched in one frame). */
const FILL_MS = 180;

/**
 * 0 to 1 as a control turns on, and back: its green fill and its words follow it. `key` changes each
 * time it lands (on a phone): the views it moves take it, so they are built afresh at rest and an
 * iPhone that drops a settled animation value can never show the old look on a later re-render.
 */
function useLit(on: boolean) {
  const v = useSharedValue(on ? 1 : 0);
  const [key, bump] = useRestKey();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    v.value = withTiming(on ? 1 : 0, { duration: FILL_MS, easing: Easing.out(Easing.quad) }, (done) => { 'worklet'; if (done) runOnJS(bump)(); });
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return { v, key, bump };
}

/**
 * A theme colour for the animation thread, as a shared value kept to the theme now, so a view built
 * afresh at rest starts in the theme chosen now, never the one first drawn in. `changed` (the view's
 * rebuild) runs a frame after a theme change, once the new colour has reached the animation thread.
 */
function useInk(c: string, changed?: () => void) {
  const v = useSharedValue(c);
  const was = useRef(c);
  useEffect(() => {
    if (was.current === c) return;
    was.current = c;
    v.value = c;
    if (!changed) return;
    const id = requestAnimationFrame(changed);
    return () => cancelAnimationFrame(id);
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** Words that turn from the page's colour to the colour on green as the fill comes in. */
function useLitText(v: SharedValue<number>, rebuild?: () => void) {
  const off = useInk(colors.text, rebuild);
  const lit = useInk(colors.brandInk, rebuild);
  return useAnimatedStyle(() => ({ color: interpolateColor(v.value, [0, 1], [off.value, lit.value]) }));
}

/**
 * A control's green, laid over its see-through fill and faded in and out on its own: only this fill is ever
 * faded, never the see-through one under it (MapGlass) nor anything holding it.
 */
function GreenFill({ v, radius: r, edge = 0 }: { v: SharedValue<number>; radius: number; /** The control's border, which the green covers too (so its edge never switches on its own). */ edge?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const look = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <Animated.View pointerEvents="none" style={[styles.greenFill, { borderRadius: r, top: -edge, right: -edge, bottom: -edge, left: -edge }, look]}>
      <BrandWash radius={r} />
    </Animated.View>
  );
}

/** An icon in its two colours, one fading into the other as the fill under it comes and goes. */
function TwoTone({ v, off, lit }: { v: SharedValue<number>; off: React.ReactNode; lit: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const offLook = useAnimatedStyle(() => ({ opacity: 1 - v.value }));
  const litLook = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <View pointerEvents="none">
      <Animated.View style={offLook}>{off}</Animated.View>
      <Animated.View style={[styles.twoToneLit, litLook]}>{lit}</Animated.View>
    </View>
  );
}

/**
 * Zoomed out past about a city, the court pins step aside (thousands of
 * them would say nothing at that size). This small note says where they
 * went, under the filter chips (ChipsNoteLine). Not a button: the map under
 * it still takes the pinch and the drag.
 */
export function CourtsZoomNote() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} pointerEvents="none" style={styles.zoomNote}>
      <CourtGlyph size={12} color={colors.textMuted} />
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.zoomNoteText}>Zoom in to see courts</Text>
    </Animated.View>
  );
}

export function WeatherChip({ weather }: { weather: Weather | null }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!weather) return null;
  return (
    <View pointerEvents="none" style={styles.weather}>
      <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={15} color={colors.text} />
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.weatherText} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>{weather.tempF}°</Text>
    </View>
  );
}

/**
 * Back to me, and on a computer the zoom buttons a mouse needs; the map's
 * credits (ⓘ) at the other end of the row. `lead`, with nothing up over the
 * map, is the "All N players" pill (PlayersPill), at the row's start, the
 * credits just above it.
 */
/** How small the players pill starts as it grows in, riding down from a closing card (CrownLead). */
const LEAD_FROM = 0.85;

export function MapButtons({ onRecentre, onZoomIn, onZoomOut, lead }: { onRecentre: () => void; onZoomIn?: () => void; onZoomOut?: () => void; lead?: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  // The pill and the credits over it: grown in by the stage under them (CrownLead, Oct 10). Taking over from a card
  // closing under them they grow to full size as the buttons ride down to their spot; the rest were already there, on
  // the card. Never faded (Oct 22): the pill's see-through fill (MapGlass) is the same in every frame.
  const leadIn = useContext(CrownLead);
  const leadLook = useAnimatedStyle(() => ({ transform: [{ scale: leadIn ? LEAD_FROM + (1 - LEAD_FROM) * leadIn.value : 1 }] }));
  // The room the players pill has: the row less its edges, the buttons and the gap between.
  const [rowW, setRowW] = useState(0);
  const [buttonsW, setButtonsW] = useState(0);
  const pillRoom = rowW && buttonsW ? Math.max(0, rowW - 2 * spacing.md - buttonsW - spacing.sm) : 0;
  return (
    <View pointerEvents="box-none" style={styles.buttonsRow} onLayout={(e) => setRowW(Math.floor(e.nativeEvent.layout.width))}>
    {lead ? <Animated.View pointerEvents="box-none" style={[styles.buttonsLead, leadLook]}><MapCredit /><PillRoom.Provider value={pillRoom}>{lead}</PillRoom.Provider></Animated.View> : <MapCredit />}
    <View style={styles.buttons} onLayout={(e) => setButtonsW(Math.ceil(e.nativeEvent.layout.width))}>
      {onZoomIn && onZoomOut ? (
        <View style={styles.zoom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={onZoomIn} style={({ pressed }) => [styles.zoomButton, pressed && styles.closePressed]}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
          <View style={styles.zoomRule} />
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={onZoomOut} style={({ pressed }) => [styles.zoomButton, pressed && styles.closePressed]}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Back to me" onPress={() => { haptics.tap(); onRecentre(); }} style={({ pressed }) => [styles.roundHit, pressed && styles.barPressed]}>
        <MapGlass radius={21} style={styles.roundGlass}><Ionicons name="locate-outline" size={18} color={colors.brand} /></MapGlass>
      </Pressable>
    </View>
    </View>
  );
}

/**
 * The map's credits, findable but not shouting: a faint ⓘ that opens a
 * small card naming where the map and the weather come from, each a link.
 * `align` says which side of the ⓘ the card hangs from.
 */
export function MapCredit({ style, align = 'left' }: { style?: object; align?: 'left' | 'right' }) {
  const styles = useThemedStyles(styleDefinitions);
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.creditWrap, style]}>
      {open ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={[styles.creditCard, align === 'right' ? { right: 0 } : { left: 0 }]}>
          {MAP_CREDITS.map((c) => (
            <Pressable key={c.url} accessibilityRole="link" accessibilityLabel={c.label} hitSlop={4} onPress={() => { setOpen(false); void Linking.openURL(c.url); }}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.creditText} numberOfLines={1}>{c.label}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Hide map credits' : 'Map and weather credits'} hitSlop={10} onPress={() => setOpen((v) => !v)} style={styles.credit}>
        <Ionicons name={open ? 'close-circle-outline' : 'information-circle-outline'} size={13} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

/**
 * The Find Players card's credit (bottom right). With the check-in zoom's grow (mapGrow) it slips down out of the card at
 * its own size as the page pushes in, like the weather opposite it.
 */
export function CardCredit() {
  const away = useGrowAway('bottom');
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', right: 10, bottom: 10, zIndex: 20 }, away]}>
      <MapCredit align="right" />
    </Animated.View>
  );
}

/*
 * Scrolling lists inside the map's sheets. On a phone, the gesture library's
 * own scroll view, so a list scrolling and its sheet being pulled down never
 * fight. In a browser its stand-in claims every touch before the sheet can,
 * so there the plain one.
 */
const GHScrollView = Platform.OS === 'web' ? ScrollView : GestureScrollView;

/*
 * The full map's players (Oct 8, owner: "taking the island on the bottom out
 * entirely"). Nothing lies along the bottom of the map any more: the pins
 * carry the faces, and one small pill beside Back to me opens everyone
 * (PlayersSheet: since Oct 9 a tray of faces side by side, pulled up into the
 * full list), the city and its weather moving into the search bar
 * (MapTopBar, Oct 11).
 */

/** What keeps players from you (nearbyLock), as the list says it: not with a name typed, or on Following, neither of which depends on it. */
const lockOf = (lock: NearbyLock | undefined, query: string, filter: MapFilter) => (lock && !query.trim() && filter !== 'following' ? lock : null);

/** A Near me row's town (a player listed by the town on their profile, never on the map), or null for a friend's check-in. */
const townOf = (p: Listed): string | null => ('town' in p ? p.town : null);
/** How far a friend's check-in is ("1.2 mi"); a Near me row has no distance, ever. */
const placedFar = (p: Listed): string => ('miles' in p ? formatSpotMiles(p.miles, p.rough) : '');

/**
 * The list's one line: how many, and where ("10 players near Raleigh"). A
 * search or Following, which list everyone they find, say whose instead.
 * With nobody sharing nearby it counts the nearest courts it names (never
 * "0 players"); with nobody to list at all it says only where, the list
 * itself saying why (its words unchanged). Near me names the town on your
 * profile, the one its players are listed by.
 */
function listTitle(items: Listed[], query: string, filter: MapFilter, courts: CourtRow[], cityName: string, nearTown = ''): string {
  const q = query.trim();
  const n = items.length;
  // "you" is the map's own stand-in for a town not named yet: "near you".
  const place = ((filter === 'near' || filter === 'level' || filter === 'coaches' || filter === 'open') && nearTown) || cityName || 'you';
  if (!n) return !q && filter === 'all' && courts.length ? `${courts.length} ${courts.length === 1 ? 'court' : 'courts'} near ${place}` : `${filter === 'coaches' && !q ? 'Coaches' : 'Players'} near ${place}`;
  const who = n === 1 ? '1 player' : `${n} players`;
  if (q) return `${who} matching “${q}”`;
  if (filter === 'following') return `${who} you follow`;
  if (filter === 'level') return nearTown ? `${who} at your level in ${nearTown}` : `${who} at your level`;
  if (filter === 'coaches') return `${n === 1 ? '1 coach' : `${n} coaches`} near ${place}`;
  if (filter === 'open') return `${who} open to hit near ${place}`;
  return `${who} near ${place}`;
}

/** With nobody to list, the pill's few words for why: the list's own reason, shortened. */
function emptyLine(query: string, filter: MapFilter, courts: CourtRow[], locked: NearbyLock, nearTown = ''): string {
  if (query.trim()) return `No players named “${query.trim()}”`;
  if (locked === 'location') return 'Turn on Location to see players';
  if (locked === 'hidden') return 'On Only me, players are hidden';
  if (filter === 'following') return 'You don’t follow anyone yet';
  if (filter === 'level') return nearTown ? `No one at your level in ${nearTown} yet` : 'Add your city to see players';
  if (filter === 'near') return nearTown ? `No players in ${nearTown} yet` : 'Add your city to see players';
  if (filter === 'coaches') return nearTown ? `No coaches in ${nearTown} yet` : 'Add your city to see coaches';
  if (filter === 'open') return nearTown ? `No one open to hit in ${nearTown} yet` : 'Add your city to see players';
  if (filter !== 'all') return 'Nobody matches that';
  // The map's people are friends who are up to hit, at any age (migration 189; Oct 27 audit wording; Oct 28 "Up to hit").
  return courts.length ? `No friends up to hit · ${courts.length} ${courts.length === 1 ? 'court' : 'courts'} nearby` : 'No friends up to hit yet';
}

/**
 * "All 11 players", beside Back to me: the full map's one way to its list.
 * With nobody to list it says why instead ("Turn on Location to see players",
 * "No one sharing yet · 3 courts nearby"), and still opens the list, which
 * says it in full with the tap that changes it. The reason goes without the
 * pill's ⌃, so it fits whole on a narrow phone (Android's common 360 points).
 */
export function PlayersPill({ items, query = '', filter = 'all', courts = [], lock = null, nearTown = '', onOpen }: { items: Listed[]; query?: string; filter?: MapFilter; courts?: CourtRow[]; lock?: NearbyLock; /** The town on your profile, which Near me lists. */ nearTown?: string; onOpen: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const n = items.length;
  const words = n === 1 ? '1 player' : n ? `All ${n} players` : emptyLine(query, filter, courts, lockOf(lock, query, filter), nearTown);
  // Its words crossfade and its width glides to fit them (Oct 22 sweep: "6 players" to "No one sharing yet…" snapped).
  // The width it wants is measured from an unseen copy at its own size, kept to the room beside Back to me.
  const room = useContext(PillRoom);
  const reduce = useReducedMotion();
  const [natural, setNatural] = useState(0);
  const target = natural && room !== 0 ? (room == null ? natural : Math.min(natural, room)) : 0;
  // Its width rests as a plain style held by React (useRestLength), so an iPhone that drops a settled
  // animation value can never put the pill back to an older width on a later re-render.
  const pillW = useRestLength('width');
  useEffect(() => {
    if (!target) return;
    // The edge's hairlines either side of the words.
    const to = target + 2 * StyleSheet.hairlineWidth;
    if (pillW.target.current == null || reduce) pillW.jump(to);
    else if (to !== pillW.target.current) pillW.glide(to, (t, done) => withTiming(t, { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }, done));
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  const icon = <Ionicons name={n ? 'people' : 'people-outline'} size={15} color={colors.brand} />;
  // The chevron rides the gliding edge (drawn at the glass's right, its room kept in the row), fading with whether there is a list.
  const chevV = useLit(!!n);
  const chevOn = chevV.v;
  const chevLook = useAnimatedStyle(() => ({ opacity: chevOn.value }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={n ? 'Show the full list' : 'Show players'} onPress={() => { haptics.tap(); onOpen(); }} style={({ pressed }) => [styles.pillLift, pressed && styles.glassPressed]}>
      <MapGlass radius={21} style={[styles.pillEdge, pillW.style]}>
        {/* Laid out at the width it is going to, so the words never squeeze while the edge glides. */}
        <View style={[styles.playersPill, n ? styles.playersPillChev : null, target ? { width: target } : null]}>
          {icon}
          <CrossFade id={words} free style={styles.playersPillWords}>
            <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.playersPillText} numberOfLines={1}>{words}</Text>
          </CrossFade>
        </View>
        <Animated.View key={chevV.key} pointerEvents="none" style={[styles.pillChev, chevLook]}><Ionicons name="chevron-up" size={14} color={colors.textMuted} /></Animated.View>
      </MapGlass>
      {/* The unseen copy, free of the room, to say how wide the pill wants to be (a point to spare, so a fraction never trails the words off). */}
      <View style={styles.pillMeasure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <View style={[styles.playersPill, n ? styles.playersPillChev : null]} onLayout={(e) => setNatural(Math.ceil(e.nativeEvent.layout.width) + 1)}>
          {icon}
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.playersPillText} numberOfLines={1}>{words}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** How wide the players pill may grow beside Back to me (MapButtons measures it); 0 until known, null with no limit. */
const PillRoom = React.createContext<number | null>(null);

/**
 * The line under the chips, there only while zoomed out, with "Zoom in to
 * see courts" at its start, in line with Back and the first chip, 8 under
 * them as the chips are 8 under the bar. Nothing to say, no line. Taps go
 * through it to the map. (Oct 11: it took the place of the city chip's
 * line, the city and its weather now in the search bar.)
 */
export function ChipsNoteLine({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!React.Children.toArray(children).length) return null;
  return <View pointerEvents="box-none" style={styles.noteLine}>{children}</View>;
}

/**
 * Everyone around, nearest first: what the pill opens, rising like a card.
 * Since Oct 9 (owner: "maybe make it more like the snapchat map with
 * profiles horizontal?") it opens as a short tray, Snap Map's friends tray in
 * CourtSide's look: one line on top says how many and where ("10 players
 * near Raleigh"; the city chip under the filters already gives the weather),
 * and under it everyone side by side, scrolled sideways: a big round face
 * (wearing the green ring when they are open to hit), the first name, their
 * level and how far and how long ago. A face flies the map to that player's
 * pin with their card up, and closing the card comes back to the tray, at
 * the same place along it. Pulled up (by the title, or on a phone the faces),
 * or See all, it opens into the full list of Oct 8 (listStops), one player a
 * row, under the search and the filters; pulled back down it is the tray
 * again. The search and the chips filter it as they do the pins. With nobody
 * to list it says why in a line, with the tap that changes it, or names the
 * nearest courts. × (or a pull down past the tray, or a tap on the map)
 * closes it, back to the bare map.
 *
 * Under Near me (Oct 27) it also lists the players whose own profile town is
 * yours, after the friends checked in: by their town ("Raleigh") where a
 * friend's row says how far, and a tap opens their profile, since they have
 * no pin (the map stays friends only, Apple 5.1.2(i)).
 */
export function PlayersSheet({ items, cityName, onSelect, onProfile, nearTown = '', query = '', filter = 'all', courts = [], onPickCourt, lock = null, onUnlock, onClose, openTall = false, onTall, room, stripAt }: { items: Listed[]; cityName: string; onSelect: (id: string) => void; /** A Near me row (no pin): opens their profile. */ onProfile?: (id: string) => void; /** The town on your profile, which Near me lists. */ nearTown?: string; /** What is typed in the search, which the players are filtered by. */ query?: string; /** Which chip is on, so an empty list says why. */ filter?: MapFilter; /** With nobody sharing nearby, the nearest few places anyone may play, to tap. */ courts?: CourtRow[]; onPickCourt?: (id: string) => void; /** What keeps "Players nearby" from you (nearbyLock): an empty list says so, not that nobody is there. */ lock?: NearbyLock; /** The one tap that lifts it: Location on, or who can see you. */ onUnlock?: () => void; onClose: () => void; /** Opens as the full list (it was when a row opened a player's card). */ openTall?: boolean; /** Which height it is going to (the full list, or the tray), each time that changes. */ onTall?: (tall: boolean) => void; /** Where the list may reach (the map's height, the foot of the filters, the strip under the home indicator). */ room?: ListRoom; /** How far along the tray's faces were scrolled, kept by the map, so closing a player's card comes back to the same place. */ stripAt?: { current: number } }) {
  const styles = useThemedStyles(styleDefinitions);
  const { height: windowH, width: windowW } = useWindowDimensions();
  const stops = useListStops({ rows: items.length, room, windowH, windowW, openTall, onTall, onClose });
  // Since migration 98 you share to see: with Location off or on Only me the
  // server sends only your friends, so an empty list says how to see the
  // players near you instead of "No one sharing nearby yet".
  const locked = lockOf(lock, query, filter);
  const grabber = <View style={[styles.grabber, styles.listGrabber]} />;
  // Back from a player's card: the faces scroll to where they were, once they are laid out.
  const strip = useRef<ScrollView>(null);
  const restored = useRef(false);
  const onStripSize = (w: number, h: number) => {
    stops.onStripSize(w, h);
    if (restored.current || w <= 0) return;
    restored.current = true;
    if (stripAt?.current) strip.current?.scrollTo({ x: stripAt.current, animated: false });
  };
  // Every people chip (Following, Open to hit, Near me, My level, Coaches) mixes friends up to hit with people listed by their town: the ones up to hit say so.
  const upTag = filter !== 'all';
  // A friend's check-in flies the map to their pin; a town row (no pin) opens their profile.
  const open = (p: Listed) => (townOf(p) !== null ? (onProfile ?? onSelect)(p.user.id) : onSelect(p.user.id));
  const pick = (p: Listed) => { if (!stops.justDragged()) { haptics.tap(); open(p); } };
  // Where the faces are scrolled to, as they go and where they come to rest (a fling's last move can fall between two scroll events).
  const keepAt = (e: NativeSyntheticEvent<NativeScrollEvent>) => { if (stripAt) stripAt.current = e.nativeEvent.contentOffset.x; };
  // The faces as they stand, for the crossfade to fade out: no ref, handlers or gesture, at the place they were scrolled to.
  const facesGhost = (
    <View style={styles.trayGhost}>
      <View style={[styles.trayRow, styles.trayGhostRow, { transform: [{ translateX: -(stripAt?.current ?? 0) }] }]}>
        {items.map((p) => <TrayFace key={p.user.id} placed={p} onPress={() => {}} />)}
      </View>
    </View>
  );
  const faces = (
    <ScrollView
      // Only ever set, never cleared: a faded-out copy going away must not empty it under the live row.
      ref={(r) => { if (r) strip.current = r; }}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.trayRow}
      scrollEventThrottle={32}
      onScroll={keepAt}
      onScrollEndDrag={keepAt}
      onMomentumScrollEnd={keepAt}
      onContentSizeChange={onStripSize}
    >
      {items.map((p) => <TrayFace key={p.user.id} placed={p} onPress={() => pick(p)} />)}
    </ScrollView>
  );
  // A chip or a search changing who is listed: the faces crossfade to the new set (Oct 22 sweep: swapped in one frame),
  // which starts again from its first face.
  // Keyed on what a chip or a search changes, not on the ids: players arriving as the map pans, a live update or the
  // distance sort reordering them update in place, and the row keeps its place.
  const faceSet = `${filter}|${query.trim().toLowerCase()}`;
  const lastSet = useRef(faceSet);
  useEffect(() => {
    if (lastSet.current === faceSet) return;
    lastSet.current = faceSet;
    if (stripAt) stripAt.current = 0;
  }, [faceSet]); // eslint-disable-line react-hooks/exhaustive-deps
  // A chip tapped with the full list up: back to the faces, as every chip rests (Oct 28, owner: "The near me my level
  // coaches etc. should be the same sideways icons like following currently is"). The list is still a pull or See all away.
  const lastFilter = useRef(filter);
  useEffect(() => {
    if (lastFilter.current === filter) return;
    lastFilter.current = filter;
    stops.collapse();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  // The height the faces were showing at, for the "No players" box to glide from as it takes their place.
  const lastBody = useRef(0);
  if (stops.restH > 0) lastBody.current = stops.restH;
  // What it opens with is simply there; the faces or the empty box coming in later fade in.
  const opened = useRef(false);
  useEffect(() => { opened.current = true; }, []);
  const emptyKey = `${locked ?? ''}|${filter}|${query.trim() ? 'q' : ''}|${courts.length ? 'c' : ''}`;
  const list = (
    <Animated.ScrollView
      ref={stops.listRef}
      style={StyleSheet.absoluteFill}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      bounces={false}
      onScroll={stops.onScroll}
      onContentSizeChange={stops.onContentSizeChange}
    >
      {items.map((p, i) => (
        <Pressable key={p.user.id} accessibilityRole="button" accessibilityLabel={townOf(p) !== null ? `${[p.user.name, townOf(p)].filter(Boolean).join(', ')}. Open profile` : `${p.user.name}, ${placedFar(p)}${upTag ? ', up to hit' : ''}`} onPress={() => open(p)} style={({ pressed }) => [styles.listRow, pressed && styles.listPressed]}>
          {/* A hairline between rows, from the names across, the way a contacts list draws it. */}
          {i > 0 ? <View pointerEvents="none" style={styles.listRowRule} /> : null}
          <View style={[styles.listRing, isOpenToHit(p.user) && styles.listRingOn]}><Avatar name={p.user.name} seed={p.user.avatarSeed} size={40} ring={p.user.isCoach} /></View>
          <View style={styles.listWords}>
            <View style={styles.personTop}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.listName} numberOfLines={1}>{p.user.name}</Text>
              <LevelPill profile={p.user.profile} userId={p.user.id} small />
            </View>
            {/* A friend's check-in: how far and how long ago (on Following, My level and Near me, "Up to hit" first, as those lists hold people who are not). A town row: only the town on their profile. */}
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{[upTag && townOf(p) === null ? 'Up to hit' : null, townOf(p) ?? placedFar(p), 'seenAt' in p && p.seenAt ? agoLabel(p.seenAt) : null, isOpenToHit(p.user) ? 'open to hit' : null].filter(Boolean).join(' · ')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      ))}
    </Animated.ScrollView>
  );
  return (
    <Animated.View style={[styles.listSheet, stops.sheetStyle]} onLayout={stops.onSheetLayout}>
      {/* What it opens with is simply there (the sheet itself rises); only what changes after crossfades. */}
      <LayoutAnimationConfig skipEntering>
      {/* The handle and the title: a drag up opens the full list, a drag down brings it back to the tray and then closes it. */}
      <GestureDetector gesture={stops.headGesture}>
        <View style={styles.listHead}>
          {stops.canTall ? (
            <Pressable accessibilityRole="button" accessibilityLabel={stops.up ? 'Make the list shorter' : 'Make the list taller'} hitSlop={8} onPress={() => { haptics.tap(); stops.toggle(); }} style={styles.listGrabberHit}>{grabber}</Pressable>
          ) : (
            <View style={styles.listGrabberHit}>{grabber}</View>
          )}
          <View style={styles.listTitleRow}>
            {/* "6 players near Raleigh" to "1 player…": the words crossfade rather than swap. */}
            <CrossFade id={listTitle(items, query, filter, courts, cityName, nearTown)} style={styles.listTitleBox}>
              <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={[styles.listTitle, styles.flexNone]} numberOfLines={1}>{listTitle(items, query, filter, courts, cityName, nearTown)}</Text>
            </CrossFade>
            {/* More players than fit across: See all opens them as the full list. */}
            {stops.canTall && !stops.up ? (
              <Pressable accessibilityRole="button" accessibilityLabel="See all players" hitSlop={8} onPress={() => { haptics.tap(); stops.expand(); }} style={({ pressed }) => [styles.seeAll, pressed && styles.closePressed]}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.seeAllText}>See all</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
              <Ionicons name="close" size={17} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
      {items.length ? (
        // The tray's faces on top, the full list behind them; whichever is showing takes the touches and is read out.
        <View ref={stops.body}>
          <Animated.View style={[styles.trayBody, stops.bodyStyle]}>
            <Animated.View
              style={[StyleSheet.absoluteFill, stops.listStyle, !stops.up && styles.noTouch]}
              accessibilityElementsHidden={!stops.up}
              importantForAccessibility={stops.up ? 'auto' : 'no-hide-descendants'}
              aria-hidden={!stops.up}
            >
              {stops.listGesture ? <GestureDetector gesture={stops.listGesture}>{list}</GestureDetector> : list}
            </Animated.View>
            <Animated.View
              style={[styles.trayStrip, stops.stripStyle, stops.up && styles.noTouch]}
              accessibilityElementsHidden={stops.up}
              importantForAccessibility={stops.up ? 'no-hide-descendants' : 'auto'}
              aria-hidden={stops.up}
            >
              <CrossFade id={faceSet} ghost={facesGhost} appear={opened.current}>
                {stops.stripGesture ? <GestureDetector gesture={stops.stripGesture}>{faces}</GestureDetector> : faces}
              </CrossFade>
            </Animated.View>
          </Animated.View>
        </View>
      ) : (
        <EmptyBox from={lastBody.current} onHeight={stops.holdBody}>
        <View style={styles.listEmpty}><CrossFade id={emptyKey} appear={opened.current}>
          {locked && (filter !== 'all' || !courts.length) ? (
            <View style={styles.lockBox}>
              <LockNote lock={locked} onUnlock={onUnlock} />
            </View>
          ) : query.trim() || filter !== 'all' || !courts.length ? (
            // With a name typed, say only that no player has it: a court's name finds the court, and the players are still there.
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sheetEmpty} numberOfLines={2}>
              {query.trim() ? `No players named “${query.trim()}”`
                : filter === 'following' ? 'You don’t follow anyone yet.'
                  : filter === 'level' ? (nearTown ? `No players at your level in ${nearTown} yet.` : 'Add your city to your profile to see the players at your level.')
                  : filter === 'near' ? (nearTown ? `No players in ${nearTown} yet.` : 'Add your city to your profile to see the players in your town.')
                  : filter === 'coaches' ? (nearTown ? `No coaches in ${nearTown} yet.` : 'Add your city to your profile to see the coaches in your town.')
                  : filter === 'open' ? (nearTown ? `No one open to hit in ${nearTown} yet.` : 'Add your city to your profile to see who is open to hit in your town.')
                  : filter !== 'all' ? 'Nobody matches that.'
                    // The map's people are friends who are up to hit, at any age (migration 189; the pill's own words, emptyLine).
                    : 'No friends up to hit yet. Tap a court to see what’s played there.'}
              {/* Following and My level list people, not only who is up to hit: an empty one points to where to find some. */}
              {!query.trim() && (filter === 'following' || (filter === 'level' && nearTown)) ? <Text accessibilityRole="link" onPress={() => { haptics.tap(); router.push('/search'); }} style={styles.findLink}>{'  ·  Find players'}</Text> : null}
            </Text>
          ) : (
            // Nobody sharing yet: the nearest places to play instead, side by side like the faces, each a tap from its card.
            <View style={styles.emptyCourts}>
              {locked ? <View style={styles.lockBox}><LockNote lock={locked} onUnlock={onUnlock} /></View> : null}
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.emptyCourtsTitle} numberOfLines={1}>{locked ? 'The nearest courts:' : 'No friends up to hit yet. The nearest courts:'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courtStrip}>
                {courts.map(({ c, miles }) => (
                  <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.name}, ${formatMiles(miles)}. Show on the map`} onPress={() => { haptics.tap(); onPickCourt?.(c.id); }} style={({ pressed }) => [styles.courtChip, pressed && styles.listPressed]}>
                    <View style={styles.resultTile}><CourtGlyph size={13} color={colors.brand} /></View>
                    <View style={styles.courtChipWords}>
                      {/* The court's own name; an unnamed one (only listed when a town has no named court) says just "Tennis courts", never "public". */}
                      <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.courtChipName} numberOfLines={1}>{c.name}</Text>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{[formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </CrossFade></View>
        </EmptyBox>
      )}
      </LayoutAnimationConfig>
    </Animated.View>
  );
}

/** How long a crossfade's old copy takes to go, and its new one to come. */
const SWAP_OUT_MS = 140;
const SWAP_IN_MS = 200;
/** A crossfade layer shown and still: after its animated style, so it wins at rest. */
const SWAP_SHOWN = { opacity: 1 } as const;

/**
 * What it shows, crossfading to new content each time `id` changes: the old copy stays drawn in place
 * (absolutely, under the new, taking no touches) while it fades out, the new fading in over it, then the
 * old is dropped. Both platforms draw it the same way, so it never depends on an exiting copy's position
 * (Reanimated on the web placed it below the screen, or floating above the tray). `ghost` is what to keep
 * fading out, when the live content holds things that must not be drawn twice (a ref, a gesture).
 * `appear`: the first content fades in too, rather than simply being there.
 */
function CrossFade({ id, children, ghost, appear = false, free = false, style }: { id: string; children: React.ReactNode; ghost?: React.ReactNode; appear?: boolean; /** The old copy at its own width (one line of words), not the box's. */ free?: boolean; style?: object }) {
  const styles = useThemedStyles(styleDefinitions);
  const [shown, setShown] = useState<{ id: string; old: { id: string; node: React.ReactNode }[] }>({ id, old: [] });
  const last = useRef<React.ReactNode>(ghost ?? children);
  if (shown.id !== id) {
    // Derived during the render, so the new content's first frame already has the old one under it.
    setShown({ id, old: [...shown.old.filter((o) => o.id !== id).slice(-1), { id: shown.id, node: last.current }] });
  }
  last.current = ghost ?? children;
  const first = useRef(!appear);
  useEffect(() => { first.current = false; }, []);
  const drop = useCallback((gone: string) => setShown((now) => ({ ...now, old: now.old.filter((o) => o.id !== gone) })), []);
  return (
    <View style={style}>
      {shown.old.map((o) => (
        <SwapLayer key={o.id} leaving onGone={() => drop(o.id)} style={free ? styles.swapGhostFree : styles.swapGhost}>{o.node}</SwapLayer>
      ))}
      <SwapLayer key={id} first={first.current}>{children}</SwapLayer>
    </View>
  );
}

function SwapLayer({ leaving = false, first = false, onGone, style, children }: { leaving?: boolean; first?: boolean; onGone?: () => void; style?: object; children: React.ReactNode }) {
  // The old copy is a layer of its own, built as it starts to leave: it starts fully there and fades out.
  const v = useSharedValue(first || leaving ? 1 : 0);
  // Each layer comes to rest once (shown), then is only ever taken away: shown and still, on a phone, that
  // is said by a plain style as well, so an iPhone that drops the settled animation value can never leave
  // a layer clear (its first frame) on a later re-render.
  const [shown, setShown] = useState(first);
  const gone = useRef(onGone);
  gone.current = onGone;
  const done = useCallback(() => gone.current?.(), []);
  useEffect(() => {
    if (leaving) v.value = withTiming(0, { duration: SWAP_OUT_MS, easing: Easing.out(Easing.quad) }, (fin) => { 'worklet'; if (fin) runOnJS(done)(); });
    else v.value = withTiming(1, { duration: SWAP_IN_MS, easing: Easing.out(Easing.quad) }, (fin) => { 'worklet'; if (fin) runOnJS(setShown)(true); });
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      aria-hidden={leaving || undefined}
      style={[style, look, !leaving && shown && Platform.OS !== 'web' && SWAP_SHOWN]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Where the players list says nobody is there (or why), gliding from the faces' height to its own and back
 * as a chip or a search empties the list and fills it again, rather than jumping, the map's buttons on top
 * riding with it (Oct 22 sweep).
 */
function EmptyBox({ from, onHeight, children }: { from: number; onHeight: (h: number) => void; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const glide = useGlideHeight({ seed: from });
  return (
    <Animated.View style={[styles.emptyBox, glide.style]}>
      <View onLayout={(e) => { glide.onLayout(e); onHeight(Math.round(e.nativeEvent.layout.height)); }}>{children}</View>
    </Animated.View>
  );
}

/**
 * One player in the tray, Snap Map's way: the face first and big (the green
 * ring round it when they are open to hit, the coach's mark on it), their
 * first name, their level, and how far and how long ago, small.
 */
function TrayFace({ placed: p, onPress }: { placed: Listed; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const open = isOpenToHit(p.user);
  // A Near me row says only the town on their profile: never how far, never when (they have no pin).
  const town = townOf(p);
  const seenAt = 'seenAt' in p ? p.seenAt : undefined;
  const far = town ?? placedFar(p);
  const ago = seenAt ? agoShort(seenAt) : '';
  const said = [p.user.name, isOfficial(p.user.id) ? null : levelBadge(p.user.profile).label, far, seenAt ? agoLabel(seenAt) : null, open ? 'open to hit' : null].filter(Boolean).join(', ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${said}. ${town !== null ? 'Open profile' : 'Show on the map'}`} onPress={onPress} style={({ pressed }) => [styles.trayFace, pressed && styles.listPressed]}>
      <OpenRing open={open} size={TRAY_FACE} halo="small"><Avatar name={p.user.name} seed={p.user.avatarSeed} size={TRAY_FACE} ring={p.user.isCoach} /></OpenRing>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.trayName} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text>
      <LevelPill profile={p.user.profile} userId={p.user.id} small style={styles.trayLevel} />
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.trayMeta} numberOfLines={1}>{[far, ago].filter(Boolean).join(' · ')}</Text>
    </Pressable>
  );
}

/**
 * The map's buttons (Back to me, the zoom, the credits) riding on the
 * players tray. As it is pulled up into the full list and the map left above
 * it runs short (listHeadroom) they fade out, and once they would no longer
 * fit under the filters they are gone, taking no taps, so nothing ever lies
 * over the list or the filters; pulled back down to the tray, they fade back
 * in. A short list that rises only a little keeps them. Their fill is the
 * map's fixed see-through one (MapGlass), so a fade never changes how it looks.
 */
export function ListCrown({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  // How tall the buttons are (measured while they are there; the browser's zoom makes them taller), and whether they still fit.
  const tall = useSharedValue(0);
  const [gone, setGone] = useState(false);
  useAnimatedReaction(
    () => tall.value > 0 && listHeadroom.value < tall.value,
    (now, before) => { if (now !== before) runOnJS(setGone)(now); },
  );
  // Fading over the last stretch before they no longer fit.
  const look = useAnimatedStyle(() => ({ opacity: listCrownFade(listHeadroom.value, tall.value) }));
  // On the phone, told to the stage, which cannot see it (CrownFade, Oct 11): closing the list while they are part
  // faded, it never swaps them for the bare map's at full strength in one frame; those fade in at the bottom instead.
  const fade = useContext(CrownFade);
  useEffect(() => {
    if (!fade) return undefined;
    fade.current = () => listCrownFade(listHeadroom.value, tall.value);
    return () => { fade.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[styles.crownThrough, look]}>
      {gone ? null : (
        <View style={styles.crownThrough} onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0) tall.value = h; }}>
          {children}
        </View>
      )}
    </Animated.View>
  );
}

/** How solid the buttons riding on the players list are with this much map left above it (ListCrown): faded over the last 60 before they no longer fit. */
function listCrownFade(room: number, tall: number): number {
  'worklet';
  return tall > 0 ? Math.max(0, Math.min(1, (room - tall) / 60)) : 1;
}

/**
 * Why no players nearby show (migration 98: you share to see), with the one
 * tap that changes it: Location on, or who can see you (from Only me).
 */
function LockNote({ lock, onUnlock }: { lock: 'location' | 'hidden'; onUnlock?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const words = lock === 'location'
    ? 'Players near you show once you share your spot too.'
    : 'You’re on Only me, so players nearby are hidden from you too.';
  const action = lock === 'location' ? 'Turn on Location' : 'Change who can see you';
  return (
    <View style={styles.lockNote}>
      <Text style={styles.lockWords}>{words}</Text>
      {onUnlock ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={8} onPress={() => { haptics.tap(); onUnlock(); }} style={({ pressed }) => [styles.lockAction, pressed && styles.listPressed]}>
          <Ionicons name={lock === 'location' ? 'navigate' : 'eye-outline'} size={14} color={colors.brand} />
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.lockActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Pulling a card down closes it, the way a sheet does. Let go far enough
 * (or flick it) and it closes there and then: the card stage carries it on
 * down from where the finger left it, at speed (sheetFling), so the
 * swipe, the card sliding away and what was under it settling back are one motion.
 */
function useDragToClose(onClose: () => void, sideways = false) {
  const y = useSharedValue(0);
  const pan = Gesture.Pan().activeOffsetY(8);
  // Over a row that swipes side to side (the court card's hit boxes, COURT_CARD_HIT_BOXES), a finger
  // that goes sideways first is the row's, never the card's: the pull gives way after 12pt across.
  const gesture = (sideways ? pan.failOffsetX([-12, 12]) : pan)
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 600) { sheetFling.value = 1; runOnJS(onClose)(); }
      else y.value = withSpring(0, { damping: 18, stiffness: 240 });
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return { gesture, style };
}

/** "Active 2h ago", or "Last active Sep 25" once it is more than a day. */
function activeLabel(iso: string): string {
  const r = relativeTime(iso);
  if (r === 'just now') return 'Active just now';
  return /^\d+[mh]$/.test(r) ? `Active ${r} ago` : `Last active ${r}`;
}

/**
 * The map on a first visit, when it does not know where you are: rather
 * than guess a city and fill it with people who are not there, it asks.
 */
export function WhereCard({ locating, onLocation }: { locating?: boolean; onLocation?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.sheet, { paddingTop: spacing.lg }]}>
      <View style={[styles.personWords, { paddingHorizontal: spacing.lg }]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personName}>Where do you play?</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.openNote}>Turn on location or add your city, and the map shows the courts near you, and your friends when they’re up to hit.</Text>
      </View>
      <View style={[styles.personActions, { marginTop: spacing.xs }]}>
        <Pressable accessibilityRole="button" onPress={onLocation} disabled={locating} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.primary, pressed && styles.glassPressed]}>
          <BrandWash radius={buttonShape.smallRadius} curve />
          {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name="navigate" size={16} color={colors.brandInk} />}
          <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.primaryText}>Use my location</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/edit-profile')} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.secondary, pressed && styles.glassPressed]}>
          <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.secondaryText}>Add my city</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * One player, picked on the map: who they are, how far, and what to do about
 * it. Message opens your one-to-one chat with them; "Add to a group" (when
 * given) puts them in one of your groups instead.
 */
export function PlayerSheet({ placed, following, onClose, onProfile, onMessage, onFollow, onAddToGroup, onAskToHit }: { placed: Placed; following: boolean; onClose: () => void; onProfile: () => void; onMessage: () => void; onFollow: () => void; onAddToGroup?: () => void; /** Only for someone you may message: an adult, or a teen who follows you. */ onAskToHit?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  const { user, miles, seenAt, seenCity, rough, court } = placed;
  // Their "till 7pm" (and the line below) go by themselves at 7pm, the card still open.
  useOpenClock([user.openToHitUntil]);
  // Farther than they'd like to go for a hit (migration 120): one friendly line, never a warning, and Ask to hit stays as it is.
  const farLine = hitsWithinLine(user, miles, seenCity || user.location);
  const till = isOpenToHit(user) ? tillLabel(user.openToHitUntil) : null;
  const first = user.name.split(' ')[0];
  // ⋯ holds what used to hang under the buttons (Add to a group), the profile, and Follow in words,
  // the same choices a profile's own ⋯ offers. Each runs once the menu has gone.
  const [menuOpen, setMenuOpen] = useState(false);
  const { followRequests, currentUserId, followEdges } = useApp();
  const requested = !following && !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === user.id);
  // They follow you: said on the card ("Follows you"), and Follow reads "Follow back" in the menu
  // and to a screen reader. Following back is what puts you both on each other's map.
  const followsYou = !!currentUserId && followEdges.some((e) => e.followerId === user.id && e.followingId === currentUserId);
  const menu: MenuSheetItem[] = [
    ...(onAskToHit ? [{ icon: 'person-circle-outline' as const, label: 'View profile', onPress: () => afterMenu(onProfile) }] : []),
    ...(onAddToGroup ? [{ icon: 'people-outline' as const, label: 'Add to a group', onPress: () => afterMenu(onAddToGroup) }] : []),
    { icon: following || requested ? 'person-remove-outline' : 'person-add-outline', label: following ? 'Unfollow' : requested ? 'Cancel request' : followsYou ? 'Follow back' : 'Follow', onPress: () => afterMenu(onFollow) },
  ];
  // Whether Follow has the room to say its word: the row's width against what the two pills, the
  // Follow disc and ⋯ take at their natural size, the pills' words measured hidden at whatever text
  // size the phone is set to. On a 375pt iPhone one step up in Text Size, the word would cut
  // "Ask to hit" short; there Follow is the disc until you follow, as it is after.
  const primaryLabel = onAskToHit ? 'Ask to hit' : 'Message';
  const secondaryLabel = onAskToHit ? 'Message' : 'Profile';
  const [rowWidth, setRowWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState({ primary: 0, secondary: 0 });
  const measured = (key: 'primary' | 'secondary') => (e: { nativeEvent: { layout: { width: number } } }) => {
    const width = Math.ceil(e.nativeEvent.layout.width);
    setLabelWidths((was) => (was[key] === width ? was : { ...was, [key]: width }));
  };
  const followRoom = rowWidth && labelWidths.primary && labelWidths.secondary
    ? rowWidth - 2 * spacing.lg - 3 * spacing.sm - 2 * CARD_ROUND
      - (CARD_PILL_CHROME + CARD_PILL_ICON + CARD_PILL_GAP + labelWidths.primary) - (CARD_PILL_CHROME + labelWidths.secondary)
    : undefined;
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.personRow}>
        <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, open profile`} onPress={onProfile} style={styles.faceSlot}>
          {/* Open to hit, they wear the same green ring here as on their pin. */}
          <OpenRing open={isOpenToHit(user)} size={50}><Avatar name={user.name} seed={user.avatarSeed} size={50} ring={user.isCoach} /></OpenRing>
        </Pressable>
        {/* The name opens the profile too, so a card with Ask to hit still reaches it in one tap. */}
        <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, open profile`} onPress={onProfile} style={styles.personWords}>
          <View style={styles.personTop}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personName} numberOfLines={1}>{user.name}</Text>
            <LevelPill profile={user.profile} userId={user.id} small />
          </View>
          {/* At a court right now (migration 63): which one, first; otherwise the town, and how far (never finer than the pin is). */}
          {/* "Follows you" joins whichever line is short: this one at a court (no town on it, and the
              court's name below needs its room), the "Active" line otherwise. */}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{[`@${user.handle}`, court ? null : seenCity || user.location || null, formatSpotMiles(miles, rough), court && followsYou ? 'Follows you' : null].filter(Boolean).join(' · ')}</Text>
          {court ? <View style={styles.openRow}><CourtGlyph size={13} color={colors.court} /><Text style={styles.atCourt} numberOfLines={1}>At {court.name}{seenAt ? ` · ${agoLabel(seenAt)}` : ''}</Text></View>
            : seenAt || followsYou ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{[seenAt ? activeLabel(seenAt) : null, followsYou ? 'Follows you' : null].filter(Boolean).join(' · ')}</Text> : null}
          {isOpenToHit(user) ? <View style={styles.openRow}><View style={styles.openDot} /><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.openText}>{till ? `Open to hit ${till}` : 'Open to hit today'}</Text></View> : null}
        </Pressable>
        {/* Up by the name, where a card's close sits on a phone, rather than floating halfway down the words. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, styles.closeTop, pressed && styles.closePressed]}>
          <Ionicons name="close" size={17} color={colors.textMuted} />
        </Pressable>
      </View>
      {farLine ? <Text style={styles.farLine}>{farLine}</Text> : null}
      {/* One row (Oct 7): a single filled pill (Ask to hit, tennis first, or Message where Ask to hit
          is not offered), a sand pill beside it, Follow in words until you follow (then a small round
          button), and ⋯ for the rest. All four fit a 375pt phone: the two pills size to their words and
          share what is left, and the sand pill carries no icon to make the room for "Follow". */}
      <View style={styles.cardActions} onLayout={(e) => { const width = Math.floor(e.nativeEvent.layout.width); if (width !== rowWidth) setRowWidth(width); }}>
        <View style={styles.cardSlot}>
          {onAskToHit ? (
            <Tappable accessibilityLabel={`Ask ${user.name} to hit`} onPress={onAskToHit} scaleTo={0.97} hoverTo={1.02} style={[styles.cardPill, styles.cardPrimary, pageIsDark() ? styles.cardLiftDark : styles.cardLift]}>
              <BrandWash radius={buttonShape.radius} curve />
              <HitGlyph size={CARD_PILL_ICON} color={colors.brandInk} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardPrimaryText} numberOfLines={1}>{primaryLabel}</Text>
            </Tappable>
          ) : (
            <Tappable accessibilityLabel={`Message ${user.name}`} onPress={onMessage} scaleTo={0.97} hoverTo={1.02} style={[styles.cardPill, styles.cardPrimary, pageIsDark() ? styles.cardLiftDark : styles.cardLift]}>
              <BrandWash radius={buttonShape.radius} curve />
              <Ionicons name="paper-plane-outline" size={CARD_PILL_ICON} color={colors.brandInk} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardPrimaryText} numberOfLines={1}>{primaryLabel}</Text>
            </Tappable>
          )}
        </View>
        <View style={styles.cardSlot}>
          {onAskToHit ? (
            <Tappable accessibilityLabel={`Message ${user.name}`} onPress={onMessage} scaleTo={0.97} hoverTo={1.02} style={[styles.cardPill, styles.cardSecondary]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardSecondaryText} numberOfLines={1}>{secondaryLabel}</Text>
            </Tappable>
          ) : (
            <Tappable accessibilityRole="link" accessibilityLabel="Open profile" onPress={onProfile} scaleTo={0.97} hoverTo={1.02} style={[styles.cardPill, styles.cardSecondary]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardSecondaryText} numberOfLines={1}>{secondaryLabel}</Text>
            </Tappable>
          )}
        </View>
        <FollowShrink following={following} userId={user.id} onPress={onFollow} name={first} followsYou={followsYou} size={CARD_ROUND} room={followRoom} />
        <Tappable accessibilityLabel={`More for ${user.name}`} onPress={() => setMenuOpen(true)} style={styles.cardRound}>
          <Ionicons name="ellipsis-horizontal" size={19} color={colors.text} />
        </Tappable>
        {/* The pills' words at their natural width, never seen or read out (see followRoom). */}
        <View pointerEvents="none" style={styles.cardMeasure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardPrimaryText} numberOfLines={1} onLayout={measured('primary')}>{primaryLabel}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cardSecondaryText} numberOfLines={1} onLayout={measured('secondary')}>{secondaryLabel}</Text>
        </View>
      </View>
      <MenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={`@${user.handle}`} items={menu} />
    </Animated.View>
    </GestureDetector>
  );
}

/**
 * You, tapped on the map: whether you are up for a hit today, and your
 * profile. Flip the switch and the change shows everywhere at once: your
 * face here draws on its green ring, the box around the switch warms to
 * green, and your pin on the map behind does the same.
 */
export function YouSheet({ me, open, teen = false, onToggle, onProfile, onClose, seenBy, onSeenBy }: { me: User; open: boolean; /** Not known to be an adult, with the map's teen rule on (migration 78): only friends who follow you back see you. */ teen?: boolean; onToggle: (on: boolean) => void; onProfile: () => void; onClose: () => void; /** Who can see you on the map (migration 63), with a way to change it; absent before it. */ seenBy?: MapVisibility | null; onSeenBy?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  const reduce = useReducedMotion();
  const lit = useSharedValue(open ? 1 : 0);
  useEffect(() => { lit.value = withTiming(open ? 1 : 0, { duration: reduce ? 200 : 420, easing: Easing.bezier(0.4, 0, 0.2, 1) }); }, [open, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  // Off, the box is the card's own quiet grey; on, it takes a wash of the open green and a fine green edge.
  // White when off, washing into the theme's own colour when on (Oct 3), not the ring's green.
  const quiet = colors.surface;
  const warm = mix(colors.surface, colors.brand, 0.14);
  const edgeOff = colors.border;
  const edgeOn = withAlpha(colors.brand, 0.35);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(lit.value, [0, 1], [quiet, warm]),
    borderColor: interpolateColor(lit.value, [0, 1], [edgeOff, edgeOn]),
  }), [quiet, warm, edgeOff, edgeOn]);
  // The words under it hand over as it flips, one fading out as the other fades in, rather than cutting.
  const noteOff = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - lit.value * 2) }));
  // Until the time you picked (holding your ring in the Open to hit row), or midnight.
  const till = (open ? tillLabel(me.openToHitUntil) : null) ?? 'until midnight';
  const noteOn = useAnimatedStyle(() => ({ opacity: Math.max(0, lit.value * 2 - 1) }));
  // Who sees the ring follows Who can see you, the row under it: on Only me nobody else does, and
  // on Only people you follow back (always, for a teen) only those friends (map_players).
  // The map is friends only, at any age, and only on a check-in (migration 189; Oct 27 audit #8): no yes, no one.
  const ringNote = !saidYes(seenBy)
    ? 'Only you see your ring on the map.'
    : `Friends who follow you back see your green ring ${till} while you’re up to hit.`;
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.personRow}>
        <View style={styles.faceSlot}>
          <OpenRing open={open} size={50} hairline><Avatar name={me.name} seed={me.avatarSeed} size={50} /></OpenRing>
        </View>
        <View style={styles.personWords}>
          <View style={styles.personTop}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personName} numberOfLines={1}>You</Text>
            <Level profile={me.profile} userId={me.id} small />
          </View>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>@{me.handle}{me.location ? ` · ${me.location}` : ''}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <Animated.View style={[styles.openCard, box]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.openTitle}>Open to hit today</Text>
          {/* Both sentences hold the same place (the longer one keeps the room), so the card never changes height as they hand over. */}
          <View>
            <Animated.Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.openNote, noteOn]} aria-hidden={!open} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>{ringNote}</Animated.Text>
            <Animated.Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.openNote, styles.noteOver, noteOff]} aria-hidden={open} accessibilityElementsHidden={open} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}>Wear a green ring on the map until midnight.</Animated.Text>
          </View>
        </View>
        {/* Green like the ring it puts on, not the court's colour: the one switch in the app that is (see DESIGN.md, Open Green). */}
        <Toggle value={open} onChange={onToggle} haptic tint={colors.open} accessibilityLabel="Open to hit today" />
      </Animated.View>
      {onSeenBy ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Who can see you: ${visibilityLabel(seenBy, teen)}. Change`} onPress={onSeenBy} style={({ pressed }) => [styles.seenRow, pressed && styles.listPressed]}>
          <Ionicons name={seenBy === 'none' || (teen && seenBy == null) ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.seenLabel}>Who can see you</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.seenValue} numberOfLines={1}>{visibilityLabel(seenBy, teen)}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
        </Pressable>
      ) : null}
      <View style={styles.personActions}>
        <Pressable accessibilityRole="link" accessibilityLabel="Your profile" onPress={onProfile} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.secondary, pressed && styles.glassPressed]}>
          <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.secondaryText}>Your profile</Text>
        </Pressable>
      </View>
    </Animated.View>
    </GestureDetector>
  );
}

/**
 * The court card's "More open hits (N)" row (Oct 29, owner: "Wdym court card only list 2 hits"): when a court
 * has more open hits than the card lists (two, or one beside clips), a last row says how many more and opens
 * the court's page, which lists them all. false: the card as it is, its first one or two hits only.
 */
export const COURT_CARD_MORE_HITS: boolean = false;

/**
 * The court card's open hits as the Community tab's boxes (Oct 29, owner: "the hits on the court card needs to
 * be how they look in main community tab. it needs to look like the boxes. is that possible to fit in or no, we
 * can make it a side to side swiping thing."): every open hit at the court, each in the same HitCard the
 * Community tab's Open hits list shows, in a row that swipes side to side, one card at a time, the next one
 * peeking at the right edge. One hit: a single box the card's full width, nothing to swipe. Taps do what they
 * do on Community. false: the card as it is, one quiet line per hit (one beside clips, two without).
 */
export const COURT_CARD_HIT_BOXES: boolean = true;
/** How much of the next hit box shows at the row's right edge, so the row reads as one to swipe. */
const HIT_BOX_PEEK = 28;

/** The court card's hits as Community's boxes, side by side (COURT_CARD_HIT_BOXES). */
function CourtHitBoxes({ hits, miles }: { hits: HitRequest[]; miles: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { width: windowW } = useWindowDimensions();
  // The row's own width once laid out; until then the screen's, which on a phone is the same.
  const [rowW, setRowW] = useState(0);
  const w = rowW || windowW;
  const one = hits.length === 1;
  const gap = spacing.md;
  const cardW = Math.max(200, Math.round(one ? w - spacing.lg * 2 : w - spacing.lg - gap - HIT_BOX_PEEK));
  return (
    <ScrollView
      horizontal
      scrollEnabled={!one}
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => { const next = Math.round(e.nativeEvent.layout.width); if (next && next !== rowW) setRowW(next); }}
      // One card per swipe, each coming to rest at the card's left margin.
      snapToInterval={cardW + gap}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      style={[styles.hitBoxes, !one && Platform.OS === 'web' ? styles.hitBoxesSnapWeb : null]}
      contentContainerStyle={styles.hitBoxesRow}
    >
      {/* Pressed the way Community's boxes are: a finger that starts a sideways swipe never dims the box under it. */}
      <SwipeArea on={!one}>
        {hits.map((h) => (
          <View key={h.id} style={[{ width: cardW }, Platform.OS === 'web' ? styles.hitBoxSnapWeb : null]}>
            <HitCard hit={h} miles={miles} fill />
          </View>
        ))}
      </SwipeArea>
    </ScrollView>
  );
}

/**
 * Played here today (features/places/playedToday): today's clip from this court at the top of its card. Its
 * picture, still (the card plays nothing on its own), with "Played here today" and who and when on it; a tap
 * opens it the way any clip at a court opens (openCourtReel), in the court's reel.
 */
function TodayClip({ post, author, mine, onOpen }: { post: Post; author?: User; mine: boolean; onOpen: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const cover = post.thumbnailUrl ?? post.imageUrl;
  const who = mine ? 'You' : author ? `@${author.handle}` : '';
  const when = relativeTime(post.createdAt);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Played here today: ${who ? `${who}'s clip` : 'a clip'}, ${when}. Play it`} onPress={onOpen} style={({ pressed }) => [styles.todayWrap, pressed && styles.postedPressed]}>
      <View style={styles.todayClip}>
        {cover ? <TileCover uri={cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <View style={StyleSheet.absoluteFill}><MediaPlaceholder label={post.mediaLabel ?? 'Clip · 0:15'} seed={post.id} fill /></View>}
        <View style={styles.todayShade} />
        <View style={styles.todayTag}>
          <View style={[styles.todayDot, { backgroundColor: playedTodayTone() }]} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.todayTagText} numberOfLines={1}>Played here today</Text>
        </View>
        <View style={styles.todayPlay}><Ionicons name="play" size={18} color={colors.onMedia} /></View>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.todayWho} numberOfLines={1}>{[who, when].filter(Boolean).join(' · ')}</Text>
      </View>
    </Pressable>
  );
}

/**
 * A court, picked on the map: what OpenStreetMap knows, who may play there,
 * how it is right now, what players say, the people you follow who play
 * there, what was posted there, and the open hits there. Directions, Play
 * here (post a hit at this court) and Post (a photo or clip tagged here,
 * with the video mark so it never reads as posting a hit); beside Close,
 * the heart (follow it) and Send (into any of your chats: "meet here"). A
 * court played on this week wears the green ring here too, and a tap on it
 * plays its newest clip. A members-only or private court offers no Play
 * here: it is never suggested for a hit.
 */
export function CourtSheet({ court, miles, ringed = false, today = false, onClose }: { court: Court; miles: number; /** Played on this week: the disc wears the story ring. */ ringed?: boolean; /** Played here today (playedToday): today's clip from here at the top, when there is one. */ today?: boolean; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { height: windowH } = useWindowDimensions();
  const { currentUserId, users, actions, courtFacts, courtExtras } = useApp();
  // Only a court OpenStreetMap knows can carry facts, follows and tags; a place sent without one
  // (a hit's place, a court from a chat) has nothing to load and nothing to add to.
  const mapCourt = isMapCourtId(court.id);
  // The court's own life (migration 60), shown once a read has said the
  // database has it: on one without it, nothing appears that cannot work.
  const extras = mapCourt && courtExtras === true;
  useEffect(() => { if (mapCourt && currentUserId) void actions.loadCourtInfo([court.id]).catch(() => undefined); }, [court.id, mapCourt, currentUserId, actions]);
  const facts = courtFacts[court.id];
  // Players' and admins' answers come with the facts; until they load, what the map's data said.
  const access = facts && facts.access !== 'unknown' ? facts.access : court.access ?? 'unknown';
  const bookUrl = facts?.bookUrl ?? court.bookUrl;
  const closed = isClosedCourt({ access });
  // How far first, so it never falls off the end beside the icons. Lights
  // only from the map while no player has said: then the facts line below
  // is the one place lights are mentioned, and the two can never disagree.
  const playersOnLights = !!facts && facts.lights.yes + facts.lights.no > 0;
  const meta = [formatMiles(miles), court.count > 1 ? `${court.count} courts` : '1 court', courtSurfaceWord(court), court.lit && !playersOnLights ? 'lit at night' : null].filter(Boolean).join(' · ');
  // Clips and photos people tagged here: the best proof a court gets played on.
  // The same posts, in the same order, as the court's own page and its reel.
  const place = useMemo(() => ({ id: mapCourt ? court.id : undefined, name: court.name, lat: court.lat, lng: court.lng }), [mapCourt, court.id, court.name, court.lat, court.lng]);
  const { posts: here, more } = useCourtPosts(place);
  // Played here today (PLAYED_TODAY_GLOW): the most-liked public clip posted here today, at the top of the card.
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);
  const todays = PLAYED_TODAY_GLOW && today ? todayClip(here, usersById, currentUserId) : null;
  // The clips under it leave out the one already on top, so a court with one clip today does not show it twice;
  // when that clip is the court's only post, "Played here" is left out altogether.
  const strip = here.filter((p) => (p.thumbnailUrl || p.imageUrl) && p.id !== todays?.id).slice(0, 12);
  const onlyToday = !!todays && here.length === 1 && !more;
  // Open hits here, the same ones the court's page lists: one beside the clips, two without them.
  const allHits = useCourtHits(place);
  // As Community's boxes (COURT_CARD_HIT_BOXES): every one of them, in a row that swipes.
  const hits = COURT_CARD_HIT_BOXES ? allHits : allHits.slice(0, strip.length ? 1 : 2);
  // With the boxes' row showing, a sideways swipe moves the row, never the card (useDragToClose).
  const pull = useDragToClose(onClose, COURT_CARD_HIT_BOXES && hits.length > 1);
  // The ones the card has no room for (COURT_CARD_MORE_HITS): its last row says how many, and opens the page.
  const moreHits = COURT_CARD_MORE_HITS ? allHits.length - hits.length : 0;
  const hitLine = (h: HitRequest) => {
    const left = Math.max(0, h.spots - joinedCount(h));
    const who = h.authorId === currentUserId ? 'You' : users.find((u) => u.id === h.authorId)?.name.split(' ')[0];
    return [hitShort(h.startsAt), FORMAT_LABEL[h.format], left ? `${left} ${left === 1 ? 'spot' : 'spots'} left` : 'Full', who].filter(Boolean).join(' · ');
  };
  // The ring plays the court's newest post, the way a story ring does; without one to play, the disc opens the page.
  const lead = here[0];
  const tapDisc = () => (ringed && lead ? openCourtReel(place, lead.id) : openCourt(place));
  const showTags = access !== 'unknown' || !!bookUrl || extras;
  // Everything between the name and the buttons scrolls once it is taller
  // than this, so the whole card stays within about 60% of the screen: on a
  // small phone it never covers the search and the chips, and the pin
  // stays in sight. (The name row and the buttons take about 190pt.)
  const middleMax = Math.max(160, Math.round(windowH * 0.6) - 190);
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.personRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={ringed && lead ? `Play the newest from ${court.name}` : `Open ${court.name}'s page`} onPress={tapDisc} style={({ pressed }) => [ringed && styles.courtRing, pressed && styles.postedPressed]}>
          <View style={[styles.courtDisc, closed && styles.courtDiscClosed]}>{closed ? null : <BrandWash />}<CourtGlyph size={16} color={closed ? colors.textMuted : colors.brandInk} /></View>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel={`Open ${court.name}'s page`} onPress={() => openCourt(place)} style={({ pressed }) => [styles.personWords, pressed && styles.postedPressed]}>
          {/* Two lines: the court's name is the card's main news, so it is never cut short for want of width. */}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personName} numberOfLines={2}>{court.name}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{meta}</Text>
        </Pressable>
        {/* The heart and Send sit beside Close, the way a maps app's place card puts Save and Share there. */}
        {extras ? <FollowHeart court={{ id: court.id, name: court.name, lat: court.lat, lng: court.lng, access }} style={styles.close} size={16} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Send ${court.name} to a chat`} hitSlop={8} onPress={() => sendCourtToChat(place)} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
          <Ionicons name="paper-plane-outline" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <GHScrollView style={{ maxHeight: middleMax, flexGrow: 0 }} contentContainerStyle={styles.courtMiddle} showsVerticalScrollIndicator={false} bounces={false}>
      {todays ? <TodayClip post={todays} author={usersById.get(todays.authorId)} mine={todays.authorId === currentUserId} onOpen={() => openCourtReel(place, todays.id)} /> : null}
      {showTags ? (
        <View style={styles.courtTags}>
          <AccessTag access={access} bookUrl={bookUrl} />
          {extras ? <NowTags courtId={court.id} name={court.name} access={access} /> : null}
        </View>
      ) : null}
      {extras ? <View style={styles.courtBlock}><CourtFactsLine courtId={court.id} name={court.name} note={false} lines={1} /></View> : null}
      {extras ? <View style={styles.courtBlock}><RegularsRow court={{ id: court.id, name: court.name, lat: court.lat, lng: court.lng }} closed={closed} /></View> : null}
      {here.length && !onlyToday ? (
        <View style={styles.posted}>
          <View style={styles.postedHead}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postedTitle}>Played here <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.postedCount}>· {countLabel(here, more)}</Text></Text>
            <Pressable accessibilityRole="link" accessibilityLabel={`See all posts from ${court.name}`} hitSlop={8} onPress={() => openCourt(place)} style={({ pressed }) => pressed && styles.postedPressed}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.postedAll}>See all</Text>
            </Pressable>
          </View>
          {strip.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.postedRow}>
            {strip.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.kind === 'clip' ? 'A clip from this court' : 'A post from this court'} onPress={() => openCourtReel(place, p.id)} style={({ pressed }) => [styles.postedThumb, pressed && styles.postedPressed]}>
                <TileCover uri={p.thumbnailUrl ?? p.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                {p.kind === 'clip' || p.videoUrl ? <View style={styles.postedPlay}><Ionicons name="play" size={11} color="#fff" /></View> : null}
              </Pressable>
            ))}
          </ScrollView> : null}
        </View>
      ) : null}
      {hits.length && COURT_CARD_HIT_BOXES ? <CourtHitBoxes hits={hits} miles={miles} /> : hits.length ? (
        <View style={styles.hitRows}>
          {hits.map((h) => (
            <Pressable key={h.id} accessibilityRole="link" accessibilityLabel={`Open hit: ${hitLine(h)}`} onPress={() => router.push(`/hit-request/${h.id}`)} style={({ pressed }) => [styles.hitRow, pressed && styles.postedPressed]}>
              <View style={styles.hitTile}><HitGlyph size={18} color={colors.brand} /></View>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.hitText} numberOfLines={1}>{hitLine(h)}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
            </Pressable>
          ))}
          {moreHits > 0 ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`More open hits at ${court.name}: ${moreHits}`} onPress={() => openCourt(place)} style={({ pressed }) => [styles.hitRow, styles.hitMore, pressed && styles.postedPressed]}>
              <View style={styles.hitMoreGap} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.hitMoreText} numberOfLines={1}>More open hits ({moreHits})</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      </GHScrollView>
      <View style={styles.personActions}>
        {/* Three pills, a little tighter than the player card's, so they fit a 320pt phone. */}
        <Pressable accessibilityRole="link" accessibilityLabel="Directions" onPress={() => directionsTo(court)} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.primary, styles.pillTight, pressed && styles.glassPressed]}>
          <BrandWash radius={buttonShape.smallRadius} curve />
          <Ionicons name="navigate-outline" size={16} color={colors.brandInk} />
          <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.primaryText}>Directions</Text>
        </Pressable>
        {closed ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Post a hit at ${court.name}`} onPress={() => playHere(place)} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.secondary, styles.pillTight, pressed && styles.glassPressed]}>
            <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.secondaryText}>Play here</Text>
          </Pressable>
        )}
        {mapCourt ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Post a photo or clip from ${court.name}`} onPress={() => postFromCourt({ id: court.id, name: court.name, lat: court.lat, lng: court.lng })} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.secondary, styles.pillTight, styles.pillIcon, pressed && styles.glassPressed]}>
            <Ionicons name="videocam-outline" size={15} color={colors.text} />
            <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.secondaryText}>Post</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
    </GestureDetector>
  );
}

/** A court's distance from a searched place, naming the place: "0.4 mi from Durham", or "central Durham" / "at Pullen Park" when it is right there. */
function milesFromPlace(miles: number, place: FoundPlace): string {
  if (miles < 0.15) return place.kind === 'area' ? `central ${place.title}` : `at ${place.title}`;
  return `${formatMiles(miles)} from ${place.title}`;
}

/**
 * A place picked from the map's search: its courts, best first (rankForPlace
 * in courts.ts). A city or neighbourhood lists the bigger and busier places
 * to play nearer the middle first; an address, a street or a park simply
 * the nearest. Each row says how far from the place (naming it, since the
 * court's card says how far from you), how many courts and whether there
 * are lights, and opens that court's card; closing the card comes back
 * here. Close (or a swipe down) puts the list away, back to the bare map (or
 * the players list, if that was open); the map stays where it is.
 */
export function PlaceSheet({ place, rows, loading, failed, onPickCourt, onRetry, onClose, played }: { place: FoundPlace; rows: CourtRow[]; loading: boolean; failed: boolean; onPickCourt: (c: Court) => void; onRetry: () => void; onClose: () => void; /** Whether a court was played on this week (the map's ring). */ played: (c: Court) => boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  const { height: windowH } = useWindowDimensions();
  const area = place.kind === 'area';
  const title = `Courts ${area ? 'in' : 'near'} ${place.title}`;
  const how = area ? 'Bigger, busier, central first' : 'Nearest first';
  // Tall enough for a good few rows, never so tall it hides the place on the map.
  const listMax = Math.max(160, Math.round(windowH * 0.42));
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.personRow}>
        <View style={styles.placeDisc}><Ionicons name={area ? 'map-outline' : 'location-outline'} size={18} color={colors.brand} /></View>
        <View style={styles.personWords}>
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.personName} numberOfLines={1}>{title}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={1}>{rows.length ? `${rows.length} ${rows.length === 1 ? 'place' : 'places'} · ${how}` : place.sub || how}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {rows.length ? (
        <GHScrollView style={{ maxHeight: listMax, flexGrow: 0 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} bounces={false}>
          {rows.map(({ c, miles }, i) => {
            const busy = played(c);
            // "N courts" always shows here: how big a place is, is half of why it is where it is in this list.
            // How far from the place, said so ("0.4 mi from Durham"): every other "x mi" in the app is from you, and the court's card one tap on is too.
            const meta = [milesFromPlace(miles, place), `${c.count} ${c.count === 1 ? 'court' : 'courts'}`, c.lit ? 'lights' : null, busy ? 'played this week' : null].filter(Boolean).join(' · ');
            return (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${labelOf(c)}, ${meta}. Show on the map`} onPress={() => { haptics.tap(); onPickCourt(c); }} style={({ pressed }) => [styles.resultRow, i > 0 && styles.listRule, pressed && styles.listPressed]}>
                <View style={styles.resultTile}><CourtGlyph size={13} color={colors.brand} /></View>
                <View style={styles.listWords}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.listName} numberOfLines={1}>{labelOf(c)}</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.personMeta} numberOfLines={2}>{meta}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
              </Pressable>
            );
          })}
        </GHScrollView>
      ) : (
        <View style={styles.placeEmpty}>
          {loading ? (
            <View style={styles.placeNote}><ActivityIndicator size="small" color={colors.textFaint} /><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.placeNoteText}>Finding courts…</Text></View>
          ) : failed ? (
            <>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.openNote}>Couldn’t load the courts here. Check your connection.</Text>
              <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={6} style={styles.lockAction}>
                <Ionicons name="refresh" size={14} color={colors.brand} />
                <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.lockActionText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.openNote}>No courts on the map here yet.</Text>
          )}
        </View>
      )}
    </Animated.View>
    </GestureDetector>
  );
}

/** An open hit, picked on the map: its card, the same one Find Players shows, with how far it is. */
export function HitSheet({ hit, miles, onClose }: { hit: HitRequest; miles?: number; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.sheetHead}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sheetTitle}>Open hit</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.hitSheetCard}><HitCard hit={hit} miles={miles} /></View>
    </Animated.View>
    </GestureDetector>
  );
}

/**
 * The thin edge in the map's ground colour on the card's city words. A
 * browser draws it as a tight ring of three short shadows, close to a map
 * label's halo; a phone's one shadow is kept just as short. `ground` is the
 * court's page colour, the map's own ground.
 */
const labelEdge = (ground: string) => (Platform.OS === 'web'
  ? ({ textShadow: `0 0 1px ${ground}, 0 0 2px ${ground}, 0 0 3px ${ground}` } as object)
  : { textShadowColor: ground, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } });

/**
 * What sits on the still card in the Find Players tab: your city's name in
 * the middle of its own map, the way Snapchat's map names where you are, with
 * who is around under it; a round location switch, and the weather. Nothing
 * says "open" — a map is plainly a thing you tap. (Oct 5 moved the name to
 * the top; Oct 6 the owner wanted it back in the middle, as it always was.)
 */
export function PreviewOverlay({ cityName, count, placeCount = 0, hitCount = 0, weather, checkIn, lock = null, inviting = false, uthTip = false, reask = false, chip = false }: { /** The No one re-ask may come now (noOneReask: the Community card, due for this person). */ reask?: boolean; /** The card draws the full map's own pins (fullCard: the zoom, admins first): the words go in a small chip by the weather, out of the pins' way. */ chip?: boolean; /** Up to hit's one tip may come now (upToHitTip: the Community card, the right visit, the right person). */ uthTip?: boolean; cityName: string; count: number; /** Places to play in town (one per park, not single courts). */ placeCount?: number; /** Open hits in town. */ hitCount?: number; weather: Weather | null; /** The Check in button (useCheckIn, migration 189). */ checkIn?: CheckInControl; /** What keeps "Players nearby" from you (nearbyLock). */ lock?: NearbyLock; /** The "You're early" card sits right under this one, asking for the first players already. */ inviting?: boolean }) {
  const labelsOut = useGrowLabels();
  // The check-in zoom's grow (mapGrow): the weather slips down out of the card at its own size as the page pushes in.
  const weatherAway = useGrowAway('bottom');
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  const edge = labelEdge(themes[theme].bg);
  // A teen sees only friends who follow each other with them (migration 78),
  // so for anyone not known to be an adult an empty map says nothing about
  // the town: no "be the first" for them.
  const { currentUser } = useApp();
  const adult = !!currentUser && !notKnownAdult(currentUser);
  // Since migration 98 you share to see: with Location off or on Only me
  // only your friends come back, so an empty map says how to see the
  // players here, never "Be the first player on the map".
  const hint = lock === 'location' ? 'Turn on Location to see players' : lock === 'hidden' ? 'On Only me, players nearby are hidden' : null;
  // Friends first (the only people on the map, migration 189); with none checked in, the courts still say the map is worth opening.
  const line = count === 1 ? '1 friend around' : count ? `${count} friends around`
    : placeCount ? `${placeCount}${placeCount >= 30 ? '+' : ''} ${placeCount === 1 ? 'place' : 'places'} to play nearby`
      : hint ?? 'No one here yet';
  // The card that draws the full map's pins (fullCard): its middle is all courts, faces and "4 here" labels, so the
  // words sit in one small chip beside the weather, sized like it, and slip out with it as the zoom starts (Oct 28,
  // owner: "no shit animations, not ui that looks bad"). Never near Up to hit's tip, which hangs from the top right.
  const chipBits = chip ? [
    count ? `${count} ${count === 1 ? 'friend' : 'friends'}` : placeCount ? `${placeCount}${placeCount >= 30 ? '+' : ''} ${placeCount === 1 ? 'place' : 'places'}` : null,
    hitCount ? `${hitCount} ${hitCount === 1 ? 'hit' : 'hits'}` : null,
  ].filter(Boolean) as string[] : [];
  const weatherChip = weather ? (
    <View style={styles.previewChip}>
      <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={13} color={colors.text} />
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.weatherText} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>{weather.tempF}°</Text>
    </View>
  ) : null;
  return (
    <>
      {chip ? (
        <Animated.View pointerEvents="none" style={[styles.previewChips, weatherAway]}>
          {weatherChip}
          <View style={[styles.previewChip, styles.cityChip]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.cityChipText}>
              {cityName}
              {chipBits.length ? <Text style={(count > 0 || placeCount > 0) ? styles.cityChipOn : styles.cityChipMuted}>{`  ·  ${chipBits.join(' · ')}`}</Text> : null}
            </Text>
          </View>
        </Animated.View>
      ) : null}
      {chip ? null : <>
      {/* The city's name is the top layer, so a player's ring or a court never
          sits over the words however busy the middle of town gets. Each word
          wears a thin edge of the map's ground colour, the way a map's own
          labels do, so it reads over roads and pins with nothing behind it
          (Oct 25, owner: "I don't like this big glare here", of the haze that was). */}
      {/* The check-in zoom's grow (mapGrow): the words step out of the way as the card grows into the full map (words only, no glass). */}
      <Animated.View pointerEvents="none" style={[styles.cityMark, labelsOut]}>
        <View style={styles.cityGlow}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.cityName, edge]} numberOfLines={1}>{cityName}</Text>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.cityCount, (count > 0 || placeCount > 0) && styles.cityCountOn, edge]}>{line}</Text>
          {hitCount ? <Text style={[styles.cityHits, edge]}>{hitCount === 1 ? '1 open hit nearby' : `${hitCount} open hits nearby`}</Text>
            // Nobody to show, but courts to play on: how to see the players here, or (sharing already) a next step, not an empty town.
            : !count && placeCount && hint ? <Text style={[styles.cityHits, edge]}>{hint}</Text>
              // Not with the "You're early" card under the map: that card is the one ask for this moment.
              : !count && placeCount && adult && !inviting ? <Text style={[styles.cityHits, edge]}>Tap Up to hit so friends see you</Text> : null}
        </View>
      </Animated.View>
      </>}
      {checkIn ? (
        <>
          <View pointerEvents="none" style={styles.previewPulse}><TipPulse where="card" size={32} /></View>
          {/* The Up to hit pill (Oct 27, the owner's pick: "Up to hit"; migration 189): "Up to hit", or while it is on,
              "Up to hit · till 10pm" on green (a tap turns it off). UpToHit: it springs to its words as the green sweeps in. */}
          <UpToHitPill control={checkIn} />
          <HideTip where="card" style={{ top: 52, right: 8 }} />
          <UpToHitTip ready={uthTip && !checkIn.on && !checkIn.busy} span={checkIn.span} />
          <NoOneReaskTip ready={reask && !checkIn.on && !checkIn.busy} span={checkIn.span} />
        </>
      ) : null}
      {weatherChip && !chip ? (
        <Animated.View pointerEvents="none" style={[styles.previewWeather, weatherAway]}>{weatherChip}</Animated.View>
      ) : null}
      {/* The one-tap Check in bar over the map is gone (Oct 27, owner: "I don't like how there's two check in things take out the one on bottom of map"): the Check in button is the one way in. */}
    </>
  );
}

/**
 * The Find Players card when the profile has no city: it asks for one
 * rather than guessing a place you may be nowhere near. The full map is
 * still a tap away, for anyone who would rather share their location.
 */
export function CitylessCard({ onOpenMap }: { onOpenMap?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.cityless}>
      <View style={styles.citylessDisc}><Ionicons name="location-outline" size={20} color={colors.brand} /></View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.citylessTitle}>Where do you play?</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.citylessBody}>Add your city to see the courts and players in your town.</Text>
      <View style={styles.citylessActions}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/edit-profile')} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.primary, pressed && styles.glassPressed]}>
          <BrandWash radius={buttonShape.smallRadius} curve />
          <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.primaryText}>Add my city</Text>
        </Pressable>
        {onOpenMap ? (
          <Pressable accessibilityRole="button" onPress={onOpenMap} hitSlop={buttonShape.smallSlop} style={({ pressed }) => [styles.secondary, pressed && styles.glassPressed]}>
            <Text {...oneLine(TextScale.TITLE, 0.8)} style={styles.secondaryText}>Open the map</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The one tip after "Who can see you on the map?" and the device's prompt,
 * hung under the location button it points at: "Tap here any time to hide
 * yourself." (or, for someone who chose Only me and is hidden already, "Tap
 * here to change who sees you."). Once, ever; a tap on it (or the button)
 * puts it away, and it goes by itself after a few seconds.
 */
function HideTip({ where, style }: { where: TipSpot; style: object }) {
  const styles = useThemedStyles(styleDefinitions);
  const shown = useHideTip(where);
  const text = useHideTipText();
  useEffect(() => {
    if (!shown) return undefined;
    const t = setTimeout(dismissHideTip, 7000);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <Animated.View entering={FadeIn.duration(260).delay(120)} exiting={FadeOut.duration(180)} style={[styles.tip, style]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${text} Got it`} onPress={dismissHideTip} style={styles.tipBody}>
        <View style={styles.tipArrow} />
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.tipText}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Up to hit's one tip (upToHitTip), hung under the card's pill: "Tap Up to hit · friends see you on the map till
 * 10pm." The app's own tip bubble (TipBubble), so it waits its turn like every tip; it closes itself after a few
 * seconds and never comes back (a tap on it, or on the pill, closes it too).
 */
function UpToHitTip({ ready, span }: { ready: boolean; span: string }) {
  const tip = useTip('up-to-hit', ready);
  const close = useRef(tip.close);
  close.current = tip.close;
  useEffect(() => {
    if (!tip.shown) return undefined;
    const t = setTimeout(() => close.current(), UTH_TIP_SHOW_MS);
    // Shown once: gone off the card meanwhile (the map opened, another tab) still counts as seen.
    return () => { clearTimeout(t); close.current(); };
  }, [tip.shown]);
  return <TipBubble tip="up-to-hit" words={`Tap Up to hit · friends see you on the map ${span}.`} shown={tip.shown} onClose={tip.close} pointer="up" pointerRight={UTH_TIP_POINTER} style={{ top: 48, right: 8, left: 24, alignItems: 'flex-end' }} />;
}
/**
 * The No one re-ask (noOneReask), in the same place and bubble as Up to hit's tip: "Friends can see you when you tap
 * Up to hit · only people you both follow, till 10pm", with Turn on (our "Who can see you on the map?", its first
 * look: Friends or Not now; Apple's prompt still only comes on the next Up to hit, after a yes) and Not now. It waits
 * its turn like every tip, goes by itself after a while (asked, not a Not now), and comes back only as noOneReask says.
 */
function NoOneReaskTip({ ready, span }: { ready: boolean; span: string }) {
  const { currentUserId } = useApp();
  const tip = useTip('no-one-reask', ready);
  const [gone, setGone] = useState(false);
  const shown = tip.shown && !gone;
  const id = useRef(currentUserId);
  id.current = currentUserId;
  useEffect(() => {
    if (!tip.shown || !id.current) return undefined;
    noteReaskShown(id.current);
    const t = setTimeout(() => { setGone(true); releaseTip('no-one-reask'); }, REASK_SHOW_MS);
    return () => { clearTimeout(t); releaseTip('no-one-reask'); };
  }, [tip.shown]);
  const notNow = () => {
    setGone(true);
    releaseTip('no-one-reask');
    if (id.current) noteReaskNotNow(id.current);
  };
  const turnOn = () => {
    setGone(true);
    releaseTip('no-one-reask');
    const who = id.current;
    void askWhoSeesYou('first', 'reask').then((v) => {
      if (!who) return;
      if (saidYes(v)) noteReaskYes(who);
      else noteReaskNotNow(who);
    });
  };
  return (
    <TipBubble
      tip="no-one-reask"
      words={`Friends can see you when you tap Up to hit · only people you both follow, ${span}.`}
      shown={shown}
      onClose={notNow}
      actions={[{ label: 'Not now', onPress: notNow }, { label: 'Turn on', onPress: turnOn, strong: true }]}
      pointer="up"
      pointerRight={UTH_TIP_POINTER}
      style={{ top: 48, right: 8, left: 24, alignItems: 'flex-end' }}
    />
  );
}
/** Where the bubble's pointer sits, in from its right edge: under the middle of "Up to hit" (the pill's right edge 4 in from the bubble's). */
const UTH_TIP_POINTER = 40;

/** While the tip is up, a soft ring breathes out from the button it points at. */
function TipPulse({ where, size }: { where: TipSpot; size: number }) {
  const shown = useHideTip(where);
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (shown && !reduce) t.value = withDelay(200, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) }), -1, false));
    else t.value = 0;
  }, [shown, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = useAnimatedStyle(() => (reduce ? { opacity: shown ? 0.5 : 0, transform: [{ scale: 1.15 }] } : { opacity: shown ? 0.55 * (1 - t.value) : 0, transform: [{ scale: 1 + 0.5 * t.value }] }));
  if (!shown) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: colors.text }, ring]} />;
}

/**
 * The player card's row, in numbers the row's fit is worked out from (PlayerSheet's followRoom):
 * how tall its buttons are (and how wide the round ones), a pill's padding either side and its
 * hairline border, and the icon and gap before a filled pill's word.
 */
const CARD_ROUND = 44;
const CARD_PILL_PAD = spacing.md;
const CARD_PILL_CHROME = 2 * CARD_PILL_PAD + 2;
const CARD_PILL_ICON = 16;
const CARD_PILL_GAP = 6;

const styleDefinitions = StyleSheet.create({
  // The tip: an ink bubble, its arrow pointing up at the button.
  tip: { position: 'absolute', zIndex: 30, elevation: 30, width: 210 },
  tipBody: { backgroundColor: colors.text, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  tipArrow: { position: 'absolute', top: -5, right: 14, width: 12, height: 12, borderRadius: 2, backgroundColor: colors.text, transform: [{ rotate: '45deg' }] },
  tipText: { ...typography.smallStrong, color: colors.bg, lineHeight: 18 },
  previewPulse: { position: 'absolute', right: 12, top: 12, width: 32, height: 32 },
  // Your card's "Who can see you" row: a settings row, quiet, under the Open to hit box.
  seenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 11, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  seenLabel: { ...typography.smallStrong, color: colors.text, flex: 1 },
  seenValue: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  roundHit: { width: 42, height: 42, borderRadius: 21, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  roundGlass: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  // The chips' row to the screen's edge, its 6 above and below the chips their touch's reach (44 in all).
  chipsRow: { flexDirection: 'row', alignItems: 'center' },
  chipsWrap: { flexGrow: 0, flexShrink: 1 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipGap: { width: StyleSheet.hairlineWidth, height: 18, marginHorizontal: 4, backgroundColor: colors.borderStrong },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 32, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  // Once measured, the chips go clear-backed at their own spots and the sliding pill carries the fill.
  greenFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', backgroundColor: colors.brand, pointerEvents: 'none' },
  twoToneLit: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  chipClear: { backgroundColor: 'transparent', borderColor: colors.border },
  chipPlate: { position: 'absolute', top: 6, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface },
  chipPill: { position: 'absolute', left: 0, top: 6, height: 32, borderRadius: radius.pill, backgroundColor: colors.brand },
  chipText: { ...typography.smallStrong, color: colors.text },
  chipTextOn: { color: colors.brandInk },
  // "Zoom in to see courts": a quiet pill under the chips, never in the way, a touch smaller than they are.
  zoomNote: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 28, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  zoomNoteText: { ...typography.small, color: colors.textMuted },
  weather: { marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weatherText: { ...typography.smallStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  buttonsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  // The credits over the "All N players" pill, at the start of the buttons' row: stacked, so the pill has
  // the row's whole width to say why nobody shows on a narrow phone (375 points), and gives way first.
  buttonsLead: { alignItems: 'flex-start', gap: 6, flexShrink: 1, marginRight: spacing.sm },
  buttons: { alignItems: 'flex-end', gap: spacing.sm },
  // A floating pill's shadow lives on a wrapper: the glass inside clips to its own round corners.
  pillLift: { flexShrink: 1, maxWidth: '100%', borderRadius: 21, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  // "All 11 players": as tall as Back to me beside it, in the same glass.
  playersPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 42 },
  // Room for the chevron (6 gap + 14 wide) beside the words.
  playersPillChev: { paddingRight: 14 + 6 + 14 },
  playersPillWords: { flexShrink: 1 },
  pillChev: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  // The pill's edge, on its see-through fill (which glides to the words' width).
  pillEdge: { maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  // The pill's unseen copy: wide enough never to squeeze it, reaching off to the left (which never scrolls the page), taking no taps.
  pillMeasure: { position: 'absolute', right: 0, top: 0, width: 2000, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start', opacity: 0, pointerEvents: 'none' },
  playersPillText: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  // The map's top row (Oct 11): Back, the bar and Location, 44 tall, one glass, one soft lift each.
  barPillHit: { height: 44, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  barPill: { height: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  barRoundHit: { width: 44, height: 44, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  barRound: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  // Pressed, a button dims rather than shrinks (a shrunk icon goes soft on an iPhone, Oct 11).
  // Glass inside: pressed shrinks, never dims (a dim over glass can turn it see-through on iPhone, Oct 17).
  barPressed: { transform: [{ scale: 0.94 }] },
  glassPressed: { transform: [{ scale: PRESS_SHRINK }] },
  searchLift: { flex: 1, minWidth: 0, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  // The words' room: the field fills it, the bar's own words ("Search Los Angeles") under it while nothing is typed.
  searchField: { flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center' },
  searchHintBox: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  searchHint: { ...typography.body, fontSize: 16, color: colors.textFaint },
  // Unseen, wide enough that nothing squeezes the words it measures.
  searchMeasure: { position: 'absolute', left: 0, top: 0, width: 600, flexDirection: 'row', alignItems: 'flex-start', opacity: 0 },
  // In a browser no ring of its own round the words: the bar's edge says it is being typed in (searchOn).
  searchInput: { ...typography.body, fontSize: 16, color: colors.text, minHeight: 40, paddingVertical: 9, paddingHorizontal: 0, backgroundColor: 'transparent', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  searchOn: { borderColor: colors.brand },
  searchClear: { paddingLeft: 2 },
  // The weather at the bar's end: a hairline, the sky, the temperature.
  searchWeather: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 },
  searchWeatherRule: { width: StyleSheet.hairlineWidth, height: 18, marginRight: 4, backgroundColor: colors.borderStrong },
  searchWeatherText: { ...typography.smallStrong, fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  // Zoomed out, the line under the chips that holds "Zoom in to see courts".
  noteLine: { flexDirection: 'row', paddingHorizontal: spacing.md },
  credit: { padding: 2, opacity: 0.7 },
  // The map's buttons riding on the players list (ListCrown): taps pass through around them, in a browser too (a compiled style).
  crownThrough: { pointerEvents: 'box-none' },
  creditWrap: { zIndex: 20 },
  creditCard: { position: 'absolute', bottom: 22, gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  creditText: { ...typography.caption, color: colors.textMuted, letterSpacing: 0 },
  zoom: { borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  zoomButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  zoomRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  // A card along the bottom: the list of players, or the one that was picked.
  // Flush on the bottom edge, a grabber line on top: a sheet, not a card floating on the map.
  // Its shadow spills below it too, but the strip under the tab bar lies over it (the full map
  // draws it after the card), so that spill never draws a grey band there (Oct 7).
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: -8 } },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.xs },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: 2 },
  // The players tray and its full list (Oct 9): the sheet's look with no padding of its own, its parts measured
  // out (listStops: LIST_HEAD_H for the head, the faces' row, LIST_ROW_H a row), so its two heights land where they should.
  listSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: -8 } },
  // Its handle and one line: 2 + 12 + 32 = LIST_HEAD_H. The whole strip takes the drag, up to the sheet's top edge.
  listHead: { paddingTop: 2, paddingHorizontal: spacing.lg },
  listGrabberHit: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: spacing.lg },
  listGrabber: { marginBottom: 0 },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  listTitle: { ...typography.heading, color: colors.text, flex: 1 },
  // "See all", beside ×: the brand's colour, the way a section's "See all" reads everywhere in the app.
  seeAll: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  seeAllText: { ...typography.smallStrong, color: colors.brand },
  // The tray's body: its height moves (listStops), the faces at its top and the full list filling it behind them.
  trayBody: { overflow: 'hidden' },
  trayStrip: { position: 'absolute', left: 0, right: 0, top: 0 },
  // The faces' row: the sheet's margin at either end, and a little room above for the open ring's breath.
  trayRow: { paddingHorizontal: TRAY_PAD, paddingTop: 6, paddingBottom: 6, gap: TRAY_GAP, alignItems: 'flex-start' },
  // One player: 6 + (64 + 13) + 2 + 16 + 3 + 19 + 2 + 14 + 6 = TRAY_BODY_H, the face's ring and its words.
  trayFace: { width: TRAY_ITEM_W, alignItems: 'center' },
  trayName: { ...typography.smallStrong, color: colors.text, marginTop: 2, maxWidth: TRAY_ITEM_W },
  trayLevel: { alignSelf: 'center', marginTop: 3 },
  trayMeta: { ...typography.caption, ...font('500'), letterSpacing: 0, color: colors.textMuted, marginTop: 2, maxWidth: TRAY_ITEM_W },
  // Not the one showing: no touches (a compiled style, so a browser keeps it too).
  noTouch: { pointerEvents: 'none' },
  // Under the head when nobody is listed: the reason in a line, or the nearest courts side by side.
  listEmpty: { paddingTop: 2, paddingBottom: spacing.md },
  emptyBox: { overflow: 'hidden' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: LIST_PAD_BOTTOM },
  // A contacts list's row: LIST_ROW_H tall (more only if the words are set larger), the face 47 across with its ring's room.
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: 6 },
  // The hairline between rows, from the names across (the face's 47 and the gap before the words).
  listRowRule: { position: 'absolute', top: 0, left: 47 + spacing.md, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  listRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listPressed: { opacity: PRESS_DIM },
  listWords: { flex: 1, gap: 2 },
  listName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  sheetTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },
  sheetEmpty: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  findLink: { ...font('600'), color: colors.brand },
  // The empty tray's nearest courts: one quiet line, then the courts side by side, each the search results' tile and words.
  emptyCourts: { paddingBottom: spacing.xs },
  emptyCourtsTitle: { ...typography.small, color: colors.textMuted, paddingBottom: 6, paddingHorizontal: spacing.lg },
  courtStrip: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  courtChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: 240, paddingLeft: 8, paddingRight: spacing.md, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  courtChipWords: { flexShrink: 1, gap: 1 },
  courtChipName: { ...typography.smallStrong, color: colors.text },
  // Why no players nearby show, and the tap that changes it (LockNote).
  lockBox: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  lockNote: { paddingBottom: spacing.xs },
  lockWords: { ...typography.small, color: colors.textMuted },
  lockAction: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 6 },
  lockActionText: { ...typography.smallStrong, color: colors.brand },
  // A face in the list: the open-to-hit ring's room kept either way (40 + 2 × 3.5 = 47), green when they are.
  listRing: { padding: 1.5, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  listRingOn: { borderColor: colors.open },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  personWords: { flex: 1, gap: 3 },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personName: { ...typography.heading, color: colors.text, flexShrink: 1 },
  personMeta: { ...typography.small, color: colors.textMuted },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  // The player card's close: level with the name (half its height above the name's middle).
  closeTop: { alignSelf: 'flex-start', marginTop: -5 },
  closePressed: { opacity: PRESS_DIM },
  // The player card's one row of actions: two pills, Follow, then ⋯.
  // Capped, so on a computer (where the card spans the whole map) the pills stay pill-sized
  // rather than stretching into bars; a phone never reaches the cap.
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm, paddingBottom: spacing.xs, width: '100%', maxWidth: 456 },
  // Each pill starts at its own words' width and the two share what is left equally, so Ask to hit
  // never squeezes to "Ask to h…" beside a shorter Message. Follow drawing in hands its room to them.
  cardSlot: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  cardPill: { height: CARD_ROUND, borderRadius: buttonShape.radius, ...buttonShape.curve, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: CARD_PILL_GAP, paddingHorizontal: CARD_PILL_PAD },
  cardPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  // The page's one shadow (DESIGN.md, Lift): the primary in its own colour; plain dark on a dark page.
  cardLift: { ...brandShadow },
  cardLiftDark: { ...brandShadow },
  cardSecondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  cardPrimaryText: { ...typography.smallStrong, fontSize: 14, color: colors.brandInk, flexShrink: 1 },
  cardSecondaryText: { ...typography.smallStrong, fontSize: 14, color: colors.text, flexShrink: 1 },
  cardRound: { width: CARD_ROUND, height: CARD_ROUND, borderRadius: CARD_ROUND / 2, borderWidth: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  // Hidden, for measuring the pills' words: a width of its own, so nothing squeezes them.
  cardMeasure: { position: 'absolute', right: 0, top: 0, width: 240, alignItems: 'flex-end', opacity: 0 },
  personActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: buttonShape.smallHeight, paddingHorizontal: 16, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.brand },
  primaryText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, color: colors.brandInk },
  secondary: { minHeight: buttonShape.smallHeight, paddingHorizontal: 16, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, color: colors.text },
  pillTight: { paddingHorizontal: 12 },
  pillIcon: { flexDirection: 'row', gap: 5 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  // Open to hit, on a player's card: the map's green, never the brand (New York's is yellow).
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.open },
  openText: { ...typography.smallStrong, color: colors.text },
  // Their distance, seen from farther away: quiet words under who they are, before what to do.
  farLine: { ...typography.small, color: colors.textMuted, lineHeight: 18, paddingHorizontal: spacing.lg },
  atCourt: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  // A face that may wear the open ring: the ring's room is kept either way, so nothing shifts when it comes on.
  faceSlot: { marginVertical: -4, marginHorizontal: -4 },
  openCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: 'transparent' },
  openTitle: { ...typography.bodyStrong, color: colors.text },
  openNote: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  noteOver: { position: 'absolute', left: 0, right: 0, top: 0 },
  courtDisc: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // Members only or someone's home: the same disc, greyed.
  courtDiscClosed: { backgroundColor: colors.surfaceAlt },
  // Played on this week: the stories' green ring around the disc, a gap of the card between.
  courtRing: { padding: 2, borderRadius: 28, borderWidth: 2.5, borderColor: colors.brand },
  courtTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg },
  // The card's middle (tags to hits), with the sheet's own spacing between its parts.
  courtMiddle: { gap: spacing.sm },
  courtBlock: { paddingHorizontal: spacing.lg },
  says: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  saysFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  saysFact: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 28, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  saysFactText: { ...typography.smallStrong, color: colors.text },
  saysPhotos: { gap: spacing.sm },
  saysPhoto: { width: 96, height: 72, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  saysQuote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  posted: { gap: spacing.sm, paddingBottom: spacing.md },
  postedHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg },
  postedTitle: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  postedAll: { ...typography.smallStrong, color: colors.brand },
  postedCount: { color: colors.textFaint },
  postedRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  // Upright, like the clips themselves, and a touch taller than the players' court photos above.
  postedThumb: { width: 66, height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  postedPressed: { opacity: PRESS_DIM },
  // Played here today: today's clip, the card's width, a still picture with its play mark (TodayClip).
  todayWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  todayClip: { height: 148, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  todayShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.16)' },
  todayTag: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 24, borderRadius: radius.pill, backgroundColor: colors.bg },
  // Its colour is the pins' played-today tone (playedTodayTone), set where it is drawn.
  todayDot: { width: 7, height: 7, borderRadius: 4 },
  todayTagText: { ...typography.smallStrong, fontSize: 12, color: colors.text },
  todayPlay: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  todayWho: { position: 'absolute', left: 12, right: 12, bottom: 9, ...typography.smallStrong, fontSize: 12, color: colors.onMedia, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  postedPlay: { position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  // The still card's overlay: the city named the way a map names it, with a soft halo of the page colour so it reads over roads.
  // In the middle of the card, where it always sat (Oct 6, owner: the Oct 5 move to the top was unasked).
  cityMark: { position: 'absolute', left: spacing.xl, right: spacing.xl, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10 },
  // Holds the words, each with its thin edge (labelEdge); nothing is drawn behind them.
  cityGlow: { alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 6 },
  cityName: { ...typography.title, fontSize: 26, letterSpacing: -0.4, color: colors.text },
  cityCount: { ...typography.smallStrong, color: colors.textMuted },
  cityCountOn: { color: colors.brand },
  cityHits: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  // The map search's courts, under the bar: the bar's own glass, one row per place.
  resultsWrap: { paddingHorizontal: spacing.md },
  results: { paddingHorizontal: spacing.md },
  swapGhost: { position: 'absolute', top: 0, left: 0, right: 0 },
  swapGhostFree: { position: 'absolute', top: 0, left: 0, width: 1000 },
  trayGhost: { overflow: 'hidden' },
  trayGhostRow: { flexDirection: 'row' },
  listTitleBox: { flex: 1 },
  flexNone: { flex: 0 },
  resultsEdge: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9 },
  resultTile: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  // A place in the map search's list: the court rows' tile, in the quiet surface colour, so places and courts read apart.
  placeTile: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  // "Looking for places…", "No places found", "Finding courts…": one quiet line.
  placeNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  placeNoteText: { ...typography.small, color: colors.textMuted },
  // The searched place's list: its disc (the courts' tile, larger), and the room for a note when there is nothing to list.
  placeDisc: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  placeEmpty: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  // A court card's open hits: one quiet line each, above its actions.
  hitRows: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 6 },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  hitTile: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  hitText: { ...typography.smallStrong, color: colors.text, flex: 1, minWidth: 0 },
  // "More open hits (2)" (COURT_CARD_MORE_HITS): a quieter last row, its words in line with the hits' above.
  hitMore: { backgroundColor: 'transparent', paddingVertical: 2 },
  hitMoreGap: { width: 28 },
  hitMoreText: { ...typography.smallStrong, color: colors.brand, flex: 1, minWidth: 0 },
  // The court card's hits as Community's boxes (COURT_CARD_HIT_BOXES): a row that swipes, the boxes stretched to one height.
  hitBoxes: { flexGrow: 0, paddingBottom: spacing.sm },
  hitBoxesRow: { gap: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'stretch' },
  // A browser has no snapToInterval: CSS scroll snapping does it, each box resting at the card's left margin.
  hitBoxesSnapWeb: { scrollSnapType: 'x mandatory', scrollPaddingLeft: spacing.lg } as object,
  hitBoxSnapWeb: { scrollSnapAlign: 'start' } as object,
  hitSheetCard: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  cityless: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: 4 },
  citylessDisc: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  citylessTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  citylessBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  citylessActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  previewBar: { position: 'absolute', left: 10, right: 30, bottom: 10, alignSelf: 'auto' },
  previewWeather: { position: 'absolute', left: 12, bottom: 12 },
  previewChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  // The full-pins card: weather and the city chip side by side along the foot (the credit keeps the corner on the right).
  previewChips: { position: 'absolute', left: 12, right: 36, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cityChip: { flexShrink: 1 },
  cityChipText: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  cityChipOn: { color: colors.brand },
  cityChipMuted: { color: colors.textMuted },
});
