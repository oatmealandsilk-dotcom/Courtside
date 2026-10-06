import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { TileCover } from '@/components/TileCover';
import { Field } from '@/components/ui';
import { Fine, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { REVIEW_NOTE_MAX } from '@/data/remote';
import type { Removed } from '@/data/types';
import { asKind, removedLine, thingWord } from '@/features/moderation/reasons';
import { openRules, useReviewOf } from '@/features/moderation/RemovedNote';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/**
 * "Ask for a review" (Oct 5, owner): a small sheet over something of yours
 * that was taken down. A line on what happens, an optional note (up to 300
 * characters, read only by CourtSide's admins) and one button. Once per
 * take-down: asked before, it says so instead. The server checks all of it
 * again (request_review, migration 20261006000139).
 *
 * Address: /review-request?kind=post|hit|comment|hit-comment|question|answer|coach-question|coach-reply&id=…
 */
export default function ReviewRequestSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind = asKind(params.kind);
  const id = typeof params.id === 'string' ? params.id : '';
  const { posts, stories, comments, questions, answers, coachQuestions, coachReplies, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // The sheet opens only as tall as what it holds.
  const [contentH, setContentH] = useState(0);

  // What it is, as this phone holds it: whose, why it came down, a few words and a picture.
  const item = useMemo((): { authorId?: string; removed?: Removed; words?: string; picture?: string; clip?: boolean } => {
    switch (kind) {
      case 'post': { const p = posts.find((x) => x.id === id); return p ? { authorId: p.authorId, removed: p.removed, words: p.body, picture: p.thumbnailUrl ?? p.imageUrl, clip: p.kind === 'clip' } : {}; }
      case 'hit': { const st = stories.find((x) => x.id === id); return st ? { authorId: st.authorId, removed: st.removed, words: st.caption, picture: st.thumbnailUrl ?? st.imageUrl } : {}; }
      case 'comment': case 'hit-comment': { const c = comments.find((x) => x.id === id); return c ? { authorId: c.authorId, removed: c.removed, words: c.body, picture: c.imageUrl } : {}; }
      case 'question': { const q = questions.find((x) => x.id === id); return q ? { authorId: q.authorId, removed: q.removed, words: q.title } : {}; }
      case 'answer': { const a = answers.find((x) => x.id === id); return a ? { authorId: a.authorId, removed: a.removed, words: a.body, picture: a.media?.thumb ?? (a.media?.kind === 'photo' ? a.media.url : undefined) } : {}; }
      case 'coach-question': { const q = coachQuestions.find((x) => x.id === id); return q ? { authorId: q.authorId, removed: q.removed, words: q.title } : {}; }
      case 'coach-reply': { const r = coachReplies.find((x) => x.id === id); return r ? { authorId: r.coachUserId, removed: r.removed, words: r.body } : {}; }
      default: return {};
    }
  }, [kind, id, posts, stories, comments, questions, answers, coachQuestions, coachReplies]);
  const { mine, review, known, off } = useReviewOf(kind && id ? { kind, id, authorId: item.authorId, clip: item.clip } : undefined, item.removed);
  const thing = kind ? thingWord(kind, item.clip) : 'post';
  const removed = item.removed;

  const send = async () => {
    if (!kind || !removed || sending) return;
    setSending(true);
    setError('');
    const result = await actions.askForReview(kind, id, note);
    if (result === 'done') {
      showToast({ title: 'Review asked', body: 'We’ll let you know what we decide.', icon: 'checkmark-circle-outline' });
      close();
      return;
    }
    if (result === 'already') { showToast({ title: 'You’ve already asked about this one', body: 'We’ll let you know what we decide.', icon: 'time-outline' }); close(); return; }
    if (result === 'not_removed') { showToast({ title: 'It’s already back', body: `Your ${thing} isn’t removed any more.`, icon: 'eye-outline' }); close(); return; }
    if (result === 'gone') { showToast({ title: 'It’s been deleted', icon: 'trash-outline' }); close(); return; }
    setError(result === 'not_ready' ? 'Reviews aren’t switched on yet. Try again later.' : result === 'not_yours' ? `Only whoever posted this ${thing} can ask.` : 'That didn’t send. Check your connection and try again.');
    setSending(false);
  };

  // Nothing to ask about here: not yours, not removed (any more), a broken link, or reviews not on this database yet.
  const blocked = !kind || !removed || !mine || off;
  // Asked already about this take-down: where it stands, and no second ask.
  const answered = !blocked && review ? review : null;

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.9} contentHeight={contentH || undefined}
      beforeClose={() => !sending}
      header={<SheetTitle title="Ask for a review" line={removed ? removedLine(removed) : undefined} onClose={close} />}>
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled" onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        {blocked ? (
          <View style={styles.empty}>
            <Ionicons name="eye-outline" size={22} color={colors.textMuted} />
            <Text style={styles.body}>{!removed ? `This ${thing} isn’t removed, so there’s nothing to review.` : !mine ? 'Only whoever posted it can ask for a review.' : 'Reviews aren’t switched on yet. Try again later.'}</Text>
          </View>
        ) : (
          <>
            {/* Which one, so there's no doubt. */}
            <View style={styles.target}>
              {item.picture ? <TileCover uri={item.picture} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, styles.noThumb]}><Ionicons name="document-text-outline" size={18} color={colors.textMuted} /></View>}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.kind}>Your {thing}</Text>
                {item.words?.trim() ? <Text style={styles.words} numberOfLines={2}>{item.words.trim()}</Text> : <Text style={styles.muted}>No words with it</Text>}
              </View>
            </View>

            {answered ? (
              <View style={styles.status}>
                <Ionicons name={answered.status === 'open' ? 'time-outline' : 'checkmark-done-outline'} size={20} color={colors.brand} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.statusTitle}>{answered.status === 'open' ? 'Review asked' : 'Reviewed'}</Text>
                  <Text style={styles.body}>{answered.status === 'open' ? 'Someone on our team will look at it again. We’ll let you know what we decide.' : 'We looked again, and it stays removed. You can ask once for each removal.'}</Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.body}>
                  If you think we got this wrong, tell us. Someone on the CourtSide team will look at your {thing} again and let you know. If it didn’t break the rules, it comes back exactly as it was.
                </Text>
                <Field
                  soft
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, REVIEW_NOTE_MAX))}
                  placeholder="Anything we should know? (optional)"
                  multiline
                  minHeight={88}
                  maxLength={REVIEW_NOTE_MAX}
                  accessibilityLabel="A note for the review (optional)"
                />
                <Text style={styles.count}>{note.length ? `${REVIEW_NOTE_MAX - note.length} characters left` : `Up to ${REVIEW_NOTE_MAX} characters. Only CourtSide’s admins read it.`}</Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Submit label="Ask for a review" busyLabel="Sending…" onPress={() => { void send(); }} busy={sending} disabled={!known} waiting="One moment…" />
                <Fine>You can ask once for each removal.</Fine>
              </>
            )}
            <Text accessibilityRole="link" onPress={() => { if (removed) openRules(removed.reason, thing); }} style={styles.rules}>Read the Community Guidelines</Text>
          </>
        )}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  target: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: colors.surface },
  thumb: { width: 40, height: 50, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  kind: { ...typography.smallStrong, color: colors.textMuted },
  words: { ...typography.body, color: colors.text },
  muted: { ...typography.small, color: colors.textMuted },
  body: { ...typography.body, color: colors.text, lineHeight: 22 },
  count: { ...typography.small, color: colors.textFaint, marginTop: -spacing.md },
  error: { ...typography.small, color: colors.danger, ...font('500') },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.brandDim },
  statusTitle: { ...typography.bodyStrong, color: colors.text },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rules: { ...typography.smallStrong, color: colors.text, textAlign: 'center', textDecorationLine: 'underline', paddingVertical: spacing.xs },
});
