import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { AchievementProgress } from '@/lib/badges';
import { tierColor } from '@/lib/badges';
import { show as showToast } from '@/lib/toast';
import { mixHex } from '@/features/activity/zones';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, typography, withAlpha } from '@/theme';

/*
 * The pieces the Tennis profile page is built from (Oct 5): a section's head,
 * the white box each section sits in, a row on a hairline (the hairline
 * starting at the words, not the tile), a status chip, a card's summary line
 * with its thin bar, an empty section's one row with its Add button, the
 * grid of medals and the bar to the next one. Everything from the theme's
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

/**
 * A quiet status chip ("Entered", "Watching"): small, rounded, an icon and a
 * word. "On" is the brand's colour on its own dim wash, the ink deepened
 * where it fell short of 4.5:1 on it (Paris's brick); "off" is muted on the
 * page's raised tone. Not a button, so not a pill.
 */
export function Chip({ label, icon, on = false }: { label: string; icon?: IconName; on?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const ink = on ? deepenFor(colors.brand, colors.brandDim, 4.5) : colors.textMuted;
  return (
    <View style={[styles.chip, { backgroundColor: on ? colors.brandDim : colors.bgElevated }]}>
      {icon ? <Ionicons name={icon} size={12} color={ink} /> : null}
      <Text style={[styles.chipText, { color: ink }]}>{label}</Text>
    </View>
  );
}

/**
 * A card's first line: what it adds up to ("1 of 3 done", "2 of 10
 * unlocked"), small and upper-case, with a thin bar in the brand colour
 * filling the rest of the line when there is a share to show.
 */
export function Summary({ label, share }: { label: string; share?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const pct = share === undefined ? undefined : Math.round(Math.max(0, Math.min(1, share)) * 100);
  return (
    <View style={styles.summary} accessible accessibilityLabel={label}>
      <Text style={styles.eyebrow}>{label}</Text>
      {pct !== undefined ? (
        <View style={styles.summaryTrack}>
          {pct > 0 ? <View style={[styles.summaryFill, { width: `${pct}%`, backgroundColor: colors.brand }]} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * An empty section, tidily: an icon on the brand's dim wash, what belongs
 * here and why, and one white outline button. The whole row is the button,
 * so the target is never just the small pill.
 */
export function EmptyRow({ icon, title, sub, action = 'Add', accessibilityLabel, onPress }: {
  icon: IconName;
  title: string;
  sub?: string;
  action?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={sub} onPress={onPress} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={20} color={colors.brand} /></View>
      <View style={styles.words}>
        <Text style={styles.emptyTitle}>{title}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      <View style={styles.outline}>
        <Ionicons name="add" size={14} color={colors.text} />
        <Text style={styles.outlineText}>{action}</Text>
      </View>
    </Pressable>
  );
}

/** A day on the calendar as a small tile: the month in capitals over the day's number. For a row's lead. */
export function DateTile({ iso }: { iso: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const d = new Date(iso);
  return (
    <View style={styles.dateTile}>
      <Text style={styles.dateMonth} maxFontSizeMultiplier={1.2}>{d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</Text>
      <Text style={styles.dateDay} maxFontSizeMultiplier={1.2}>{d.getDate()}</Text>
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

/**
 * Medals as a grid, four across and two rows at most, so the box is never
 * half-empty: the won ones first in their metal, gold first, then (with
 * `locked`) the ones nearest to winning, greyed with a small lock, so you
 * can see what is next. A tap names the medal in a toast; a locked one also
 * says how far along it is.
 */
export function MedalGrid({ items, locked = false, max = 8 }: { items: AchievementProgress[]; locked?: boolean; max?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const won = items.filter((a) => a.unlocked).sort((a, b) => TIER_ORDER[a.achievement.tier] - TIER_ORDER[b.achievement.tier]);
  const waiting = locked ? items.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress) : [];
  const shown = [...won, ...waiting].slice(0, max);
  return (
    <View style={styles.grid}>
      {shown.map(({ achievement: a, unlocked, current, target, unit }) => {
        const tint = medalTint(a.tier);
        const tier = a.tier.charAt(0).toUpperCase() + a.tier.slice(1);
        const far = `${current} of ${target}${unit ? ` ${unit}` : ''}`;
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={unlocked ? `${a.name}, ${tier}. ${a.description}` : `${a.name}, locked. ${a.description}. ${far}`}
            onPress={() => showToast(unlocked
              ? { title: a.name, body: `${tier} · ${a.description}`, icon: a.icon }
              : { title: a.name, body: `Locked · ${a.description} · ${far}`, icon: 'lock-closed-outline' })}
            style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
          >
            <View style={[styles.disc, unlocked
              ? { backgroundColor: withAlpha(tint, 0.18), borderColor: withAlpha(tint, 0.45) }
              : { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
            >
              <Ionicons name={a.icon as IconName} size={22} color={unlocked ? tint : withAlpha(colors.textFaint, 0.55)} />
              {unlocked ? null : (
                <View style={styles.lockBadge}><Ionicons name="lock-closed" size={8} color={colors.textFaint} /></View>
              )}
            </View>
            <Text style={[styles.medalName, !unlocked && styles.medalNameLocked]} numberOfLines={2}>{a.name}</Text>
          </Pressable>
        );
      })}
    </View>
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  chipText: { ...font('600'), fontSize: 12, lineHeight: 15, letterSpacing: 0 },
  // A card's eyebrow ("Next up", "1 of 3 done"): small capitals in the muted ink, the one label style in the Game tab.
  eyebrow: { ...typography.caption, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: 14, paddingBottom: 6 },
  summaryTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  summaryFill: { height: 4, borderRadius: 2 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.bodyStrong, lineHeight: 20, color: colors.text },
  // The white outline button (the Share page's): the card's own white, a firm hairline, the page's ink.
  outline: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  outlineText: { ...typography.smallStrong, color: colors.text },
  dateTile: { width: 40, height: 44, borderRadius: 12, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  dateMonth: { ...font('600'), fontSize: 10, lineHeight: 12, letterSpacing: 0.5, color: colors.textMuted },
  dateDay: { ...font('600'), fontSize: 17, lineHeight: 20, letterSpacing: -0.4, color: colors.text, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, paddingTop: 6, paddingBottom: 4 },
  cell: { width: '25%', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 8 },
  disc: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  lockBadge: { position: 'absolute', right: -1, bottom: -1, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  medalName: { ...typography.caption, letterSpacing: 0, lineHeight: 14, color: colors.text, textAlign: 'center' },
  medalNameLocked: { ...font('500'), color: colors.textFaint },
});
