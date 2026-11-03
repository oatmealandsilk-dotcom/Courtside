import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { Avatar, Button } from '@/components/ui';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PRESS_DIM } from '@/theme/press';
import { colors, spacing, typography, font } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { tillLabel } from '@/features/players/openToHit';
import type { User } from '@/data/types';

/*
 * DESIGN OPTIONS for the inbox with no chats yet (Nov 3), shown only on the
 * web demo with ?var=messages-empty:A|B|C|D (see lib/designVar). None of
 * this is reached on a phone or without the query.
 */

/** When someone is up to hit until, from their profile or the map's ring. */
export type UpUntil = (u: User) => string | null;

/** A: plain rows of the people you can message, each with a small Message button. */
export function PeopleYouCanMessage({ people, upUntil, onMessage }: { people: User[]; upUntil: UpUntil; onMessage: (u: User) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.quiet}>No messages yet.</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.caption}>People you can message</Text>
      <View style={styles.bleed}>
        {people.map((u, i) => {
          const till = tillLabel(upUntil(u));
          return (
            <View key={u.id} style={styles.personRow}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${u.name}'s profile`} onPress={() => router.push(`/user/${u.id}`)} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
                <View style={till ? styles.ringSmall : undefined}>
                  <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={till ? 40 : 44} />
                </View>
              </Pressable>
              <View style={[styles.personBody, i > 0 && styles.hairTop]}>
                <View style={styles.personWords}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{u.name}</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.sub, till && styles.subOpen]} numberOfLines={1}>{till ? `Up to hit ${till}` : u.location || `@${u.handle}`}</Text>
                </View>
                <Button label="Message" size="sm" variant="secondary" onPress={() => onMessage(u)} accessibilityLabel={`Message ${u.name}`} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** One Settings-style row: a small icon, the words, a chevron. */
function PlainRow({ icon, label, onPress, first }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; first?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.plainRow, pressed && styles.pressed]}>
      <Ionicons name={icon} size={21} color={colors.text} />
      <View style={[styles.plainBody, !first && styles.hairTop]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.plainLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
      </View>
    </Pressable>
  );
}

/** B: a top-aligned grey line, then New message and Start a group chat as hairline rows. */
export function EmptyRows({ line }: { line: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.quiet}>{line}</Text>
      <View style={[styles.bleed, styles.rowsBox]}>
        <PlainRow first icon="create-outline" label="New message" onPress={() => router.push('/messages/new')} />
        <PlainRow icon="people-outline" label="Start a group chat" onPress={() => router.push('/messages/new')} />
      </View>
    </View>
  );
}

/** C: who is up to hit today, large, with their till-time; a tap opens the chat. */
export function UpTodayBig({ people, upUntil, onMessage }: { people: User[]; upUntil: UpUntil; onMessage: (u: User) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View>
      <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.bigTitle}>Up to hit today</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.bigSub}>Tap someone to message them.</Text>
      <View style={styles.grid}>
        {people.map((u) => (
          <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`${u.name} is up to hit today. Message them`} onPress={() => onMessage(u)} style={({ pressed }) => [styles.cell, pressed && { opacity: PRESS_DIM }]}>
            <View style={styles.ringBig}>
              <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={72} />
            </View>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cellName} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cellTill} numberOfLines={1}>{tillLabel(upUntil(u)) ?? 'today'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** D: one quiet line, and one row that opens the invite page. */
export function InviteRow({ line }: { line: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.quiet}>{line}</Text>
      <View style={[styles.bleed, styles.rowsBox]}>
        <PlainRow first icon="person-add-outline" label="Invite someone you play with" onPress={() => router.push('/invite')} />
      </View>
    </View>
  );
}


const styleDefinitions = StyleSheet.create({
  bleed: { marginHorizontal: -spacing.lg },
  quiet: { ...typography.body, color: colors.textMuted, paddingTop: spacing.md, paddingBottom: spacing.lg },
  caption: { ...typography.caption, color: colors.textFaint, marginBottom: spacing.xs },
  hairTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // A: a person per row, the hairline running from the words as the inbox's own rows do.
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg },
  personBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 11, paddingRight: spacing.lg, minWidth: 0 },
  personWords: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  subOpen: { color: colors.open },
  ringSmall: { padding: 1, borderRadius: 24, borderWidth: 1.5, borderColor: colors.open },
  // B and D: Settings-style rows between two hairlines.
  rowsBox: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  plainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg, backgroundColor: colors.bg },
  pressed: { backgroundColor: colors.surfaceAlt },
  plainBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingRight: spacing.lg },
  plainLabel: { ...typography.body, fontSize: 16, color: colors.text },
  // C: larger faces, three to a row.
  bigTitle: { ...typography.heading, color: colors.text, paddingTop: spacing.sm },
  bigSub: { ...typography.small, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  cell: { width: '33.33%', alignItems: 'center', gap: 4 },
  ringBig: { padding: 2, borderRadius: 42, borderWidth: 2, borderColor: colors.open, marginBottom: 2 },
  cellName: { ...typography.body, ...font('500'), color: colors.text, maxWidth: 100 },
  cellTill: { ...typography.small, fontSize: 12, color: colors.textMuted },
});
