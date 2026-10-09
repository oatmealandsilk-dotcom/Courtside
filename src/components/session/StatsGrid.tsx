import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, font } from '@/theme';
import { Figure } from './Duration';
import { ZoneRows } from './ZoneRows';

/*
 * The stats pop-up's numbers as one labelled grid (Oct 8, owner: "Ok pop up
 * one then. Ship 1", the "Stats grid" look). Everything above it (what it
 * was, the time, "over your usual", who and where) and everything below it
 * (the "Only you" box, Share, Edit, Rematch, the tracker's name) is the
 * pop-up's own and stays as it was. Only what the post shares is drawn here:
 * a workout's distance, heart rate, calories, Strain (on the pop-up only when
 * the post shares it), minutes in zones 4–5, and a match's sets. A number the
 * post does not have is simply not there, and the grid closes up around it;
 * nothing is made up. The heart-rate zones' rows go under it, as before.
 */

/** A number on the pop-up, as the post shares it. */
export type StatNumber = { key: string; label: string; value: number; unit?: string; dec?: boolean };

type Cell = { key: string; label: string; n?: StatNumber; text?: string };

export function StatsGrid({ numbers, sets, zones, play }: {
  /** What the post shares, most telling first. */
  numbers: StatNumber[];
  /** "2–1": sets taken on a match's score, when there is one. */
  sets: string | null;
  zones: number[] | null;
  play: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const cells: Cell[] = [...numbers.map((n) => ({ key: n.key, label: n.label, n })), ...(sets ? [{ key: 'sets', label: 'SETS', text: sets }] : [])];
  // Three across; four go two and two rather than three and one.
  const across = cells.length === 4 ? 2 : Math.min(3, Math.max(1, cells.length));
  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += across) rows.push(cells.slice(i, i + across));
  return (
    <>
      {rows.length ? (
        <View style={styles.grid}>
          {rows.map((row, r) => (
            <View key={r} style={[styles.row, r > 0 && styles.rowRule]}>
              {/* A short last row keeps its empty places, so every number sits in its column. */}
              {Array.from({ length: across }, (_, i) => row[i]).map((c, i) => (
                <View key={c?.key ?? `empty-${i}`} style={styles.cell}>
                  {c ? (
                    <>
                      <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.2}>{c.label}</Text>
                      {c.n ? (
                        <Figure value={c.n.value} part={c.n.dec ? 'dec1' : 'int'} unit={c.n.unit} size={28} color={colors.text} unitColor={colors.textMuted} play={play} delay={200 + r * 60} />
                      ) : (
                        <Text style={styles.text} numberOfLines={1} maxFontSizeMultiplier={1.2}>{c.text}</Text>
                      )}
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {zones ? (
        <View style={styles.zones}>
          <Text style={styles.label} maxFontSizeMultiplier={1.2}>HEART RATE ZONES</Text>
          <ZoneRows zones={zones} play={play} />
        </View>
      ) : null}
    </>
  );
}

const styleDefinitions = StyleSheet.create({
  label: { ...font('600'), fontSize: 11, letterSpacing: 0.66, color: colors.textMuted },
  zones: { gap: 6, marginTop: 4 },
  grid: { marginTop: -6 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 12 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cell: { flex: 1, gap: 5, minWidth: 0 },
  text: { ...font('600'), fontSize: 28, lineHeight: 31, letterSpacing: -1.1, color: colors.text, fontVariant: ['tabular-nums'] },
});
