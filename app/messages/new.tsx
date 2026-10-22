import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import Reanimated, { Easing, FadeIn, FadeOut, LinearTransition, ZoomIn, ZoomOut, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, BrandWash, EmptyState, Screen } from '@/components/ui';
import { brandBoxShadow, brandShadow } from '@/theme/fillMode';
import { GROUP_CAP, GroupAvatar, chatLockNote, groupLockNote, groupName, isGroupChat, named, othersIn } from '@/features/messages/groups';
import { LockBadge, LockNote } from '@/features/messages/LockNote';
import { GrowRoom } from '@/features/messages/ChatBits';
import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { User } from '@/data/types';
import { goBack } from '@/lib/goBack';
import { useResponsive } from '@/lib/useResponsive';
import { useApp, type GroupOutcome } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { buttonShape, colors, font, lift, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';


/**
 * On a phone (iPhone and Android), the room the keyboard takes at the bottom
 * of the screen, following it frame by frame: the Chat / Create group button
 * rides up on it rather than sitting underneath. `less` is the room the
 * button already keeps under it (the home strip's), which the keyboard
 * covers anyway. A browser has no keyboard to follow. Which version runs is
 * fixed per platform, so the hooks inside never change between draws.
 */
const NO_LIFT: ViewStyle = {};
const useFooterLift: (less: number) => ViewStyle = Platform.OS === 'web'
  ? () => NO_LIFT
  : function useNativeFooterLift(less: number) {
    const keyboard = useAnimatedKeyboard();
    return useAnimatedStyle(() => ({ bottom: Math.max(0, keyboard.height.value - less) })) as ViewStyle;
  };

/*
 * How the picks move (Oct 22 sweep: "picking the first person makes the
 * Chat/Create group footer pop up; chips and ticks pop too"): the footer
 * slides up from the bottom edge and back down, a chip grows in softly and
 * the others make room, and a tick fills from its middle.
 */
// The footer travels its own height (not the window's, as the slide presets do: on a computer that was
// off screen for nearly all of it and then popped in), on a shared value so web and phone move alike.
const FOOTER_IN_MS = 260;
const FOOTER_OUT_MS = 220;
const CHIP_IN = ZoomIn.duration(180).easing(Easing.out(Easing.cubic));
const CHIP_OUT = ZoomOut.duration(130);
const CHIP_GLIDE = LinearTransition.duration(200).easing(Easing.bezier(0.25, 0.8, 0.25, 1));

/** The round tick at the end of a row: its fill grows from the middle when ticked, and shrinks away when not. */
function Tick({ on, styles }: { on: boolean; styles: { tick: object; tickFill: object } }) {
  const p = useSharedValue(on ? 1 : 0);
  React.useEffect(() => {
    p.value = on ? withSpring(1, { damping: 16, stiffness: 320, mass: 0.7 }) : withTiming(0, { duration: 140 });
  }, [on, p]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return (
    <View style={styles.tick}>
      <Reanimated.View style={[styles.tickFill, fill]}>
        <Ionicons name="checkmark" size={15} color={colors.brandInk} />
      </Reanimated.View>
    </View>
  );
}

/**
 * Starting a chat. On a computer it is a small box over your inbox, the way
 * Instagram's is: "To", the people you talk to most, and one click opens the
 * chat. On a phone it is its own page. Never suggests someone blocked.
 *
 * Instagram's way for groups: tick two or more people (up to GROUP_CAP in
 * all, you included), give it a name if you like, then Create group. Your
 * groups are listed first, so an existing one is one tap away, and picking
 * exactly the people of an unnamed group you already have opens that group
 * instead of making a second one (iMessage does the same).
 *
 * `?with=<id>` opens with that person already picked: "Create a group with
 * Mira" from a one-to-one chat's details.
 *
 * Someone you can't reach shows a small lock on their face (the Send-to
 * sheet's look). Tapping them first asks the server again (they may have
 * followed you since the app opened), then either ticks them or says why in
 * a note above the button that stays until things change, never in a toast
 * that is gone before it is read. On its own a lock follows the one-to-one
 * rule; once someone is ticked, the group rule, which has no "already
 * chatting" exception.
 */
export default function NewMessage() {
  const styles = useThemedStyles(styleDefinitions);
  const { isPhone } = useResponsive();
  const params = useLocalSearchParams<{ with?: string }>();
  const { users, conversations, currentUserId, blockedIds, actions } = useApp();
  // On a phone the button keeps clear of the home strip, and rides up on the keyboard (the To box opens it).
  const insets = useSafeAreaInsets();
  const footerBottom = Math.max(spacing.xl, insets.bottom + spacing.sm);
  const footerLift = useFooterLift(footerBottom - spacing.lg);
  const [query, setQuery] = useState('');
  // Instagram's way: tick people, then Chat (one) or Create group (two or more).
  const [picked, setPicked] = useState<string[]>(() => {
    const first = params.with;
    return first && first !== currentUserId && !blockedIds.includes(first) && users.some((u) => u.id === first) ? [first] : [];
  });
  const [title, setTitle] = useState('');
  // Why the last tap or Create group did not go through, until the picks change.
  const [note, setNote] = useState<{ text: string; alert?: boolean } | null>(null);
  // Waiting on the server's yes for a new group (a real account only).
  const [busy, setBusy] = useState(false);
  // Opening: ask the server again whether the locked people follow you now,
  // so the locks shown are today's rather than from when the app opened.
  // Only people already known to be locked: nobody new is asked about here.
  useEffect(() => {
    const locked = actions.lockedNow(users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id)).map((u) => u.id));
    if (locked.length) void actions.recheckFollows(locked);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const term = query.trim().replace(/^@/, '').toLowerCase();
  const recent = [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).flatMap((c) => c.participantIds.filter((id) => id !== currentUserId));
  const matches = users
    .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id) && `${u.name} ${u.handle}`.toLowerCase().includes(term))
    .sort((a, b) => (recent.includes(a.id) ? recent.indexOf(a.id) : 999) - (recent.includes(b.id) ? recent.indexOf(b.id) : 999))
    .slice(0, 50);
  // Your groups, newest first, found by their name or anyone in them. Only
  // while nobody is ticked: once you are picking people, a tap on a group
  // would throw the picking away.
  const groups = picked.length || !currentUserId ? [] : conversations
    .filter((c) => isGroupChat(c) && c.participantIds.includes(currentUserId))
    .map((c) => ({ conversation: c, name: groupName(c, users, currentUserId), people: othersIn(c, users, currentUserId) }))
    .filter(({ name, people }) => !term || `${name} ${people.map((p) => `${p.name} ${p.handle}`).join(' ')}`.toLowerCase().includes(term))
    .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt))
    .slice(0, term ? 20 : 5);
  // The same people, with no new name: the unnamed group you already have.
  const sameGroup = picked.length > 1 && !title.trim() && currentUserId
    ? conversations.find((c) => {
      if (!isGroupChat(c) || c.title || c.participantIds.length !== picked.length + 1) return false;
      return c.participantIds.includes(currentUserId) && picked.every((id) => c.participantIds.includes(id));
    })
    : undefined;
  // On a computer the box arrives on its own (the inbox behind never moves or
  // flashes): the backdrop darkens and blurs, the box rises and settles.
  const backdrop = useRef<View>(null);
  const box = useRef<View>(null);
  const closing = useRef(false);
  const node = (r: React.RefObject<View | null>) => r.current as unknown as HTMLElement | null;
  useEffect(() => {
    if (isPhone || Platform.OS !== 'web') return;
    node(backdrop)?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    node(box)?.animate?.([{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }, [isPhone]);
  const close = () => {
    if (isPhone || Platform.OS !== 'web') { goBack('/messages'); return; }
    if (closing.current) return;
    closing.current = true;
    node(box)?.animate?.([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
    const out = node(backdrop)?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    if (out) out.onfinish = () => goBack('/messages'); else goBack('/messages');
  };
  const firstName = (u?: User) => u?.name.trim().split(/\s+/)[0] ?? 'They';
  // How notes name people: a first name, with the @handle when it's shared.
  const namesOf = (ids: string[]) => ids.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u).map((u) => named(u, users));
  // With nobody ticked, a tap starts a one-to-one chat; with anyone ticked, it makes a group.
  const lockedFor = (id: string) => !picked.includes(id) && (picked.length ? !actions.canAddToGroup(id) : !actions.canMessage(id));
  // Ticked people who can't be put in a new group: one you chat with, say,
  // who doesn't follow you. A group you already have with them just opens.
  const blockers = picked.length > 1 && !sameGroup ? picked.filter((id) => !actions.canAddToGroup(id)) : [];
  const toggle = async (id: string) => {
    if (picked.includes(id)) { setPicked((p) => p.filter((x) => x !== id)); setNote(null); return; }
    // Locked, unless they have followed you since the app opened (or the server says otherwise now): ask before saying no.
    if (lockedFor(id) && !(await actions.reachNow(id))) {
      const [who] = namesOf([id]);
      setNote({ text: picked.length ? groupLockNote(who ? [who] : []) : chatLockNote(who) });
      return;
    }
    if (picked.length >= GROUP_CAP - 1) { setNote({ text: `A group can have up to ${GROUP_CAP} people, you included.` }); return; }
    setNote(null);
    setPicked((p) => (p.includes(id) ? p : [...p, id]));
    setQuery('');
  };
  // The server's no, in words that name who when the app can tell.
  const refusal = (outcome: Extract<GroupOutcome, { ok: false }>) => {
    switch (outcome.why) {
      case 'teen': return groupLockNote(namesOf(outcome.who), true);
      case 'blocked': return 'Some of the people you picked can’t be in a group together. Take someone out and try again.';
      case 'full': return `A group can have up to ${GROUP_CAP} people, you included.`;
      // A name refused for its words (migration 117).
      case 'words': return BLOCKED_WORDS_NOTE;
      default: return 'That group didn’t start. Check your connection and try again.';
    }
  };
  const start = async () => {
    if (!picked.length || busy || blockers.length) return;
    if (picked.length === 1) { router.replace(`/messages/${actions.openConversationWith(picked[0])}`); return; }
    if (sameGroup) { router.replace(`/messages/${sameGroup.id}`); return; }
    setBusy(true);
    const outcome = await actions.createGroup(picked, title);
    setBusy(false);
    if (!outcome) return;
    if (outcome.ok) { router.replace(`/messages/${outcome.id}`); return; }
    // Stay here with the picks as they were, so whoever is in the way can be taken out.
    setNote({ text: refusal(outcome), alert: true });
  };
  const pickedUsers = picked.map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const chips = pickedUsers.length ? (
    <Reanimated.View layout={CHIP_GLIDE} exiting={FadeOut.duration(130)} style={styles.chips}>
      {pickedUsers.map((u) => {
        // Someone ticked who can't be in the group shows the lock here too, beside the way to take them out.
        const stuck = blockers.includes(u.id);
        return (
          <Reanimated.View key={u.id} entering={CHIP_IN} exiting={CHIP_OUT} layout={CHIP_GLIDE}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${u.name}`} onPress={() => { void toggle(u.id); }} style={({ pressed }) => [styles.chip, stuck && styles.chipStuck, pressed && { opacity: PRESS_DIM }]}>
            <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={20} />
            {stuck ? <Ionicons name="lock-closed" size={11} color={colors.textMuted} /> : null}
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.chipText, stuck && styles.chipTextStuck]} numberOfLines={1}>{firstName(u)}</Text>
            <Ionicons name="close" size={13} color={stuck ? colors.textMuted : colors.brand} />
          </Pressable>
          </Reanimated.View>
        );
      })}
    </Reanimated.View>
  ) : null;
  // The notes sit above the button, pinned with it, so they are on screen wherever the list is scrolled.
  const blockersText = blockers.length ? groupLockNote(namesOf(blockers), true) : null;
  const notes = [blockersText, note && note.text !== blockersText ? note.text : null].filter((t): t is string => !!t);
  const held = !!blockers.length || busy;
  // The footer slides up from under the screen's edge by its own height, and is kept drawn while it slides
  // back down, showing what it last said (the way the chat's emoji keyboard is kept, emojiDrawn).
  const footerShown = !!(picked.length || notes.length);
  const lastFooter = useRef({ picked, notes, held, busy, sameGroup: !!sameGroup });
  if (footerShown) lastFooter.current = { picked, notes, held, busy, sameGroup: !!sameGroup };
  const [footerDrawn, setFooterDrawn] = useState(footerShown);
  const footerH = useRef(120);
  const footerY = useSharedValue(footerShown ? 0 : 120);
  const footerFade = useSharedValue(footerShown ? 1 : 0);
  const footerStill = useReducedMotion();
  useEffect(() => {
    if (footerShown) {
      setFooterDrawn(true);
      // Reduce Motion: it only fades.
      if (footerStill) { footerY.value = 0; footerFade.value = withTiming(1, { duration: 180 }); return undefined; }
      footerFade.value = 1;
      footerY.value = withTiming(0, { duration: FOOTER_IN_MS, easing: Easing.out(Easing.cubic) });
      return undefined;
    }
    if (footerStill) footerFade.value = withTiming(0, { duration: 160 });
    else footerY.value = withTiming(footerH.current + 4, { duration: FOOTER_OUT_MS, easing: Easing.in(Easing.quad) });
    const t = setTimeout(() => setFooterDrawn(false), (footerStill ? 160 : FOOTER_OUT_MS) + 40);
    return () => clearTimeout(t);
  }, [footerShown, footerStill, footerY, footerFade]);
  const footerSlide = useAnimatedStyle(() => ({ opacity: footerFade.value, transform: [{ translateY: footerY.value }] }));
  const footer = (phone: boolean) => {
    if (!footerShown && !footerDrawn) return null;
    const f = footerShown ? { picked, notes, held, busy, sameGroup: !!sameGroup } : lastFooter.current;
    return (
      <Reanimated.View
        pointerEvents={footerShown ? 'auto' : 'none'}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h) footerH.current = h;
        }}
        style={[styles.footer, phone && { paddingBottom: footerBottom }, phone && footerLift, footerSlide]}
      >
        {f.notes.map((text) => (
          <LockNote key={text} text={text} tone={note?.alert && text === note.text ? 'alert' : 'lock'} onClose={text === note?.text ? () => setNote(null) : undefined} />
        ))}
        {/* The group name's room opens and closes with it, so the footer's top edge glides rather than jumps. */}
        <View style={styles.groupNameRoom}>
          <GrowRoom from="top">
            {f.picked.length > 1 ? (
              <Reanimated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.groupNameWrap}>
                <TextInput maxFontSizeMultiplier={TextScale.TITLE} value={title} onChangeText={(v) => setTitle(v.slice(0, 60))} placeholder="Group name (optional)" placeholderTextColor={colors.textFaint} style={styles.groupName} accessibilityLabel="Group name" />
              </Reanimated.View>
            ) : null}
          </GrowRoom>
        </View>
        {f.picked.length ? (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: f.held, busy: f.busy }} disabled={f.held} onPress={() => { void start(); }} style={({ pressed }) => [styles.start, f.picked.length > 1 && styles.startGroup, f.held && styles.startHeld, pressed && { transform: [{ scale: PRESS_SHRINK }] }]}>
            <BrandWash radius={buttonShape.radius} curve />
            {/* Two or more ticked: the group is the point now, so the button says so with its people. */}
            {f.picked.length > 1 && !f.sameGroup ? <Ionicons name="people" size={19} color={colors.brandInk} /> : null}
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.startText}>{f.picked.length === 1 ? 'Chat' : f.sameGroup ? 'Open group' : f.busy ? 'Creating group…' : `Create group · ${f.picked.length + 1} people`}</Text>
          </Pressable>
        ) : null}
      </Reanimated.View>
    );
  };

  const list = (
    <>
      {/* Your groups step aside once someone is ticked: they fade while their room closes, and the people glide up. */}
      <GrowRoom from="top">
      {groups.length ? (
        <Reanimated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(130)}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label}>Groups</Text>
          {groups.map(({ conversation, name, people }) => (
            <Pressable
              key={conversation.id}
              accessibilityRole="link"
              accessibilityLabel={`Open ${name}`}
              onPress={() => router.replace(`/messages/${conversation.id}`)}
              style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
            >
              <GroupAvatar people={people} size={44} photoUrl={conversation.photoUrl} name={name} />
              <View style={styles.words}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{name}</Text>
                {/* A named group says who is in it; an unnamed one is already called by its people. */}
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.handle} numberOfLines={1}>
                  {conversation.title && people.length ? people.map((p) => p.name.split(' ')[0]).join(', ') : `${conversation.participantIds.length} members`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </Reanimated.View>
      ) : null}
      </GrowRoom>
      {matches.length ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label}>{groups.length ? (term ? 'People' : 'Suggested') : term ? 'Results' : 'Suggested'}</Text> : null}
      {matches.map((user) => {
        const on = picked.includes(user.id);
        const locked = lockedFor(user.id);
        return (
          <Pressable
            key={user.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={locked ? `${user.name}. Locked` : user.name}
            accessibilityHint={locked ? `Shows why you can’t ${picked.length ? 'add' : 'message'} ${firstName(user)}` : undefined}
            onPress={() => { void toggle(user.id); }}
            style={(state) => [styles.row, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
          >
            <View style={locked && styles.locked}>
              <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={44} />
              {locked ? <LockBadge /> : null}
            </View>
            <View style={[styles.words, locked && styles.locked]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{user.name}</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.handle} numberOfLines={1}>@{user.handle}</Text>
            </View>
            {locked ? null : <Tick on={on} styles={styles} />}
          </Pressable>
        );
      })}
      {!matches.length && !groups.length ? <EmptyState title="No players found" body="Try their name or username." /> : null}
    </>
  );

  if (isPhone) {
    return (
      <View style={{ flex: 1 }}>
        <Screen
          title="New message"
          compactTitle
          onBack={close}
          // "To" and the people picked stay pinned under the title while the list scrolls (Instagram's).
          headerWrapper={(header) => (
            <>
              {header}
              <View style={styles.toPinned}>
                <View style={styles.toRow}>
                  <Text style={styles.to}>To</Text>
                  <TextInput maxFontSizeMultiplier={TextScale.TITLE} value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} autoFocus style={styles.toInput} accessibilityLabel="To" />
                </View>
                {/* The chips' row opens and closes smoothly, the list gliding down and back up under it. */}
                <GrowRoom from="top">{chips}</GrowRoom>
              </View>
            </>
          )}
        >
          <View style={styles.phoneList}>{list}</View>
          {/* Room under the list for the footer pinned over it (taller with a note in it). */}
          <View style={{ height: picked.length || notes.length ? 140 + notes.length * 90 : 0 }} />
        </Screen>
        {footer(true)}
      </View>
    );
  }

  return (
    <View ref={backdrop} style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={StyleSheet.absoluteFill} />
      <View ref={box} style={styles.box} accessibilityViewIsModal>
        <View style={styles.head}>
          <View style={styles.headSide} />
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>New message</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={8} style={styles.headSide}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.toRow}>
          <Text style={styles.to}>To</Text>
          <TextInput maxFontSizeMultiplier={TextScale.TITLE} value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} autoFocus style={styles.toInput} accessibilityLabel="To" />
        </View>
        <GrowRoom from="top">{chips}</GrowRoom>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollBody, picked.length || notes.length ? { paddingBottom: 150 + notes.length * 90 } : null]}>{list}</ScrollView>
        {footer(false)}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  // Dark and blurred behind the box, so the inbox recedes instead of reading as a second copy of the list.
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay, padding: spacing.xl, backdropFilter: 'blur(10px) saturate(0.8)', WebkitBackdropFilter: 'blur(10px) saturate(0.8)' } as object,
  box: { ...lift, width: '100%', maxWidth: 480, height: '72%', maxHeight: 640, borderRadius: 20, backgroundColor: colors.bg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headSide: { width: 32, alignItems: 'flex-end' },
  title: { ...typography.bodyStrong, color: colors.text },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  to: { ...typography.bodyStrong, color: colors.text },
  // Sized by its padding, not squeezed to no padding in a fixed-height row (that drew "Search" low and cut off on an iPhone).
  toInput: { flex: 1, ...typography.body, fontSize: 16, color: colors.text, minHeight: 50, paddingVertical: 10, outlineStyle: 'none' } as object,
  scroll: { flex: 1 },
  scrollBody: { paddingBottom: spacing.lg },
  label: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.lg },
  rowOn: { backgroundColor: colors.surfaceAlt },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  handle: { ...typography.small, color: colors.textMuted },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  // The tick's fill, grown from the middle over the ring (Tick).
  tickFill: { position: 'absolute', top: -1.5, left: -1.5, right: -1.5, bottom: -1.5, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  // The face sits 5px in from the pill's round end, so the pill hugs it.
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5, paddingRight: 9, minHeight: 30, borderRadius: 15, backgroundColor: colors.brandDim },
  chipText: { ...typography.smallStrong, color: colors.brand, maxWidth: 120 },
  // A ticked person who can't be in the group: greyed, with the lock.
  chipStuck: { backgroundColor: colors.surfaceAlt },
  chipTextStuck: { color: colors.textMuted },
  // Someone you can't pick right now, dimmed the way the Send-to sheet's locked tiles are.
  locked: { opacity: 0.45 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // The group name's room: the footer's gap under it comes off while it is shut, and goes inside it while open.
  groupNameRoom: { marginBottom: -spacing.sm },
  groupNameWrap: { paddingBottom: spacing.sm },
  groupName: { ...typography.body, fontSize: 16, color: colors.text, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.bgElevated, outlineStyle: 'none' } as object,
  start: { minHeight: 48, borderRadius: buttonShape.radius, ...buttonShape.curve, ...brandShadow, backgroundColor: colors.brand, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  startGroup: { boxShadow: brandBoxShadow },
  toPinned: { paddingBottom: spacing.xs },
  // The list under the pinned "To" runs edge to edge, as the rows draw their own room.
  phoneList: { marginHorizontal: -spacing.lg },
  startHeld: { opacity: 0.5 },
  startText: { ...typography.bodyStrong, color: colors.brandInk },
});
