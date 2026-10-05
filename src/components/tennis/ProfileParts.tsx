import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { AchievementProgress } from '@/lib/badges';
import { tierColor } from '@/lib/badges';
import { show as showToast } from '@/lib/toast';
import { mixHex } from '@/features/activity/zones';
import { daysUntil } from '@/features/players/tennisProfile';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, spacing, typography, withAlpha } from '@/theme';

/*
 * The pieces the Tennis profile page is built from (Oct 5): a section's head,
 * a row on a hairline (the hairline starting at the words, not the tile), the
 * countdown to a tournament and the row of medals. Everything from the
 * theme's slots, so every court draws them in its own colours.
 */

type IconName = keyof typeof Ionicons.glyphMap;

/** A section's title at 22, a lock after it on what only you see, one muted line under it, and a link on the right. */
export function SectionHead({ title, lock = false, line, link }: {
  title: string;
  lock?: boolean;
  line?: string;
  link?: { label: string; onPress: () => void; accessibilityLabel?: string };
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <View style={styles.headTitle} accessible accessibilityRole="header" accessibilityLabel={lock ? `${title}. Only you see this` : title}>
          <Text style={styles.title}>{title}</Text>
          {lock ? <Ionicons name="lock-closed-outline" size={14} color={colors.textFaint} style={styles.lock} /> : null}
        </View>
        {link ? (
          <Pressable accessibilityRole="button" accessibilityLabel={link.accessibilityLabel ?? link.label} onPress={link.onPress} hitSlop={{ left: 12, right: 12 }} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text style={styles.linkText}>{link.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {line ? <Text style={styles.line}>{line}</Text> : null}
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
export function Row({ lead, leadWidth, first = false, title, titleStyle, sub, subLines = 1, right, onPress, accessibilityLabel, accessibilityRole = 'button', minHeight = 56, chevron = false }: {
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
  if (!onPress) return <View style={styles.row} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <Pressable accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
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

/** A small tag on a row ("Entered", "Watching"): radius 6, since a pill would read as something to press. */
export function Tag({ label, on = false }: { label: string; on?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={[styles.tag, on && styles.tagOn]}><Text style={[styles.tagText, on && styles.tagTextOn]}>{label}</Text></View>;
}

/**
 * How long until a tournament, in its court's colour on a whisper of it:
 * "26 days", "Today" on the day, and from 100 days out the date itself.
 */
export function CountdownTile({ iso, slot }: { iso: string; slot: 'hard' | 'clay' | 'grass' | 'court' }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const ink = colors[slot];
  // The small word a step toward the text, so it reads at 11 on its tint as well as the big number does.
  const small = mixHex(ink, colors.text, pageIsDark() ? 0.25 : 0.3);
  const days = daysUntil(iso);
  const d = new Date(iso);
  const [big, word] = days <= 0 ? ['Today', ''] : days >= 100 ? [String(d.getDate()), d.toLocaleDateString(undefined, { month: 'short' })] : [String(days), days === 1 ? 'day' : 'days'];
  return (
    <View style={[styles.countdown, { backgroundColor: withAlpha(ink, 0.12) }]}>
      {days >= 100 ? <Text style={[styles.countWord, { color: small }]}>{word}</Text> : null}
      <Text maxFontSizeMultiplier={1.2} style={[days <= 0 ? styles.countToday : styles.countBig, { color: ink }]}>{big}</Text>
      {days > 0 && days < 100 ? <Text maxFontSizeMultiplier={1.2} style={[styles.countWord, { color: small }]}>{word}</Text> : null}
    </View>
  );
}

const TIER_ORDER = { platinum: 0, gold: 1, silver: 2, bronze: 3 } as const;

/** Unlocked medals in one row that scrolls sideways, gold first; a tap names the medal in a toast. */
export function MedalRow({ items }: { items: AchievementProgress[] }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const shown = items.filter((a) => a.unlocked).sort((a, b) => TIER_ORDER[a.achievement.tier] - TIER_ORDER[b.achievement.tier]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.medalStrip} contentContainerStyle={styles.medals}>
      {shown.map(({ achievement: a }) => {
        const tint = tierColor(a.tier);
        const tier = a.tier.charAt(0).toUpperCase() + a.tier.slice(1);
        return (
          <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${a.name}, ${tier}. ${a.description}`} onPress={() => showToast({ title: a.name, body: `${tier} · ${a.description}`, icon: a.icon })} style={({ pressed }) => [styles.medal, pressed && styles.pressed]}>
            <View style={[styles.disc, { backgroundColor: withAlpha(tint, 0.14) }]}>
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
  lock: { marginTop: 2 },
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
  tagOn: { backgroundColor: colors.brand },
  tagText: { ...typography.caption, letterSpacing: 0.2, color: colors.textMuted },
  tagTextOn: { color: colors.brandInk },
  countdown: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  countBig: { ...font('600'), fontSize: 22, lineHeight: 24, letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
  countToday: { ...font('600'), fontSize: 14, lineHeight: 18, letterSpacing: -0.2 },
  countWord: { ...font('600'), fontSize: 11, lineHeight: 13 },
  medalStrip: { marginHorizontal: -spacing.lg },
  medals: { paddingHorizontal: spacing.lg - 8, paddingTop: 4, paddingBottom: 2 },
  medal: { width: 70, alignItems: 'center', gap: 6, paddingVertical: 4 },
  disc: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  medalName: { ...typography.caption, letterSpacing: 0, lineHeight: 14, color: colors.text, textAlign: 'center' },
});
