import { PRESS_DIM } from '@/theme/press';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { type CourtCardOption, designHere, hereWords } from '@/features/courtUnlocks/designDemo';
import * as haptics from '@/lib/haptics';
import type { CourtToFollow } from '@/store/courtLife';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
import { TextScale, oneLine } from '@/theme/textScale';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks). On a court's card, right under
 * its name: who is at the court now.
 *
 * Round 5 (owner, Oct 28, on the round 4 board: "I don't like the regulars
 * here and it says +4"): the "Regulars here" row and its "+3 here" pill are
 * gone. Three calmer ways, one shown at a time (courtCardOption in
 * designDemo), all on the same rules as before: a friend (you follow each
 * other) by face and first name; everyone else only as a number in words,
 * only from 2 up (a lone stranger is never counted), and a teen only for
 * their friends. Never a plus.
 *   a  HereLine: one quiet line.
 *   b  HereRow: a small "Here now" row.
 *   c  HereChips: "5 playing now" and "My court", side by side.
 * Add yourself (this court is one of yours) was the same job as the card's
 * heart, which already keeps a court in Your courts: in a and b it is the
 * heart by Send and Close; in c it comes down beside the count with a word,
 * "My court", and the heart up top steps aside.
 */
export function HereNow({ name, option, follow }: { name: string; option: CourtCardOption; /** The court to follow, for c's My court (none: no chip). */ follow?: CourtToFollow }) {
  if (option === 'b') return <HereRow name={name} />;
  if (option === 'c') return <HereChips name={name} follow={follow} />;
  return <HereLine name={name} />;
}

/** What VoiceOver says for who is there: "Sam, Marcus and 3 others are playing here now". */
function spoken(lead: string, tail: string, total: number, friends: number) {
  if (!total) return 'No one is playing here right now';
  if (!friends) return `${total} people are playing here now`;
  return `${lead}${tail} ${total === 1 ? 'is' : 'are'} playing here now`;
}

/** Friends' faces, a little overlapped; each opens that friend's profile. */
function Faces({ people, size }: { people: User[]; size: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.faces}>
      {people.map((u, i) => (
        <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${u.name.split(' ')[0]}, open profile`} hitSlop={4} onPress={() => router.push(`/user/${u.id}`)}
          style={({ pressed }) => [styles.faceRim, { borderRadius: size / 2 + 2 }, i > 0 && { marginLeft: -Math.round(size * 0.28) }, pressed && styles.pressed]}
        >
          <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={size} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * a, One line: no row, no heading. "Sam, Marcus and 3 others playing now"
 * with Sam's and Marcus's small faces first; "4 playing now" after a green
 * dot when no friend is there; "No one playing right now", quieter, when
 * nobody is. At big text sizes it takes a second line rather than cutting.
 */
function HereLine({ name }: { name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { friends, others } = designHere(name);
  const { lead, tail, total } = hereWords(friends, others);
  return (
    <View style={styles.line}>
      {friends.length ? <Faces people={friends.slice(0, 3)} size={24} /> : total ? <View style={styles.dot} /> : null}
      <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={2} accessibilityLabel={spoken(lead, tail, total, friends.length)} style={[styles.lineText, !total && styles.quiet]}>
        {friends.length ? (
          <><Text style={styles.strong}>{lead}</Text>{tail} playing now</>
        ) : total ? (
          <><Text style={styles.strong}>{total}</Text> playing now</>
        ) : 'No one playing right now'}
      </Text>
    </View>
  );
}

/**
 * b, Here now: a small row under the same kind of heading as Played here.
 * Friends' faces with their first names under (the map's own shape), then
 * "and 3 others" in plain words. No friend there: one line, "Here now ·
 * 4 players". Nobody: "No one here right now".
 */
function HereRow({ name }: { name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { friends, others } = designHere(name);
  const shown = friends.slice(0, 4);
  const rest = others + friends.length - shown.length;
  const { lead, tail, total } = hereWords(friends, others);
  if (!total) {
    return (
      <View style={styles.rowEmpty}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.lineText, styles.quiet]}>No one here right now</Text>
      </View>
    );
  }
  if (!friends.length) {
    return (
      <View style={styles.rowEmpty} accessible accessibilityLabel={`Here now: ${others} players`}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>Here now <Text style={styles.rowCount}>· {others} players</Text></Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" accessibilityLabel={`Here now: ${lead}${tail}`} style={[styles.rowTitle, styles.rowHead]}>Here now</Text>
      <View style={styles.rowFaces}>
        {shown.map((u) => (
          <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${u.name.split(' ')[0]}, here now. Open profile`} hitSlop={4} onPress={() => router.push(`/user/${u.id}`)} style={({ pressed }) => [styles.rowItem, pressed && styles.pressed]}>
            <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={ROW_FACE} />
            <Text {...oneLine(TextScale.CARD, 0.8)} numberOfLines={1} style={styles.rowName}>{u.name.split(' ')[0]}</Text>
          </Pressable>
        ))}
        {rest ? (
          // The heading already says "and 3 others" to VoiceOver: not twice.
          <View style={styles.rowRest} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lineText}>and {rest} {rest === 1 ? 'other' : 'others'}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * c, Two chips under the name. "5 playing now": friends' tiny faces in it,
 * a tap opens their names under it (closed by default, the calmest); with
 * no friend there, a green dot and nothing to open. Nobody: "No one playing
 * right now", plain. Beside it, "My court": the heart, with a word, so what
 * it does is said rather than guessed.
 */
function HereChips({ name, follow }: { name: string; follow?: CourtToFollow }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtFollows, actions } = useApp();
  const [open, setOpen] = useState(false);
  const { friends, others } = designHere(name);
  const { lead, tail, total } = hereWords(friends, others);
  const mine = !!follow && !!courtFollows[follow.id]?.following;
  const said = spoken(lead, tail, total, friends.length);
  return (
    <View style={styles.chipsWrap}>
      <View style={styles.chips}>
        {total ? (
          <Pressable disabled={!friends.length} accessibilityRole={friends.length ? 'button' : 'text'} accessibilityState={friends.length ? { expanded: open } : undefined}
            accessibilityLabel={friends.length ? `${said}. ${open ? 'Hide' : 'Show'} who` : said}
            onPress={() => { haptics.tap(); setOpen((o) => !o); }} hitSlop={4}
            style={({ pressed }) => [styles.chip, styles.chipLive, pressed && styles.pressed]}
          >
            {friends.length ? (
              <View style={styles.chipFaces}>
                {friends.slice(0, 3).map((u, i) => (
                  <View key={u.id} style={[styles.chipFace, i > 0 && styles.chipFaceOver]}><Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={20} /></View>
                ))}
              </View>
            ) : <View style={styles.dot} />}
            <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={styles.chipText}><Text style={styles.chipNumber}>{total}</Text> playing now</Text>
            {friends.length ? <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} /> : null}
          </Pressable>
        ) : (
          <View style={[styles.chip, styles.chipQuiet]}>
            <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={[styles.chipText, styles.quiet]}>No one playing right now</Text>
          </View>
        )}
        {follow ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: mine }} accessibilityLabel={mine ? `${name} is one of your courts. Tap to take it off` : `Make ${name} one of your courts`}
            onPress={() => { haptics.tap(); actions.toggleCourtFollow(follow); }} hitSlop={4}
            style={({ pressed }) => [styles.chip, styles.chipPlain, mine && styles.chipMine, pressed && styles.pressed]}
          >
            <Ionicons name={mine ? 'heart' : 'heart-outline'} size={14} color={mine ? colors.brand : colors.textMuted} />
            <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={[styles.chipText, mine && styles.chipMineText]}>My court</Text>
          </Pressable>
        ) : null}
      </View>
      {open && friends.length ? (
        <View style={styles.openList}>
          {friends.map((u) => (
            <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${u.name.split(' ')[0]}, here now. Open profile`} hitSlop={4} onPress={() => router.push(`/user/${u.id}`)} style={({ pressed }) => [styles.openItem, pressed && styles.pressed]}>
              <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={26} />
              <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.openName}>{u.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
          {others ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.lineText, styles.openRest]}>and {others} {others === 1 ? 'other' : 'others'}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const ROW_FACE = 42;

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: PRESS_DIM },
  faces: { flexDirection: 'row', alignItems: 'center' },
  // The card's own colour round each face, so overlapped faces stay apart.
  faceRim: { borderWidth: 2, borderColor: colors.surface },
  // The "people there now" green, as on the map's lit courts.
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.open, marginHorizontal: 2 },
  strong: { ...font('600'), color: colors.text },
  quiet: { color: colors.textMuted },
  // a
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, minHeight: 28, paddingBottom: 2 },
  lineText: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, flexShrink: 1 },
  // b
  row: { gap: 8, paddingBottom: 2 },
  rowEmpty: { paddingHorizontal: spacing.lg, minHeight: 24, justifyContent: 'center' },
  rowHead: { paddingHorizontal: spacing.lg },
  rowTitle: { ...typography.smallStrong, color: colors.text },
  rowCount: { ...font('400'), color: colors.textMuted },
  rowFaces: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: spacing.lg - 4, flexWrap: 'wrap' },
  rowItem: { width: 60, alignItems: 'center', gap: 4 },
  rowName: { ...font('600'), fontSize: 12, lineHeight: 15, color: colors.text, maxWidth: 66, textAlign: 'center' },
  rowRest: { minHeight: ROW_FACE, justifyContent: 'center', paddingLeft: 4 },
  // c
  chipsWrap: { gap: 10, paddingBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 },
  chipLive: { backgroundColor: withAlpha(colors.open, 0.12) },
  chipQuiet: { backgroundColor: colors.bgElevated },
  chipPlain: { borderWidth: 1, borderColor: colors.border },
  // On: the outline and the word in your colour, never a fill, so it can't be taken for the green "playing now" chip beside it.
  chipMine: { borderColor: withAlpha(colors.brand, 0.45) },
  chipMineText: { color: colors.brand },
  chipText: { ...font('600'), fontSize: 13, lineHeight: 18, color: colors.text },
  chipNumber: { fontVariant: ['tabular-nums'] },
  chipFaces: { flexDirection: 'row', alignItems: 'center' },
  chipFace: { borderRadius: 12, borderWidth: 1.5, borderColor: colors.surface },
  chipFaceOver: { marginLeft: -4 },
  openList: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, paddingHorizontal: spacing.lg },
  openItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  openName: { ...font('600'), fontSize: 14, color: colors.text },
  openRest: { flexShrink: 0 },
});
