import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import * as haptics from '@/lib/haptics';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen, Toggle } from '@/components/ui';
import { TOGGLE } from '@/components/ui/toggleLook';
import { Wash } from '@/components/Wash';
import { AUTO_DARK_AVAILABLE, liveTheme, pickedTheme, remapFor, setAutoDark, shownWithAutoDark, themeList, themes, useAutoDark, useTheme, useThemedStyles, type ThemeName } from '@/theme/ThemeProvider';
import { FADE_MS, FadeCopy, FadeFill, FadeSpot, FadeText, useThemeFade, type FadeStore } from '@/theme/ThemeFade';
import { colors, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { learned } from '@/features/tips/tips';
import { catchUpNow } from '@/theme/catchUp';
import { useNavigation } from 'expo-router';
import { useApp } from '@/store/AppContext';
import { joinedAfterCutoff, showEarlyMemberNote, themeAllowed } from '@/theme/earlyThemes';

const LEAD = 'Applies everywhere straight away. Pick the court you would rather be on.';
/**
 * Match phone (Oct 25): asked for as "a toggle where you can do like automatic dark mode … it
 * automatically turned dark mode when your phone does", named by the owner the same day ("Match
 * phone. On for new users": on from the start for a new player, see ThemeProvider's matchPhoneFrom).
 * Instagram calls the same thing "System default", Snapchat "Match System". The switch is named
 * Match phone for screen readers too (the auto-tester finds it by that name).
 */
const AUTO_TITLE = 'Match phone';
/** The quiet line early members see above the courts, when EARLY_MEMBER_NOTE is on (src/theme/earlyThemes.ts). */
const EARLY_NOTE = 'Early member · every court is yours';
const AUTO_LINE = `Dark when your ${Platform.OS === 'web' ? 'device' : 'phone'} is in dark mode`;

/**
 * Every court, with a swatch and a line on what it is, on its own page.
 *
 * A pick changes this page at once and fades the old look off it (ThemeFade,
 * Oct 23, owner: "It should just be super smooth. No lag"): the page, its
 * words and the cards are redrawn in the new court on the tap, with a copy of
 * each in the old court on top, fading out. The rest of the app follows out
 * of sight (src/theme/catchUp.ts).
 */
export default function ThemePage() {
  const styles = useThemedStyles(styleDefinitions);
  const { theme, setTheme } = useTheme();
  const { store, begin } = useThemeFade();
  // Every court for early members; Clean and Night for players who joined after the launch cutoff
  // (src/theme/earlyThemes.ts; no cutoff yet, so every court for everyone).
  // Unless the account is known to have joined after the cutoff, the court you are on is always
  // listed (and the one you were on as the page opened, so the list never shrinks under you): a
  // guest, an account whose join time isn't read yet, or a link opened before the app has loaded
  // keeps seeing their own court ticked; it is never taken off the page. A known new player has
  // only Clean and Night (EarlyThemesGate has already moved them off any other).
  const joinedAt = useApp().currentUser?.joinedAt;
  const [openedOn] = useState(pickedTheme);
  const keepOwn = !joinedAfterCutoff(joinedAt);
  const courts = themeList.filter((option) =>
    themeAllowed(option.name, joinedAt) || (keepOwn && (option.name === pickedTheme() || option.name === openedOn)));
  const earlyNote = showEarlyMemberNote(joinedAt);
  // Found the themes: the dot on Profile's ☰ has done its job, however this page was reached.
  useEffect(() => { learned('theme'); }, []);
  // An iPhone's edge swipe back shows Profile under the finger from its first pixel: Profile is let go
  // onto the picked court as the swipe starts, not mid-drag (the app's own Back does this in goBack).
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('transitionStart' as never, ((e: { data?: { closing?: boolean } }) => { if (e?.data?.closing) catchUpNow('active'); }) as never), [navigation]);
  // The check pops in only on a pick, not when the page opens.
  const opened = useRef(false);
  useEffect(() => { opened.current = true; }, []);
  const onPick = useCallback((name: ThemeName) => {
    const leaving = liveTheme();
    if (name === leaving) return;
    haptics.tap();
    // One go, one redraw: the old look's copies go on as the page turns to the new court.
    begin(leaving);
    setTheme(name);
  }, [begin, setTheme]);
  // Match phone switched: the page fades to Night (or back) as for a pick, when the phone is dark.
  const onAuto = useCallback((on: boolean) => {
    const leaving = liveTheme();
    if (shownWithAutoDark(on) !== leaving) begin(leaving);
    setAutoDark(on);
  }, [begin]);

  return (
    <Screen title="Theme" compactTitle onBack={() => goBack()} themeFade={store}>
      <View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>{LEAD}</Text>
        <FadeSpot store={store} render={(layers) => layers.map((layer) => <FadeText key={layer.key} op={layer.op} style={remapFor(layer.theme, styleDefinitions).lead} text={LEAD} maxFontSizeMultiplier={TextScale.CARD} testID="theme-fade-text" />)} />
      </View>
      {AUTO_DARK_AVAILABLE ? <AutoDarkRow onChange={onAuto} styles={styles} fade={store} /> : null}
      {earlyNote ? (
        <View>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.earlyNote}>{EARLY_NOTE}</Text>
          <FadeSpot store={store} render={(layers) => layers.map((layer) => <FadeText key={layer.key} op={layer.op} style={remapFor(layer.theme, styleDefinitions).earlyNote} text={EARLY_NOTE} maxFontSizeMultiplier={TextScale.CARD} testID="theme-fade-text" />)} />
        </View>
      ) : null}
      <View style={styles.list}>
        {courts.map((option) => (
          <ThemeCard key={option.name} option={option} active={theme === option.name} onPick={onPick} styles={styles} fade={store} pop={opened.current} />
        ))}
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  list: { gap: spacing.sm },
  earlyNote: { ...typography.caption, color: colors.textMuted, paddingBottom: spacing.sm },
  // The edge is its own layer (cardEdge), not a border here: a phone draws a view's border over
  // everything inside it, so the new court's edge would cover the fading copy of the old one.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md + 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  // A card's words and edge in the court being left, laid exactly over the live ones.
  cardCopy: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // The court as a tiny page: its ground with its wash faintly on it, nothing else.
  swatch: { width: 56, height: 48, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  words: { flex: 1, gap: 2 },
  name: { ...typography.bodyStrong, color: colors.text },
  blurb: { ...typography.small, color: colors.textMuted },
  slot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong },
  // Where the slot sits in the card: its right padding in, the full height, the ring in the middle.
  ringCopy: { position: 'absolute', top: 0, bottom: 0, right: spacing.md + 1, width: 24, alignItems: 'center', justifyContent: 'center' },
  // Match phone: a card like the courts', a little apart from them above the list.
  autoRow: { marginBottom: spacing.lg },
  // Its swatch: the court picked and Night, side by side, the two it moves between.
  half: { flex: 1 },
  toggleSpace: { width: TOGGLE.W },
});

type Styles = ReturnType<typeof useThemedStyles<typeof styleDefinitions>>;

/**
 * Match phone's switch, in a card like the courts' (Oct 25). Its swatch is the court you
 * picked beside Night: what the app moves between as your phone goes light and dark. Bottom to top
 * as a ThemeCard: the old court's face (fading), the live face, the live edge, the old court's
 * words and edge (fading).
 */
const AutoDarkRow = memo(function AutoDarkRow({ onChange, styles, fade }: { onChange: (on: boolean) => void; styles: Styles; fade: FadeStore }) {
  const on = useAutoDark();
  useTheme(); // drawn again with each change of court
  const light = themes[pickedTheme()];
  const night = themes.night;
  return (
    <View style={[styles.card, styles.autoRow]}>
      <FadeSpot store={fade} render={(layers) => layers.map((layer) => <FadeFill key={layer.key} op={layer.op} color={themes[layer.theme].surface} radius={radius.lg} testID="theme-fade-card" />)} />
      <View style={[styles.swatch, { flexDirection: 'row', borderColor: light.border }]}>
        <View style={[styles.half, { backgroundColor: light.bg }]} />
        <View style={[styles.half, { backgroundColor: night.bg }]} />
      </View>
      <View style={styles.words}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name}>{AUTO_TITLE}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.blurb}>{AUTO_LINE}</Text>
      </View>
      <Toggle value={on} onChange={onChange} accessibilityLabel={AUTO_TITLE} haptic />
      <View pointerEvents="none" style={styles.cardEdge} />
      <FadeSpot store={fade} render={(layers) => layers.map((layer) => {
        const s = remapFor(layer.theme, styleDefinitions);
        return (
          <FadeCopy key={layer.key} op={layer.op} style={s.cardCopy} testID="theme-fade-card">
            <View style={swatchSpace} />
            <View style={s.words}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={s.name}>{AUTO_TITLE}</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={s.blurb}>{AUTO_LINE}</Text>
            </View>
            <View style={s.toggleSpace} />
          </FadeCopy>
        );
      })} />
    </View>
  );
});

/**
 * One theme to pick. Choosing it is a small moment: the card gives a little
 * push and a check pops into its ring; the check leaves the card picked
 * before at once. Bottom to top: the old court's card face (fading), the live
 * face, the live edge, then the old court's words and edge (fading).
 */
const ThemeCard = memo(function ThemeCard({ option, active, onPick, styles, fade, pop }: {
  option: (typeof themeList)[number];
  active: boolean;
  onPick: (name: ThemeName) => void;
  styles: Styles;
  fade: FadeStore;
  pop: boolean;
}) {
  const palette = themes[option.name];
  const push = useSharedValue(1);
  // The card answers the tap itself with a little push (it only ever rests at its full size).
  const pick = () => {
    if (!active) push.value = withSequence(withTiming(0.992, { duration: 50 }), withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }));
    onPick(option.name);
  };
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: push.value }] }));
  return (
    <Pressable accessibilityRole="radio" aria-checked={active} accessibilityLabel={`${option.label} theme`} onPress={pick}>
      <Animated.View style={[styles.card, cardStyle]}>
        <FadeSpot store={fade} render={(layers) => layers.map((layer) => <FadeFill key={layer.key} op={layer.op} color={themes[layer.theme].surface} radius={radius.lg} testID="theme-fade-card" />)} />
        <View style={[styles.swatch, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <Wash theme={option.name} height={48} strength={0.7} fade={palette.bg} swatch />
        </View>
        <View style={styles.words}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name}>{option.label}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.blurb}>{option.blurb}</Text>
        </View>
        <View style={styles.slot}>
          {active ? <CheckPop color={palette.brand} pop={pop} /> : <View style={styles.ring} />}
        </View>
        <View pointerEvents="none" style={styles.cardEdge} />
        <FadeSpot store={fade} render={(layers) => layers.map((layer) => (
          <React.Fragment key={layer.key}>
            <CardCopy op={layer.op} theme={layer.theme} label={option.label} blurb={option.blurb} />
            {/* Its own copy, so a card picked or left mid-fade adds or drops it rather than redrawing a copy that is fading. */}
            {active ? null : <RingCopy op={layer.op} theme={layer.theme} />}
          </React.Fragment>
        ))} />
      </Animated.View>
    </Pressable>
  );
});

/** A card's words and edge in the court being left: a spacer where the swatch sits, the slot left empty. */
const CardCopy = memo(function CardCopy({ op, theme, label, blurb }: { op: SharedValue<number>; theme: ThemeName; label: string; blurb: string }) {
  const s = remapFor(theme, styleDefinitions);
  return (
    <FadeCopy op={op} style={s.cardCopy} testID="theme-fade-card">
      <View style={swatchSpace} />
      <View style={s.words}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={s.name}>{label}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={s.blurb}>{blurb}</Text>
      </View>
      <View style={s.slot} />
    </FadeCopy>
  );
});

/** An empty ring in the court being left, over the live one. */
const RingCopy = memo(function RingCopy({ op, theme }: { op: SharedValue<number>; theme: ThemeName }) {
  const s = remapFor(theme, styleDefinitions);
  return (
    <FadeCopy op={op} style={s.ringCopy} testID="theme-fade-card">
      <View style={s.ring} />
    </FadeCopy>
  );
});
const swatchSpace = { width: 56, height: 48 } as const;

/**
 * The check, there only on the card picked, so the one picked before goes at
 * once. On a pick it pops in (an animated style only while it moves), then
 * rests as a plain view: a check that rests in one look only can never be
 * left showing an old one (see src/components/ui/restMotion.ts).
 */
const CheckPop = memo(function CheckPop({ color, pop }: { color: string; pop: boolean }) {
  const [phase, setPhase] = useState<'pop' | 'rest'>(() => (pop ? 'pop' : 'rest'));
  const on = useSharedValue(pop ? 0 : 1);
  useEffect(() => {
    if (phase !== 'pop') return undefined;
    on.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never });
    // To rest once the page's fade is over too (no redraw lands during it), well inside the second in
    // which a phone still syncs a settled value back (restMotion.ts); it looks the same either way.
    const rest = setTimeout(() => setPhase('rest'), Math.max(140, FADE_MS) + 80);
    return () => clearTimeout(rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.8 + 0.2 * on.value }] }));
  const icon = <Ionicons name="checkmark-circle" size={24} color={color} />;
  return phase === 'pop' ? <Animated.View style={style}>{icon}</Animated.View> : <View>{icon}</View>;
});
