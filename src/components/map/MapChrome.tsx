import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, interpolateColor, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { Avatar, BrandWash } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import { FollowPill } from '@/components/FollowPill';
import { TileCover } from '@/components/TileCover';
import { LevelPill } from '@/components/LevelPill';
import { Tappable } from '@/components/Tappable';
import * as haptics from '@/lib/haptics';
import { isClosedCourt, type Court, type CourtRow } from '@/features/players/courts';
import { HitCard } from '@/components/HitCard';
import { HitGlyph } from '@/components/HitGlyph';
import type { HitRequest } from '@/data/types';
import { FORMAT_LABEL, hitShort } from '@/features/hits/format';
import { isMapCourtId, labelOf } from '@/features/places/courtName';
import { useCourtHits } from '@/features/places/useCourtHits';
import { directionsTo } from '@/features/players/openInMaps';
import { useApp } from '@/store/AppContext';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { formatMiles } from '@/features/players/geo';
import { relativeTime } from '@/lib/format';
import { isOpenToHit } from '@/features/players/openToHit';
import { LevelPill as Level } from '@/components/LevelPill';
import type { User } from '@/data/types';
import { countLabel } from '@/features/places/court';
import { CityHaze } from '@/components/map/CityHaze';
import { useCourtPosts } from '@/features/places/useCourtPosts';
import { openCourt, openCourtReel, playHere, postFromCourt, sendCourtToChat } from '@/features/players/courtLink';
import { Toggle } from '@/components/ui';
import type { MapFilter, Placed } from '@/features/players/mapModel';
import type { Weather } from '@/lib/weather';
import { colors, radius, spacing, typography, withAlpha } from '@/theme';
import { agoLabel, agoShort } from '@/components/map/markers';
import { MAP_CREDITS } from '@/components/map/credits';
import { AccessTag, CourtFactsLine, FollowHeart, NowTags, RegularsRow } from '@/components/place/CourtLife';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { sheetFling } from '@/components/map/sheetFling';
import { OpenRing } from '@/components/map/OpenRing';
import { mix } from '@/components/map/look';
import { notKnownAdult } from '@/features/players/age';
import { dismissHideTip, useHideTip, useHideTipText, visibilityLabel, type TipSpot } from '@/features/players/mapPrivacy';
import { formatSpotMiles } from '@/features/players/geo';
import type { MapVisibility } from '@/data/types';

// Kept here too, for the screens that already import it from the map's chrome.
export { CourtGlyph };

/*
 * Everything laid over the map that is not the map: the same on a phone and
 * in a browser, so the two canvases only draw tiles and pins.
 */

/**
 * Back, the search, and the location switch across the top. While the search
 * names courts (`results`), they list under it: a pick takes the map there
 * with the court's card up.
 */
export function MapTopBar({ onBack, query, onQuery, locationOn, locating, onToggleLocation, results, onPickCourt, locationMenu = false }: { onBack?: () => void; query: string; onQuery: (next: string) => void; locationOn?: boolean; locating?: boolean; onToggleLocation?: () => void; results?: CourtRow[]; onPickCourt?: (c: Court) => void; /** With Location on, the button opens who can see you (and Location off) rather than switching off. */ locationMenu?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const found = onPickCourt && query.trim() ? (results ?? []).slice(0, 5) : [];
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
          accessibilityLabel="Search players, courts or places"
          placeholder="Players, courts or places"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={onQuery}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={() => { if (found[0] && onPickCourt) onPickCourt(found[0].c); }}
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
    {found.length ? (
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

/** Back to me, and on a computer the zoom buttons a mouse needs. */
export function MapButtons({ onRecentre, onZoomIn, onZoomOut }: { onRecentre: () => void; onZoomIn?: () => void; onZoomOut?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View pointerEvents="box-none" style={styles.buttonsRow}>
    <MapCredit />
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

/** Where the players tray was left: it opens there again after a player's card closes. 0 tucked, 1 the row, 2 the list. */
let trayStop: 0 | 1 | 2 = 1;
/*
 * Scrolling lists inside the tray. On a phone, the gesture library's own
 * scroll view, so a swipe sideways along the faces and a drag up or down on
 * the tray never fight. In a browser its stand-in claims every touch before
 * the tray can, so there the plain one.
 */
const GHScrollView = Platform.OS === 'web' ? ScrollView : GestureScrollView;
const TRAY_SPRING = { damping: 26, stiffness: 260, mass: 0.9, overshootClamping: true } as const;

/**
 * The players tray along the bottom, nearest first. It rests in three
 * places, like Apple Maps' sheet: tucked down to its title, the row of faces
 * (where it opens), or pulled up into the full list. Drag it from anywhere —
 * the title, the faces, the list's top — or tap the title to step it up.
 * Tap a player and the map goes to them.
 */
export function NearbyRail({ items, cityName, onSelect, weather, query = '', filter = 'all', courts = [], onPickCourt }: { items: Placed[]; cityName: string; selectedId?: string | null; onSelect: (id: string) => void; /** Beside the city's name: what it's like to play there today. */ weather?: Weather | null; /** What is typed in the search, which the players are filtered by. */ query?: string; /** Which chip is on, so an empty tray says why. */ filter?: MapFilter; /** With nobody sharing nearby, the nearest few places anyone may play, to tap. */ courts?: CourtRow[]; onPickCourt?: (id: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { height: windowH } = useWindowDimensions();
  const hasList = items.length > 0;
  // The row's own height, and the list's: measured, then kept on the animation
  // thread too so a drag never waits on JavaScript (busy with pins).
  const [railH, setRailH] = useState(0);
  const [listContentH, setListContentH] = useState(0);
  // Tall enough to be a list, never so tall it buries the map or the buttons over it.
  const listMax = Math.max(160, Math.min(Math.round(windowH * 0.45), windowH - 420));
  const listH = railH ? Math.max(railH, Math.min(listMax, listContentH || listMax)) : 0;
  const railHV = useSharedValue(0);
  const listHV = useSharedValue(0);
  const hasListV = useSharedValue(hasList ? 1 : 0);
  const h = useSharedValue(0);
  const startH = useSharedValue(0);
  const [stop, setStop] = useState<0 | 1 | 2>(trayStop === 2 && !hasList ? 1 : trayStop);
  const placed = useRef(false);
  const land = (next: 0 | 1 | 2) => { trayStop = next; setStop(next); };

  // Measured (or the players changed): the tray goes to the height its stop now needs.
  useEffect(() => {
    if (!railH) return;
    railHV.value = railH;
    listHV.value = listH;
    hasListV.value = hasList ? 1 : 0;
    const at = stop === 2 && !hasList ? 1 : stop;
    if (at !== stop) land(at);
    const target = at === 0 ? 0 : at === 1 ? railH : listH;
    if (!placed.current) { placed.current = true; h.value = target; }
    else h.value = withSpring(target, TRAY_SPRING);
  }, [railH, listH, hasList]); // eslint-disable-line react-hooks/exhaustive-deps

  const settleTo = (next: 0 | 1 | 2, velocity = 0) => {
    'worklet';
    const target = next === 0 ? 0 : next === 1 ? railHV.value : listHV.value;
    h.value = withSpring(target, { ...TRAY_SPRING, velocity });
    runOnJS(land)(next);
  };
  // One drag for the title and one for the faces (a gesture can only be on one view).
  const makePan = () => Gesture.Pan()
    // Up or down moves the tray; sideways belongs to the row of faces.
    .activeOffsetY([-8, 8])
    .failOffsetX([-14, 14])
    .onStart(() => { startH.value = h.value; })
    .onUpdate((e) => {
      const top = hasListV.value ? listHV.value : railHV.value;
      const raw = startH.value - e.translationY;
      // Past the top it gives a little and pulls back: the tray is there, just full.
      h.value = raw > top ? top + Math.min(48, (raw - top) * 0.25) : Math.max(0, raw);
    })
    .onEnd((e) => {
      // Where a flick would carry it, then the nearest resting place to that.
      const aim = h.value - e.velocityY * 0.12;
      const spots = hasListV.value ? [0, railHV.value, listHV.value] : [0, railHV.value];
      let best = 0;
      for (let i = 1; i < spots.length; i++) if (Math.abs(spots[i] - aim) < Math.abs(spots[best] - aim)) best = i;
      settleTo(best as 0 | 1 | 2, -e.velocityY);
    });
  const headPan = makePan();
  // In the list, the list scrolls; the title still drags, and pulling down past its top tucks it back to the row.
  const bodyPan = makePan().enabled(stop !== 2);
  const step = () => {
    haptics.tap();
    settleTo(stop === 0 ? 1 : stop === 1 ? (hasList ? 2 : 0) : 1);
  };
  const headTap = Gesture.Tap().onEnd(() => { runOnJS(step)(); });

  const body = useAnimatedStyle(() => (railHV.value ? { height: Math.max(0, h.value) } : {}));
  // Between the row and the list, one fades into the other; tucking, the row fades as it goes.
  const railLook = useAnimatedStyle(() => {
    const r = railHV.value || 1;
    const span = Math.max(1, listHV.value - r);
    const toList = Math.min(1, Math.max(0, (h.value - r) / span));
    const toTuck = Math.min(1, Math.max(0, h.value / r));
    return { opacity: (1 - toList) * (0.35 + 0.65 * toTuck) };
  });
  const listLook = useAnimatedStyle(() => {
    const r = railHV.value || 1;
    const span = Math.max(1, listHV.value - r);
    return { opacity: Math.min(1, Math.max(0, (h.value - r) / span)) };
  });

  // A new filter deals a new set: the row fades in as one, rather than thirty avatars springing about.
  const dealt = items.slice(0, 30).map((p) => p.user.id).join(',');
  const label = stop === 0 ? 'Show players' : stop === 1 ? (hasList ? 'Show the full list' : 'Tuck players away') : 'Back to the row';
  const upward = stop === 0 || (stop === 1 && hasList);
  return (
    <View style={styles.sheet}>
      <GestureDetector gesture={Gesture.Exclusive(headPan, headTap)}>
        <View accessibilityRole="button" accessibilityLabel={label} style={styles.trayHead}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle} numberOfLines={1}>Around {cityName}</Text>
              {weather ? (
                <View style={styles.sheetWeather} accessibilityLabel={`${weather.tempF} degrees, ${weather.label}`}>
                  <Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={15} color={colors.textMuted} />
                  <Text style={styles.sheetWeatherText}>{weather.tempF}°</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.sheetHeadRight}>
              {/* Nobody to count, but the nearest courts listed: count those, not "0 players". */}
              <Text style={styles.sheetCount}>{!items.length && !query.trim() && filter === 'all' && courts.length ? `${courts.length} ${courts.length === 1 ? 'court' : 'courts'}` : items.length === 1 ? '1 player' : `${items.length} players`}</Text>
              <Ionicons name={upward ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
            </View>
          </View>
        </View>
      </GestureDetector>
      <GestureDetector gesture={bodyPan}>
        <Animated.View style={[styles.railBody, body]}>
          <Animated.View style={railLook} pointerEvents={stop === 2 ? 'none' : 'auto'}>
            <View onLayout={(e) => { const next = Math.round(e.nativeEvent.layout.height); if (next && next !== railH) setRailH(next); }}>
              {items.length ? (
                <Animated.View key={dealt} entering={FadeIn.duration(200).easing(Easing.out(Easing.cubic))}>
                  <GHScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.railScroll}>
                    {items.slice(0, 30).map((p) => (
                      <View key={p.user.id}>
                        <Tappable accessibilityLabel={`${p.user.name}, ${formatSpotMiles(p.miles, p.rough)}`} onPress={() => onSelect(p.user.id)} scaleTo={0.96} style={styles.railItem}>
                          <View style={[styles.railRing, isOpenToHit(p.user) && styles.railRingOn]}><Avatar name={p.user.name} seed={p.user.avatarSeed} size={46} ring={p.user.isCoach} /></View>
                          <Text style={styles.railName} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text>
                          <Text style={styles.railMeta} numberOfLines={1}>{formatSpotMiles(p.miles, p.rough)}{p.seenAt ? ` · ${agoShort(p.seenAt)}` : ''}</Text>
                        </Tappable>
                      </View>
                    ))}
                  </GHScrollView>
                </Animated.View>
              ) : query.trim() || filter !== 'all' || !courts.length ? (
                // With a name typed, say only that no player has it: a court's name finds the court, and the players are still there.
                <Animated.Text entering={FadeIn.duration(180)} style={styles.sheetEmpty}>
                  {query.trim() ? `No players named “${query.trim()}”`
                    : filter === 'following' ? 'Nobody you follow is sharing their spot nearby.'
                      : filter !== 'all' ? 'Nobody nearby matches that.'
                        : 'No one sharing nearby yet. Tap a court to see what’s played there.'}
                </Animated.Text>
              ) : (
                // Nobody sharing yet: the nearest places to play instead of an empty tray, each a tap from its card.
                <Animated.View entering={FadeIn.duration(180)} style={styles.emptyCourts}>
                  <Text style={styles.emptyCourtsTitle}>No one sharing nearby yet. The nearest courts:</Text>
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
                </Animated.View>
              )}
            </View>
          </Animated.View>
          {hasList ? (
            <Animated.View style={[styles.listLayer, { height: listH || undefined }, listLook]} pointerEvents={stop === 2 ? 'auto' : 'none'}>
              <GHScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={(_, next) => { const v = Math.round(next); if (v !== listContentH) setListContentH(v); }}
                scrollEventThrottle={16}
                onScrollEndDrag={(e) => { if (e.nativeEvent.contentOffset.y < -48) settleTo(1); }}
              >
                {items.map((p, i) => (
                  <Pressable key={p.user.id} accessibilityRole="button" accessibilityLabel={`${p.user.name}, ${formatSpotMiles(p.miles, p.rough)}`} onPress={() => onSelect(p.user.id)} style={({ pressed }) => [styles.listRow, i > 0 && styles.listRule, pressed && styles.listPressed]}>
                    <View style={[styles.railRing, isOpenToHit(p.user) && styles.railRingOn]}><Avatar name={p.user.name} seed={p.user.avatarSeed} size={40} ring={p.user.isCoach} /></View>
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
              </GHScrollView>
            </Animated.View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Pulling a card down closes it, the way a sheet does. Let go far enough
 * (or flick it) and it closes there and then: the card stage carries it on
 * down from where the finger left it, at speed (sheetFling), so the
 * swipe, the card sliding away and the tray settling back are one motion.
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
          <Text style={styles.personMeta} numberOfLines={1}>{[`@${user.handle}`, court ? null : seenCity || user.location || null, formatSpotMiles(miles, rough)].filter(Boolean).join(' · ')}</Text>
          {court ? <View style={styles.openRow}><CourtGlyph size={13} color={colors.court} /><Text style={styles.atCourt} numberOfLines={1}>At {court.name}{seenAt ? ` · ${agoLabel(seenAt)}` : ''}</Text></View>
            : seenAt ? <Text style={styles.personMeta} numberOfLines={1}>{activeLabel(seenAt)}</Text> : null}
          {isOpenToHit(user) ? <View style={styles.openRow}><View style={styles.openDot} /><Text style={styles.openText}>Open to hit today</Text></View> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {onAskToHit ? (
        // Tennis first: Ask to hit leads (a normal open hit, also sent to your chat with them), then Message and Follow.
        <View style={styles.personActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${user.name} to hit`} onPress={onAskToHit} style={[styles.primary, styles.pillTight]}>
            <BrandWash />
            <HitGlyph size={16} color={colors.brandInk} />
            <Text style={styles.primaryText}>Ask to hit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Message ${user.name}`} onPress={onMessage} style={[styles.secondary, styles.pillTight]}>
            <Text style={styles.secondaryText}>Message</Text>
          </Pressable>
          <FollowPill following={following} userId={user.id} onPress={onFollow} name={user.name.split(' ')[0]} />
        </View>
      ) : (
        <View style={styles.personActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Message ${user.name}`} onPress={onMessage} style={styles.primary}>
            <BrandWash />
            <Ionicons name="paper-plane-outline" size={16} color={colors.brandInk} />
            <Text style={styles.primaryText}>Message</Text>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel="Open profile" onPress={onProfile} style={styles.secondary}>
            <Text style={styles.secondaryText}>Profile</Text>
          </Pressable>
          <FollowPill following={following} userId={user.id} onPress={onFollow} name={user.name.split(' ')[0]} />
        </View>
      )}
      {/* A quiet link of its own: a fourth pill does not fit beside the three on a phone. */}
      {onAddToGroup ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Add ${user.name} to a group`} onPress={onAddToGroup} hitSlop={6} style={({ pressed }) => [styles.groupLink, pressed && { opacity: 0.6 }]}>
          <Ionicons name="people-outline" size={16} color={colors.textMuted} />
          <Text style={styles.groupLinkText}>Add to a group</Text>
        </Pressable>
      ) : null}
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
  const noteOn = useAnimatedStyle(() => ({ opacity: Math.max(0, lit.value * 2 - 1) }));
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
            <Animated.Text style={[styles.openNote, noteOn]} aria-hidden={!open} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>{teen ? 'Friends who follow you back see your green ring until midnight.' : 'Players nearby see your green ring until midnight.'}</Animated.Text>
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
    const left = Math.max(0, h.spots - h.joinedIds.length);
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
          <Text style={styles.personName} numberOfLines={1}>{court.name}</Text>
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
 * the middle of its own map, the way a map names a city, with who is around
 * under it; a round location switch, and the weather. Nothing says "open" —
 * a map is plainly a thing you tap.
 */
export function PreviewOverlay({ cityName, count, placeCount = 0, hitCount = 0, weather, locationOn, locating, onToggleLocation }: { cityName: string; count: number; /** Places to play in town (one per park, not single courts). */ placeCount?: number; /** Open hits in town. */ hitCount?: number; weather: Weather | null; locationOn?: boolean; locating?: boolean; onToggleLocation?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  // A teen sees only friends who follow each other with them (migration 78),
  // so for anyone not known to be an adult an empty map says nothing about
  // the town: no "be the first" for them.
  const { currentUser } = useApp();
  const adult = !!currentUser && !notKnownAdult(currentUser);
  // Players first; with none sharing yet, the courts still say the map is worth opening.
  const line = count === 1 ? '1 player around' : count ? `${count} players around`
    : placeCount ? `${placeCount}${placeCount >= 30 ? '+' : ''} ${placeCount === 1 ? 'place' : 'places'} to play nearby`
      : 'No one here yet';
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
            // Nobody sharing yet, but courts to play on: a next step, not an empty town.
            : !count && placeCount && adult ? <Text style={styles.cityHits}>Be the first player on the map</Text> : null}
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
  search: { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  roundHit: { width: 42, height: 42, borderRadius: 21, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  roundGlass: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
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
  weather: { marginLeft: 6, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weatherText: { ...typography.smallStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  buttonsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  buttons: { alignItems: 'flex-end', gap: spacing.sm },
  credit: { padding: 2, opacity: 0.7 },
  creditWrap: { zIndex: 20 },
  creditCard: { position: 'absolute', bottom: 22, gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  creditText: { ...typography.caption, color: colors.textMuted, letterSpacing: 0 },
  zoom: { borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  zoomButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  zoomRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  // The bottom panel: the rail of players, or the one that was picked.
  // Flush on the bottom edge, a grabber line on top: a tray, not a card floating on the map.
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: -8 } },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.xs },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: 2 },
  sheetHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  railBody: { overflow: 'hidden' },
  trayHead: { paddingTop: spacing.sm, marginTop: -spacing.sm },
  // A sideways swipe scrolls the faces; an up-or-down one is the tray's (a phone browser must not take it for a page scroll).
  railScroll: Platform.OS === 'web' ? ({ touchAction: 'pan-x' } as object) : {},
  listLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  listRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listPressed: { opacity: 0.7 },
  listWords: { flex: 1, gap: 2 },
  listName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  sheetTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  sheetWeather: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetWeatherText: { ...typography.smallStrong, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  sheetCount: { ...typography.small, color: colors.textMuted },
  sheetEmpty: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  // The empty tray's nearest courts: the search results' rows, under one quiet line.
  emptyCourts: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  emptyCourtsTitle: { ...typography.small, color: colors.textMuted, paddingBottom: 2 },
  rail: { paddingHorizontal: spacing.md, gap: 4 },
  railItem: { width: 76, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: radius.lg },
  railItemOn: { backgroundColor: colors.brandDim },
  railRing: { padding: 2, borderRadius: 27, borderWidth: 2, borderColor: 'transparent' },
  railRingOn: { borderColor: colors.open },
  railName: { ...typography.smallStrong, color: colors.text },
  railMeta: { ...typography.caption, color: colors.textMuted, letterSpacing: 0 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  personWords: { flex: 1, gap: 3 },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personName: { ...typography.heading, color: colors.text, flexShrink: 1 },
  personMeta: { ...typography.small, color: colors.textMuted },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  personActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryText: { ...typography.smallStrong, color: colors.brandInk },
  secondary: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.smallStrong, color: colors.text },
  pillTight: { paddingHorizontal: 12 },
  pillIcon: { flexDirection: 'row', gap: 5 },
  groupLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginHorizontal: spacing.lg, marginTop: -spacing.xs, paddingBottom: spacing.sm },
  groupLinkText: { ...typography.smallStrong, color: colors.textMuted },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  // Open to hit, on a player's card: the map's green, never the brand (New York's is yellow).
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.open },
  openText: { ...typography.smallStrong, color: colors.text },
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
