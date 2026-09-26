import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import { FollowPill } from '@/components/FollowPill';
import { LevelPill } from '@/components/LevelPill';
import { Tappable } from '@/components/Tappable';
import * as haptics from '@/lib/haptics';
import type { Court } from '@/features/players/courts';
import { formatMiles } from '@/features/players/geo';
import type { MapFilter, Placed } from '@/features/players/mapModel';
import type { Weather } from '@/lib/weather';
import { colors, radius, spacing, typography } from '@/theme';

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
          {locating ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={18} color={locationOn ? colors.brandInk : colors.text} />}
        </Pressable>
      ) : null}
    </View>
  );
}

const FILTERS: { key: MapFilter; label: string }[] = [
  { key: 'all', label: 'All' },
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
  const moveTo = (key: MapFilter, animate: boolean) => {
    const spot = spots.current[key];
    if (!spot) return;
    const spring = { damping: 18, stiffness: 220, mass: 0.7 };
    x.value = animate ? withSpring(spot.x, spring) : spot.x;
    w.value = animate ? withSpring(spot.w, spring) : spot.w;
  };
  useEffect(() => { moveTo(filter, true); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));
  const pick = (key: MapFilter) => { if (key !== filter) { haptics.tap(); onFilter(key); } };
  return (
    <View style={styles.chipsRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
        {measured ? FILTERS.map((f) => { const spot = spots.current[f.key]; return spot ? <View key={`plate-${f.key}`} pointerEvents="none" style={[styles.chipPlate, { left: spot.x, width: spot.w }]} /> : null; }) : null}
        {measured ? <Animated.View pointerEvents="none" style={[styles.chipPill, pill]} /> : null}
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => pick(f.key)}
            onLayout={(e) => {
              const { x: cx, width } = e.nativeEvent.layout;
              spots.current[f.key] = { x: cx, w: width };
              if (f.key === filter) { moveTo(f.key, false); if (!measured) setMeasured(true); }
            }}
            style={[styles.chip, measured ? styles.chipClear : filter === f.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {/* Courts stays put at the end, whatever the row scrolls to. */}
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: courtsOn }} accessibilityLabel="Show courts" onPress={() => { haptics.tap(); onCourts(); }} style={[styles.chip, styles.chipCourts, courtsOn && styles.chipOn]}>
        {courtsLoading ? <ActivityIndicator size="small" color={courtsOn ? colors.brandInk : colors.text} /> : <Ionicons name="tennisball-outline" size={14} color={courtsOn ? colors.brandInk : colors.text} />}
        <Text style={[styles.chipText, courtsOn && styles.chipTextOn]}>Courts</Text>
      </Pressable>
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
 * The map's credit. The data's licence asks for it to be findable, not
 * shouting: a faint ⓘ that opens OpenStreetMap's own credits page.
 */
export function MapCredit({ style }: { style?: object }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="Map data © OpenStreetMap contributors" hitSlop={10} onPress={() => { void Linking.openURL('https://www.openstreetmap.org/copyright'); }} style={[styles.credit, style]}>
      <Ionicons name="information-circle-outline" size={13} color={colors.textFaint} />
    </Pressable>
  );
}

/** The strip of players along the bottom, nearest first — tap one and the map goes to them. */
export function NearbyRail({ items, cityName, selectedId, onSelect }: { items: Placed[]; cityName: string; selectedId: string | null; onSelect: (id: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const [railH, setRailH] = useState(0);
  const railHRef = useRef(0);
  const drop = useSharedValue(0);
  const start = useSharedValue(0);
  const [tucked, setTucked] = useState(false);
  const settle = (down: boolean) => {
    drop.value = withSpring(down ? railHRef.current : 0, { damping: 20, stiffness: 240 });
    setTucked(down);
  };
  const drag = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onBegin(() => { start.value = drop.value; })
    .onUpdate((e) => { drop.value = Math.max(0, Math.min(railHRef.current, start.value + e.translationY)); })
    .onEnd((e) => {
      const down = e.velocityY > 500 || (e.velocityY > -500 && drop.value > railHRef.current / 2);
      runOnJS(settle)(down);
    });
  const tap = Gesture.Tap().onEnd(() => { runOnJS(settle)(!tucked); });
  const body = useAnimatedStyle(() => (railH ? { height: Math.max(0, railH - drop.value), opacity: 1 - (drop.value / Math.max(1, railH)) * 0.6 } : {}));
  return (
    <View style={styles.sheet}>
      <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
        <View accessibilityRole="button" accessibilityLabel={tucked ? 'Show players' : 'Tuck players away'}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Around {cityName}</Text>
            <View style={styles.sheetHeadRight}>
              <Text style={styles.sheetCount}>{items.length === 1 ? '1 player' : `${items.length} players`}</Text>
              <Ionicons name={tucked ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
            </View>
          </View>
        </View>
      </GestureDetector>
      <Animated.View style={[styles.railBody, body]}>
        <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h && h !== railHRef.current) { railHRef.current = h; setRailH(h); } }}>
          {items.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {items.slice(0, 30).map((p, i) => (
                // A new filter deals the players again: they shuffle into their new places, newcomers fading in.
                <Animated.View key={p.user.id} layout={LinearTransition.springify().damping(18)} entering={FadeIn.delay(i * 25).duration(220)} exiting={FadeOut.duration(120)}>
                  <Tappable accessibilityLabel={`${p.user.name}, ${formatMiles(p.miles)}`} onPress={() => onSelect(p.user.id)} scaleTo={0.96} style={[styles.railItem, selectedId === p.user.id && styles.railItemOn]}>
                    <Avatar name={p.user.name} seed={p.user.avatarSeed} size={46} ring={p.user.isCoach} />
                    <Text style={styles.railName} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text>
                    <Text style={styles.railMeta} numberOfLines={1}>{formatMiles(p.miles)}</Text>
                  </Tappable>
                </Animated.View>
              ))}
            </ScrollView>
          ) : (
            <Animated.Text entering={FadeIn.duration(180)} style={styles.sheetEmpty}>No one matches. Try another filter.</Animated.Text>
          )}
        </View>
      </Animated.View>
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

/** One player, picked on the map: who they are, how far, and what to do about it. */
export function PlayerSheet({ placed, following, onClose, onProfile, onMessage, onFollow }: { placed: Placed; following: boolean; onClose: () => void; onProfile: () => void; onMessage: () => void; onFollow: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  const { user, miles } = placed;
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
          <Text style={styles.personMeta} numberOfLines={1}>{[`@${user.handle}`, user.location || null, formatMiles(miles)].filter(Boolean).join(' · ')}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.personActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Message ${user.name}`} onPress={onMessage} style={styles.primary}>
          <Ionicons name="paper-plane-outline" size={16} color={colors.brandInk} />
          <Text style={styles.primaryText}>Message</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Open profile" onPress={onProfile} style={styles.secondary}>
          <Text style={styles.secondaryText}>Profile</Text>
        </Pressable>
        <FollowPill following={following} onPress={onFollow} name={user.name.split(' ')[0]} />
      </View>
    </Animated.View>
    </GestureDetector>
  );
}

/** A court, picked on the map. */
export function CourtSheet({ court, miles, onClose, onDirections }: { court: Court; miles: number; onClose: () => void; onDirections: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const pull = useDragToClose(onClose);
  const facts = [court.count > 1 ? `${court.count} courts` : '1 court', court.surface ? court.surface.replace(/_/g, ' ') : null, court.lit ? 'lit at night' : null].filter(Boolean).join(' · ');
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
      <View style={styles.personActions}>
        <Pressable accessibilityRole="link" accessibilityLabel="Directions" onPress={onDirections} style={styles.primary}>
          <Ionicons name="navigate-outline" size={16} color={colors.brandInk} />
          <Text style={styles.primaryText}>Directions</Text>
        </Pressable>
        <Text style={styles.courtNote}>From OpenStreetMap</Text>
      </View>
    </Animated.View>
    </GestureDetector>
  );
}

/**
 * What sits on the still card in the Find Players tab: the city and the
 * count in one small pill, a round location switch, the weather. Nothing
 * says "open" — a map is plainly a thing you tap.
 */
export function PreviewOverlay({ cityName, count, weather, locationOn, locating, onToggleLocation }: { cityName: string; count: number; weather: Weather | null; locationOn?: boolean; locating?: boolean; onToggleLocation?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <>
      <View pointerEvents="none" style={styles.previewTitle}>
        <Ionicons name="location" size={13} color={colors.brand} />
        <Text style={styles.previewTitleText}>{cityName}</Text>
        <Text style={styles.previewCount}>{count ? `· ${count}` : '· no one yet'}</Text>
      </View>
      {onToggleLocation ? (
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? 'Turn location off' : 'Turn location on'} hitSlop={6} onPress={onToggleLocation} style={[styles.previewSwitch, locationOn && styles.roundOn]}>
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
  chipCourts: { marginLeft: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  // Once measured, the chips go clear-backed at their own spots and the sliding pill carries the fill.
  chipClear: { backgroundColor: 'transparent', borderColor: colors.border },
  chipPlate: { position: 'absolute', top: 0, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface },
  chipPill: { position: 'absolute', left: 0, top: 0, height: 32, borderRadius: radius.pill, backgroundColor: colors.brand },
  chipText: { ...typography.smallStrong, color: colors.text },
  chipTextOn: { color: colors.brandInk },
  weather: { alignSelf: 'flex-end', marginRight: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weatherText: { ...typography.smallStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  buttonsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  buttons: { alignItems: 'flex-end', gap: spacing.sm },
  credit: { padding: 2, opacity: 0.7 },
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
  sheetTitle: { ...typography.heading, color: colors.text },
  sheetCount: { ...typography.small, color: colors.textMuted },
  sheetEmpty: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  rail: { paddingHorizontal: spacing.md, gap: 4 },
  railItem: { width: 76, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: radius.lg },
  railItemOn: { backgroundColor: colors.brandDim },
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
  courtDisc: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  courtNote: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, marginLeft: 'auto' },
  // The still card's overlay.
  previewTitle: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  previewTitleText: { ...typography.smallStrong, color: colors.text },
  previewCount: { ...typography.smallStrong, color: colors.brand },
  previewSwitch: { position: 'absolute', right: 12, top: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  previewWeather: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
