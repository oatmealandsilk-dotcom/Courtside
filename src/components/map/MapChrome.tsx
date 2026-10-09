import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, interpolateColor, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { Avatar, BrandWash } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import { FollowShrink } from '@/components/FollowPill';
import { MenuSheet, type MenuSheetItem } from '@/components/MenuSheet';
import { afterMenu } from '@/lib/confirm';
import { TileCover } from '@/components/TileCover';
import { LevelPill } from '@/components/LevelPill';
import { Tappable } from '@/components/Tappable';
import * as haptics from '@/lib/haptics';
import { isClosedCourt, type Court, type CourtRow } from '@/features/players/courts';
import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import type { HitRequest } from '@/data/types';
import { joinedCount } from '@/features/hits/audience';
import { FORMAT_LABEL, hitShort } from '@/features/hits/format';
import { isMapCourtId, labelOf } from '@/features/places/courtName';
import { useCourtHits } from '@/features/places/useCourtHits';
import { directionsTo } from '@/features/players/openInMaps';
import { useApp } from '@/store/AppContext';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { formatMiles } from '@/features/players/geo';
import { relativeTime } from '@/lib/format';
import { hitsWithinLine, isOpenToHit, tillLabel } from '@/features/players/openToHit';
import { useOpenClock } from '@/features/players/useOpenClock';
import { LevelPill as Level } from '@/components/LevelPill';
import type { User } from '@/data/types';
import { countLabel } from '@/features/places/court';
import { CityHaze } from '@/components/map/CityHaze';
import { useCourtPosts } from '@/features/places/useCourtPosts';
import { openCourt, openCourtReel, playHere, postFromCourt, sendCourtToChat } from '@/features/players/courtLink';
import { Toggle } from '@/components/ui';
import type { MapFilter, Placed } from '@/features/players/mapModel';
import type { Weather } from '@/lib/weather';
import { colors, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';
import { agoLabel } from '@/components/map/markers';
import { MAP_CREDITS } from '@/components/map/credits';
import { AccessTag, CourtFactsLine, FollowHeart, NowTags, RegularsRow } from '@/components/place/CourtLife';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { sheetFling } from '@/components/map/sheetFling';
import { listHeadroom, useListStops, type ListRoom } from '@/components/map/listStops';
import { OpenRing } from '@/components/map/OpenRing';
import { mix } from '@/components/map/look';
import { notKnownAdult } from '@/features/players/age';
import { dismissHideTip, useHideTip, useHideTipText, visibilityLabel, type NearbyLock, type TipSpot } from '@/features/players/mapPrivacy';
import { formatSpotMiles } from '@/features/players/geo';
import type { MapVisibility } from '@/data/types';
import type { FoundPlace } from '@/features/places/geocode';
import type { PlaceSearch } from '@/features/places/usePlaceSearch';
import { plain } from '@/features/search/words';

// Kept here too, for the screens that already import it from the map's chrome.
export { CourtGlyph };

/*
 * Everything laid over the map that is not the map: the same on a phone and
 * in a browser, so the two canvases only draw tiles and pins.
 */

/**
 * Back, the search, and the location switch across the top. While the search
 * names courts (`results`), they list under it: a pick takes the map there
 * with the court's card up. Places come under them (a city, a neighbourhood,
 * an address, a park: `places`), a pick taking the map there with that
 * place's courts listed. Return picks a court or place named exactly what
 * was typed ("Raleigh" is the city, not The Raleigh Racquet Club), else the
 * top row. Players still filter the pins and the players list as before (`players`
 * says how many match, so "No places found" never hangs over a name that found someone).
 */
export function MapTopBar({ onBack, query, onQuery, locationOn, locating, onToggleLocation, results, onPickCourt, places, onPickPlace, players = 0, locationMenu = false }: { onBack?: () => void; query: string; onQuery: (next: string) => void; locationOn?: boolean; locating?: boolean; onToggleLocation?: () => void; results?: CourtRow[]; onPickCourt?: (c: Court) => void; /** The place search as you type (usePlaceSearch). */ places?: PlaceSearch; onPickPlace?: (p: FoundPlace) => void; /** Players whose names match what is typed. */ players?: number; /** With Location on, the button opens who can see you (and Location off) rather than switching off. */ locationMenu?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
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
  const submit = () => {
    const sameCourt = found.find((r) => plain(labelOf(r.c)) === key);
    const samePlace = placeRows.find((p) => plain(p.title) === key);
    if (sameCourt && onPickCourt) onPickCourt(sameCourt.c);
    else if (samePlace && onPickPlace) onPickPlace(samePlace);
    else if (found[0] && onPickCourt) onPickCourt(found[0].c);
    else if (placeRows[0] && onPickPlace) onPickPlace(placeRows[0]);
  };
  return (
    // Above the filter chips under it, so the location tip hangs over them.
    <View style={{ gap: spacing.sm, zIndex: 5 }}>
    <View style={styles.topRow}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.roundHit}>
          <Glass radius={21} style={styles.roundGlass}><Ionicons name="chevron-back" size={22} color={colors.text} /></Glass>
        </Pressable>
      ) : null}
      <Glass radius={21} style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          accessibilityLabel="Search players, courts, or a city, address or park"
          // Short enough not to be cut off on a phone; the label keeps the full wording.
          placeholder="Search a place or park"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={onQuery}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={submit}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </Glass>
      {onToggleLocation ? (
        <View>
          <TipPulse where="map" size={42} />
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? (locationMenu ? 'Location on. Who can see you' : 'Turn location off') : 'Turn location on'} onPress={onToggleLocation} style={[styles.round, locationOn && styles.roundOn]}>
            {locationOn ? <BrandWash /> : null}
            {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={18} color={locationOn ? colors.brandInk : colors.text} />}
          </Pressable>
          <HideTip where="map" style={{ top: 50, right: 0 }} />
        </View>
      ) : null}
    </View>
    {found.length || placeRows.length || placeNote || searching ? (
      <Animated.View entering={FadeIn.duration(140)} style={styles.resultsWrap}>
        <Glass radius={18} style={styles.results}>
          {found.map(({ c, miles }, i) => {
            const meta = [formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ');
            return (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${labelOf(c)}, ${meta}. Show on the map`} onPress={() => { haptics.tap(); onPickCourt?.(c); }} style={({ pressed }) => [styles.resultRow, i > 0 && styles.listRule, pressed && styles.listPressed]}>
                <View style={styles.resultTile}><CourtGlyph size={13} color={colors.brand} /></View>
                <View style={styles.listWords}>
                  <Text style={styles.listName} numberOfLines={1}>{labelOf(c)}</Text>
                  <Text style={styles.personMeta} numberOfLines={1}>{meta}</Text>
                </View>
              </Pressable>
            );
          })}
          {placeRows.map((p, i) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.title}${p.sub ? `, ${p.sub}` : ''}. Show its courts on the map`} onPress={() => { haptics.tap(); onPickPlace?.(p); }} style={({ pressed }) => [styles.resultRow, (found.length > 0 || i > 0) && styles.listRule, pressed && styles.listPressed]}>
              <View style={styles.placeTile}><Ionicons name={p.kind === 'area' ? 'map-outline' : 'location-outline'} size={15} color={colors.textMuted} /></View>
              <View style={styles.listWords}>
                <Text style={styles.listName} numberOfLines={1}>{p.title}</Text>
                {p.sub ? <Text style={styles.personMeta} numberOfLines={1}>{p.sub}</Text> : null}
              </View>
            </Pressable>
          ))}
          {searching ? (
            <View style={styles.placeNote}><ActivityIndicator size="small" color={colors.textFaint} /><Text style={styles.placeNoteText}>Looking for places…</Text></View>
          ) : placeNote ? (
            <View style={[styles.placeNote, found.length + placeRows.length > 0 ? styles.listRule : null]}>
              <Ionicons name={places?.failed ? 'cloud-offline-outline' : 'search-outline'} size={15} color={colors.textFaint} />
              <Text style={styles.placeNoteText}>{placeNote}</Text>
            </View>
          ) : null}
        </Glass>
      </Animated.View>
    ) : null}
    </View>
  );
}

const FILTERS: { key: MapFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  // Only the people you follow, named on their pins.
  { key: 'following', label: 'Following' },
  { key: 'open', label: 'Open to hit' },
  { key: 'near', label: 'Near me' },
  { key: 'level', label: 'My level' },
  { key: 'coaches', label: 'Coaches' },
];

/** Who to show, plus the courts layer, as one row of chips. */
export function FilterChips({ filter, onFilter, courtsOn, onCourts, courtsLoading }: { filter: MapFilter; onFilter: (next: MapFilter) => void; courtsOn: boolean; onCourts: () => void; courtsLoading: boolean }) {
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
  const pick = (key: MapFilter) => {
    if (key === active) return;
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
            <Text style={[styles.chipText, active === f.key && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
        {/* Courts is an on/off switch, not one of the choices: a hairline sets it apart, and it scrolls with the row so nothing is ever tucked behind it. */}
        <View style={styles.chipGap} />
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: courtsOn }} accessibilityLabel="Show courts" onPress={() => { haptics.tap(); onCourts(); }} style={[styles.chip, courtsOn && styles.chipOn]}>
          {courtsOn ? <BrandWash /> : null}
          {courtsLoading ? <ActivityIndicator size="small" color={courtsOn ? colors.brandInk : colors.text} /> : <CourtGlyph size={15} color={courtsOn ? colors.brandInk : colors.text} />}
          <Text style={[styles.chipText, courtsOn && styles.chipTextOn]}>Courts</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * Zoomed out past about a city, the court pins step aside (thousands of
 * them would say nothing at that size). This small note, under the chips,
 * says where they went. Not a button: the map under it still takes the
 * pinch and the drag.
 */
export function CourtsZoomNote() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} pointerEvents="none" style={styles.zoomNote}>
      <CourtGlyph size={12} color={colors.textMuted} />
      <Text style={styles.zoomNoteText}>Zoom in to see courts</Text>
    </Animated.View>
  );
}

export function WeatherChip({ weather }: { weather: Weather | null }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!weather) return null;
  return (
    <View pointerEvents="none" style={styles.weather}>
      <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={15} color={colors.text} />
      <Text style={styles.weatherText} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>{weather.tempF}°</Text>
    </View>
  );
}

/**
 * Back to me, and on a computer the zoom buttons a mouse needs; the map's
 * credits (ⓘ) at the other end of the row. `lead`, with nothing up over the
 * map, is the "All N players" pill (PlayersPill), at the row's start, the
 * credits just above it.
 */
export function MapButtons({ onRecentre, onZoomIn, onZoomOut, lead }: { onRecentre: () => void; onZoomIn?: () => void; onZoomOut?: () => void; lead?: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View pointerEvents="box-none" style={styles.buttonsRow}>
    {lead ? <View pointerEvents="box-none" style={styles.buttonsLead}><MapCredit />{lead}</View> : <MapCredit />}
    <View style={styles.buttons}>
      {onZoomIn && onZoomOut ? (
        <View style={styles.zoom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={onZoomIn} style={styles.zoomButton}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
          <View style={styles.zoomRule} />
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={onZoomOut} style={styles.zoomButton}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Back to me" onPress={onRecentre} style={styles.roundHit}>
        <Glass radius={21} style={styles.roundGlass}><Ionicons name="locate-outline" size={18} color={colors.brand} /></Glass>
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
        <Animated.View entering={FadeIn.duration(140)} style={[styles.creditCard, align === 'right' ? { right: 0 } : { left: 0 }]}>
          {MAP_CREDITS.map((c) => (
            <Pressable key={c.url} accessibilityRole="link" accessibilityLabel={c.label} hitSlop={4} onPress={() => { setOpen(false); void Linking.openURL(c.url); }}>
              <Text style={styles.creditText} numberOfLines={1}>{c.label}</Text>
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
 * carry the faces, and one small pill beside Back to me opens the list of
 * everyone (PlayersSheet), the city and its weather moving to a chip under
 * the filters (CityWeatherChip).
 */

/** What keeps players from you (nearbyLock), as the list says it: not with a name typed, or on Following, neither of which depends on it. */
const lockOf = (lock: NearbyLock | undefined, query: string, filter: MapFilter) => (lock && !query.trim() && filter !== 'following' ? lock : null);

/**
 * The list's one line: how many, and where ("10 players near Raleigh"). A
 * search or Following, which list everyone they find, say whose instead.
 * With nobody sharing nearby it counts the nearest courts it names (never
 * "0 players"); with nobody to list at all it says only where, the list
 * itself saying why (its words unchanged).
 */
function listTitle(items: Placed[], query: string, filter: MapFilter, courts: CourtRow[], cityName: string): string {
  const q = query.trim();
  const n = items.length;
  // "you" is the map's own stand-in for a town not named yet: "near you".
  const place = cityName || 'you';
  if (!n) return !q && filter === 'all' && courts.length ? `${courts.length} ${courts.length === 1 ? 'court' : 'courts'} near ${place}` : `Players near ${place}`;
  const who = n === 1 ? '1 player' : `${n} players`;
  if (q) return `${who} matching “${q}”`;
  if (filter === 'following') return `${who} you follow`;
  return `${who} near ${place}`;
}

/** With nobody to list, the pill's few words for why: the list's own reason, shortened. */
function emptyLine(query: string, filter: MapFilter, courts: CourtRow[], locked: NearbyLock): string {
  if (query.trim()) return `No players named “${query.trim()}”`;
  if (locked === 'location') return 'Turn on Location to see players';
  if (locked === 'hidden') return 'On Only me, players are hidden';
  if (filter === 'following') return 'Nobody you follow is sharing nearby';
  if (filter !== 'all') return 'Nobody nearby matches that';
  return courts.length ? `No one sharing yet · ${courts.length} ${courts.length === 1 ? 'court' : 'courts'} nearby` : 'No one sharing nearby yet';
}

/**
 * "All 11 players", beside Back to me: the full map's one way to its list.
 * With nobody to list it says why instead ("Turn on Location to see players",
 * "No one sharing yet · 3 courts nearby"), and still opens the list, which
 * says it in full with the tap that changes it. The reason goes without the
 * pill's ⌃, so it fits whole on a narrow phone (Android's common 360 points).
 */
export function PlayersPill({ items, query = '', filter = 'all', courts = [], lock = null, onOpen }: { items: Placed[]; query?: string; filter?: MapFilter; courts?: CourtRow[]; lock?: NearbyLock; onOpen: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const n = items.length;
  const words = n === 1 ? '1 player' : n ? `All ${n} players` : emptyLine(query, filter, courts, lockOf(lock, query, filter));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={n ? 'Show the full list' : 'Show players'} onPress={() => { haptics.tap(); onOpen(); }} style={({ pressed }) => [styles.pillLift, pressed && styles.listPressed]}>
      <Glass radius={21} style={styles.playersPill}>
        <Ionicons name={n ? 'people' : 'people-outline'} size={15} color={colors.brand} />
        <Text style={styles.playersPillText} numberOfLines={1}>{words}</Text>
        {n ? <Ionicons name="chevron-up" size={14} color={colors.textMuted} /> : null}
      </Glass>
    </Pressable>
  );
}

/** The city and what it's like to play there today, a small chip under the filters. Nothing to say (no town named yet, no weather), no chip. */
export function CityWeatherChip({ cityName, weather }: { cityName: string; weather?: Weather | null }) {
  const styles = useThemedStyles(styleDefinitions);
  // "you" is the list's own stand-in ("Around you") for a town not named yet: never a chip of its own.
  const city = cityName && cityName !== 'you' ? cityName : '';
  if (!city && !weather) return null;
  return (
    <View pointerEvents="none" style={styles.cityChipWrap}>
      <View style={styles.pillLift}>
        <Glass radius={15} style={styles.cityChip}>
          {city ? <Text style={styles.cityChipText} numberOfLines={1}>{city}</Text> : null}
          {city && weather ? <View style={styles.cityChipRule} /> : null}
          {weather ? (
            <>
              <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={13} color={colors.text} />
              <Text style={styles.cityChipText} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>{weather.tempF}°</Text>
            </>
          ) : null}
        </Glass>
      </View>
    </View>
  );
}

/**
 * Everyone around, nearest first: the list the pill opens, rising like a
 * card. Since Oct 8 (owner: "This show players pop up covers too much of the
 * screen") it is a compact list at two heights (listStops): it opens low,
 * three and a half rows with the map and its pins in view above, and a pull
 * up on its handle (or on a phone, on the list) raises it to tall, under the
 * search and the filters. One line on top says how many and where ("10
 * players near Raleigh"; the city chip under the filters already gives the
 * weather), and each row is a contacts list's: a face, the name and level,
 * how far and how long ago under it. The search and the chips filter it as
 * they do the pins; a row opens that player's card (and closing the card
 * comes back to the list, at the height it was). With nobody to list it says
 * why, with the tap that changes it, or names the nearest courts. × (or a
 * pull down past its peek) closes it, back to the bare map.
 */
export function PlayersSheet({ items, cityName, onSelect, query = '', filter = 'all', courts = [], onPickCourt, lock = null, onUnlock, onClose, openTall = false, onTall, room }: { items: Placed[]; cityName: string; onSelect: (id: string) => void; /** What is typed in the search, which the players are filtered by. */ query?: string; /** Which chip is on, so an empty list says why. */ filter?: MapFilter; /** With nobody sharing nearby, the nearest few places anyone may play, to tap. */ courts?: CourtRow[]; onPickCourt?: (id: string) => void; /** What keeps "Players nearby" from you (nearbyLock): an empty list says so, not that nobody is there. */ lock?: NearbyLock; /** The one tap that lifts it: Location on, or who can see you. */ onUnlock?: () => void; onClose: () => void; /** Opens at its tall height (it was tall when a row opened a player's card). */ openTall?: boolean; /** Which height it is going to (tall, or the peek), each time that changes. */ onTall?: (tall: boolean) => void; /** Where the list may reach (the map's height, the foot of the filters, the strip under the home indicator). */ room?: ListRoom }) {
  const styles = useThemedStyles(styleDefinitions);
  const { height: windowH } = useWindowDimensions();
  const stops = useListStops({ rows: items.length, room, windowH, openTall, onTall, onClose });
  // Since migration 98 you share to see: with Location off or on Only me the
  // server sends only your friends, so an empty list says how to see the
  // players near you instead of "No one sharing nearby yet".
  const locked = lockOf(lock, query, filter);
  const grabber = <View style={[styles.grabber, styles.listGrabber]} />;
  const list = items.length ? (
    <Animated.ScrollView
      ref={stops.listRef}
      style={[styles.listScroll, stops.listStyle]}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      bounces={false}
      scrollEnabled={stops.scrollEnabled}
      onScroll={stops.onScroll}
      onContentSizeChange={stops.onContentSizeChange}
    >
      {items.map((p, i) => (
        <Pressable key={p.user.id} accessibilityRole="button" accessibilityLabel={`${p.user.name}, ${formatSpotMiles(p.miles, p.rough)}`} onPress={() => onSelect(p.user.id)} style={({ pressed }) => [styles.listRow, pressed && styles.listPressed]}>
          {/* A hairline between rows, from the names across, the way a contacts list draws it. */}
          {i > 0 ? <View pointerEvents="none" style={styles.listRowRule} /> : null}
          <View style={[styles.listRing, isOpenToHit(p.user) && styles.listRingOn]}><Avatar name={p.user.name} seed={p.user.avatarSeed} size={40} ring={p.user.isCoach} /></View>
          <View style={styles.listWords}>
            <View style={styles.personTop}>
              <Text style={styles.listName} numberOfLines={1}>{p.user.name}</Text>
              <LevelPill profile={p.user.profile} small />
            </View>
            <Text style={styles.personMeta} numberOfLines={1}>{[formatSpotMiles(p.miles, p.rough), p.seenAt ? agoLabel(p.seenAt) : null, isOpenToHit(p.user) ? 'open to hit' : null].filter(Boolean).join(' · ')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      ))}
    </Animated.ScrollView>
  ) : null;
  return (
    <Animated.View style={[styles.listSheet, stops.sheetStyle]}>
      {/* The handle and the title: a drag up raises the list, a drag down lowers it and then closes it. */}
      <GestureDetector gesture={stops.headGesture}>
        <View style={styles.listHead}>
          {stops.canTall ? (
            <Pressable accessibilityRole="button" accessibilityLabel={stops.up ? 'Make the list shorter' : 'Make the list taller'} hitSlop={8} onPress={() => { haptics.tap(); stops.toggle(); }} style={styles.listGrabberHit}>{grabber}</Pressable>
          ) : (
            <View style={styles.listGrabberHit}>{grabber}</View>
          )}
          <View style={styles.listTitleRow}>
            <Text accessibilityRole="header" style={styles.listTitle} numberOfLines={1}>{listTitle(items, query, filter, courts, cityName)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
              <Ionicons name="close" size={17} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
      {list ? (
        stops.listGesture ? <GestureDetector gesture={stops.listGesture}>{list}</GestureDetector> : list
      ) : (
        <View style={styles.listEmpty}>
          {locked && (filter !== 'all' || !courts.length) ? (
            <View style={styles.lockBox}>
              <LockNote lock={locked} onUnlock={onUnlock} />
            </View>
          ) : query.trim() || filter !== 'all' || !courts.length ? (
            // With a name typed, say only that no player has it: a court's name finds the court, and the players are still there.
            <Text style={styles.sheetEmpty}>
              {query.trim() ? `No players named “${query.trim()}”`
                : filter === 'following' ? 'Nobody you follow is sharing their spot nearby.'
                  : filter !== 'all' ? 'Nobody nearby matches that.'
                    : 'No one sharing nearby yet. Tap a court to see what’s played there.'}
            </Text>
          ) : (
            // Nobody sharing yet: the nearest places to play instead of an empty list, each a tap from its card.
            <View style={styles.emptyCourts}>
              {locked ? <LockNote lock={locked} onUnlock={onUnlock} /> : null}
              <Text style={styles.emptyCourtsTitle}>{locked ? 'The nearest courts:' : 'No one sharing nearby yet. The nearest courts:'}</Text>
              {courts.map(({ c, miles }, i) => (
                <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.name}, ${formatMiles(miles)}. Show on the map`} onPress={() => { haptics.tap(); onPickCourt?.(c.id); }} style={({ pressed }) => [styles.resultRow, i > 0 && styles.listRule, pressed && styles.listPressed]}>
                  <View style={styles.resultTile}><CourtGlyph size={13} color={colors.brand} /></View>
                  <View style={styles.listWords}>
                    {/* The court's own name; an unnamed one (only listed when a town has no named court) says just "Tennis courts", never "public". */}
                    <Text style={styles.listName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.personMeta} numberOfLines={1}>{[formatMiles(miles), c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

/**
 * The map's buttons (Back to me, the zoom, the credits) riding on the
 * players list. As the list is pulled up and the map left above it runs
 * short (listHeadroom) they fade out, and once they would no longer fit
 * under the filters they are gone, taking no taps, so nothing ever lies over
 * the list or the filters; pulled back down, they fade back in. A short list
 * that rises only a little keeps them.
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
  const look = useAnimatedStyle(() => ({ opacity: tall.value > 0 ? Math.max(0, Math.min(1, (listHeadroom.value - tall.value) / 60)) : 1 }));
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
          <Text style={styles.lockActionText}>{action}</Text>
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
function useDragToClose(onClose: () => void) {
  const y = useSharedValue(0);
  const gesture = Gesture.Pan()
    .activeOffsetY(8)
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
        <Text style={styles.personName}>Where do you play?</Text>
        <Text style={styles.openNote}>Turn on location or add your city, and the map shows the players and courts near you.</Text>
      </View>
      <View style={[styles.personActions, { marginTop: spacing.xs }]}>
        <Pressable accessibilityRole="button" onPress={onLocation} disabled={locating} style={styles.primary}>
          <BrandWash />
          {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name="navigate" size={16} color={colors.brandInk} />}
          <Text style={styles.primaryText}>Use my location</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/edit-profile')} style={styles.secondary}>
          <Text style={styles.secondaryText}>Add my city</Text>
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
            <Text style={styles.personName} numberOfLines={1}>{user.name}</Text>
            <LevelPill profile={user.profile} small />
          </View>
          {/* At a court right now (migration 63): which one, first; otherwise the town, and how far (never finer than the pin is). */}
          {/* "Follows you" joins whichever line is short: this one at a court (no town on it, and the
              court's name below needs its room), the "Active" line otherwise. */}
          <Text style={styles.personMeta} numberOfLines={1}>{[`@${user.handle}`, court ? null : seenCity || user.location || null, formatSpotMiles(miles, rough), court && followsYou ? 'Follows you' : null].filter(Boolean).join(' · ')}</Text>
          {court ? <View style={styles.openRow}><CourtGlyph size={13} color={colors.court} /><Text style={styles.atCourt} numberOfLines={1}>At {court.name}{seenAt ? ` · ${agoLabel(seenAt)}` : ''}</Text></View>
            : seenAt || followsYou ? <Text style={styles.personMeta} numberOfLines={1}>{[seenAt ? activeLabel(seenAt) : null, followsYou ? 'Follows you' : null].filter(Boolean).join(' · ')}</Text> : null}
          {isOpenToHit(user) ? <View style={styles.openRow}><View style={styles.openDot} /><Text style={styles.openText}>{till ? `Open to hit ${till}` : 'Open to hit today'}</Text></View> : null}
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
              <BrandWash />
              <HitGlyph size={CARD_PILL_ICON} color={colors.brandInk} />
              <Text style={styles.cardPrimaryText} numberOfLines={1}>{primaryLabel}</Text>
            </Tappable>
          ) : (
            <Tappable accessibilityLabel={`Message ${user.name}`} onPress={onMessage} scaleTo={0.97} hoverTo={1.02} style={[styles.cardPill, styles.cardPrimary, pageIsDark() ? styles.cardLiftDark : styles.cardLift]}>
              <BrandWash />
              <Ionicons name="paper-plane-outline" size={CARD_PILL_ICON} color={colors.brandInk} />
              <Text style={styles.cardPrimaryText} numberOfLines={1}>{primaryLabel}</Text>
            </Tappable>
          )}
        </View>
        <View style={styles.cardSlot}>
          {onAskToHit ? (
            <Tappable accessibilityLabel={`Message ${user.name}`} onPress={onMessage} scaleTo={0.97} hoverTo={1.02} style={[styles.cardPill, styles.cardSecondary]}>
              <Text style={styles.cardSecondaryText} numberOfLines={1}>{secondaryLabel}</Text>
            </Tappable>
          ) : (
            <Tappable accessibilityRole="link" accessibilityLabel="Open profile" onPress={onProfile} scaleTo={0.97} hoverTo={1.02} style={[styles.cardPill, styles.cardSecondary]}>
              <Text style={styles.cardSecondaryText} numberOfLines={1}>{secondaryLabel}</Text>
            </Tappable>
          )}
        </View>
        <FollowShrink following={following} userId={user.id} onPress={onFollow} name={first} followsYou={followsYou} size={CARD_ROUND} room={followRoom} />
        <Tappable accessibilityLabel={`More for ${user.name}`} onPress={() => setMenuOpen(true)} scaleTo={0.94} style={styles.cardRound}>
          <Ionicons name="ellipsis-horizontal" size={19} color={colors.text} />
        </Tappable>
        {/* The pills' words at their natural width, never seen or read out (see followRoom). */}
        <View pointerEvents="none" style={styles.cardMeasure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <Text style={styles.cardPrimaryText} numberOfLines={1} onLayout={measured('primary')}>{primaryLabel}</Text>
          <Text style={styles.cardSecondaryText} numberOfLines={1} onLayout={measured('secondary')}>{secondaryLabel}</Text>
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
  const ringNote = seenBy === 'none' || (teen && seenBy == null)
    ? 'Only you see your ring on the map.'
    : teen || seenBy === 'mutuals' ? `Friends who follow you back see your green ring ${till}.` : `Players nearby see your green ring ${till}.`;
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
            <Text style={styles.personName} numberOfLines={1}>You</Text>
            <Level profile={me.profile} small />
          </View>
          <Text style={styles.personMeta} numberOfLines={1}>@{me.handle}{me.location ? ` · ${me.location}` : ''}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <Animated.View style={[styles.openCard, box]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.openTitle}>Open to hit today</Text>
          {/* Both sentences hold the same place (the longer one keeps the room), so the card never changes height as they hand over. */}
          <View>
            <Animated.Text style={[styles.openNote, noteOn]} aria-hidden={!open} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>{ringNote}</Animated.Text>
            <Animated.Text style={[styles.openNote, styles.noteOver, noteOff]} aria-hidden={open} accessibilityElementsHidden={open} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}>Wear a green ring on the map until midnight.</Animated.Text>
          </View>
        </View>
        {/* Green like the ring it puts on, not the court's colour: the one switch in the app that is (see DESIGN.md, Open Green). */}
        <Toggle value={open} onChange={onToggle} haptic tint={colors.open} accessibilityLabel="Open to hit today" />
      </Animated.View>
      {onSeenBy ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Who can see you: ${visibilityLabel(seenBy, teen)}. Change`} onPress={onSeenBy} style={({ pressed }) => [styles.seenRow, pressed && styles.listPressed]}>
          <Ionicons name={seenBy === 'none' || (teen && seenBy == null) ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
          <Text style={styles.seenLabel}>Who can see you</Text>
          <Text style={styles.seenValue} numberOfLines={1}>{visibilityLabel(seenBy, teen)}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
        </Pressable>
      ) : null}
      <View style={styles.personActions}>
        <Pressable accessibilityRole="link" accessibilityLabel="Your profile" onPress={onProfile} style={styles.secondary}>
          <Text style={styles.secondaryText}>Your profile</Text>
        </Pressable>
      </View>
    </Animated.View>
    </GestureDetector>
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
export function CourtSheet({ court, miles, ringed = false, onClose }: { court: Court; miles: number; /** Played on this week: the disc wears the story ring. */ ringed?: boolean; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
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
  const meta = [formatMiles(miles), court.count > 1 ? `${court.count} courts` : '1 court', court.surface ? court.surface.replace(/_/g, ' ') : null, court.lit && !playersOnLights ? 'lit at night' : null].filter(Boolean).join(' · ');
  // Clips and photos people tagged here: the best proof a court gets played on.
  // The same posts, in the same order, as the court's own page and its reel.
  const place = useMemo(() => ({ id: mapCourt ? court.id : undefined, name: court.name, lat: court.lat, lng: court.lng }), [mapCourt, court.id, court.name, court.lat, court.lng]);
  const { posts: here, more } = useCourtPosts(place);
  const strip = here.filter((p) => p.thumbnailUrl || p.imageUrl).slice(0, 12);
  // Open hits here, the same ones the court's page lists: one beside the clips, two without them.
  const hits = useCourtHits(place).slice(0, strip.length ? 1 : 2);
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
          <Text style={styles.personName} numberOfLines={2}>{court.name}</Text>
          <Text style={styles.personMeta} numberOfLines={1}>{meta}</Text>
        </Pressable>
        {/* The heart and Send sit beside Close, the way a maps app's place card puts Save and Share there. */}
        {extras ? <FollowHeart court={{ id: court.id, name: court.name, lat: court.lat, lng: court.lng, access }} style={styles.close} size={16} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Send ${court.name} to a chat`} hitSlop={8} onPress={() => sendCourtToChat(place)} style={styles.close}>
          <Ionicons name="paper-plane-outline" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <GHScrollView style={{ maxHeight: middleMax, flexGrow: 0 }} contentContainerStyle={styles.courtMiddle} showsVerticalScrollIndicator={false} bounces={false}>
      {showTags ? (
        <View style={styles.courtTags}>
          <AccessTag access={access} bookUrl={bookUrl} />
          {extras ? <NowTags courtId={court.id} name={court.name} access={access} /> : null}
        </View>
      ) : null}
      {extras ? <View style={styles.courtBlock}><CourtFactsLine courtId={court.id} name={court.name} note={false} lines={1} /></View> : null}
      {extras ? <View style={styles.courtBlock}><RegularsRow court={{ id: court.id, name: court.name, lat: court.lat, lng: court.lng }} closed={closed} /></View> : null}
      {here.length ? (
        <View style={styles.posted}>
          <View style={styles.postedHead}>
            <Text style={styles.postedTitle}>Played here <Text style={styles.postedCount}>· {countLabel(here, more)}</Text></Text>
            <Pressable accessibilityRole="link" accessibilityLabel={`See all posts from ${court.name}`} hitSlop={8} onPress={() => openCourt(place)} style={({ pressed }) => pressed && styles.postedPressed}>
              <Text style={styles.postedAll}>See all</Text>
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
      {hits.length ? (
        <View style={styles.hitRows}>
          {hits.map((h) => (
            <Pressable key={h.id} accessibilityRole="link" accessibilityLabel={`Open hit: ${hitLine(h)}`} onPress={() => router.push(`/hit-request/${h.id}`)} style={({ pressed }) => [styles.hitRow, pressed && styles.postedPressed]}>
              <View style={styles.hitTile}><HitGlyph size={18} color={colors.brand} /></View>
              <Text style={styles.hitText} numberOfLines={1}>{hitLine(h)}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      ) : null}
      </GHScrollView>
      <View style={styles.personActions}>
        {/* Three pills, a little tighter than the player card's, so they fit a 320pt phone. */}
        <Pressable accessibilityRole="link" accessibilityLabel="Directions" onPress={() => directionsTo(court)} style={[styles.primary, styles.pillTight]}>
          <BrandWash />
          <Ionicons name="navigate-outline" size={16} color={colors.brandInk} />
          <Text style={styles.primaryText}>Directions</Text>
        </Pressable>
        {closed ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Post a hit at ${court.name}`} onPress={() => playHere(place)} style={[styles.secondary, styles.pillTight]}>
            <Text style={styles.secondaryText}>Play here</Text>
          </Pressable>
        )}
        {mapCourt ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Post a photo or clip from ${court.name}`} onPress={() => postFromCourt({ id: court.id, name: court.name, lat: court.lat, lng: court.lng })} style={[styles.secondary, styles.pillTight, styles.pillIcon]}>
            <Ionicons name="videocam-outline" size={15} color={colors.text} />
            <Text style={styles.secondaryText}>Post</Text>
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
          <Text accessibilityRole="header" style={styles.personName} numberOfLines={1}>{title}</Text>
          <Text style={styles.personMeta} numberOfLines={1}>{rows.length ? `${rows.length} ${rows.length === 1 ? 'place' : 'places'} · ${how}` : place.sub || how}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
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
                  <Text style={styles.listName} numberOfLines={1}>{labelOf(c)}</Text>
                  <Text style={styles.personMeta} numberOfLines={2}>{meta}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
              </Pressable>
            );
          })}
        </GHScrollView>
      ) : (
        <View style={styles.placeEmpty}>
          {loading ? (
            <View style={styles.placeNote}><ActivityIndicator size="small" color={colors.textFaint} /><Text style={styles.placeNoteText}>Finding courts…</Text></View>
          ) : failed ? (
            <>
              <Text style={styles.openNote}>Couldn’t load the courts here. Check your connection.</Text>
              <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={6} style={styles.lockAction}>
                <Ionicons name="refresh" size={14} color={colors.brand} />
                <Text style={styles.lockActionText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.openNote}>No courts on the map here yet.</Text>
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
        <Text style={styles.sheetTitle}>Open hit</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.hitSheetCard}><HitCard hit={hit} miles={miles} /></View>
    </Animated.View>
    </GestureDetector>
  );
}

/**
 * What sits on the still card in the Find Players tab: your city's name in
 * the middle of its own map, the way Snapchat's map names where you are, with
 * who is around under it; a round location switch, and the weather. Nothing
 * says "open" — a map is plainly a thing you tap. (Oct 5 moved the name to
 * the top; Oct 6 the owner wanted it back in the middle, as it always was.)
 */
export function PreviewOverlay({ cityName, count, placeCount = 0, hitCount = 0, weather, locationOn, locating, onToggleLocation, lock = null, inviting = false }: { cityName: string; count: number; /** Places to play in town (one per park, not single courts). */ placeCount?: number; /** Open hits in town. */ hitCount?: number; weather: Weather | null; locationOn?: boolean; locating?: boolean; onToggleLocation?: () => void; /** What keeps "Players nearby" from you (nearbyLock). */ lock?: NearbyLock; /** The "You're early" card sits right under this one, asking for the first players already. */ inviting?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  // A teen sees only friends who follow each other with them (migration 78),
  // so for anyone not known to be an adult an empty map says nothing about
  // the town: no "be the first" for them.
  const { currentUser } = useApp();
  const adult = !!currentUser && !notKnownAdult(currentUser);
  // Since migration 98 you share to see: with Location off or on Only me
  // only your friends come back, so an empty map says how to see the
  // players here, never "Be the first player on the map".
  const hint = lock === 'location' ? 'Turn on Location to see players' : lock === 'hidden' ? 'On Only me, players nearby are hidden' : null;
  // Players first; with none sharing yet, the courts still say the map is worth opening.
  const line = count === 1 ? '1 player around' : count ? `${count} players around`
    : placeCount ? `${placeCount}${placeCount >= 30 ? '+' : ''} ${placeCount === 1 ? 'place' : 'places'} to play nearby`
      : hint ?? 'No one here yet';
  return (
    <>
      {/* The city's name is the top layer, so a player's ring or a court never
          sits over the words however busy the middle of town gets. Behind the
          words, a soft haze of the page colour that fades to nothing on every
          side (CityHaze), so the name reads over roads and pins. */}
      <View pointerEvents="none" style={styles.cityMark}>
        <View style={styles.cityGlow}>
          <CityHaze />
          <Text style={styles.cityName} numberOfLines={1}>{cityName}</Text>
          <Text style={[styles.cityCount, (count > 0 || placeCount > 0) && styles.cityCountOn]}>{line}</Text>
          {hitCount ? <Text style={styles.cityHits}>{hitCount === 1 ? '1 open hit nearby' : `${hitCount} open hits nearby`}</Text>
            // Nobody to show, but courts to play on: how to see the players here, or (sharing already) a next step, not an empty town.
            : !count && placeCount && hint ? <Text style={styles.cityHits}>{hint}</Text>
              // Not with the "You're early" card under the map: that card is the one ask for this moment.
              : !count && placeCount && adult && !inviting ? <Text style={styles.cityHits}>Be the first player on the map</Text> : null}
        </View>
      </View>
      {onToggleLocation ? (
        <>
          <View pointerEvents="none" style={styles.previewPulse}><TipPulse where="card" size={32} /></View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? 'Turn location off' : 'Turn location on'} hitSlop={6} onPress={onToggleLocation} style={[styles.previewSwitch, locationOn && styles.roundOn]}>
            {locationOn ? <BrandWash /> : null}
            {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={15} color={locationOn ? colors.brandInk : colors.text} />}
          </Pressable>
          <HideTip where="card" style={{ top: 52, right: 8 }} />
        </>
      ) : null}
      {weather ? (
        <View pointerEvents="none" style={styles.previewWeather}>
          <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={13} color={colors.text} />
          <Text style={styles.weatherText} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>{weather.tempF}°</Text>
        </View>
      ) : null}
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
      <Text style={styles.citylessTitle}>Where do you play?</Text>
      <Text style={styles.citylessBody}>Add your city to see the players near you.</Text>
      <View style={styles.citylessActions}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/edit-profile')} style={styles.primary}>
          <BrandWash />
          <Text style={styles.primaryText}>Add my city</Text>
        </Pressable>
        {onOpenMap ? (
          <Pressable accessibilityRole="button" onPress={onOpenMap} style={styles.secondary}>
            <Text style={styles.secondaryText}>Open the map</Text>
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
        <Text style={styles.tipText}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

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
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  roundOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  search: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  roundHit: { width: 42, height: 42, borderRadius: 21, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  roundGlass: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  // Sized by its padding, not squeezed to none in a fixed-height pill (that drew the words low and cut off on an iPhone).
  searchInput: { flex: 1, ...typography.body, fontSize: 16, color: colors.text, minHeight: 40, paddingVertical: 9 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md, paddingVertical: spacing.sm },
  chipsWrap: { flexGrow: 0, flexShrink: 1 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md },
  chipGap: { width: StyleSheet.hairlineWidth, height: 18, marginHorizontal: 4, backgroundColor: colors.borderStrong },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  // Once measured, the chips go clear-backed at their own spots and the sliding pill carries the fill.
  chipClear: { backgroundColor: 'transparent', borderColor: colors.border },
  chipPlate: { position: 'absolute', top: 0, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface },
  chipPill: { position: 'absolute', left: 0, top: 0, height: 32, borderRadius: radius.pill, backgroundColor: colors.brand },
  chipText: { ...typography.smallStrong, color: colors.text },
  chipTextOn: { color: colors.brandInk },
  // "Zoom in to see courts": a quiet pill under the chips, never in the way.
  zoomNote: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
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
  playersPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 42, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  playersPillText: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  // The city and its weather under the chips: quieter and smaller than they are.
  cityChipWrap: { paddingHorizontal: spacing.md, paddingTop: 2, alignItems: 'flex-start' },
  cityChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  cityChipText: { ...typography.smallStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  cityChipRule: { width: StyleSheet.hairlineWidth, height: 14, marginHorizontal: 3, backgroundColor: colors.borderStrong },
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
  // The players list (Oct 8, compact): the sheet's look with no padding of its own, its parts measured out
  // (listStops: LIST_HEAD_H for the head, LIST_ROW_H a row), so its two heights land where they should.
  listSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: -8 } },
  // Its handle and one line: 4 + 12 + 32 + 4 = LIST_HEAD_H. The whole strip takes the drag, up to the sheet's top edge.
  listHead: { paddingTop: 4, paddingBottom: 4, paddingHorizontal: spacing.lg },
  listGrabberHit: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: spacing.lg },
  listGrabber: { marginBottom: 0 },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  listTitle: { ...typography.heading, color: colors.text, flex: 1 },
  listScroll: { flexGrow: 0 },
  // Under the head when nobody is listed: the reason, or the nearest courts.
  listEmpty: { paddingTop: 2, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  // A contacts list's row: LIST_ROW_H tall (more only if the words are set larger), the face 47 across with its ring's room.
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: 6 },
  // The hairline between rows, from the names across (the face's 47 and the gap before the words).
  listRowRule: { position: 'absolute', top: 0, left: 47 + spacing.md, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  listRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listPressed: { opacity: 0.7 },
  listWords: { flex: 1, gap: 2 },
  listName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  sheetTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },
  sheetEmpty: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  // The empty players list's nearest courts: the search results' rows, under one quiet line.
  emptyCourts: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  emptyCourtsTitle: { ...typography.small, color: colors.textMuted, paddingBottom: 2 },
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
  closePressed: { opacity: 0.6 },
  // The player card's one row of actions: two pills, Follow, then ⋯.
  // Capped, so on a computer (where the card spans the whole map) the pills stay pill-sized
  // rather than stretching into bars; a phone never reaches the cap.
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm, paddingBottom: spacing.xs, width: '100%', maxWidth: 456 },
  // Each pill starts at its own words' width and the two share what is left equally, so Ask to hit
  // never squeezes to "Ask to h…" beside a shorter Message. Follow drawing in hands its room to them.
  cardSlot: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  cardPill: { height: CARD_ROUND, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: CARD_PILL_GAP, paddingHorizontal: CARD_PILL_PAD },
  cardPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  // The page's one shadow (DESIGN.md, Lift): the primary in its own colour; plain dark on a dark page.
  cardLift: { shadowColor: colors.brand, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  cardLiftDark: { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  cardSecondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  cardPrimaryText: { ...typography.smallStrong, fontSize: 14, color: colors.brandInk, flexShrink: 1 },
  cardSecondaryText: { ...typography.smallStrong, fontSize: 14, color: colors.text, flexShrink: 1 },
  cardRound: { width: CARD_ROUND, height: CARD_ROUND, borderRadius: CARD_ROUND / 2, borderWidth: 1, backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  // Hidden, for measuring the pills' words: a width of its own, so nothing squeezes them.
  cardMeasure: { position: 'absolute', right: 0, top: 0, width: 240, alignItems: 'flex-end', opacity: 0 },
  personActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryText: { ...typography.smallStrong, color: colors.brandInk },
  secondary: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.smallStrong, color: colors.text },
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
  saysFact: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
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
  postedPressed: { opacity: 0.85 },
  postedPlay: { position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  // The still card's overlay: the city named the way a map names it, with a soft halo of the page colour so it reads over roads.
  // In the middle of the card, where it always sat (Oct 6, owner: the Oct 5 move to the top was unasked).
  cityMark: { position: 'absolute', left: spacing.xl, right: spacing.xl, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10 },
  // Holds the words and their haze (CityHaze, drawn behind them). Oct 2, William: "more of a
  // rectangle with like a shadow fade" but "it shouldn't be clear that it is a rectangle".
  cityGlow: { alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 6 },
  cityName: { ...typography.title, fontSize: 26, letterSpacing: -0.6, color: colors.text, textShadowColor: colors.bg, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  cityCount: { ...typography.smallStrong, color: colors.textMuted, textShadowColor: colors.bg, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  cityCountOn: { color: colors.brand },
  cityHits: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, textShadowColor: colors.bg, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  // The map search's courts, under the bar: the bar's own glass, one row per place.
  resultsWrap: { paddingHorizontal: spacing.md },
  results: { paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
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
  hitSheetCard: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  cityless: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: 4 },
  citylessDisc: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  citylessTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  citylessBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  citylessActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  previewSwitch: { position: 'absolute', right: 12, top: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  previewWeather: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
