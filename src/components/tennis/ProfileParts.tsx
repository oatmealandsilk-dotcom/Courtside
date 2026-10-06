import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { AchievementProgress } from '@/lib/badges';
import { tierColor } from '@/lib/badges';
import { show as showToast } from '@/lib/toast';
import { mixHex } from '@/features/activity/zones';
import { daysUntil } from '@/features/players/tennisProfile';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, pageIsDark, spacing, typography, withAlpha } from '@/theme';

/*
 * The pieces the Tennis profile page is built from (Oct 5): a section's head,
 * the white box each section sits in, a row on a hairline (the hairline
 * starting at the words, not the tile), the countdown to a tournament, the
 * row of medals and the bar to the next one. Everything from the theme's
 * slots, so every court draws them in its own colours.
 */

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * A section's title at 22, one muted line under it, and on the right either
 * a link or, on the first section of a tab only you see, the "Only you"
 * label (Oct 5, option A: it replaced a lock after every private heading).
 * `count` is a small number after the title ("Waiting on you 2").
 */
export function SectionHead({ title, onlyYou = false, count, line, link }: {
  title: string;
  onlyYou?: boolean;
  count?: number;
  line?: string;
  link?: { label: string; onPress: () => void; accessibilityLabel?: string };
}) {
  const styles = useThemedStyles(styleDefinitions);
  const spoken = [title, count ? String(count) : '', onlyYou ? 'Only you see this' : ''].filter(Boolean).join('. ');
  return (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <View style={styles.headTitle} accessible accessibilityRole="header" accessibilityLabel={spoken}>
          <Text style={styles.title}>{title}</Text>
          {count ? <View style={styles.count}><Text style={styles.countText}>{count}</Text></View> : null}
        </View>
        {link ? (
          <Pressable accessibilityRole="button" accessibilityLabel={link.accessibilityLabel ?? link.label} onPress={link.onPress} hitSlop={{ left: 12, right: 12 }} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text style={styles.linkText}>{link.label}</Text>
          </Pressable>
        ) : onlyYou ? <OnlyYou /> : null}
      </View>
      {line ? <Text style={styles.line}>{line}</Text> : null}
    </View>
  );
}

/** "Only you", small and quiet, with a crossed-out eye (a lock read as "not unlocked yet", Oct 6): said once per private tab, in plain words. Read as part of the heading it sits beside. */
export function OnlyYou() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.onlyYou} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name="eye-off-outline" size={10} color={colors.textMuted} />
      <Text style={styles.onlyYouText}>Only you</Text>
    </View>
  );
}

/** A section's white box: rounded, lifted a touch off the page, its rows inside on the page's 16-point gutter. */
export function Box({ children, padded = false }: { children: React.ReactNode; padded?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={[styles.box, padded && styles.boxPadded]}>{children}</View>;
}

/**
 * The medal nearest to winning, under the row of medals: its name, how far
 * along ("21 of 30 days") and a bar in the metal it will be.
 */
export function NextMedal({ next }: { next: AchievementProgress }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const a = next.achievement;
  const share = Math.max(0, Math.min(1, next.target > 0 ? next.current / next.target : next.progress));
  const far = `${next.current} of ${next.target}${next.unit ? ` ${next.unit}` : ''}`;
  return (
    <View style={styles.next} accessible accessibilityLabel={`Next medal: ${a.name}, ${far}`}>
      <View style={styles.nextRow}>
        <Text style={styles.nextName} numberOfLines={1}>Next: {a.name}</Text>
        <Text style={styles.nextFar}>{far}</Text>
      </View>
      <View style={styles.nextTrack}>
        <View style={[styles.nextFill, { width: `${Math.round(share * 100)}%`, backgroundColor: medalTint(a.tier) }]} />
      </View>
    </View>
  );
}

/** The square a row leads with: 40 by 40, a half-step up from the page, the icon in muted ink. `brand` for an add-something row. */
export function Tile({ icon, brand = false, children }: { icon?: IconName; brand?: boolean; children?: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.tile, brand && styles.tileBrand]}>
      {children ?? (icon ? <Ionicons name={icon} size={18} color={brand ? colors.brand : colors.textMuted} /> : null)}
    </View>
  );
}

/**
 * A row on a hairline: a lead (a tile, a marker, a countdown) and the words,
 * with the hairline over the words only. At least 56 tall; pressable when
 * given `onPress`.
 */
export function Row({ lead, leadWidth, first = false, title, titleStyle, sub, subLines = 1, right, onPress, onLongPress, accessibilityLabel, accessibilityRole = 'button', minHeight = 56, chevron = false }: {
  lead?: React.ReactNode;
  /** The lead's column width, when it is not a 40 tile (a 56 countdown). */
  leadWidth?: number;
  first?: boolean;
  title: React.ReactNode;
  titleStyle?: object;
  sub?: React.ReactNode;
  subLines?: number;
  right?: React.ReactNode;
  onPress?: () => void;
  /** A hold on the row (Remove, for a logged session), offered to a screen reader as an action of its own. */
  onLongPress?: { label: string; run: () => void };
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  minHeight?: number;
  chevron?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const body = (
    <>
      {lead ? <View style={[styles.lead, leadWidth ? { width: leadWidth } : null]}>{lead}</View> : null}
      <View style={[styles.body, { minHeight }, !first && styles.hairline]}>
        <View style={styles.words}>
          {typeof title === 'string' ? <Text style={[styles.rowTitle, titleStyle]} numberOfLines={2}>{title}</Text> : title}
          {sub ? (typeof sub === 'string' ? <Text style={styles.rowSub} numberOfLines={subLines}>{sub}</Text> : sub) : null}
        </View>
        {right}
        {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
      </View>
    </>
  );
  if (!onPress && !onLongPress) return <View style={styles.row} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <Pressable
      accessibilityRole={onPress ? accessibilityRole : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: onLongPress.label }] : undefined}
      onAccessibilityAction={onLongPress ? (e) => { if (e.nativeEvent.actionName === 'longpress') onLongPress.run(); } : undefined}
      onPress={onPress}
      onLongPress={onLongPress?.run}
      delayLongPress={450}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** An empty section's one row: a brand-dim tile and what to do, in the brand colour. */
export function AddRow({ icon, title, sub, onPress, first = true }: { icon: IconName; title: string; sub?: string; onPress: () => void; first?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Row first={first} lead={<Tile icon={icon} brand />} title={<Text style={styles.addTitle}>{title}</Text>} sub={sub} subLines={2} onPress={onPress} accessibilityLabel={sub ? `${title}. ${sub}` : title} />
  );
}

/** The contrast between two #RRGGBB colours, as WCAG counts it (1 to 21). */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A fill deepened a twentieth at a time toward the page's text colour until
 * `ink` on it reaches `target`: unchanged where it already does. Melbourne's
 * light blue takes the most (white on it is only 4:1), London's green none.
 */
function deepenFor(fill: string, ink: string, target: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(fill) || !/^#[0-9a-f]{6}$/i.test(ink)) return fill;
  let out = fill;
  for (let step = 1; contrast(ink, out) < target && step <= 12; step++) out = mixHex(fill, colors.text, step * 0.05);
  return out;
}

/** A small tag on a row ("Entered", "Watching"): radius 6, since a pill would read as something to press. */
export function Tag({ label, on = false }: { label: string; on?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  // An "on" tag is the brand colour, deepened where its ink on it fell short of 4.5:1 (white on Melbourne's blue is 4:1).
  return <View style={[styles.tag, on && { backgroundColor: deepenFor(colors.brand, colors.brandInk, 4.5) }]}><Text style={[styles.tagText, on && styles.tagTextOn]}>{label}</Text></View>;
}

/**
 * How long until a tournament, in its court's colour on a whisper of it:
 * "26 days", "Today" on the day, and from 100 days out the date itself.
 */
export function CountdownTile({ iso, slot }: { iso: string; slot: 'hard' | 'clay' | 'grass' | 'court' }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const tint = colors[slot];
  const dark = pageIsDark();
  // On a light page both the number and its word are a step toward the text, so they read on the tint as well
  // as on the page: the light clay courts' own colour was under 3:1 there (Paris 2.8:1). A dark page keeps the
  // court's colour for the number, which already reads.
  const ink = dark ? tint : mixHex(tint, colors.text, 0.25);
  const small = mixHex(tint, colors.text, dark ? 0.25 : 0.4);
  const days = daysUntil(iso);
  const d = new Date(iso);
  const [big, word] = days <= 0 ? ['Today', ''] : days >= 100 ? [String(d.getDate()), d.toLocaleDateString(undefined, { month: 'short' })] : [String(days), days === 1 ? 'day' : 'days'];
  return (
    <View style={[styles.countdown, { backgroundColor: withAlpha(tint, 0.12) }]}>
      {days >= 100 ? <Text style={[styles.countWord, { color: small }]}>{word}</Text> : null}
      <Text maxFontSizeMultiplier={1.2} style={[days <= 0 ? styles.countToday : styles.countBig, { color: days <= 0 ? small : ink }]}>{big}</Text>
      {days > 0 && days < 100 ? <Text maxFontSizeMultiplier={1.2} style={[styles.countWord, { color: small }]}>{word}</Text> : null}
    </View>
  );
}

const TIER_ORDER = { platinum: 0, gold: 1, silver: 2, bronze: 3 } as const;

/**
 * A won medal's colour on this row: the tier's own, except silver, which is
 * the page's grey everywhere else (the locked look in the full grid). Here it
 * is a cool metal, the grey a third of the way to the court's blue, so a
 * silver medal reads as won beside the gold ones.
 */
const medalTint = (tier: AchievementProgress['achievement']['tier']) => (tier === 'silver' ? mixHex(colors.textMuted, colors.hard, 0.35) : tierColor(tier));

/** Unlocked medals in one row that scrolls sideways, gold first; a tap names the medal in a toast. Every disc is ringed in its metal, so none reads as locked. */
export function MedalRow({ items }: { items: AchievementProgress[] }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const shown = items.filter((a) => a.unlocked).sort((a, b) => TIER_ORDER[a.achievement.tier] - TIER_ORDER[b.achievement.tier]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.medalStrip} contentContainerStyle={styles.medals}>
      {shown.map(({ achievement: a }) => {
        const tint = medalTint(a.tier);
        const tier = a.tier.charAt(0).toUpperCase() + a.tier.slice(1);
        return (
          <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${a.name}, ${tier}. ${a.description}`} onPress={() => showToast({ title: a.name, body: `${tier} · ${a.description}`, icon: a.icon })} style={({ pressed }) => [styles.medal, pressed && styles.pressed]}>
            <View style={[styles.disc, { backgroundColor: withAlpha(tint, 0.18), borderColor: withAlpha(tint, 0.45) }]}>
              <Ionicons name={a.icon as IconName} size={22} color={tint} />
            </View>
            <Text style={styles.medalName} numberOfLines={2}>{a.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { gap: 4, marginBottom: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...typography.title, color: colors.text },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  countText: { ...font('600'), fontSize: 11, lineHeight: 14, color: colors.brandInk, fontVariant: ['tabular-nums'] },
  onlyYou: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  onlyYouText: { ...font('600'), fontSize: 11, lineHeight: 14, color: colors.textMuted },
  // The house's grouped box (Your sessions, Log a session): white on the page, radius 20, the soft lift.
  box: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  boxPadded: { paddingVertical: spacing.lg },
  next: { gap: 8, paddingTop: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 6 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nextName: { flex: 1, ...typography.smallStrong, color: colors.text },
  nextFar: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  nextTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  nextFill: { height: 6, borderRadius: 3 },
  // A 44-point target round a small link, without the header growing to fit it.
  link: { minHeight: 44, justifyContent: 'center', marginVertical: -12 },
  linkText: { ...typography.smallStrong, color: colors.brand },
  line: { ...typography.small, lineHeight: 19, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center' },
  lead: { width: 40, marginRight: spacing.md, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  hairline: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...typography.body, ...font('500'), lineHeight: 20, color: colors.text },
  rowSub: { ...typography.small, lineHeight: 18, color: colors.textMuted },
  addTitle: { ...typography.bodyStrong, color: colors.brand },
  pressed: { opacity: 0.6 },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  tileBrand: { backgroundColor: colors.brandDim },
  tag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.bgElevated },
  tagText: { ...typography.caption, letterSpacing: 0.2, color: colors.textMuted },
  tagTextOn: { color: colors.brandInk },
  countdown: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  countBig: { ...font('600'), fontSize: 22, lineHeight: 24, letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
  countToday: { ...font('600'), fontSize: 14, lineHeight: 18, letterSpacing: -0.2 },
  countWord: { ...font('600'), fontSize: 11, lineHeight: 13 },
  medalStrip: { marginHorizontal: -spacing.lg },
  // The first medal's name starts on the page's 16-point gutter, and each name wraps inside its own column.
  medals: { paddingHorizontal: spacing.lg, gap: 10, paddingTop: 4, paddingBottom: 2 },
  medal: { width: 72, alignItems: 'center', gap: 6, paddingVertical: 4 },
  disc: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  medalName: { ...typography.caption, letterSpacing: 0, lineHeight: 14, maxWidth: 72, color: colors.text, textAlign: 'center' },
});
