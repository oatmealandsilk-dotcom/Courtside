import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { DragSheet } from '@/components/DragSheet';
import { Avatar } from '@/components/ui';
import { SheetTitle, Submit } from '@/components/sheet/SheetForm';
import type { MapVisibility } from '@/data/types';
import { CONSENT_CHOICES, FIRST_YES, TEEN_NOTICE, onTeenMap, settleWhoSeesYou } from '@/features/players/mapPrivacy';
import { checkInEnds, clock } from '@/features/players/checkIn';
import { BIRTHDAY_OPENS_IT, ageUnknown } from '@/features/players/age';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography, withAlpha, buttonShape } from '@/theme';

/**
 * "Who can see you on the map?" (migration 189, after Apple's 5.1.2(i)
 * review): a plain yes or no. Yes: friends who follow each other with you
 * see your pin, but only after you tap Check in, and only until 10pm that
 * day. Strangers never see where you are. No: nothing of yours is ever on
 * the map.
 *
 * `mode=first`: the first time you tap Up to hit, the short version (Oct 28,
 * owner: "I don't like the at big who can see you on the map screen"): "Show
 * friends you're up to hit?", one line saying who sees you (only friends you
 * both follow, never strangers), when (only when you tap Up to hit) and that
 * it ends by itself. "Turn on for friends" saves the yes; then Apple's own
 * location prompt, then Up to hit. "Not now" (or closing it) saves nothing
 * and shares nothing; it asks again the next time you tap Up to hit.
 * `mode=manage`: from Settings → Privacy. A tap saves at once; "No one"
 * also takes any live check-in off the map.
 *
 * A teen (migration 78) reads the same two answers under a short notice;
 * their rule is unchanged: only friends who follow each other, only their
 * rough area, off until they say yes here (under 16s too, migration 119).
 */
export default function MapVisibilitySheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ mode?: string }>();
  const first = params.mode !== 'manage';
  const { actions, mapVisibility, currentUser, teenMap } = useApp();
  const teen = onTeenMap(currentUser, teenMap);
  const yesNow = mapVisibility === 'mutuals' || mapVisibility === 'nearby';
  const [picked, setPicked] = useState<MapVisibility>(first || yesNow ? 'mutuals' : 'none');
  const [busy, setBusy] = useState<MapVisibility | null>(null);
  const [error, setError] = useState('');
  const [closeSignal, setCloseSignal] = useState(0);
  // The sheet hugs its words and buttons (Oct 28, owner: "I don't like the at big who can see you on the map screen"):
  // without these heights a phone's sheet opened to its peek and left a wide empty gap above the buttons.
  const [contentH, setContentH] = useState(0);
  const [footH, setFootH] = useState(0);
  // What the screen closes with: the answer once it is saved, else nothing.
  const answer = useRef<MapVisibility | null>(null);
  const close = () => setCloseSignal((n) => n + 1);
  const settled = () => answer.current ?? (first ? null : mapVisibility ?? null);
  // However the screen goes (a phone's Back as well as Close), whoever asked hears how it ended.
  useEffect(() => () => { settleWhoSeesYou(settled()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: MapVisibility) => {
    if (busy) return;
    setPicked(v);
    setError('');
    if (!first && (v === 'mutuals' ? yesNow : mapVisibility === 'none')) { answer.current = v; return; }
    setBusy(v);
    const ok = await actions.setMapVisibility(v);
    setBusy(null);
    if (!ok) { setError('Couldn’t save that. Try again.'); setPicked(first || yesNow ? 'mutuals' : 'none'); return; }
    answer.current = v;
    if (first) close();
  };

  return (
    <DragSheet
      peekFraction={first ? 0.8 : 0.7}
      fitContent
      contentHeight={contentH && footH ? contentH + footH : undefined}
      closeSignal={closeSignal}
      onDismissed={() => { router.back(); settleWhoSeesYou(settled()); }}
      // A touch smaller than other sheets' titles, so the question stays on one line on a phone.
      header={<SheetTitle title={first ? 'Show friends you’re up to hit?' : 'Who can see you on the map?'} titleSize={21} onClose={close} />}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        {/* Plain words, no drawing and no icon bullets (Oct 27, owner: "make who can see you on the map look more aesthetic less ai"). */}
        {first ? (
          <View style={styles.short}>
            {/* Apple 5.1.2(i) / 5.1.1: who (only friends you both follow, never strangers), when (only on a tap), and that it ends by itself. */}
            <Text style={styles.shortLine}>Only friends you both follow see you, never strangers, and only when you tap Up to hit. It ends by itself {endsWords()}.</Text>
            <Text style={styles.shortSmall}>Change any time in Settings → Privacy.</Text>
          </View>
        ) : (
          <View style={styles.facts}>
            {FACTS.map((f) => (
              <Text key={f.text} style={styles.factText}>{f.text}</Text>
            ))}
          </View>
        )}
        {teen ? (
          <View style={styles.notice} accessibilityRole="text">
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.brand} />
            <View style={styles.noticeWords}>
              <Text style={styles.noticeText}>{TEEN_NOTICE}</Text>
              <Text style={styles.noticeSmall}>Under 18, only people you follow who follow you back can see you, and only your rough area.</Text>
              {/* No birthday given (it is optional since Oct 17): say what adding one opens up. */}
              {ageUnknown(currentUser) ? <Text style={styles.noticeSmall}>{BIRTHDAY_OPENS_IT}</Text> : null}
            </View>
          </View>
        ) : null}
        {first ? null : (
          <View style={styles.choices} accessibilityRole="radiogroup">
            {CONSENT_CHOICES.map((c) => {
              const on = picked === c.value;
              return (
                <Pressable key={c.value} accessibilityRole="radio" accessibilityState={{ selected: on, busy: busy === c.value }} accessibilityLabel={`${c.label}. ${c.line}`} onPress={() => { void save(c.value); }} style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && { transform: [{ scale: 0.985 }] }]}>
                  <View style={[styles.tile, on && styles.tileOn]}><Ionicons name={c.value === 'none' ? 'eye-off-outline' : 'swap-horizontal-outline'} size={19} color={on ? colors.bg : colors.textMuted} /></View>
                  <View style={styles.words}>
                    <Text style={styles.label}>{c.label}</Text>
                    <Text style={styles.line}>{c.line}</Text>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
      {/* The way forward sits under the list, never scrolled off a short phone. */}
      <View style={[styles.footer, !first && styles.footerBare]} onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h !== footH) setFootH(h); }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {first ? (
          <>
            <Submit label={FIRST_YES} busy={busy === 'mutuals'} busyLabel="Saving…" onPress={() => { void save('mutuals'); }} />
            <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.off, pressed && { opacity: PRESS_DIM }]}>
              <Text style={styles.offText}>Not now</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </DragSheet>
  );
}

/** When Up to hit tapped now ends by itself: "at 10pm", or "after 2 hours" from 8pm on (checkInEnds). */
function endsWords(now: Date = new Date()): string {
  return now.getHours() >= 20 ? 'after 2 hours' : `at ${clock(checkInEnds(now))}`;
}

/** What a yes means, said plainly before it is given (Settings → Privacy). */
const FACTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'hand-left-outline', text: 'You show on the map only when you tap Up to hit. Never on your own.' },
  { icon: 'people-outline', text: 'Only friends who follow each other with you see your pin. Strangers never see where you are.' },
  { icon: 'time-outline', text: 'It ends by itself at 10pm (after 2 hours, late in the day). Tap Turn off to hide at once.' },
];

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
 * round you, two of them friends who follow you back. Friends: only those
 * two see you. No one: everyone fades, and your face shows the eye shut.
 * Each change eases over (Reduce Motion: quicker, still a fade).
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
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.md },
  // A clear step down from the words to the buttons.
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  // Settings → Privacy has no buttons under its choices (a tap saves): only the sheet's own foot.
  footerBare: { paddingTop: 0 },
  art: { height: ART, alignItems: 'center', justifyContent: 'center' },
  // Your patch of map: a soft round of the brand's dim, edged like a map's area.
  patch: { position: 'absolute', width: ART + 40, height: ART - 8, borderRadius: (ART + 40) / 2, backgroundColor: withAlpha(colors.brand, 0.07), borderWidth: 1, borderColor: withAlpha(colors.brand, 0.18), borderStyle: 'dashed' },
  face: { position: 'absolute', width: FACE, height: FACE, borderRadius: FACE / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...lift },
  faceFriend: { borderWidth: 2, borderColor: colors.brand },
  youWrap: { alignItems: 'center', justifyContent: 'center' },
  youRing: { padding: 3, borderRadius: 30, backgroundColor: colors.surface, ...lift },
  eye: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  facts: { gap: spacing.md },
  short: { gap: spacing.sm },
  shortLine: { ...typography.body, color: colors.text, lineHeight: 22 },
  shortSmall: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  factText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 21 },
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
  off: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: buttonShape.height, borderRadius: buttonShape.radius, ...buttonShape.curve, borderWidth: 1, borderColor: colors.borderStrong },
  offText: { ...typography.smallStrong, ...font('600'), color: colors.text },
});
