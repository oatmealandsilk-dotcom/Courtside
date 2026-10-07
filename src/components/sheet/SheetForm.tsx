import React, { useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { Chip, BrandWash } from '@/components/ui';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/*
 * The pieces every sheet's form is built from, in the app's own language
 * rather than a form's: the page titles' light weight, section heads like
 * "Ask a coach", the Community tab's chips (the chosen one filled with ink),
 * white fields and tiles lifted on a soft shadow instead of outlined boxes,
 * and green kept for the one thing to press.
 */

/** The sheet's title, a line under it that can change as you fill it in, and a round close. `lines`: how many lines the line may run to (one unless said). */
export function SheetTitle({ title, line, lineTone = 'muted', lines = 1, onClose, titleSize }: { title: string; line?: string; lineTone?: 'muted' | 'brand'; lines?: number; onClose: () => void; /** A little smaller than the usual 24, for a longer title that should stay on one line on a phone. */ titleSize?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.title, titleSize ? { fontSize: titleSize, letterSpacing: -0.03 * titleSize } : null]}>{title}</Text>
        {line ? <Text style={[styles.line, lineTone === 'brand' && styles.lineBrand]} numberOfLines={lines}>{line}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * A part of the form under a heading, the way the Coaching page heads its parts.
 * `strong`: the heading in the page's ink at reading size, for a sheet whose
 * choices are drawn light (`soft`) and so no longer carry the page on their own.
 */
export function Section({ title, hint, right, strong = false, children }: { title: string; hint?: string; right?: React.ReactNode; strong?: boolean; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.section, strong && styles.sectionStrong]}>
      <View style={[styles.sectionHead, strong && styles.sectionHeadStrong]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.sectionTitle, strong && styles.sectionTitleStrong]} accessibilityRole={strong ? 'header' : undefined}>{title}</Text>
          {hint ? <Text style={[styles.sectionHint, strong && styles.sectionHintStrong]}>{hint}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** A small pill's reach: well past it above and below, barely sideways, so the two halves of a switch never take each other's taps. */
const SMALL_REACH = { top: 8, bottom: 8, left: 1, right: 1 } as const;

/**
 * One choice drawn light (`soft` on Chips and ChipStrip): a white pill on the
 * page's soft shadow that, once chosen, takes the brand's pale tint and a ring
 * in the brand, its words in ink. Quieter than an ink-filled chip, so a sheet
 * of several choices keeps the one filled thing for its button.
 */
function SoftPill({ label, a11y, on, onPress, fill = false, small = false }: { label: string; a11y?: string; on: boolean; onPress: () => void; fill?: boolean; small?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on, selected: on }} accessibilityLabel={a11y ?? label} hitSlop={small ? SMALL_REACH : 4} onPress={onPress}
      style={({ pressed }) => [styles.pill, small && styles.pillSmall, fill && styles.pillFill, on && styles.pillOn, pressed && !on && styles.pressed]}>
      <Text style={[styles.pillText, small && styles.pillTextSmall, on && styles.pillTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** One choice among a few, as the Community tab's chips: the chosen one filled with ink. Tap it again to clear, if clearing is allowed. */
export function Chips<T extends string>({ options, value, onChange, clearable = false, brand = false, soft = false, fill = false, small = false, label }: {
  /** `a11y`: what a screen reader says for a chip whose words are shorthand (":30" is "Half past"). */
  options: { value: T; label: string; a11y?: string }[]; value: T | undefined; onChange: (v: T | undefined) => void; clearable?: boolean;
  /** The chosen one in the brand colour with a tick (a match's result). */ brand?: boolean;
  /** Drawn light: white pills, the chosen one tinted and ringed in the brand (see SoftPill). */ soft?: boolean;
  /** Soft only: the pills share the row's width equally (three game types across). */ fill?: boolean;
  /** Soft only: small pills held in one white capsule, a two-way switch beside a heading (":00 / :30"). */ small?: boolean;
  /** What a screen reader calls the group. */ label?: string;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.chips, fill && styles.chipsFill, soft && small && styles.chipsTrack]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => (soft ? (
        <SoftPill key={o.value} label={o.label} a11y={o.a11y} on={value === o.value} fill={fill} small={small} onPress={() => onChange(clearable && value === o.value ? undefined : o.value)} />
      ) : (
        <Chip key={o.value} label={o.label} selected={value === o.value} tint={brand ? undefined : colors.text} ink={brand ? colors.brandInk : colors.bg} icon={brand ? 'checkmark' : undefined} onPress={() => onChange(clearable && value === o.value ? undefined : o.value)} />
      )))}
    </View>
  );
}

/**
 * Choices as small white tiles on a shadow, a top line and a big one: days of the week, lengths of a session.
 * `reveal` (a sideways row only): opened on a choice further along than the screen shows (a session from two
 * weeks ago, being edited), the row starts scrolled to it.
 */
export function Tiles<T extends string | number>({ options, value, onChange, scroll = false, inCard = false, reveal = false, soft = false }: { options: { value: T; top: string; main: string; label?: string; /** Drawn in place of the two lines (a length as "1h 30m", big figures and small units). */ draw?: (on: boolean) => React.ReactNode }[]; value: T; onChange: (v: T) => void; scroll?: boolean; inCard?: boolean; reveal?: boolean; /** The chosen tile tinted and ringed in the brand rather than filled with ink, to match soft chips. */ soft?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const scroller = useRef<ScrollView>(null);
  // Where the chosen tile lies and how wide the row is, once each is laid out; brought into view once, never again under your thumb.
  const seen = useRef({ row: 0, x: -1, w: 0, done: !reveal });
  const bringIn = () => {
    const s = seen.current;
    if (s.done || !s.row || s.x < 0) return;
    s.done = true;
    if (s.x + s.w <= s.row - 32) return;
    scroller.current?.scrollTo({ x: Math.max(0, s.x - (s.row - s.w) / 2), animated: false });
  };
  const tiles = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable key={String(o.value)} onLayout={scroll && on && !seen.current.done ? (e) => { seen.current.x = e.nativeEvent.layout.x; seen.current.w = e.nativeEvent.layout.width; bringIn(); } : undefined} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label ?? `${o.top} ${o.main}`} onPress={() => onChange(o.value)} style={({ pressed }) => [styles.tile, inCard && styles.tileInCard, scroll ? styles.tileFixed : styles.tileFlex, soft && styles.tileSoft, on && (soft ? styles.tileSoftOn : styles.tileOn), pressed && !on && { opacity: 0.8 }]}>
        {o.draw ? o.draw(on) : (
          <>
            <Text style={[styles.tileTop, on && (soft ? styles.tileSoftTopOn : styles.tileInk)]}>{o.top}</Text>
            <Text style={[styles.tileMain, on && !soft && styles.tileInk]}>{o.main}</Text>
          </>
        )}
      </Pressable>
    );
  });
  if (!scroll) return <View style={styles.tileRow}>{tiles}</View>;
  return (
    <View style={{ marginHorizontal: -spacing.lg }}>
      <ScrollView ref={scroller} onLayout={reveal ? (e) => { seen.current.row = e.nativeEvent.layout.width; bringIn(); } : undefined} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tileRow, { paddingHorizontal: spacing.lg, paddingVertical: 6 }]}>{tiles}</ScrollView>
      <LinearGradient pointerEvents="none" colors={inCard ? [`${colors.surface}00`, colors.surface] : [`${colors.bg}00`, colors.bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fadeRight} />
    </View>
  );
}

/** A row of chips that scrolls sideways, fading at the edge so it reads as "more this way". */
export function ChipStrip<T extends string | number>({ options, value, onChange, inCard = false, soft = false, label }: { options: { value: T; label: string; a11y?: string }[]; value: T; onChange: (v: T) => void; inCard?: boolean; /** Drawn light, as soft Chips. */ soft?: boolean; /** What a screen reader calls the row. */ label?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={{ marginHorizontal: -spacing.lg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole={soft ? 'radiogroup' : undefined} accessibilityLabel={label} contentContainerStyle={[styles.chips, { flexWrap: 'nowrap', paddingHorizontal: spacing.lg }, soft && styles.stripSoft]}>
        {options.map((o) => (soft
          ? <SoftPill key={String(o.value)} label={o.label} a11y={o.a11y} on={value === o.value} onPress={() => onChange(o.value)} />
          : <Chip key={String(o.value)} label={o.label} selected={value === o.value} tint={colors.text} ink={colors.bg} onPress={() => onChange(o.value)} />))}
      </ScrollView>
      <LinearGradient pointerEvents="none" colors={inCard ? [`${colors.surface}00`, colors.surface] : [`${colors.bg}00`, colors.bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fadeRight} />
    </View>
  );
}

/**
 * The one green thing on the sheet. Until the form is ready it waits quietly
 * in grey, saying what is missing; once pressed it stays green and turns a
 * small wheel while it works, saying what it is doing ("Signing in…").
 */
export function Submit({ label, onPress, disabled = false, busy = false, waiting, busyLabel }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; waiting?: string; busyLabel?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const off = disabled || busy;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onPress} style={({ pressed }) => [styles.submit, busy ? [styles.submitOn, styles.submitBusy] : off ? styles.submitOff : styles.submitOn, pressed && !off && { transform: [{ scale: 0.99 }] }]}>
      {busy ? (
        <View style={styles.submitRow}>
          <ActivityIndicator size="small" color={colors.brandInk} />
          <Text style={styles.submitText}>{busyLabel ?? label}</Text>
        </View>
      ) : (
        <>
          {off ? null : <BrandWash />}
          <Text style={[styles.submitText, off && styles.submitTextOff]}>{disabled && waiting ? waiting : label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** The small print under the button. */
export function Fine({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return <Text style={styles.fine}>{children}</Text>;
}

/** The body of a sheet's form: its padding and the rhythm between parts. */
export const formBody = { padding: spacing.lg, paddingTop: spacing.md, gap: 20, paddingBottom: spacing.xxl } as const;

const styleDefinitions = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  title: { ...typography.title, fontSize: 24, letterSpacing: -0.8, color: colors.text },
  line: { ...typography.small, color: colors.textMuted },
  lineBrand: { color: colors.brand, ...font('600') },
  close: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  // Quiet labels: the choices under them carry the page, not the headings.
  sectionTitle: { ...typography.smallStrong, color: colors.textMuted },
  sectionHint: { ...typography.small, color: colors.textFaint },
  // Strong: the heading reads first, then the light choices under it.
  sectionStrong: { gap: 10 },
  sectionHeadStrong: { alignItems: 'center' },
  sectionTitleStrong: { ...typography.bodyStrong, color: colors.text },
  sectionHintStrong: { color: colors.textMuted, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipsFill: { flexWrap: 'nowrap' },
  // The small switch's capsule: white on the soft shadow, like a stepper; only the chosen side is drawn inside it.
  chipsTrack: { ...lift, flexWrap: 'nowrap', gap: 2, padding: 3, borderRadius: radius.pill, backgroundColor: colors.surface },
  // The soft pill: white on the page's shadow, with a ring on every pill (clear until chosen) so choosing never shifts the row.
  pill: { ...lift, minHeight: 38, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pillSmall: { minHeight: 30, minWidth: 46, paddingHorizontal: 10, backgroundColor: 'transparent', boxShadow: 'none' },
  pillFill: { flex: 1, paddingHorizontal: spacing.sm },
  pillOn: { backgroundColor: colors.brandDim, borderColor: colors.brand, boxShadow: 'none' },
  pillText: { ...typography.smallStrong, fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  pillTextSmall: { fontSize: 13 },
  pillTextOn: { color: colors.text },
  pressed: { opacity: 0.7 },
  // Room above and below a soft strip for the pills' shadow, which a sideways scroller would otherwise clip.
  stripSoft: { paddingVertical: 6 },
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  tile: { ...lift, height: 64, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 1 },
  // A day's tile: 58 wide, a little wider only for a longer word on top ("Yesterday").
  tileFixed: { minWidth: 58, paddingHorizontal: 8 },
  tileFlex: { flex: 1 },
  tileOn: { backgroundColor: colors.text },
  tileTop: { fontSize: 12, ...font('500'), color: colors.textMuted },
  tileMain: { fontSize: 20, ...font('600'), letterSpacing: -0.4, color: colors.text, fontVariant: ['tabular-nums'] },
  tileInk: { color: colors.bg },
  tileSoft: { borderWidth: 1.5, borderColor: 'transparent' },
  tileSoftOn: { backgroundColor: colors.brandDim, borderColor: colors.brand, boxShadow: 'none' },
  tileSoftTopOn: { color: colors.text, ...font('600') },
  fadeRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 32 },
  submit: { height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  submitOn: { backgroundColor: colors.brand, boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.16)' },
  submitOff: { backgroundColor: colors.surfaceAlt },
  submitBusy: { opacity: 0.92 },
  submitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitText: { ...typography.bodyStrong, fontSize: 16, color: colors.brandInk },
  submitTextOff: { color: colors.textMuted },
  fine: { ...typography.small, color: colors.textFaint, textAlign: 'center', marginTop: -spacing.md },
  tileInCard: { backgroundColor: colors.bg, boxShadow: 'none' },
});
