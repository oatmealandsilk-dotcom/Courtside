import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CrownGlyph } from '@/components/place/CrownGlyph';
import { KING, MY_COURTS } from '@/features/courtUnlocks/designDemo';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, typography, withAlpha } from '@/theme';
import { corner } from '@/theme/look';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks): the small pieces the court
 * unlock pictures share. Drawn from the map's own court mark, so a court
 * reads the same on the map, in the reward sheet and in Your courts.
 */

/** A court as a mark: unlocked, a rounded square in your colour with the court drawn on it; locked, the plain outline. */
export function CourtTile({ size = 36, unlocked, dashed = false }: { size?: number; unlocked: boolean; dashed?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: corner(Math.round(size * 0.26)) },
      unlocked ? styles.tileOn : dashed ? styles.tileDashed : styles.tileOff]}
    >
      {dashed ? null : <CourtGlyph size={Math.round(size * 0.42)} color={unlocked ? colors.brandInk : colors.textFaint} />}
    </View>
  );
}

/** A thin bar: how far along. */
export function Bar({ have, need, tone }: { have: number; need: number; tone?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round((Math.min(have, need) / need) * 100)}%`, backgroundColor: tone ?? colors.brand }]} />
    </View>
  );
}

/**
 * A court badge (5, 10, 25 or 50 courts): earned, a disc in your colour's
 * dim tint with the number in your colour; the next one, a plain disc with a
 * ring that fills as you go; further off, plain and faint with a small lock.
 */
export function BadgeDisc({ n, state, have = 0, size = 58 }: { n: number; state: 'earned' | 'next' | 'locked'; have?: number; size?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const r = size / 2 - 2;
  const round = 2 * Math.PI * r;
  const part = Math.min(1, have / n);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 },
        state === 'earned' ? styles.discEarned : styles.discPlain]}
      >
        <Text maxFontSizeMultiplier={1.2} style={[styles.discNumber, { fontSize: size * 0.34 },
          state === 'earned' ? { color: colors.brand } : state === 'next' ? { color: colors.text } : { color: withAlpha(colors.textFaint, 0.7) }]}
        >{n}</Text>
      </View>
      {state === 'next' ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.brand} strokeWidth={3} fill="none" strokeLinecap="round"
            strokeDasharray={`${round}`} strokeDashoffset={round * (1 - part)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      ) : null}
      {state === 'locked' ? <View style={styles.lock}><Ionicons name="lock-closed" size={9} color={colors.textFaint} /></View> : null}
    </View>
  );
}

/** The weeks played, oldest first: a small square each, filled for a week with tennis in it. */
export function WeekDots({ weeks, size = 14 }: { weeks: boolean[]; size?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.weeks}>
      {weeks.map((on, i) => (
        <View key={i} style={[styles.week, { width: size, height: size, borderRadius: corner(4) }, on ? styles.weekOn : styles.weekOff, i === weeks.length - 1 && styles.weekNow]} />
      ))}
    </View>
  );
}

/** The next profile card, as a small card in the theme's own card colour with the court drawn on it. */
export function CardSwatch({ width = 30 }: { width?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.card, { width, height: Math.round(width * 1.36), borderRadius: corner(Math.max(4, Math.round(width * 0.16))) }]}>
      <CourtGlyph size={Math.round(width * 0.5)} color={colors.cardFigure} />
    </View>
  );
}

/**
 * On a court's card on the map: yours ("Yours since Sep 2 · 31 sessions",
 * and the crown when you hold it), or how to make it yours. Nothing on a
 * members' club or someone's own court.
 */
export function UnlockLine({ name, closed }: { name: string; closed: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const mine = MY_COURTS.find((c) => c.name === name);
  if (closed && !mine) return null;
  if (!mine) {
    return (
      <View style={styles.unlockRow}>
        <CourtTile size={22} unlocked={false} />
        <Text style={styles.unlockQuiet} numberOfLines={1}>Not yours yet. Log a hit here to unlock it.</Text>
      </View>
    );
  }
  return (
    <View style={styles.unlockRow}>
      <CourtTile size={22} unlocked />
      <Text style={styles.unlockText} numberOfLines={1}>
        <Text style={styles.unlockStrong}>Yours</Text>{` since ${mine.since} · ${mine.sessions} ${mine.sessions === 1 ? 'session' : 'sessions'}`}
      </Text>
      {mine.crown ? (
        <View style={styles.unlockCrown}>
          <CrownGlyph size={14} color={colors.sun} />
          <Text style={styles.unlockCrownText}>King · {KING.month.slice(0, 3)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  unlockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  unlockText: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  unlockStrong: { ...font('600'), color: colors.brand },
  unlockQuiet: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  unlockCrown: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  unlockCrownText: { ...typography.smallStrong, color: colors.text },
  tile: { alignItems: 'center', justifyContent: 'center' },
  tileOn: { backgroundColor: colors.brand },
  tileOff: { backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.borderStrong },
  tileDashed: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  disc: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  discEarned: { backgroundColor: colors.brandDim, borderColor: `${colors.brand}80` },
  discPlain: { backgroundColor: colors.bgElevated, borderColor: colors.border },
  discNumber: { ...font('600'), letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  lock: { position: 'absolute', right: -1, bottom: -1, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  weeks: { flexDirection: 'row', gap: 5 },
  week: {},
  weekOn: { backgroundColor: colors.brand },
  weekOff: { backgroundColor: colors.surfaceAlt },
  weekNow: { },
  card: { backgroundColor: colors.cardFill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.text}1F` },
  caption: { ...typography.caption },
});
