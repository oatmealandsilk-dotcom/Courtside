import React from 'react';
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
export function SheetTitle({ title, line, lineTone = 'muted', lines = 1, onClose }: { title: string; line?: string; lineTone?: 'muted' | 'brand'; lines?: number; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.title}>{title}</Text>
        {line ? <Text style={[styles.line, lineTone === 'brand' && styles.lineBrand]} numberOfLines={lines}>{line}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/** A part of the form under a heading, the way the Coaching page heads its parts. */
export function Section({ title, hint, right, children }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** One choice among a few, as the Community tab's chips: the chosen one filled with ink. Tap it again to clear, if clearing is allowed. */
export function Chips<T extends string>({ options, value, onChange, clearable = false }: { options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T | undefined) => void; clearable?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={value === o.value} tint={colors.text} ink={colors.bg} onPress={() => onChange(clearable && value === o.value ? undefined : o.value)} />
      ))}
    </View>
  );
}

/** Choices as small white tiles on a shadow, a top line and a big one: days of the week, lengths of a session. */
export function Tiles<T extends string | number>({ options, value, onChange, scroll = false, inCard = false }: { options: { value: T; top: string; main: string; label?: string }[]; value: T; onChange: (v: T) => void; scroll?: boolean; inCard?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const tiles = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label ?? `${o.top} ${o.main}`} onPress={() => onChange(o.value)} style={({ pressed }) => [styles.tile, inCard && styles.tileInCard, scroll ? styles.tileFixed : styles.tileFlex, on && styles.tileOn, pressed && !on && { opacity: 0.8 }]}>
        <Text style={[styles.tileTop, on && styles.tileInk]}>{o.top}</Text>
        <Text style={[styles.tileMain, on && styles.tileInk]}>{o.main}</Text>
      </Pressable>
    );
  });
  if (!scroll) return <View style={styles.tileRow}>{tiles}</View>;
  return (
    <View style={{ marginHorizontal: -spacing.lg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tileRow, { paddingHorizontal: spacing.lg, paddingVertical: 6 }]}>{tiles}</ScrollView>
      <LinearGradient pointerEvents="none" colors={inCard ? [`${colors.surface}00`, colors.surface] : [`${colors.bg}00`, colors.bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fadeRight} />
    </View>
  );
}

/** A row of chips that scrolls sideways, fading at the edge so it reads as "more this way". */
export function ChipStrip<T extends string | number>({ options, value, onChange, inCard = false }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; inCard?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={{ marginHorizontal: -spacing.lg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { flexWrap: 'nowrap', paddingHorizontal: spacing.lg }]}>
        {options.map((o) => <Chip key={String(o.value)} label={o.label} selected={value === o.value} tint={colors.text} ink={colors.bg} onPress={() => onChange(o.value)} />)}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  tile: { ...lift, height: 64, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 1 },
  tileFixed: { width: 58 },
  tileFlex: { flex: 1 },
  tileOn: { backgroundColor: colors.text },
  tileTop: { fontSize: 12, ...font('500'), color: colors.textMuted },
  tileMain: { fontSize: 20, ...font('600'), letterSpacing: -0.4, color: colors.text, fontVariant: ['tabular-nums'] },
  tileInk: { color: colors.bg },
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
