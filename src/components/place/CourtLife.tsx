import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import { HitGlyph } from '@/components/HitGlyph';
import type { CourtAccess, User } from '@/data/types';
import { askToHit, openCourtNow, openCourtReview } from '@/features/players/courtLink';
import { ACCESS_LABEL, NOW_ICON, courtNoteKey, nowStatus, playingLine, regularsLine, summarizeFacts } from '@/features/players/courtSummary';
import { afterReport } from '@/features/moderation/reportThanks';
import { confirmReport } from '@/lib/confirm';
import type { CourtToFollow } from '@/store/courtLife';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/*
 * The small pieces of a court's own life (migration 60) that its card on
 * the map and its page both show, so the two always say the same: who may
 * play there, how it is right now, the heart, what players say about it,
 * and the people you follow who play there.
 */

const ACCESS_ICON: Record<Exclude<CourtAccess, 'unknown'>, keyof typeof Ionicons.glyphMap> = { public: 'lock-open-outline', members: 'lock-closed-outline', pay: 'card-outline', private: 'home-outline' };

/** Who may play there, and Book when a booking link is known. Nothing while nobody has said. */
export function AccessTag({ access, bookUrl }: { access: CourtAccess; bookUrl?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  if (access === 'unknown' && !bookUrl) return null;
  return (
    <>
      {access !== 'unknown' ? (
        <View style={styles.tag} accessibilityLabel={`Who can play: ${ACCESS_LABEL[access]}`}>
          <Ionicons name={ACCESS_ICON[access]} size={13} color={colors.textMuted} />
          <Text style={styles.tagText}>{ACCESS_LABEL[access]}</Text>
        </View>
      ) : null}
      {bookUrl ? (
        <Pressable accessibilityRole="link" accessibilityLabel="Book a court (opens the booking site)" hitSlop={6} onPress={() => { void Linking.openURL(bookUrl); }} style={({ pressed }) => [styles.tag, styles.tagLink, pressed && styles.pressed]}>
          <Text style={[styles.tagText, styles.tagLinkText]}>Book</Text>
          <Ionicons name="open-outline" size={12} color={colors.brand} />
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * Right now: "Free · 20 min ago" while an answer stands, else "How is it
 * now?"; a tap opens the picker. Beside it, who is on court now, as much as
 * the server lets you see, and, once you have checked in, "You're here" with
 * Check out, so you never forget you are showing. Nothing at someone's home
 * (a private court): nobody reports on, or checks in at, a person's house.
 * The icons stay one quiet colour: each answer has its own shape and word,
 * and no one status colour reads the same in every theme.
 */
export function NowTags({ courtId, name, access }: { courtId: string; name: string; access: CourtAccess }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtNow, users, actions } = useApp();
  if (access === 'private') return null;
  const now = courtNow[courtId];
  const standing = nowStatus(now);
  const playing = playingLine(now, users);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={standing ? `Right now: ${standing.line}. Update it` : 'How is it right now? Tell players'} hitSlop={4} onPress={() => openCourtNow({ id: courtId, name, access })} style={({ pressed }) => [styles.tag, pressed && styles.pressed]}>
        <Ionicons name={standing ? NOW_ICON[standing.status] : 'pulse-outline'} size={13} color={colors.textMuted} />
        <Text style={standing ? styles.tagText : styles.tagQuiet}>{standing ? standing.line : 'How is it now?'}</Text>
      </Pressable>
      {playing ? (
        <View style={styles.tag} accessibilityLabel={playing}>
          <View style={styles.liveDot} />
          <Text style={styles.tagText}>{playing}</Text>
        </View>
      ) : null}
      {now?.youHere ? <HereTag onCheckOut={() => { void actions.checkOutOfCourt(); }} /> : null}
    </>
  );
}

/**
 * "You're here · Check out": you are checked in at this court; one tap ends
 * it. On a small card (Your courts) the words shrink to "Here · Check out",
 * the court's name right above saying where.
 */
export function HereTag({ onCheckOut, small = false }: { onCheckOut: () => void; small?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="You’re checked in here. Check out" hitSlop={6} onPress={onCheckOut} style={({ pressed }) => [styles.tag, styles.tagLink, small && styles.tagSmall, pressed && styles.pressed]}>
      {small ? null : <View style={styles.liveDot} />}
      <Text style={[styles.tagText, styles.tagLinkText, small && styles.tagSmallText]} numberOfLines={1}>{small ? 'Here · Check out' : 'You’re here · Check out'}</Text>
    </Pressable>
  );
}

/** The heart: follow a court to hear when a hit or a clip lands there, and keep it in Your courts. */
export function FollowHeart({ court, style, size = 18 }: { court: CourtToFollow; style?: StyleProp<ViewStyle>; size?: number }) {
  const { courtFollows, actions } = useApp();
  const on = !!courtFollows[court.id]?.following;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? `Following ${court.name}. Unfollow` : `Follow ${court.name}`} hitSlop={8} onPress={() => actions.toggleCourtFollow(court)} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? colors.brand : colors.textMuted} />
    </Pressable>
  );
}

/**
 * What players say about a court, in one line: "Lights · Usually busy
 * weekday evenings · Some cracks (3 players)", the newest note (only ever
 * an adult's, never named), and Add what you know. Before anyone has said
 * anything, a single line asking.
 *
 * The note has a small flag to report it (App Review 1.2), asked first as
 * every report is. Once reported it leaves your screen and the next newest
 * shows. The database leaves out notes by anyone suspended or blocked
 * either way (migration 145): the app is never told whose a note is.
 */
export function CourtFactsLine({ courtId, name, note = true, lines }: { courtId: string; name: string; /** The newest note under the line. */ note?: boolean; lines?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtFacts, myCourtReviews, reportedIds, currentUserId, actions } = useApp();
  const facts = courtFacts[courtId];
  const said = summarizeFacts(facts && reportedIds.length ? { ...facts, notes: facts.notes.filter((n) => !reportedIds.includes(courtNoteKey(courtId, n.text))) } : facts);
  const mine = !!myCourtReviews[courtId];
  // Your own note (the newest may be yours) has no flag: Update yours is there for it.
  // Compared space for space as the database keeps it (a line break saved becomes one space).
  const quoted = note ? said.note : undefined;
  const asKept = (text?: string) => text?.replace(/\s+/g, ' ').trim();
  const canReport = !!quoted && !!currentUserId && asKept(myCourtReviews[courtId]?.notes) !== asKept(quoted.text);
  const reportNote = () => {
    if (!quoted) return;
    confirmReport('note', () => afterReport(actions.reportUser(null, `court-note:${courtNoteKey(courtId, quoted.text)}`, quoted.text)));
  };
  const add = (
    <Text accessibilityRole="link" accessibilityLabel={mine ? `Update what you said about ${name}` : `Add what you know about ${name}`} onPress={() => openCourtReview(courtId, { name })} style={styles.link}>
      {mine ? 'Update yours' : 'Add what you know'}
    </Text>
  );
  if (!said.players) {
    return <Text style={styles.factsQuiet}>Know it? Lights, nets, busy times, rules. {add}</Text>;
  }
  return (
    <View style={styles.facts}>
      <Text style={styles.factsLine} numberOfLines={lines}>{said.line}</Text>
      {quoted ? (
        <View style={styles.noteRow}>
          <Text style={[styles.quote, styles.noteText]} numberOfLines={2}>“{quoted.text}”</Text>
          {canReport ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Report this note" hitSlop={10} onPress={reportNote} style={({ pressed }) => [styles.noteFlag, pressed && styles.noteFlagPressed]}>
              <Ionicons name="flag-outline" size={13} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.factsQuiet}>{add}</Text>
    </View>
  );
}

/**
 * "Sam and Marcus, who you follow, play here", from their posts and hits
 * there (never from where their phones were), with their faces and Ask to
 * hit: a hit here sent to the ones you can message. Anyone already on court
 * now is left out (the "on court now" tag names them), so each person shows
 * once. At a members-only or private court the line stays, but Ask to hit
 * opens the hit form with no place picked: such a court is never suggested.
 */
export function RegularsRow({ court, closed = false }: { court: { id: string; name: string; lat: number; lng: number }; closed?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtRegulars, courtNow, users, actions } = useApp();
  const onCourt = new Set(courtNow[court.id]?.friendIds ?? []);
  const people = (courtRegulars[court.id] ?? []).filter((id) => !onCourt.has(id)).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const line = regularsLine(people);
  if (!line) return null;
  const askable = people.filter((u) => actions.canMessage(u.id)).map((u) => u.id);
  return (
    <View style={styles.regulars}>
      <View style={styles.faces}>
        {people.slice(0, 3).map((u, i) => (
          <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${u.name}, open profile`} hitSlop={4} onPress={() => router.push(`/user/${u.id}`)} style={i > 0 && styles.faceOver}>
            <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={24} style={styles.face} />
          </Pressable>
        ))}
      </View>
      <Text style={styles.regularsText} numberOfLines={2}>{line}</Text>
      {askable.length ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${askable.length === 1 ? people.find((u) => u.id === askable[0])?.name.split(' ')[0] : 'them'} to hit here`} hitSlop={6} onPress={() => (closed ? askToHit(askable) : askToHit(askable, court))} style={({ pressed }) => [styles.ask, pressed && styles.pressed]}>
          <HitGlyph size={14} color={colors.brand} />
          <Text style={styles.askText}>Ask to hit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.7 },
  // One small pill per fact, on the card's half-step of warmth: who may play, right now, who's playing.
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  tagText: { ...typography.smallStrong, color: colors.text },
  tagQuiet: { ...typography.smallStrong, color: colors.textMuted },
  tagLink: { backgroundColor: colors.brandDim },
  tagLinkText: { color: colors.brand },
  // The small card's size (Your courts), for "You're here".
  tagSmall: { height: 22, paddingHorizontal: 8, gap: 4, alignSelf: 'flex-start' },
  tagSmallText: { ...typography.caption, letterSpacing: 0 },
  // Live: someone is on court now.
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  facts: { gap: 4 },
  factsLine: { ...typography.smallStrong, color: colors.text, lineHeight: 19 },
  factsQuiet: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  quote: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  // The newest note, its report flag at the end of its first line.
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteText: { flex: 1, minWidth: 0 },
  noteFlag: { paddingTop: 3 },
  noteFlagPressed: { opacity: 0.5 },
  link: { ...typography.smallStrong, color: colors.brand },
  regulars: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faces: { flexDirection: 'row', alignItems: 'center' },
  faceOver: { marginLeft: -8 },
  face: { borderWidth: 2, borderColor: colors.surface, borderRadius: 14 },
  regularsText: { ...typography.small, color: colors.textMuted, flex: 1, minWidth: 0 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  askText: { ...typography.smallStrong, color: colors.brand },
});
