import { PRESS_DIM } from '@/theme/press';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Toggle } from '@/components/ui';
import type { HitAudience, ID, User } from '@/data/types';
import { chatLockNote, named } from '@/features/messages/groups';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { Chips } from '@/components/sheet/SheetForm';
import { RisingSheet } from '@/components/RisingSheet';
import { useModalSheetBottom } from '@/lib/modalSheet';
import { AUDIENCES, AUDIENCE_SHORT, EVERYONE_FRIENDS_LINE } from './audience';

/*
 * "Who sees it first" on the hit form (migration 76): three answers you tap,
 * rows of one grouped list. Everyone is today's hit; Invite
 * first and Only people I invite open a row of the people you follow to
 * tick (the players from "Ask to hit" already ticked, first), and "My
 * groups" when you are in one. Only people you can message are offered: the
 * hit goes to each of them as a card in your chat with them, the same card
 * "Ask to hit" sends.
 */

export const HIT_INVITE_MAX = 20;

/** `forFriends`: the poster is not known to be an adult, so "Everyone" reaches only their followers and says so. */
export function AudienceCards({ value, onChange, forFriends = false }: { value: HitAudience; onChange: (v: HitAudience) => void; forFriends?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  // One grouped list, a row per answer on a hairline (Oct 7: three lifted cards with a ringed one read heavy):
  // the chosen row's icon and radio take the brand, the rest stay quiet.
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Who sees it first">
      {AUDIENCES.map((option, i) => {
        const o = forFriends && option.value === 'everyone' ? { ...option, line: EVERYONE_FRIENDS_LINE } : option;
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${o.title}. ${o.line}`}
            onPress={() => { if (!on) { haptics.tap(); onChange(o.value); } }}
            style={({ pressed }) => [styles.option, pressed && !on && styles.pressedRow]}
          >
            <View style={[styles.optionIcon, on && styles.optionIconOn]}>
              <Ionicons name={o.icon} size={17} color={on ? colors.brand : colors.textMuted} />
            </View>
            {/* The words own the hairline, so it starts at them, not at the icon. */}
            <View style={[styles.optionBody, i > 0 && styles.rule]}>
              <View style={styles.words}>
                <Text style={styles.title}>{o.title}</Text>
                <Text style={styles.line}>{o.line}</Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on ? <Ionicons name="checkmark" size={13} color={colors.brandInk} /> : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The calmer "Who sees it first" (Oct 24): 'A' one three-part switch, the
 * Game chips' own pills; 'B' three slim text rows in one quiet group, a check
 * on the chosen one. Either way one short line says what the chosen answer does.
 */
export function AudienceChoice({ look, value, onChange, forFriends = false }: { look: 'A' | 'B'; value: HitAudience; onChange: (v: HitAudience) => void; forFriends?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const lineOf = (v: HitAudience) => (forFriends && v === 'everyone' ? EVERYONE_FRIENDS_LINE : AUDIENCE_SHORT[v].line);
  const pick = (v: HitAudience | undefined) => { if (v && v !== value) { haptics.tap(); onChange(v); } };
  if (look === 'A') {
    return (
      <View style={{ gap: spacing.sm + 2 }}>
        <Chips soft fill label="Who sees it first" value={value} onChange={pick}
          options={AUDIENCES.map((o) => ({ value: o.value, label: AUDIENCE_SHORT[o.value].short, a11y: `${o.title}. ${lineOf(o.value)}` }))} />
        <Text style={styles.calmLine}>{lineOf(value)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Who sees it first">
      {AUDIENCES.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${o.title}. ${lineOf(o.value)}`}
            onPress={() => pick(o.value)} style={({ pressed }) => [styles.slim, i > 0 && styles.slimRule, pressed && !on && styles.pressedRow]}>
            <View style={styles.words}>
              <Text style={[styles.slimTitle, on && styles.slimTitleOn]}>{o.title}</Text>
              {on ? <Text style={styles.line}>{lineOf(o.value)}</Text> : null}
            </View>
            {on ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The words the C/E/F menu and its openers use for an answer. */
const nameOf = (v: HitAudience) => AUDIENCES.find((o) => o.value === v)!.title;

/**
 * C, E and F's small menu (Oct 24): the phone's own bottom sheet, a small
 * title and the three answers, one line each, a tick on the chosen one.
 */
export function AudienceMenu({ visible, onClose, value, onChange, forFriends = false }: { visible: boolean; onClose: () => void; value: HitAudience; onChange: (v: HitAudience) => void; forFriends?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const bottom = useModalSheetBottom(visible, spacing.xxl);
  const lineOf = (v: HitAudience) => (forFriends && v === 'everyone' ? EVERYONE_FRIENDS_LINE : AUDIENCE_SHORT[v].line);
  return (
    <RisingSheet visible={visible} onClose={onClose} closeLabel="Close menu" sheetStyle={[styles.menu, { paddingBottom: bottom }]}>
      <View style={styles.grabber} />
      <Text style={styles.menuTitle}>Who sees it</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Who sees it first">
        {AUDIENCES.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${o.title}. ${lineOf(o.value)}`}
              onPress={() => { onClose(); if (!on) { haptics.tap(); onChange(o.value); } }}
              style={({ pressed }) => [styles.menuRow, i > 0 && styles.slimRule, pressed && styles.pressedRow]}>
              <Text style={[styles.slimTitle, on && styles.slimTitleOn]}>{o.title}</Text>
              {on ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
            </Pressable>
          );
        })}
      </View>
    </RisingSheet>
  );
}

/** C: one quiet setting row, the question left and the answer right with a ›, in the sheet's Level / Players needed list. */
export function AudienceSettingRow({ value, onOpen, forFriends = false }: { value: HitAudience; onOpen: () => void; forFriends?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const line = forFriends && value === 'everyone' ? EVERYONE_FRIENDS_LINE : AUDIENCE_SHORT[value].line;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Who sees it: ${nameOf(value)}. ${line}`} accessibilityHint="Opens the choices"
      onPress={() => { haptics.untap(); onOpen(); }} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}>
      <Text style={styles.settingTitle}>Who sees it</Text>
      <View style={styles.settingValue}>
        <Text style={styles.settingValueText} numberOfLines={1}>{nameOf(value)}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
    </Pressable>
  );
}

/** D: one switch, on for everyone; off shows the one small choice left (Invite first, the default, or Only invited). */
export function AudienceSwitch({ value, onChange, forFriends = false }: { value: HitAudience; onChange: (v: HitAudience) => void; forFriends?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const open = value === 'everyone';
  const label = forFriends ? 'Open to your followers' : 'Open to players nearby';
  const flip = () => { (open ? haptics.untap : haptics.tap)(); onChange(open ? 'invite_first' : 'everyone'); };
  return (
    <View style={{ gap: spacing.sm + 2 }}>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: open }} accessibilityLabel={label}
        accessibilityHint={open ? (forFriends ? EVERYONE_FRIENDS_LINE : AUDIENCE_SHORT.everyone.line) : 'Only the people you invite, at first'}
        onPress={flip} style={styles.settingRow}>
        <Text style={styles.settingTitle}>{label}</Text>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Toggle value={open} onChange={flip} />
        </View>
      </Pressable>
      {open ? null : (
        <View style={{ gap: spacing.sm }}>
          <Chips soft label="Who sees it first" value={value} onChange={(v) => { if (v && v !== value) { haptics.untap(); onChange(v); } }}
            options={AUDIENCES.filter((o) => o.value !== 'everyone').map((o) => ({ value: o.value, label: AUDIENCE_SHORT[o.value].short, a11y: `${o.title}. ${AUDIENCE_SHORT[o.value].line}` }))} />
          <Text style={styles.calmLine}>{AUDIENCE_SHORT[value].line}</Text>
        </View>
      )}
    </View>
  );
}

/** E: the answer as one tappable word at the end of the title's summary line ("Singles · Today at 2pm · Alder Park · Everyone ▾"). */
export function AudienceWord({ value, onOpen }: { value: HitAudience; onOpen: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Text accessibilityRole="button" accessibilityLabel={`Who sees it: ${nameOf(value)}`} accessibilityHint="Opens the choices" suppressHighlighting
      onPress={() => { haptics.untap(); onOpen(); }} style={styles.word}>
      {nameOf(value)} ▾
    </Text>
  );
}

/** F: a small pill beside Post ("Everyone ▾"), the way a post's audience sits beside Share. */
export function AudiencePill({ value, onOpen }: { value: HitAudience; onOpen: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Who sees it: ${nameOf(value)}`} accessibilityHint="Opens the choices"
      onPress={() => { haptics.untap(); onOpen(); }} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      <Text style={styles.pillText} numberOfLines={1}>{AUDIENCE_SHORT[value].short}</Text>
      <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

/** The people to invite: a row of faces to tick, the ticked first. `first`: who came in already ticked ("Ask to hit"), kept at the front. */
export function InviteRow({ picked, onPicked, first }: { picked: ID[]; onPicked: React.Dispatch<React.SetStateAction<ID[]>>; first: ID[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, followingIds, blockedIds, conversations, currentUserId, actions } = useApp();
  const [note, setNote] = useState<string | null>(null);
  // Who you follow (and whoever was asked), the people you talk to most first.
  const people = useMemo(() => {
    const recent = [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).flatMap((c) => c.participantIds.filter((p) => p !== currentUserId));
    const rank = (u: User) => { const i = first.indexOf(u.id); if (i >= 0) return i - 1000; const r = recent.indexOf(u.id); return r < 0 ? 9999 : r; };
    const ids = Array.from(new Set([...first, ...followingIds]));
    return ids
      .map((fid) => users.find((u) => u.id === fid))
      .filter((u): u is User => !!u && u.id !== currentUserId && !blockedIds.includes(u.id))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [users, followingIds, blockedIds, conversations, currentUserId, first]);

  const toggle = async (u: User) => {
    if (picked.includes(u.id)) { haptics.untap(); onPicked((now) => now.filter((x) => x !== u.id)); setNote(null); return; }
    // The hit goes to them in your chat: someone the chat rules lock (a teen who doesn't follow you, say) is asked about again first.
    if (!actions.canMessage(u.id) && !(await actions.reachNow(u.id))) { setNote(chatLockNote(named(u, users))); return; }
    if (picked.length >= HIT_INVITE_MAX) { setNote(`You can invite up to ${HIT_INVITE_MAX} people to a hit.`); return; }
    haptics.tap();
    setNote(null);
    onPicked((now) => (now.includes(u.id) ? now : [...now, u.id]));
  };

  if (!people.length) return <Text style={styles.empty}>Follow some players to invite them here.</Text>;
  return (
    <View style={{ gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faces} keyboardShouldPersistTaps="handled">
        {people.map((u) => {
          const on = picked.includes(u.id);
          const locked = !on && !actions.canMessage(u.id);
          return (
            <Pressable key={u.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Invite ${u.name}${locked ? '. Can’t message yet' : ''}`}
              onPress={() => { void toggle(u); }} style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
              <View>
                <View style={[styles.ring, on && styles.ringOn]}>
                  <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={48} style={locked ? { opacity: 0.45 } : undefined} />
                </View>
                {on ? <View style={styles.tick}><Ionicons name="checkmark" size={12} color={colors.brandInk} /></View> : null}
                {locked ? <View style={styles.lock}><Ionicons name="lock-closed" size={10} color={colors.textMuted} /></View> : null}
              </View>
              <Text style={[styles.faceName, on && styles.faceNameOn]} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/** "My groups": the people in your groups see it too. A tap anywhere on the card flips it. */
export function GroupsCard({ on, onChange, count }: { on: boolean; onChange: (on: boolean) => void; count: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const line = on ? `Everyone in your ${count === 1 ? 'group' : `${count} groups`} can see it and join.` : 'Only the people you tick.';
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="My groups" accessibilityHint={line}
      onPress={() => { (on ? haptics.untap : haptics.tap)(); onChange(!on); }} style={({ pressed }) => [styles.group, styles.option, pressed && styles.pressed]}>
      <View style={[styles.optionIcon, on && styles.optionIconOn]}><Ionicons name="people-circle-outline" size={19} color={on ? colors.brand : colors.textMuted} /></View>
      <View style={styles.optionBody}>
        <View style={styles.words}>
          <Text style={styles.title}>My groups</Text>
          <Text style={styles.line}>{line}</Text>
        </View>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Toggle value={on} onChange={onChange} />
        </View>
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  // The grouped list: one white box on the page's soft shadow, the answers as rows inside it.
  group: { ...lift, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.md + 2 },
  optionBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingRight: spacing.md + 2, minHeight: 60 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // A small tile, quiet until its row is chosen, then the brand's pale tint.
  optionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  optionIconOn: { backgroundColor: colors.brandDim },
  pressed: { opacity: PRESS_DIM },
  pressedRow: { backgroundColor: colors.surfaceAlt },
  words: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.body, ...font('600'), color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  radio: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  faces: { gap: spacing.md, paddingVertical: 2, paddingRight: spacing.sm },
  face: { width: 60, alignItems: 'center', gap: 4 },
  ring: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: colors.brand },
  tick: { position: 'absolute', right: -1, bottom: -1, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  faceName: { ...typography.small, color: colors.textMuted, maxWidth: 60 },
  faceNameOn: { color: colors.text, ...font('600') },
  note: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  // The calmer looks: the chosen answer's one line under the switch; B's slim rows on hairlines.
  calmLine: { ...typography.small, color: colors.textMuted, lineHeight: 18, paddingHorizontal: 2 },
  slim: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md + 2, paddingVertical: 13, minHeight: 48 },
  slimRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  slimTitle: { ...typography.body, color: colors.text },
  slimTitleOn: { ...font('600') },
  empty: { ...typography.small, color: colors.textMuted },
  // C/E/F's small menu, the MenuSheet's own sheet without its icons.
  menu: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  menuTitle: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingBottom: spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  // C and D: a row of the Level / Players needed list.
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 48 },
  settingTitle: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  settingValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settingValueText: { ...typography.body, color: colors.textMuted },
  // E: the summary line's one tappable word.
  word: { color: colors.brand, ...font('600') },
  // F: the pill beside Post, as tall as Post.
  pill: { ...lift, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingHorizontal: spacing.md + 2, borderRadius: radius.pill, backgroundColor: colors.surface },
  pillText: { ...typography.body, ...font('600'), color: colors.text },
});
