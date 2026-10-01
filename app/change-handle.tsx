import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Button, Screen } from '@/components/ui';
import type { HandleStatus } from '@/data/remote';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography, lift } from '@/theme';

const DAY = 86400000;
const WAIT_DAYS = 30;
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
/** Only what a handle may hold, as you type it: lowercase letters, numbers, underscores. */
const clean = (text: string) => text.toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]/g, '').slice(0, 24);

/**
 * Changing your handle, with the rules the big apps settled on: once every
 * 30 days, the old one held for 14 so nobody grabs it, and invite links
 * with the old one still finding you. A live check says whether the new one
 * is free as you type, the way Instagram's does.
 */
export default function ChangeHandle() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [handle, setHandle] = useState('');
  const [status, setStatus] = useState<HandleStatus | null | 'checking'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = currentUser?.handle ?? '';
  const changedAt = currentUser?.handleChangedAt ? Date.parse(currentUser.handleChangedAt) : 0;
  const opensAt = changedAt ? changedAt + WAIT_DAYS * DAY : 0;
  const locked = opensAt > Date.now();

  // Fill in the current handle once the account is here.
  useEffect(() => { if (current && !handle) setHandle(current); }, [current]);

  // The live check: a beat after typing stops, ask whether it is free.
  useEffect(() => {
    setError('');
    if (!handle || handle === current) { setStatus(null); return; }
    if (handle.length < 2) { setStatus('invalid'); return; }
    setStatus('checking');
    let stale = false;
    const timer = setTimeout(() => {
      void actions.checkHandle(handle).then((s) => { if (!stale) setStatus(s); });
    }, 350);
    return () => { stale = true; clearTimeout(timer); };
  }, [handle, current, actions]);

  if (!currentUser) {
    return <Screen title="Handle" compactTitle onBack={() => goBack()}><View style={styles.wait}><CourtSpinner size={28} /></View></Screen>;
  }

  const canSave = !locked && !busy && handle !== current && (status === 'ok' || status === null);
  const save = () => {
    if (!canSave) return;
    confirm({
      title: `Change to @${handle}?`,
      message: `You won't be able to change it again for ${WAIT_DAYS} days. @${current} is held for you for 14 days in case you change your mind.`,
      confirmLabel: 'Change',
      onConfirm: async () => {
        setBusy(true);
        setError('');
        try {
          await actions.changeHandle(handle);
          showToast({ title: `You're @${handle} now`, icon: 'at-outline' });
          router.back();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'That did not save. Try again.');
          setBusy(false);
        }
      },
    });
  };

  const note = (() => {
    if (locked) return null;
    switch (status) {
      case 'checking': return { icon: null, text: 'Checking…', tone: styles.muted };
      case 'ok': return { icon: 'checkmark-circle' as const, text: `@${handle} is free`, tone: styles.good };
      case 'taken': return { icon: 'close-circle' as const, text: `@${handle} is taken`, tone: styles.bad };
      case 'held': return { icon: 'time-outline' as const, text: `@${handle} was just let go by someone, so it is held for a couple of weeks`, tone: styles.bad };
      case 'invalid': return { icon: 'alert-circle-outline' as const, text: 'Use 2 to 24 letters, numbers or underscores', tone: styles.bad };
      default: return null;
    }
  })();

  return (
    <Screen title="Handle" compactTitle onBack={() => goBack()}>
      <View style={styles.body}>
        {locked ? (
          <View style={styles.banner}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <Text style={styles.bannerText}>You changed it on {day(changedAt)}. You can change it again on {day(opensAt)}.</Text>
          </View>
        ) : null}

        <View style={[styles.field, locked && styles.fieldLocked]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={handle}
            onChangeText={(t) => setHandle(clean(t))}
            editable={!locked && !busy}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            maxLength={24}
            accessibilityLabel="Handle"
            returnKeyType="done"
            onSubmitEditing={save}
            style={styles.input}
          />
          {status === 'checking' ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
        </View>
        <View style={styles.noteRow} accessibilityLiveRegion="polite">
          {note ? (
            <>
              {note.icon ? <Ionicons name={note.icon} size={15} color={note.tone === styles.good ? colors.success : note.tone === styles.bad ? colors.danger : colors.textFaint} /> : null}
              <Text style={[styles.note, note.tone]}>{note.text}</Text>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <Rule icon="calendar-outline" head={`Once every ${WAIT_DAYS} days`} body="So a handle keeps meaning someone. After a change, the next one opens a month later." />
          <Rule line icon="shield-checkmark-outline" head="Your old one is held for 14 days" body="Nobody else can take it in that time, so you can change back." />
          <Rule line icon="link-outline" head="Your invite links keep working" body="Links with your old handle still bring people to you. Old @mentions of it stop linking." />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={busy ? 'Saving…' : handle && handle !== current ? `Change to @${handle}` : 'Change handle'} onPress={save} disabled={!canSave} loading={busy} full />
      </View>
    </Screen>
  );
}

function Rule({ icon, head, body, line }: { icon: keyof typeof Ionicons.glyphMap; head: string; body: string; line?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.rule, line && styles.ruleLine]}>
      <Ionicons name={icon} size={18} color={colors.textMuted} style={styles.ruleIcon} />
      <View style={styles.ruleWords}>
        <Text style={styles.ruleHead}>{head}</Text>
        <Text style={styles.ruleBody}>{body}</Text>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wait: { paddingVertical: 60, alignItems: 'center' },
  body: { gap: spacing.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, paddingHorizontal: spacing.lg, borderRadius: 16, backgroundColor: colors.surfaceAlt },
  bannerText: { flex: 1, ...typography.small, color: colors.text, lineHeight: 19 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 52, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fieldLocked: { opacity: 0.55 },
  at: { fontSize: 17, ...font('600'), color: colors.textMuted },
  input: { flex: 1, fontSize: 17, color: colors.text, paddingVertical: 0 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20, paddingHorizontal: spacing.xs },
  note: { ...typography.small, flexShrink: 1 },
  muted: { color: colors.textFaint },
  good: { color: colors.success },
  bad: { color: colors.danger },
  // The rules as one quiet list, the way Settings reads.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md },
  rule: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  ruleLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  ruleIcon: { marginTop: 1 },
  ruleWords: { flex: 1, gap: 2 },
  ruleHead: { ...typography.bodyStrong, color: colors.text },
  ruleBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
});
