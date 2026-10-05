import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { EmptyState, Field, Screen, Toggle } from '@/components/ui';
import type { HiddenWords } from '@/data/types';
import { HIDDEN_WORDS_MAX, HIDDEN_WORD_LENGTH, cleanWords } from '@/features/hiddenWords/hiddenWords';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Settings → Hidden words (migration 117), the way Instagram has it: hide
 * comments and message requests that may be offensive, and your own words,
 * phrases and emojis. CourtSide keeps the list of offensive words up to
 * date; nobody is told when something of theirs is hidden from you.
 * Nothing from someone you follow is ever hidden (friends trash-talk).
 *
 * Under 18 (not known to be an adult), the two offensive switches stay on
 * and are stricter; they show as on and cannot be turned off (the server
 * holds to it too).
 */
export default function HiddenWordsPage() {
  const styles = useThemedStyles(styleDefinitions);
  const { hiddenWords, actions } = useApp();
  const [status, setStatus] = useState<'loading' | 'ok' | 'not_ready' | 'failed'>(hiddenWords ? 'ok' : 'loading');
  const load = () => { void actions.loadHiddenWords().then(setStatus); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState('');
  const input = useRef<TextInput>(null);

  if (!hiddenWords) {
    return (
      <Screen title="Hidden words" compactTitle onBack={() => goBack()}>
        {status === 'loading' ? <View style={styles.wait}><CourtSpinner size={28} /></View>
          : status === 'not_ready' ? <EmptyState icon="eye-off-outline" title="Hidden words is on its way" body="It isn’t switched on for your account yet. Check back soon." />
          : (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn’t load your Hidden words"
              body="Check your connection and try again."
              action={{ label: 'Try again', onPress: () => { setStatus('loading'); load(); } }}
            />
          )}
      </Screen>
    );
  }

  const settings = hiddenWords;
  const locked = settings.locked;
  // Every change is saved at once; a refusal puts the page back and says why.
  const save = (patch: Partial<Omit<HiddenWords, 'locked'>>) => {
    const { locked: _locked, ...current } = settings;
    void actions.saveHiddenWords({ ...current, ...patch }).then((problem) => {
      if (problem) showToast({ title: problem, icon: 'alert-circle-outline', long: true });
    });
  };
  const words = settings.customWords;
  const typed = draft.replace(/\s+/g, ' ').trim();
  const already = !!typed && words.some((w) => w.toLowerCase() === typed.toLowerCase());
  const full = words.length >= HIDDEN_WORDS_MAX;
  const tooLong = typed.length > HIDDEN_WORD_LENGTH;
  const canAdd = !!typed && !already && !full && !tooLong;
  const add = () => {
    if (!canAdd) return;
    haptics.tap();
    save({ customWords: cleanWords([...words, typed]) });
    setDraft('');
    input.current?.focus();
  };
  const remove = (word: string) => {
    haptics.untap();
    save({ customWords: words.filter((w) => w !== word) });
  };
  const addNote = tooLong ? `Up to ${HIDDEN_WORD_LENGTH} characters each.`
    : already ? 'That one is on your list already.'
    : full ? `That’s ${HIDDEN_WORDS_MAX}, the most you can add. Remove one to add another.`
    : null;

  // A row with a switch, the way the Privacy page draws one: the whole row flips it.
  const switchRow = (icon: keyof typeof Ionicons.glyphMap, label: string, detail: string, value: boolean, onChange: (next: boolean) => void, first: boolean, disabled = false) => (
    <Pressable
      key={label}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={disabled ? 'Always on for accounts under 18' : undefined}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && !disabled && { backgroundColor: colors.surfaceAlt }]}
    >
      <Ionicons name={icon} size={19} color={colors.textMuted} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      {/* The row is the switch; this one only shows it, so a tap is never counted twice. */}
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Toggle value={value} onChange={onChange} disabled={disabled} accessibilityLabel={label} />
      </View>
    </Pressable>
  );

  return (
    <Screen title="Hidden words" compactTitle onBack={() => goBack()}>
      <Text style={styles.intro}>
        Hide comments and messages you’d rather not see. Nobody is told when something of theirs is hidden from you.
      </Text>

      <Text style={styles.sectionTitle}>Offensive words and phrases</Text>
      <View style={styles.card}>
        {switchRow('chatbubble-outline', 'Hide offensive comments', 'Comments from people you don’t follow that may be offensive go to Hidden comments, at the end of the comments on your posts, Instants, threads and questions.', settings.hideOffensiveComments, (v) => save({ hideOffensiveComments: v }), true, locked)}
        {switchRow('paper-plane-outline', 'Hide offensive message requests', 'A message from someone you don’t follow that may be offensive shows as “Hidden message” until you tap it, and doesn’t alert you.', settings.hideOffensiveRequests, (v) => save({ hideOffensiveRequests: v }), false, locked)}
      </View>
      <Text style={styles.note}>
        {locked
          ? 'These stay on for accounts under 18, and hide a few more things too.'
          : 'CourtSide keeps the list of offensive words, phrases and emojis up to date for you.'}
      </Text>

      <Text style={styles.sectionTitle}>Custom words and phrases</Text>
      <View style={styles.card}>
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <Field
              inputRef={input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a word, phrase or emoji"
              accessibilityLabel="Add a word, phrase or emoji"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={add}
              well
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Add" accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} onPress={add} hitSlop={6} style={({ pressed }) => [styles.addButton, !canAdd && styles.addButtonOff, pressed && { opacity: 0.7 }]}>
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        </View>
        {addNote ? <Text style={styles.addNote}>{addNote}</Text> : null}
        {words.length ? (
          <View style={styles.words}>
            {words.map((word) => (
              <Pressable key={word} accessibilityRole="button" accessibilityLabel={`Remove ${word}`} onPress={() => remove(word)} hitSlop={4} style={({ pressed }) => [styles.word, pressed && { opacity: 0.7 }]}>
                <Text style={styles.wordText} numberOfLines={1}>{word}</Text>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={styles.count}>{words.length ? `${words.length} of ${HIDDEN_WORDS_MAX} · tap one to remove it` : 'Nothing added yet'}</Text>
      </View>
      <View style={[styles.card, styles.cardGap]}>
        {switchRow('chatbubbles-outline', 'Hide comments', 'From people you don’t follow, with your words and phrases in them.', settings.customInComments, (v) => save({ customInComments: v }), true)}
        {switchRow('mail-outline', 'Hide message requests', 'From people you don’t follow, with your words and phrases in them.', settings.customInRequests, (v) => save({ customInRequests: v }), false)}
      </View>
      <Text style={styles.note}>Only you can see your list. Hidden comments stay hidden from everyone but you and the person who wrote them, and you can unhide any of them.</Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  // The Privacy page's look: short labels, flat grouped lists with a hairline edge.
  wait: { paddingTop: spacing.xl * 2, alignItems: 'center' },
  intro: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingHorizontal: spacing.sm },
  sectionTitle: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.sm, paddingTop: spacing.lg, paddingBottom: 6 },
  card: { borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardGap: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, minHeight: 48 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, fontSize: 15, color: colors.text },
  rowDetail: { ...typography.small, fontSize: 13, color: colors.textFaint, lineHeight: 18 },
  note: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, lineHeight: 19 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  addButton: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  addButtonOff: { opacity: 0.4 },
  addText: { ...typography.smallStrong, color: colors.brandInk },
  addNote: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  word: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingLeft: 12, paddingRight: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  wordText: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  count: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
