import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { TileCover } from '@/components/TileCover';
import { Avatar, Button, EmptyState, Field, Screen } from '@/components/ui';
import type { ID, TakedownReason } from '@/data/types';
import { KIND_WORD, TAKEDOWN_REASONS, asKind, noticeFor, reasonLabel } from '@/features/moderation/reasons';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** The longest note an admin can leave with "Something else" (the database keeps 200 characters). */
const NOTE_MAX = 200;

/**
 * Take down, for admins only (migration 108): opened from the "…" menu of a
 * post or Instant, a long press on a comment or reply, a thread's or coach
 * question's own menu, or a report. First why (one of eight reasons, with a
 * short note for "Something else"), then a plain-words question before
 * anything happens. Once it goes through, the page closes on "Taken down ·
 * Undo". The database refuses anyone who is not an admin, whatever this
 * page shows.
 *
 * Address: /take-down?kind=post|hit|comment|hit-comment|question|answer|coach-question|coach-reply&id=…
 * (&who=<author id> when the app may not hold the item, and &report=<id> from a report).
 */
export default function TakeDown() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ kind?: string; id?: string; who?: string; report?: string }>();
  const kind = asKind(params.kind);
  const id = typeof params.id === 'string' ? params.id : '';
  const { posts, stories, comments, questions, answers, coachQuestions, coachReplies, users, currentUser, actions } = useApp();
  const [reason, setReason] = useState<TakedownReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Marked down here the moment it is sent, so "already taken down" waits until this page's own try is over.
  const [sent, setSent] = useState(false);

  // What is being taken down, as far as this phone holds it: who posted it, a few words, a picture.
  const item = useMemo((): { authorId?: ID; words?: string; picture?: string; clip?: boolean; down: boolean } => {
    switch (kind) {
      case 'post': { const p = posts.find((x) => x.id === id); return p ? { authorId: p.authorId, words: p.body, picture: p.thumbnailUrl ?? p.imageUrl, clip: p.kind === 'clip', down: !!p.removed } : { down: false }; }
      case 'hit': { const st = stories.find((x) => x.id === id); return st ? { authorId: st.authorId, words: st.caption, picture: st.thumbnailUrl ?? st.imageUrl, down: !!st.removed } : { down: false }; }
      case 'comment': case 'hit-comment': { const c = comments.find((x) => x.id === id); return c ? { authorId: c.authorId, words: c.body, picture: c.imageUrl, down: !!c.removed } : { down: false }; }
      case 'question': { const q = questions.find((x) => x.id === id); return q ? { authorId: q.authorId, words: q.title, down: !!q.removed } : { down: false }; }
      case 'answer': { const a = answers.find((x) => x.id === id); return a ? { authorId: a.authorId, words: a.body, picture: a.media?.thumb ?? (a.media?.kind === 'photo' ? a.media.url : undefined), down: !!a.removed } : { down: false }; }
      case 'coach-question': { const q = coachQuestions.find((x) => x.id === id); return q ? { authorId: q.authorId, words: q.title, down: !!q.removed } : { down: false }; }
      case 'coach-reply': { const r = coachReplies.find((x) => x.id === id); return r ? { authorId: r.coachUserId, words: r.body, down: !!r.removed } : { down: false }; }
      default: return { down: false };
    }
  }, [kind, id, posts, stories, comments, questions, answers, coachQuestions, coachReplies]);
  const authorId = item.authorId ?? (typeof params.who === 'string' ? params.who : undefined);
  const author = users.find((u) => u.id === authorId);
  const handle = author ? `@${author.handle}` : 'whoever posted it';

  if (!currentUser?.isAdmin || !kind || !id) {
    return (
      <Screen title="Take down" compactTitle onBack={() => goBack()}>
        <EmptyState icon="lock-closed-outline" title={currentUser?.isAdmin ? 'Nothing to take down here' : 'Only admins can take things down'} body={currentUser?.isAdmin ? 'This link is missing what to take down.' : 'An admin is set from Supabase.'} />
      </Screen>
    );
  }

  const word = KIND_WORD[kind];
  const mine = authorId === currentUser.id;
  const told = reason ? noticeFor(kind, reason, item.clip) : null;
  const ready = !!reason && !busy;

  const run = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setSent(true);
    const result = await actions.takeDown(kind, id, reason, {
      note: reason === 'other' ? note : undefined,
      reportId: typeof params.report === 'string' && params.report ? params.report : undefined,
    });
    setBusy(false);
    // The action says how it went in its own toast ("Taken down · Undo", or why not); this page just closes on yes.
    if (result === 'done') goBack();
    else setSent(false);
  };
  const ask = () => {
    if (!reason) return;
    confirm({
      title: `Take down this ${word}?`,
      message: [
        mine ? 'Only CourtSide’s admins will see it from now on.' : `Only ${handle} and CourtSide’s admins will see it from now on.`,
        mine ? null : `${author ? author.name.split(' ')[0] : 'They'} will be told: “${told}”`,
        'Nothing is deleted. You can put it back from Settings → Admin → Removed.',
      ].filter(Boolean).join('\n\n'),
      confirmLabel: 'Take down',
      destructive: true,
      onConfirm: run,
    });
  };

  return (
    <Screen title="Take down" compactTitle onBack={() => goBack()}>
      {/* What it is, so there is no doubt which one. */}
      <View style={styles.target}>
        {author ? <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={36} /> : <View style={styles.noFace}><Ionicons name="person-outline" size={18} color={colors.textMuted} /></View>}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.kind}>{word.charAt(0).toUpperCase() + word.slice(1)}{author ? ` by @${author.handle}` : ''}</Text>
          {item.words?.trim() ? <Text style={styles.words} numberOfLines={3}>{item.words.trim()}</Text> : <Text style={styles.muted}>No words with it.</Text>}
        </View>
        {item.picture ? <TileCover uri={item.picture} style={styles.thumb} accessibilityIgnoresInvertColors /> : null}
      </View>

      {item.down && !sent ? (
        <View style={styles.already}>
          <Ionicons name="eye-off-outline" size={18} color={colors.danger} />
          <Text style={[styles.body, { flex: 1 }]}>This {word} is already taken down. You can put it back from its menu or from Settings → Admin → Removed.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.heading}>Which rule does it break?</Text>
          <View style={styles.list} accessibilityRole="radiogroup">
            {TAKEDOWN_REASONS.map((r) => {
              const on = reason === r.code;
              return (
                <Pressable
                  key={r.code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${r.label}. ${r.hint}`}
                  onPress={() => setReason(r.code)}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.rowPressed]}
                >
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.danger : colors.textFaint} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{r.label}</Text>
                    <Text style={styles.muted}>{r.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {reason === 'other' ? (
            <Field
              label="A note for the admins (optional)"
              value={note}
              onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
              placeholder="What it breaks, in a few words"
              multiline
              minHeight={72}
              hint={`Only admins see this, never ${mine ? 'anyone else' : handle}. ${NOTE_MAX - note.length} characters left.`}
            />
          ) : null}

          {/* What happens, before the button: no surprises. */}
          <View style={styles.what}>
            <Text style={styles.whatTitle}>What happens</Text>
            <Text style={styles.body}>• It disappears for everyone except {mine ? 'you' : handle} and CourtSide’s admins, wherever it shows: feeds, profiles, search, comments, shared links.</Text>
            {mine ? null : <Text style={styles.body}>• {author ? author.name.split(' ')[0] : 'They'} {told ? <>get{author ? 's' : ''} a notification: <Text style={styles.quote}>“{told}”</Text></> : <>get{author ? 's' : ''} a notification with the reason you pick.</>}</Text>}
            <Text style={styles.body}>• Nothing is deleted, so you can put it back from Settings → Admin → Removed.</Text>
            {reason ? <Text style={styles.muted}>Reason: {reasonLabel(reason)}</Text> : null}
          </View>

          <Button label={busy ? 'Taking it down…' : `Take down this ${word}`} variant="danger" loading={busy} disabled={!ready} onPress={ask} full />
        </>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  target: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  noFace: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  thumb: { width: 44, height: 55, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  kind: { ...typography.smallStrong, color: colors.textMuted },
  words: { ...typography.body, color: colors.text },
  heading: { ...typography.heading, color: colors.text, marginBottom: spacing.sm },
  list: { gap: 4, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  rowOn: { borderColor: colors.danger, backgroundColor: colors.surface },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  label: { ...typography.body, fontWeight: '600', color: colors.text },
  muted: { ...typography.small, color: colors.textMuted },
  body: { ...typography.small, color: colors.text, lineHeight: 20 },
  quote: { ...typography.smallStrong, color: colors.text },
  what: { gap: 6, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgElevated, marginVertical: spacing.lg },
  whatTitle: { ...typography.smallStrong, color: colors.text },
  already: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
