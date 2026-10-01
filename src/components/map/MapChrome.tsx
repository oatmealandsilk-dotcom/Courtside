import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Avatar, BrandWash } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import { FollowPill } from '@/components/FollowPill';
import { LevelPill } from '@/components/LevelPill';
import { Tappable } from '@/components/Tappable';
import * as haptics from '@/lib/haptics';
import type { Court } from '@/features/players/courts';
import { summarizeCourt } from '@/features/players/courtSummary';
import { useApp } from '@/store/AppContext';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { formatMiles } from '@/features/players/geo';
import { relativeTime } from '@/lib/format';
import { isOpenToHit } from '@/features/players/openToHit';
import { LevelPill as Level } from '@/components/LevelPill';
import type { Post, User } from '@/data/types';
import { Toggle } from '@/components/ui';
import type { MapFilter, Placed } from '@/features/players/mapModel';
import type { Weather } from '@/lib/weather';
import { colors, radius, spacing, typography } from '@/theme';
import { agoShort } from '@/components/map/markers';
import { MAP_CREDITS } from '@/components/map/credits';
import Svg, { Line, Rect } from 'react-native-svg';

/*
 * Everything laid over the map that is not the map: the same on a phone and
 * in a browser, so the two canvases only draw tiles and pins.
 */

/** Back, the search, and the location switch across the top. */
export function MapTopBar({ onBack, query, onQuery, locationOn, locating, onToggleLocation }: { onBack?: () => void; query: string; onQuery: (next: string) => void; locationOn?: boolean; locating?: boolean; onToggleLocation?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.topRow}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.roundHit}>
          <Glass radius={21} style={styles.roundGlass}><Ionicons name="chevron-back" size={22} color={colors.text} /></Glass>
        </Pressable>
      ) : null}
      <Glass radius={21} style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          accessibilityLabel="Search players or places"
          placeholder="Players or places"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={onQuery}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </Glass>
      {onToggleLocation ? (
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? 'Turn location off' : 'Turn location on'} onPress={onToggleLocation} style={[styles.round, locationOn && styles.roundOn]}>
          {locationOn ? <BrandWash /> : null}
          {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={18} color={locationOn ? colors.brandInk : colors.text} />}
        </Pressable>
      ) : null}
    </View>
  );
}

const FILTERS: { key: MapFilter; label: string }[] = [
  { key: 'all', label: 'All' },
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
          {courtsLoading ? <ActivityIndicator size="small" color={courtsOn ? colors.brandInk : colors.text} /> : <CourtGlyph size={15} color={courtsOn ? colors.brandInk : colors.text} />}
          <Text style={[styles.chipText, courtsOn && styles.chipTextOn]}>Courts</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** A tennis court from above: the outline, the net across the middle, the service boxes. */
export function CourtGlyph({ size = 15, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 16 20" fill="none">
      <Rect x={2} y={1.5} width={12} height={17} rx={1.2} stroke={color} strokeWidth={1.5} />
      <Line x1={2} y1={10} x2={14} y2={10} stroke={color} strokeWidth={1.5} />
      <Line x1={2} y1={6} x2={14} y2={6} stroke={color} strokeWidth={1} />
      <Line x1={2} y1={14} x2={14} y2={14} stroke={color} strokeWidth={1} />
      <Line x1={8} y1={6} x2={8} y2={14} stroke={color} strokeWidth={1} />
    </Svg>
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
export function NearbyRail({ items, cityName, onSelect, weather }: { items: Placed[]; cityName: string; selectedId?: string | null; onSelect: (id: string) => void; /** Beside the city's name: what it's like to play there today. */ weather?: Weather | null }) {
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
              <Text style={styles.sheetCount}>{items.length === 1 ? '1 player' : `${items.length} players`}</Text>
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
                        <Tappable accessibilityLabel={`${p.user.name}, ${formatMiles(p.miles)}`} onPress={() => onSelect(p.user.id)} scaleTo={0.96} style={styles.railItem}>
                          <View style={[styles.railRing, isOpenToHit(p.user) && styles.railRingOn]}><Avatar name={p.user.name} seed={p.user.avatarSeed} size={46} ring={p.user.isCoach} /></View>
                          <Text style={styles.railName} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text>
                          <Text style={styles.railMeta} numberOfLines={1}>{formatMiles(p.miles)}{p.seenAt ? ` · ${agoShort(p.seenAt)}` : ''}</Text>
                        </Tappable>
                      </View>
                    ))}
                  </GHScrollView>
                </Animated.View>
              ) : (
                <Animated.Text entering={FadeIn.duration(180)} style={styles.sheetEmpty}>No one here right now. Players show up once they share their location.</Animated.Text>
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
                  <Pressable key={p.user.id} accessibilityRole="button" accessibilityLabel={`${p.user.name}, ${formatMiles(p.miles)}`} onPress={() => onSelect(p.user.id)} style={({ pressed }) => [styles.listRow, i > 0 && styles.listRule, pressed && styles.listPressed]}>
                    <View style={[styles.railRing, isOpenToHit(p.user) && styles.railRingOn]}><Avatar name={p.user.name} seed={p.user.avatarSeed} size={40} ring={p.user.isCoach} /></View>
                    <View style={styles.listWords}>
                      <View style={styles.personTop}>
                        <Text style={styles.listName} numberOfLines={1}>{p.user.name}</Text>
                        <LevelPill profile={p.user.profile} small />
                      </View>
                      <Text style={styles.personMeta} numberOfLines={1}>{[formatMiles(p.miles), p.seenAt ? agoShort(p.seenAt) : null, isOpenToHit(p.user) ? 'open to hit' : null].filter(Boolean).join(' · ')}</Text>
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

/** Pulling a card down closes it, the way a sheet does. */
function useDragToClose(onClose: () => void) {
  const y = useSharedValue(0);
  const gesture = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 600) { y.value = withTiming(300, { duration: 160 }, () => runOnJS(onClose)()); }
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

/** One player, picked on the map: who they are, how far, and what to do about it. */
export function PlayerSheet({ placed, following, onClose, onProfile, onMessage, onFollow }: { placed: Placed; following: boolean; onClose: () => void; onProfile: () => void; onMessage: () => void; onFollow: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  const { user, miles, seenAt, seenCity } = placed;
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.personRow}>
        <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, open profile`} onPress={onProfile}>
          <Avatar name={user.name} seed={user.avatarSeed} size={56} ring={user.isCoach} />
        </Pressable>
        <View style={styles.personWords}>
          <View style={styles.personTop}>
            <Text style={styles.personName} numberOfLines={1}>{user.name}</Text>
            <LevelPill profile={user.profile} small />
          </View>
          <Text style={styles.personMeta} numberOfLines={1}>{[`@${user.handle}`, seenCity || user.location || null, formatMiles(miles)].filter(Boolean).join(' · ')}</Text>
          {seenAt ? <Text style={styles.personMeta} numberOfLines={1}>{activeLabel(seenAt)}</Text> : null}
          {isOpenToHit(user) ? <View style={styles.openRow}><View style={styles.openDot} /><Text style={styles.openText}>Open to hit today</Text></View> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
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
    </Animated.View>
    </GestureDetector>
  );
}

/** You, tapped on the map: whether you are up for a hit today, and your profile. */
export function YouSheet({ me, open, onToggle, onProfile, onClose }: { me: User; open: boolean; onToggle: (on: boolean) => void; onProfile: () => void; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.personRow}>
        <View style={[styles.youRing, open && styles.youRingOn]}>
          <Avatar name={me.name} seed={me.avatarSeed} size={50} />
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
      <View style={styles.openCard}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.openTitle}>Open to hit today</Text>
          <Text style={styles.openNote}>{open ? 'Players nearby see a green ring around you until midnight.' : 'Put a green ring around you on the map, until midnight.'}</Text>
        </View>
        <Toggle value={open} onChange={onToggle} accessibilityLabel="Open to hit today" />
      </View>
      <View style={styles.personActions}>
        <Pressable accessibilityRole="link" accessibilityLabel="Your profile" onPress={onProfile} style={styles.secondary}>
          <Text style={styles.secondaryText}>Your profile</Text>
        </Pressable>
      </View>
    </Animated.View>
    </GestureDetector>
  );
}

/** A court, picked on the map: what OpenStreetMap knows, then what players say, and a way to add to it. */
export function CourtSheet({ court, miles, onClose, onDirections }: { court: Court; miles: number; onClose: () => void; onDirections: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  const { courtNotes, currentUserId, actions } = useApp();
  useEffect(() => { void actions.loadCourtNotes(court.id).catch(() => undefined); }, [court.id, actions]);
  const notes = courtNotes[court.id] ?? [];
  const said = summarizeCourt(notes);
  const mine = notes.some((n) => n.userId === currentUserId);
  const facts = [court.count > 1 ? `${court.count} courts` : '1 court', court.surface ? court.surface.replace(/_/g, ' ') : null, court.lit ? 'lit at night' : null].filter(Boolean).join(' · ');
  // Clips and photos people tagged here: the best proof a court gets played on.
  const [posted, setPosted] = useState<Post[]>([]);
  useEffect(() => {
    let on = true;
    setPosted([]);
    void actions.loadCourtPosts({ lat: court.lat, lng: court.lng }).then((list) => { if (on) setPosted(list.filter((p) => p.thumbnailUrl || p.imageUrl)); });
    return () => { on = false; };
  }, [court.lat, court.lng, actions]);
  return (
    <GestureDetector gesture={pull.gesture}>
    <Animated.View style={[styles.sheet, pull.style]}>
      <View style={styles.grabber} />
      <View style={styles.personRow}>
        <View style={styles.courtDisc}><Ionicons name="tennisball" size={22} color={colors.brandInk} /></View>
        <View style={styles.personWords}>
          <Text style={styles.personName} numberOfLines={1}>{court.name}</Text>
          <Text style={styles.personMeta} numberOfLines={1}>{facts} · {formatMiles(miles)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {said.players ? (
        <View style={styles.says}>
          {said.facts.length ? (
            <View style={styles.saysFacts}>
              {said.facts.map((f) => (
                <View key={f.label} style={styles.saysFact}>
                  <Ionicons name={f.icon} size={13} color={colors.textMuted} />
                  <Text style={styles.saysFactText}>{f.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {said.photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.saysPhotos}>
              {said.photos.map((uri) => <ExpoImage key={uri} source={{ uri }} style={styles.saysPhoto} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel="A player's photo of the court" />)}
            </ScrollView>
          ) : null}
          {said.latest ? <Text style={styles.saysQuote} numberOfLines={2}>“{said.latest}”</Text> : null}
        </View>
      ) : null}
      {posted.length ? (
        <View style={styles.posted}>
          <Text style={styles.postedTitle}>Played here <Text style={styles.postedCount}>· {posted.length}</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.postedRow}>
            {posted.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.kind === 'clip' ? 'A clip from this court' : 'A post from this court'} onPress={() => router.push(`/post/${p.id}`)} style={({ pressed }) => [styles.postedThumb, pressed && styles.postedPressed]}>
                <ExpoImage source={{ uri: p.thumbnailUrl ?? p.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                {p.kind === 'clip' || p.videoUrl ? <View style={styles.postedPlay}><Ionicons name="play" size={11} color="#fff" /></View> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.personActions}>
        <Pressable accessibilityRole="link" accessibilityLabel="Directions" onPress={onDirections} style={styles.primary}>
          <BrandWash />
          <Ionicons name="navigate-outline" size={16} color={colors.brandInk} />
          <Text style={styles.primaryText}>Directions</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={mine ? 'Update what you said about this court' : 'Add what you know about this court'} onPress={() => router.push({ pathname: '/court-report', params: { id: court.id, name: court.name } })} style={styles.secondary}>
          <Text style={styles.secondaryText}>{mine ? 'Update yours' : 'Add what you know'}</Text>
        </Pressable>
      </View>
      <Text style={styles.courtSource}>{said.players ? `From ${said.players} ${said.players === 1 ? 'player' : 'players'} and OpenStreetMap` : 'From OpenStreetMap. Know it? Add the lights, nets and how busy it gets.'}</Text>
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
export function PreviewOverlay({ cityName, count, weather, locationOn, locating, onToggleLocation }: { cityName: string; count: number; weather: Weather | null; locationOn?: boolean; locating?: boolean; onToggleLocation?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <>
      <View pointerEvents="none" style={styles.cityMark}>
        <Text style={styles.cityName} numberOfLines={1}>{cityName}</Text>
        <Text style={[styles.cityCount, count > 0 && styles.cityCountOn]}>{count === 1 ? '1 player around' : count ? `${count} players around` : 'No one here yet'}</Text>
      </View>
      {onToggleLocation ? (
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? 'Turn location off' : 'Turn location on'} hitSlop={6} onPress={onToggleLocation} style={[styles.previewSwitch, locationOn && styles.roundOn]}>
          {locationOn ? <BrandWash /> : null}
          {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={15} color={locationOn ? colors.brandInk : colors.text} />}
        </Pressable>
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

const styleDefinitions = StyleSheet.create({
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
  rail: { paddingHorizontal: spacing.md, gap: 4 },
  railItem: { width: 76, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: radius.lg },
  railItemOn: { backgroundColor: colors.brandDim },
  railRing: { padding: 2, borderRadius: 27, borderWidth: 2, borderColor: 'transparent' },
  railRingOn: { borderColor: colors.brand },
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
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  openText: { ...typography.smallStrong, color: colors.brand },
  youRing: { padding: 2, borderRadius: 30, borderWidth: 1.5, borderColor: colors.borderStrong },
  youRingOn: { borderWidth: 2.5, borderColor: colors.brand },
  openCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  openTitle: { ...typography.bodyStrong, color: colors.text },
  openNote: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  courtDisc: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  courtSource: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  says: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  saysFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  saysFact: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  saysFactText: { ...typography.smallStrong, color: colors.text },
  saysPhotos: { gap: spacing.sm },
  saysPhoto: { width: 96, height: 72, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  saysQuote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  posted: { gap: spacing.sm, paddingBottom: spacing.md },
  postedTitle: { ...typography.smallStrong, color: colors.text, paddingHorizontal: spacing.lg },
  postedCount: { color: colors.textFaint },
  postedRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  // Upright, like the clips themselves, and a touch taller than the players' court photos above.
  postedThumb: { width: 66, height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  postedPressed: { opacity: 0.85 },
  postedPlay: { position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  // The still card's overlay: the city named the way a map names it, with a soft halo of the page colour so it reads over roads.
  cityMark: { position: 'absolute', left: spacing.xl, right: spacing.xl, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cityName: { ...typography.title, fontSize: 26, letterSpacing: -0.6, color: colors.text, textShadowColor: colors.bg, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  cityCount: { ...typography.smallStrong, color: colors.textMuted, textShadowColor: colors.bg, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  cityCountOn: { color: colors.brand },
  cityless: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: 4 },
  citylessDisc: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  citylessTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  citylessBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  citylessActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  previewSwitch: { position: 'absolute', right: 12, top: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  previewWeather: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
