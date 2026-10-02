import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Field } from '@/components/ui';
import type { ID, PracticeSession, SessionPlayer, SessionTagStatus, User } from '@/data/types';
import { MAX_SESSION_TAGS, flipRole, nameFor, nextRole, refusalWords, rolesForMatch } from '@/features/activity/sessionTags';
import { useMentionCandidates, type MentionCandidate } from '@/features/mentions/useMentionCandidates';
import * as haptics from '@/lib/haptics';
import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** Names listed under the box: enough to find someone, few enough to keep the sheet short. */
const LISTED = 5;
/** While typing (the keyboard is up on a phone), fewer, so the box and the names stay above the keys. */
const LISTED_TYPING = 3;
const firstName = (u: User) => u.name.trim().split(/\s+/)[0] || u.handle;

/**
 * "Who you played", on the log sheet: one box for the people you played with
 * or against. Typing finds CourtSide players with the same search as Tag
 * players on a post (people you follow first, then your followers); a tap
 * picks one, up to three (a doubles partner and two opponents), and in a
 * match each says which side of the net they were on ("vs" or "with", a tap
 * to switch). Whatever is left typed in the box is a name that isn't on
 * CourtSide: it stays in your log, for your eyes only, as it always has.
 *
 * The people picked are asked to accept; their name goes on a post only once
 * they do. From "How was the hit?", the people from the hit are offered
 * first. Before the server can tag (`search` off), it is the free-text box alone.
 *
 * Opened again on a session already logged (`status`), each person says
 * where their tag stands: waiting, or accepted (a tick; their side is fixed,
 * since that is what they said yes to: take them off and tag them again to
 * change it). Someone who said no, or took their name off, shows as "Said
 * no" or "Removed"; × takes them off your log, and they are still never
 * asked again on this session.
 */
export function WhoYouPlayed({ kind, players, onPlayers, text, onText, search, suggested = [], status = {}, declined = [], closed = [], onDrop }: {
  kind: PracticeSession['kind'];
  players: SessionPlayer[];
  /** Takes a list or, like a state setter, a change to the list as it is when it lands. */
  onPlayers: React.Dispatch<React.SetStateAction<SessionPlayer[]>>;
  text: string;
  onText: (next: string) => void;
  /** The people search is on (the server can tag). Off: the box is free text only. */
  search: boolean;
  /** People to offer before any typing: the others from a hit. */
  suggested?: ID[];
  /** Where each picked person's tag stands, on a session already logged. */
  status?: Record<ID, SessionTagStatus>;
  /** People who said no to this session, or took their name off it: shown, with × to take them off your log. */
  declined?: { id: ID; status: SessionTagStatus }[];
  /** Everyone who can't be tagged on this session again (the ones above, and any taken off your log). */
  closed?: ID[];
  /** × on someone who said no: off your log (the server keeps the no). */
  onDrop?: (id: ID) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, actions } = useApp();
  const candidates = useMentionCandidates(suggested);
  const box = useRef<TextInput>(null);
  const block = useRef<View>(null);
  const reveal = useRevealOnFocus();
  const [focused, setFocused] = useState(false);
  const [note, setNote] = useState('');
  // A blur waits a moment, so a tap on a name below the box lands before the list closes.
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closing.current) clearTimeout(closing.current); }, []);
  const match = kind === 'match';
  const full = players.length >= MAX_SESSION_TAGS;
  const picked = new Set(players.map((p) => p.id));
  const userOf = (id: ID) => users.find((u) => u.id === id);
  // Accepted: their side is what they said yes to, so it is not switched here.
  const locked = useMemo(() => new Set(players.filter((p) => status[p.id] === 'accepted').map((p) => p.id)), [players, status]);
  const closedSet = useMemo(() => new Set([...closed, ...declined.map((d) => d.id)]), [closed, declined]);

  // Sides switched by hand stay as they are; everyone else's is worked out
  // again when the session becomes a match (picked on a practice, where
  // everyone was "with"): two opponents first, then the partner.
  const byHand = useRef(new Set<ID>());
  const lastKind = useRef(kind);
  useEffect(() => {
    if (lastKind.current === kind) return;
    lastKind.current = kind;
    if (kind === 'match') onPlayers((now) => rolesForMatch(now, new Set([...byHand.current, ...locked])));
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = text.trim();
  const listed = useMemo(() => {
    if (!search) return [] as (MentionCandidate & { suggested: boolean })[];
    const fromHit = new Set(suggested);
    const cap = focused ? LISTED_TYPING : LISTED;
    const found = candidates(query, cap + players.length + closedSet.size)
      .filter((c) => !closedSet.has(c.user.id))
      .map((c) => ({ ...c, suggested: fromHit.has(c.user.id) }));
    // With nothing typed: the hit's people, then the people you follow.
    return found.slice(0, query ? cap : Math.max(Math.min(3, cap), suggested.length));
  }, [search, candidates, query, suggested, players.length, closedSet, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = search && (focused || !!query);
  // From a hit, before anything is typed: its people as quick picks under the box.
  const quick = search && !open ? suggested.filter((id) => !picked.has(id) && !closedSet.has(id)).map(userOf).filter((u): u is User => !!u) : [];

  // The box and the names under it stay above the phone's keys: lifted when
  // the box gains focus, and again once names are listed under it.
  const showing = open && (listed.length > 0 || !!query);
  useEffect(() => { if (showing) reveal(block.current); }, [showing, listed.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // This phone's quick answer (the server is asked about each person listed, so a lock shows a moment later); the server's own check after each pick has the last word.
  const refusal = (u: User) => actions.tagHint(u.id);
  const pick = (u: User) => {
    setNote('');
    if (picked.has(u.id)) { onPlayers((now) => now.filter((p) => p.id !== u.id)); haptics.untap(); return; }
    const why = refusal(u);
    if (why) { setNote(refusalWords(why, nameFor(u, users))); return; }
    if (full) { setNote(refusalWords('too_many')); return; }
    haptics.tap();
    onPlayers((now) => (now.some((p) => p.id === u.id) ? now : [...now, { id: u.id, role: nextRole(kind, now) }]));
    // The box empties for the next name; what was typed found who it was looking for.
    onText('');
    // The server has the last word (a block, an account gone): asked once per
    // pick. Only that person comes off, from the list as it is by then.
    void actions.sessionTagRefusal(u.id).then((no) => {
      if (!no) return;
      onPlayers((now) => now.filter((p) => p.id !== u.id));
      setNote(refusalWords(no, nameFor(u, users)));
    });
    setTimeout(() => box.current?.focus(), 0);
  };
  const remove = (id: ID) => { haptics.untap(); setNote(''); byHand.current.delete(id); onPlayers((now) => now.filter((p) => p.id !== id)); };
  const flip = (id: ID) => {
    const next = flipRole(players, id, locked);
    if (!next) {
      // The switch would move someone who already said yes to their side.
      const fixed = players.find((p) => p.id !== id && locked.has(p.id) && p.role === 'partner');
      const partner = fixed ? userOf(fixed.id) : undefined;
      setNote(partner ? `${firstName(partner)} is already your partner.` : 'Two opponents and one partner at most.');
      return;
    }
    haptics.tap();
    setNote('');
    byHand.current.add(id);
    onPlayers(next);
  };

  const placeholder = !search ? (match ? 'Opponent (optional)' : 'Who with (optional)')
    : full ? 'Add a name (only you see it)'
    : 'Search players or type a name';

  return (
    <View ref={block} style={styles.wrap}>
      {players.length || declined.length ? (
        <View style={styles.chips}>
          {players.map((p) => {
            const u = userOf(p.id);
            if (!u) return null;
            const state = status[p.id];
            const side = p.role === 'opponent' ? 'vs' : 'with';
            return (
              <View key={p.id} style={styles.chip}>
                {match ? (
                  locked.has(p.id) ? (
                    // They said yes to this side: it reads as plain words, not a switch.
                    <View style={styles.sideFixed} accessible accessibilityLabel={`${firstName(u)} was your ${p.role === 'opponent' ? 'opponent' : 'partner'}`}>
                      <Text style={styles.sideText}>{side}</Text>
                    </View>
                  ) : (
                    // Which side of the net, first, the way the post reads it ("vs Mira"). One tap switches; the court always stays possible.
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${firstName(u)} was your ${p.role === 'opponent' ? 'opponent' : 'partner'}. Switch to ${p.role === 'opponent' ? 'partner' : 'opponent'}`}
                      hitSlop={6}
                      onPress={() => flip(p.id)}
                      style={({ pressed }) => [styles.side, pressed && styles.pressed]}
                    >
                      <Text style={styles.sideText}>{side}</Text>
                      <Ionicons name="chevron-down" size={11} color={colors.textMuted} />
                    </Pressable>
                  )
                ) : null}
                <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={26} />
                <Text style={styles.chipName} numberOfLines={1}>{firstName(u)}</Text>
                {state === 'accepted' ? <Ionicons name="checkmark-circle" size={15} color={colors.brand} accessibilityLabel="Accepted" />
                  : state === 'pending' ? <Text style={styles.chipState}>Waiting</Text> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`Take ${firstName(u)} off`} hitSlop={8} onPress={() => remove(p.id)} style={({ pressed }) => [styles.chipX, pressed && styles.pressed]}>
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </Pressable>
              </View>
            );
          })}
          {/* A no stays a no on this session: said in words, and × takes the name off your log (they are still never asked again). */}
          {declined.map(({ id, status: was }) => {
            const u = userOf(id);
            if (!u) return null;
            const word = was === 'removed' ? 'Removed' : 'Said no';
            return (
              <View key={id} style={[styles.chip, styles.chipOff]}>
                <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={26} />
                <Text style={[styles.chipName, styles.chipNameOff]} numberOfLines={1}>{firstName(u)}</Text>
                <Text style={styles.chipState}>{word}</Text>
                {onDrop ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${firstName(u)}: ${word.toLowerCase()}. Take off your log`} hitSlop={8} onPress={() => { haptics.untap(); onDrop(id); }} style={({ pressed }) => [styles.chipX, pressed && styles.pressed]}>
                    <Ionicons name="close" size={14} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <Field
        soft
        inputRef={box}
        value={text}
        onChangeText={(t) => { setNote(''); onText(t); }}
        placeholder={placeholder}
        accessibilityLabel={search ? 'Who you played: search CourtSide players or type a name' : placeholder}
        autoCapitalize="words"
        autoCorrect={false}
        onFocus={() => { if (closing.current) clearTimeout(closing.current); setFocused(true); reveal(block.current); }}
        onBlur={() => { closing.current = setTimeout(() => setFocused(false), 220); }}
      />

      {quick.length ? (
        <View style={styles.quick}>
          <Text style={styles.quickLabel}>From the hit</Text>
          {quick.map((u) => (
            <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Tag ${u.name}`} onPress={() => pick(u)} style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
              <Ionicons name="add" size={14} color={colors.brand} />
              <Text style={styles.quickName}>{firstName(u)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showing ? (
        <View style={styles.list}>
          {listed.map(({ user, reason, suggested: fromHit }, i) => {
            const on = picked.has(user.id);
            const lockedOut = !on && !!refusal(user);
            const sub = lockedOut ? 'Can’t be tagged' : fromHit ? 'From the hit' : reason;
            return (
              <Pressable
                key={user.id}
                accessibilityRole="button"
                accessibilityState={{ checked: on, disabled: lockedOut }}
                accessibilityLabel={on ? `Untag ${user.name}` : lockedOut ? `${user.name}, can’t be tagged` : `Tag ${user.name}`}
                onPress={() => pick(user)}
                style={(state) => [styles.row, i > 0 && styles.rowLine, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
              >
                <View style={lockedOut && styles.dim}><Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={36} /></View>
                <View style={[styles.words, lockedOut && styles.dim]}>
                  <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>@{user.handle}{sub ? ` · ${sub}` : ''}</Text>
                </View>
                {lockedOut ? <Ionicons name="lock-closed-outline" size={16} color={colors.textFaint} />
                  : <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : <Ionicons name="add" size={16} color={colors.brand} />}</View>}
              </Pressable>
            );
          })}
          {/* The words as typed, kept in your log for you alone (someone not on CourtSide, or just a name). */}
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use “${query}” as a name only you see`}
              onPress={() => { box.current?.blur(); setFocused(false); }}
              style={(state) => [styles.row, listed.length > 0 && styles.rowLine, ((state as { hovered?: boolean }).hovered || state.pressed) && styles.rowOn]}
            >
              <View style={styles.typed}><Ionicons name="text-outline" size={16} color={colors.textMuted} /></View>
              <View style={styles.words}>
                <Text style={styles.name} numberOfLines={1}>“{query}”</Text>
                <Text style={styles.sub} numberOfLines={1}>Use this name · only you see it</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {note ? <Text style={styles.note}>{note}</Text>
        : players.some((p) => status[p.id] !== 'accepted') ? <Text style={styles.hint}>Their name shows on posts once they accept.</Text>
        : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // The sheet's own look: white, lifted on a soft shadow, no outline.
  chip: { ...lift, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 4, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface, maxWidth: '100%' },
  chipOff: { paddingRight: 4 },
  chipName: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  chipNameOff: { color: colors.textMuted },
  chipState: { ...typography.caption, ...font('600'), color: colors.textFaint, letterSpacing: 0 },
  chipX: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // The side of the net, ahead of the name, in one quiet style for both: a choice between two words, not an on/off switch.
  side: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 9, paddingRight: 6, height: 26, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  sideFixed: { justifyContent: 'center', paddingHorizontal: 8, height: 26 },
  sideText: { ...typography.caption, ...font('600'), color: colors.textMuted, letterSpacing: 0 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  quickLabel: { ...typography.small, color: colors.textFaint },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 8, paddingRight: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.brand },
  quickName: { ...typography.smallStrong, color: colors.brand },
  // The names: a white card on the sheet, rows parted by a hairline, the grouped lists' look.
  list: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.md },
  // Each row reaches the card's edges, so a finger or the mouse lights the whole of it.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 9, marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowOn: { backgroundColor: colors.surfaceAlt },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  dim: { opacity: 0.45 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.brand },
  typed: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  hint: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.xs },
  note: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.6 },
});
