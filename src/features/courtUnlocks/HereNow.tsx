import { PRESS_DIM } from '@/theme/press';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { designHere, designHome, hereWords } from '@/features/courtUnlocks/designDemo';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks). On a court's card, right under
 * its name: who is at the court now, and who calls it home.
 *
 * Owner, Oct 28: "Yes for court card" (the round 5 proposal): one quiet
 * line, "Sam, Marcus and 3 others playing now" with friends' small faces;
 * then, under it, the friends who call this court home ("Sam and Marcus
 * play here", friends only) and how many players call it home as a number
 * only ("Home court for 12 players", from 2 up). Never a list of strangers'
 * faces or names. A friend (you follow each other) by face and first name;
 * everyone else only as a number; a lone stranger is never counted, and a
 * teen only for their friends. Never a plus. Adding yourself is the heart
 * by Send and Close (it keeps the court in Your courts).
 */
export function HereNow({ name }: { name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wrap}>
      <HereLine name={name} />
      <HomeLine name={name} />
    </View>
  );
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
          <><Text style={styles.strong}>{lead}</Text>{tail} playing{'\u00A0'}now</>
        ) : total ? (
          <><Text style={styles.strong}>{total}</Text> playing{'\u00A0'}now</>
        ) : 'No one playing right now'}
      </Text>
    </View>
  );
}

/**
 * Who calls this court home: friends by first name ("Sam and Marcus play
 * here"), then everyone as one number ("Home court for 12 players", only
 * from 2 up). Nothing when neither is there. Never a stranger's name.
 */
function HomeLine({ name }: { name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { friendNames, friends, players } = designHome(name);
  if (!friendNames && !players) return null;
  // Owner, Oct 28: "call this home seems weird" -> "Home court for 12 players".
  const count = players ? `${friendNames ? 'home' : 'Home'} court for ${players}\u00A0players` : '';
  return (
    <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={3} style={[styles.lineText, styles.home]}>
      {friendNames ? <><Text style={styles.strong}>{friendNames}</Text> {friends === 1 ? 'plays' : 'play'} here{count ? '\u00A0· ' : ''}</> : null}
      {count}
    </Text>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: PRESS_DIM },
  wrap: { gap: 4, paddingBottom: 2 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  // The card's own colour round each face, so overlapped faces stay apart.
  faceRim: { borderWidth: 2, borderColor: colors.surface },
  // The "people there now" green, as on the map's lit courts.
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.open, marginHorizontal: 2 },
  strong: { ...font('600'), color: colors.text },
  quiet: { color: colors.textMuted },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, minHeight: 28 },
  lineText: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted, flexShrink: 1 },
  home: { paddingHorizontal: spacing.lg },
});
