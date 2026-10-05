import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { Easing, FadeIn, FadeOut, ZoomIn, ZoomOut, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import { EmojiKeyboard } from '@/components/EmojiKeyboard';
import type { ID, Message, User } from '@/data/types';
import { chatStamp } from '@/lib/format';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, font, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { messageSummary } from './groupRules';

/*
 * The small pieces of a chat that sit around the bubbles: the quote a reply
 * carries and the "Replying to" strip over the box, the round button that
 * takes you back down to new messages, the way a message arrives, the burst
 * of a double tap, the faces of who has seen what, and the sheets a
 * reaction chip, the "+" in the reaction bar and "Info" open.
 */

/* ------------------------------------------------------------------ replies */

/** The words a quote shows for a message: its own words, or what it was ("Photo", the court's name, "Voice message"). */
export function quoteWords(m: Message): string {
  const n = m.photos?.length ?? 1;
  if (m.kind === 'photo') return m.body.trim() || (n > 1 ? `${n} photos` : 'Photo');
  if (m.kind === 'court') return m.place?.name ?? 'Court';
  if (m.kind === 'voice') return 'Voice message';
  if (m.kind === 'post') return 'Clip';
  if (m.kind === 'question') return 'Discussion';
  if (m.kind === 'profile') return 'Profile';
  if (m.kind === 'hit-request') return 'Hit';
  // Words (a link reads as its title).
  return messageSummary(m);
}

const QUOTE_ICON: Partial<Record<Message['kind'], keyof typeof Ionicons.glyphMap>> = {
  photo: 'image-outline', court: 'location-outline', voice: 'mic-outline', post: 'play-circle-outline', question: 'chatbubbles-outline', profile: 'person-outline', 'hit-request': 'tennisball-outline',
};

/**
 * The message a reply answers, drawn small inside the reply's bubble (or
 * above a photo or voice note that answers it): a bar, who said it, and its
 * first words. Tapping it goes to the original and lights it up.
 * `original` undefined: it is gone (unsent, or deleted for you). `blocked`:
 * it is from someone you blocked, folded away in the chat, so its words stay
 * hidden here too (the inbox's wording).
 */
export function ReplyQuote({ original, who, mine, onPress, standalone = false, blocked = false }: {
  original?: Message; who: string; mine: boolean; onPress?: () => void;
  /** Above a photo or voice note rather than inside a bubble: on its own soft card. */
  standalone?: boolean;
  blocked?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const ink = mine && !standalone;
  const icon = original && !blocked ? QUOTE_ICON[original.kind] : undefined;
  const words = !original ? 'This message is no longer available' : blocked ? 'Message from someone you blocked' : quoteWords(original);
  return (
    <Pressable
      // Inside a bubble (itself a button) it cannot be a button too: a browser refuses a button in a button.
      accessibilityRole={standalone ? 'button' : undefined}
      accessibilityLabel={original ? `Replying to ${blocked ? 'someone you blocked' : who}: ${words}. Go to the message` : 'Replying to a message that is gone'}
      disabled={!original || !onPress}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.quote, ink ? styles.quoteMine : styles.quoteTheirs, standalone && styles.quoteAlone, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.quoteBar, ink ? styles.quoteBarMine : null]} />
      <View style={styles.quoteWords}>
        <Text style={[styles.quoteWho, ink && styles.quoteWhoMine]} numberOfLines={1}>{original && !blocked ? who : 'Message'}</Text>
        <View style={styles.quoteLine}>
          {icon ? <Ionicons name={icon} size={13} color={ink ? colors.brandInk : colors.textMuted} /> : null}
          <Text style={[styles.quoteText, ink && styles.quoteTextMine, (!original || blocked) && styles.quoteGone]} numberOfLines={2}>
            {words}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Over the box while answering a message: "Replying to Mira" and its first words; the cross lets go of it. */
export function ReplyBar({ to, who, onClose }: { to: Message; who: string; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Reanimated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} style={styles.replyBar}>
      <View style={styles.replyBarEdge} />
      <View style={styles.replyBarWords}>
        <Text style={styles.replyBarTitle} numberOfLines={1}>Replying to <Text style={styles.replyBarName}>{who}</Text></Text>
        <Text style={styles.replyBarText} numberOfLines={1}>{quoteWords(to)}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.replyBarClose, pressed && { opacity: 0.5 }]}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </Reanimated.View>
  );
}

/* ----------------------------------------------------------- new messages */

/**
 * Scrolled up to read: a round down-arrow above the box, with how many new
 * messages came meanwhile (WhatsApp's and Telegram's). A tap glides back
 * down to the newest.
 */
export function NewMessagesButton({ visible, count, onPress }: { visible: boolean; count: number; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!visible) return null;
  return (
    <Reanimated.View entering={ZoomIn.duration(170)} exiting={ZoomOut.duration(130)} style={styles.downWrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count ? `${count} new ${count === 1 ? 'message' : 'messages'}. Go to the newest` : 'Go to the newest message'}
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => [styles.down, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <Ionicons name="chevron-down" size={22} color={colors.text} />
        {count ? (
          <View style={styles.downBadge}><Text style={styles.downBadgeText}>{count > 99 ? '99+' : count}</Text></View>
        ) : null}
      </Pressable>
    </Reanimated.View>
  );
}

/* ----------------------------------------------------------------- motion */

export type ArriveMode = 'none' | 'sent' | 'received';

/**
 * How a message comes in while the chat is open. Your own rises out of the
 * box and grows from 0.92 to full size on a quick spring (iMessage's);
 * someone else's fades in with a soft rise. History, and anything under
 * Reduce Motion, simply appears.
 */
export function Arrive({ mode: firstMode, mine, children }: { mode: ArriveMode; mine: boolean; children: React.ReactNode }) {
  const still = useReducedMotion();
  // Settled the first time the message is drawn, and the wrapper is the same
  // whatever it is: a row drawn again later (the next key typed, a moment on)
  // keeps everything inside it as it was, so a voice note playing goes on
  // playing and a picture never flickers.
  const [mode] = useState<ArriveMode>(() => (still ? 'none' : firstMode));
  const p = useSharedValue(mode === 'none' ? 1 : 0);
  useEffect(() => {
    if (mode === 'none') return;
    // Softer springs (Oct 4, owner: "smoother"): yours settles without a bounce, theirs eases up.
    p.value = mode === 'sent'
      ? withSpring(1, { damping: 21, stiffness: 230, mass: 0.8 })
      : withSpring(1, { damping: 24, stiffness: 190, mass: 0.9 });
  // Only on arriving: a row drawn again later never plays it twice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const look = useAnimatedStyle(() => (mode === 'none' ? {}
    : mode === 'sent'
      ? { opacity: Math.min(1, p.value * 3), transform: [{ translateY: (1 - p.value) * 20 }, { scale: 0.94 + 0.06 * p.value }] }
      : { opacity: Math.min(1, p.value * 1.6), transform: [{ translateY: (1 - p.value) * 10 }, { scale: 0.97 + 0.03 * p.value }] }));
  return <Reanimated.View style={[look, mode !== 'none' && { transformOrigin: mine ? 'right bottom' : 'left bottom' }]}>{children}</Reanimated.View>;
}

/** A double tap's reaction bursting over the bubble (Instagram's heart): it pops up, holds a beat, and floats away. */
export function Burst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const s = useSharedValue(0.3);
  const o = useSharedValue(0);
  const y = useSharedValue(0);
  useEffect(() => {
    o.value = withSequence(withTiming(1, { duration: 90 }), withDelay(380, withTiming(0, { duration: 260 }, (done) => { if (done) runOnJS(onDone)(); })));
    s.value = withSequence(withSpring(1.25, { damping: 9, stiffness: 320 }), withTiming(1, { duration: 140 }));
    y.value = withDelay(420, withTiming(-26, { duration: 300, easing: Easing.in(Easing.quad) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const look = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }, { scale: s.value }] }));
  return (
    <View pointerEvents="none" style={styles.burstWrap}>
      <Reanimated.Text style={[styles.burst, look]}>{emoji}</Reanimated.Text>
    </View>
  );
}

/** Going to the message a reply answers: its row lights up for a moment, then fades back. */
export function Flash() {
  const styles = useThemedStyles(styleDefinitions);
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withSequence(withTiming(1, { duration: 180 }), withDelay(650, withTiming(0, { duration: 600 })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const look = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Reanimated.View pointerEvents="none" style={[styles.flash, look]} />;
}

/* ------------------------------------------------------------- read faces */

/** In a group, the small faces of who has read up to this message (Instagram's and Messenger's), at its edge. */
export function SeenFaces({ people, align, style }: { people: User[]; align: 'left' | 'right'; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!people.length) return null;
  const shown = people.slice(0, 5);
  const more = people.length - shown.length;
  const names = people.map((u) => u.name.trim().split(/\s+/)[0]);
  return (
    <Reanimated.View
      entering={FadeIn.duration(220)}
      accessible
      accessibilityLabel={`Seen by ${names.join(', ')}`}
      style={[styles.faces, align === 'right' ? styles.facesRight : styles.facesLeft, style]}
    >
      {shown.map((u, i) => (
        <View key={u.id} style={[styles.faceRing, i > 0 && styles.faceOverlap]}>
          {/* Too small for initials (they were cut off): the person's own colour, or their photo. */}
          <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={16} plain />
        </View>
      ))}
      {more > 0 ? <Text style={styles.facesMore}>+{more}</Text> : null}
    </Reanimated.View>
  );
}

/* ----------------------------------------------------------------- sheets */

function Sheet({ visible, title, onClose, children }: { visible: boolean; title?: string; onClose: () => void; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm }]} onStartShouldSetResponder={() => true}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text> : null}
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * Who reacted to a message, and with what (a tap on a reaction chip).
 * Yours comes first and a tap on it takes it off, as Instagram's does.
 */
export function ReactionsSheet({ message, users, me, onRemove, onClose }: {
  message: Message | null; users: User[]; me: ID | null; onRemove: (emoji: string) => void; onClose: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const entries = Object.entries(message?.reactions ?? {})
    .map(([uid, emoji]) => ({ uid, emoji, user: users.find((u) => u.id === uid) }))
    .sort((a, b) => (a.uid === me ? -1 : b.uid === me ? 1 : 0));
  const counts = entries.reduce<Record<string, number>>((acc, e) => { acc[e.emoji] = (acc[e.emoji] ?? 0) + 1; return acc; }, {});
  return (
    <Sheet visible={!!message} title="Reactions" onClose={onClose}>
      <View style={styles.tally}>
        <Text style={styles.tallyAll}>All {entries.length}</Text>
        {Object.entries(counts).map(([emoji, n]) => <Text key={emoji} style={styles.tallyOne}>{emoji} {n}</Text>)}
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        {entries.map(({ uid, emoji, user }, i) => {
          const yours = uid === me;
          return (
            <Pressable
              key={uid}
              accessibilityRole={yours ? 'button' : undefined}
              accessibilityLabel={yours ? `Your reaction, ${emoji}. Tap to remove` : `${user?.name ?? 'Someone'} reacted ${emoji}`}
              disabled={!yours}
              onPress={() => { onClose(); onRemove(emoji); }}
              style={({ pressed }) => [styles.person, i > 0 && styles.rule, pressed && styles.pressed]}
            >
              <Avatar name={user?.name ?? '?'} seed={user?.avatarSeed ?? uid} uri={user?.avatarUrl} size={38} />
              <View style={styles.personWords}>
                <Text style={styles.personName} numberOfLines={1}>{yours ? 'You' : user?.name ?? 'Someone'}</Text>
                {yours ? <Text style={styles.personNote}>Tap to remove</Text> : null}
              </View>
              <Text style={styles.personEmoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

/** Any emoji as a reaction: the "+" at the end of the reaction bar opens the whole emoji keyboard. */
export function EmojiReactSheet({ visible, onPick, onClose }: { visible: boolean; onPick: (emoji: string) => void; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdropClear}>
        <View style={styles.emojiSheet} onStartShouldSetResponder={() => true}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>React with any emoji</Text>
          <EmojiKeyboard height={300} bottomInset={insets.bottom} onPick={(e) => { onClose(); onPick(e); }} />
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * "Info" from a held message: when it was sent (and edited), and who has
 * seen it — each person in a group, with when; "Seen" or "Not seen yet" in a
 * one-to-one. Someone who keeps read receipts off is listed as that, never
 * as "Not seen yet": they may well have read it.
 */
export function MessageInfoSheet({ message, readers, sender, mine, onClose }: {
  message: Message | null;
  /** Everyone else in the chat who could have read it, with when they did (undefined: not yet); `off`: they keep read receipts off. */
  readers: { user: User; at?: string; off?: boolean }[];
  sender?: User; mine: boolean; onClose: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  if (!message) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const seen = readers.filter((r) => r.at && !r.off);
  const unseen = readers.filter((r) => !r.at && !r.off);
  const quiet = readers.filter((r) => r.off);
  return (
    <Sheet visible title="Message info" onClose={onClose}>
      <View style={styles.infoBlock}>
        <InfoLine styles={styles} icon="time-outline" label={mine ? 'Sent' : `From ${sender?.name ?? 'someone'}`} value={chatStamp(message.createdAt)} />
        {message.editedAt ? <InfoLine styles={styles} icon="create-outline" label="Edited" value={chatStamp(message.editedAt)} /> : null}
      </View>
      {mine && readers.length ? (
        <ScrollView style={{ maxHeight: 320 }}>
          {seen.length ? <Text style={styles.infoHead}>Seen by</Text> : null}
          {seen.map(({ user, at }) => (
            <View key={user.id} style={styles.person}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={34} />
              <Text style={[styles.personName, styles.personNameFlex]} numberOfLines={1}>{user.name}</Text>
              <Text style={styles.personNote}>{at ? chatStamp(at) : ''}</Text>
            </View>
          ))}
          {unseen.length ? <Text style={styles.infoHead}>Not seen yet</Text> : null}
          {unseen.map(({ user }) => (
            <View key={user.id} style={[styles.person, styles.personQuiet]}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={34} />
              <Text style={[styles.personName, styles.personNameFlex]} numberOfLines={1}>{user.name}</Text>
            </View>
          ))}
          {quiet.length ? <Text style={styles.infoHead}>Read receipts off</Text> : null}
          {quiet.map(({ user }) => (
            <View key={user.id} style={[styles.person, styles.personQuiet]}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={34} />
              <Text style={[styles.personName, styles.personNameFlex]} numberOfLines={1}>{user.name}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

function InfoLine({ styles, icon, label, value }: { styles: ReturnType<typeof useThemedStyles<typeof styleDefinitions>>; icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // A reply's quote: inside the bubble, a soft block. In yours, the bubble's colour a step toward the
  // page's text (darker on a light court, lighter on a dark one), so the ink on it stays solid and
  // clear (it was see-through ink on see-through ink, under 3:1 on Melbourne's blue); in theirs, the page's text, faint.
  quote: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', marginBottom: 5, marginTop: 1, minWidth: 120 },
  quoteMine: { backgroundColor: `${colors.text}29` },
  quoteTheirs: { backgroundColor: `${colors.text}0F` },
  quoteAlone: { backgroundColor: colors.bubble, marginBottom: 3, maxWidth: 260 },
  quoteBar: { width: 3, backgroundColor: colors.brand },
  quoteBarMine: { backgroundColor: colors.brandInk },
  quoteWords: { flexShrink: 1, paddingHorizontal: 8, paddingVertical: 5, gap: 1 },
  quoteWho: { ...font('600'), fontSize: 12.5, lineHeight: 16, color: colors.brand },
  quoteWhoMine: { color: colors.brandInk },
  quoteLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quoteText: { ...font('400'), fontSize: 13.5, lineHeight: 18, color: colors.textMuted, flexShrink: 1 },
  quoteTextMine: { color: colors.brandInk },
  quoteGone: { fontStyle: 'italic' },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md + 4, marginTop: spacing.xs, marginBottom: 2, maxWidth: 700, alignSelf: 'stretch' },
  replyBarEdge: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.brand },
  replyBarWords: { flex: 1, minWidth: 0, paddingVertical: 2 },
  replyBarTitle: { ...font('400'), fontSize: 12.5, lineHeight: 16, color: colors.textMuted },
  replyBarName: { ...font('600'), color: colors.text },
  replyBarText: { ...font('400'), fontSize: 14, lineHeight: 19, color: colors.textMuted },
  replyBarClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  downWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.md },
  down: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: '0px 3px 12px rgba(0, 0, 0, 0.14)',
  },
  downBadge: { position: 'absolute', top: -6, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  downBadgeText: { ...font('700'), fontSize: 11, lineHeight: 13, color: colors.brandInk, fontVariant: ['tabular-nums'] },
  burstWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  burst: { fontSize: 40, lineHeight: 48, textShadowColor: 'rgba(0,0,0,0.18)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  flash: { position: 'absolute', left: -spacing.lg, right: -spacing.lg, top: -3, bottom: -3, backgroundColor: `${colors.brand}24` },
  faces: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  facesRight: { alignSelf: 'flex-end', paddingRight: 2 },
  facesLeft: { alignSelf: 'flex-start' },
  faceRing: { borderRadius: 10, borderWidth: 1.5, borderColor: colors.bg },
  faceOverlap: { marginLeft: -4 },
  facesMore: { ...font('500'), fontSize: 11, color: colors.textFaint, marginLeft: 4 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropClear: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm, maxWidth: 520, width: '100%', alignSelf: 'center' },
  emojiSheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm, maxWidth: 520, width: '100%', alignSelf: 'center', overflow: 'hidden' },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  sheetTitle: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  tally: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  tallyAll: { ...typography.smallStrong, color: colors.text },
  tallyOne: { ...typography.small, color: colors.textMuted },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: 10 },
  personQuiet: { opacity: 0.6 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  personWords: { flex: 1, minWidth: 0 },
  personName: { ...typography.body, color: colors.text },
  personNameFlex: { flex: 1, minWidth: 0 },
  personNote: { ...typography.small, color: colors.textMuted },
  personEmoji: { fontSize: 24 },
  infoBlock: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  infoLabel: { ...typography.body, color: colors.text, flex: 1 },
  infoValue: { ...typography.small, color: colors.textMuted },
  infoHead: { ...typography.caption, color: colors.textFaint, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 2 },
});
