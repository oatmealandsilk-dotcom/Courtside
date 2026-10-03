import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { DragSheet } from '@/components/DragSheet';
import { Avatar } from '@/components/ui';
import { SheetTitle, Submit } from '@/components/sheet/SheetForm';
import type { MapVisibility } from '@/data/types';
import { TEEN_NOTICE, choicesFor, onTeenMap, settleWhoSeesYou } from '@/features/players/mapPrivacy';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography, withAlpha } from '@/theme';

const ICON: Record<MapVisibility, keyof typeof Ionicons.glyphMap> = { nearby: 'people-outline', mutuals: 'swap-horizontal-outline', none: 'eye-off-outline' };

/**
 * "Who can see you on the map?" (migration 63): Players nearby (the
 * default), Only people you follow back, or Only me.
 *
 * `mode=first`: the first time Location goes on (or the full map opens)
 * without an answer. Continue saves it; then the device's own prompt, then
 * the one tip by the location button (useLocationToggle). Closing it
 * without Continue changes nothing, and it asks again next time.
 * `mode=manage`: from the full map's location button, your card on the map,
 * or Settings → Privacy. A tap saves at once; Location off is at the bottom.
 *
 * Someone not known to be an adult (migration 78) gets two answers instead:
 * Friends who follow you back (their rough area, just for them) or Only me,
 * under a short notice: only friends who follow them back can see where
 * they are, and turning Location off on the map hides them. Nothing of
 * theirs is shared until they answer here. (Under 16 never gets this
 * screen: they stay off the map.)
 */
export default function MapVisibilitySheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ mode?: string }>();
  const first = params.mode !== 'manage';
  const { actions, mapVisibility, currentUser, locationEnabled, teenMap } = useApp();
  const teen = onTeenMap(currentUser, teenMap);
  const choices = choicesFor(teen);
  // A teen's "Players nearby" is kept as friends only, so it reads as that here.
  const shownAs = (v: MapVisibility | null | undefined): MapVisibility => (teen ? (v === 'none' ? 'none' : 'mutuals') : v ?? 'nearby');
  const [picked, setPicked] = useState<MapVisibility>(shownAs(mapVisibility));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closeSignal, setCloseSignal] = useState(0);
  // What the screen closes with: the answer once it is saved, else nothing.
  const answer = useRef<MapVisibility | null>(null);
  const close = () => setCloseSignal((n) => n + 1);
  // However the screen goes (a phone's Back as well as Close), whoever asked hears how it ended.
  useEffect(() => () => { settleWhoSeesYou(answer.current ?? (first ? null : mapVisibility ?? null)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (v: MapVisibility) => {
    setPicked(v);
    setError('');
    if (first || v === mapVisibility) return;
    const ok = await actions.setMapVisibility(v);
    if (ok) answer.current = v;
    else { setError('Couldn’t save that. Try again.'); setPicked(shownAs(mapVisibility)); }
  };
  const proceed = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const ok = await actions.setMapVisibility(picked);
    setBusy(false);
    if (!ok) { setError('Couldn’t save that. Try again.'); return; }
    answer.current = picked;
    close();
  };
  const locationOff = () => {
    void actions.setLocationEnabled(false);
    close();
  };

  return (
    <DragSheet
      peekFraction={first ? 0.8 : 0.7}
      fitContent
      closeSignal={closeSignal}
      onDismissed={() => { router.back(); settleWhoSeesYou(answer.current ?? (first ? null : mapVisibility ?? null)); }}
      // A touch smaller than other sheets' titles, so the question stays on one line on a phone.
      header={<SheetTitle title="Who can see you on the map?" titleSize={21} line={first ? 'You can change this any time.' : undefined} onClose={close} />}
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <WhoSeesArt choice={picked} name={currentUser?.name ?? 'You'} seed={currentUser?.avatarSeed ?? 'you'} uri={currentUser?.avatarUrl} />
        {teen ? (
          <View style={styles.notice} accessibilityRole="text">
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.brand} />
            <View style={styles.noticeWords}>
              <Text style={styles.noticeText}>{TEEN_NOTICE}</Text>
              <Text style={styles.noticeSmall}>Under 18, the map is only between friends who follow each other: strangers never see you, and you only see friends. Under 16s stay off the map.</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.choices} accessibilityRole="radiogroup">
          {choices.map((c) => {
            const on = picked === c.value;
            return (
              <Pressable key={c.value} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${c.label}. ${c.line}`} onPress={() => { void pick(c.value); }} style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && { transform: [{ scale: 0.985 }] }]}>
                <View style={[styles.tile, on && styles.tileOn]}><Ionicons name={ICON[c.value]} size={19} color={on ? colors.bg : colors.textMuted} /></View>
                <View style={styles.words}>
                  <Text style={styles.label}>{c.label}</Text>
                  <Text style={styles.line}>{c.line}</Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {first ? (
          <Submit label="Continue" busy={busy} busyLabel="Saving…" onPress={() => { void proceed(); }} />
        ) : locationEnabled ? (
          <Pressable accessibilityRole="button" onPress={locationOff} style={({ pressed }) => [styles.off, pressed && { opacity: 0.7 }]}>
            <Ionicons name="navigate-outline" size={16} color={colors.textMuted} />
            <Text style={styles.offText}>Turn off location</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </DragSheet>
  );
}

/** Where the six faces round you sit, and which two follow you back. */
const AROUND = [
  { a: -150, friend: false }, { a: -90, friend: true }, { a: -30, friend: false },
  { a: 30, friend: true }, { a: 90, friend: false }, { a: 150, friend: false },
];
const ART = 168;
const FACE = 26;
const REACH = 62;

/**
 * The answer, drawn: you in the middle of your patch of map, six players
 * round you, two of them people you follow back. Players nearby: all six
 * see you. Only people you follow back: only those two stay. Only me:
 * everyone fades, and your face shows the eye shut. Each change eases over
 * (Reduce Motion: quicker, still a fade).
 */
function WhoSeesArt({ choice, name, seed, uri }: { choice: MapVisibility; name: string; seed: string; uri?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.patch} />
      {AROUND.map((f, i) => {
        const shown = choice === 'nearby' || (choice === 'mutuals' && f.friend);
        const x = Math.cos((f.a * Math.PI) / 180) * REACH;
        const y = Math.sin((f.a * Math.PI) / 180) * REACH * 0.72;
        return <ArtFace key={i} shown={shown} friend={f.friend} x={x} y={y} />;
      })}
      <View style={styles.youWrap}>
        <View style={styles.youRing}><Avatar name={name} seed={seed} uri={uri} size={46} /></View>
        <Fade on={choice === 'none'} style={styles.eye}><Ionicons name="eye-off" size={12} color={colors.bg} /></Fade>
      </View>
    </View>
  );
}

function ArtFace({ shown, friend, x, y }: { shown: boolean; friend: boolean; x: number; y: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Fade on={shown} dim={0.14} style={[styles.face, friend && styles.faceFriend, { transform: [{ translateX: x }, { translateY: y }] }]}>
      <Ionicons name="person" size={13} color={friend ? colors.brand : colors.textFaint} />
    </Fade>
  );
}

/** Eases between shown and `dim` (gone, unless said). */
function Fade({ on, dim = 0, style, children }: { on: boolean; dim?: number; style?: object | object[]; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(on ? 1 : dim);
  useEffect(() => { v.value = withTiming(on ? 1 : dim, { duration: reduce ? 150 : 320, easing: Easing.bezier(0.4, 0, 0.2, 1) }); }, [on, dim, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[style, look]}>{children}</Animated.View>;
}

const styleDefinitions = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xl, gap: spacing.md },
  art: { height: ART, alignItems: 'center', justifyContent: 'center' },
  // Your patch of map: a soft round of the brand's dim, edged like a map's area.
  patch: { position: 'absolute', width: ART + 40, height: ART - 8, borderRadius: (ART + 40) / 2, backgroundColor: withAlpha(colors.brand, 0.07), borderWidth: 1, borderColor: withAlpha(colors.brand, 0.18), borderStyle: 'dashed' },
  face: { position: 'absolute', width: FACE, height: FACE, borderRadius: FACE / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...lift },
  faceFriend: { borderWidth: 2, borderColor: colors.brand },
  youWrap: { alignItems: 'center', justifyContent: 'center' },
  youRing: { padding: 3, borderRadius: 30, backgroundColor: colors.surface, ...lift },
  eye: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  choices: { gap: spacing.sm },
  choice: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  choiceOn: { borderColor: colors.text },
  tile: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tileOn: { backgroundColor: colors.text },
  words: { flex: 1, gap: 2 },
  label: { ...typography.bodyStrong, color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.text },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: withAlpha(colors.brand, 0.08), borderWidth: 1, borderColor: withAlpha(colors.brand, 0.2) },
  noticeWords: { flex: 1, gap: 4 },
  noticeText: { ...typography.bodyStrong, color: colors.text, lineHeight: 21 },
  noticeSmall: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  error: { ...typography.small, color: colors.danger },
  off: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, marginTop: spacing.xs },
  offText: { ...typography.smallStrong, ...font('600'), color: colors.text },
});
