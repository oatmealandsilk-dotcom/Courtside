import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { DragSheet } from '@/components/DragSheet';
import { Section, SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { Field, SegmentedControl } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { MAX_GROUPS, groupsOpenTo } from '@/store/feedGroups';
import { colors, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Start a group, or (with ?id=) edit one you run: a sheet over the Groups
 * list or the group's page, so the form is only there when it is wanted.
 * Name, a line about it, and who can join. The green button waits until
 * there is a name. A new group opens its page once the sheet has gone.
 */

type JoinMode = 'open' | 'ask';

const JOIN_HELP: Record<JoinMode, string> = {
  open: 'Anyone with the invite link joins straight away.',
  ask: 'You say yes to each person before they’re in.',
};

export default function GroupForm() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { feedGroups, feedGroupsOn, currentUser, actions } = useApp();
  const editing = id ? feedGroups.find((g) => g.id === id) : undefined;
  const [name, setName] = useState(editing?.name ?? '');
  const [about, setAbout] = useState(editing?.description ?? '');
  const [mode, setMode] = useState<JoinMode>(editing?.ask ? 'ask' : 'open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);
  const nameBox = useRef<TextInput>(null);
  // The new group's page opens once this sheet has gone.
  const created = useRef<string | null>(null);

  const full = !editing && feedGroups.length >= MAX_GROUPS;
  const allowed = editing ? true : groupsOpenTo(currentUser) && !full && feedGroupsOn !== false;
  const ready = !!name.trim() && allowed;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await actions.updateFeedGroup(editing.id, { name, description: about, ask: mode === 'ask' });
      } else {
        created.current = await actions.createFeedGroup({ name, description: about, ask: mode === 'ask' });
      }
      dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through.');
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    router.back();
    const next = created.current;
    if (next) router.push({ pathname: '/g/[id]', params: { id: next } });
  };

  // Asked to edit a group that isn't yours (or has gone): say so, nothing to fill in.
  const gone = !!id && !editing;
  const why = !editing && !groupsOpenTo(currentUser) ? 'Groups open when you’re 18.'
    : full ? `You’re in ${MAX_GROUPS} groups, the most anyone can be in. Leave one to start another.`
    : feedGroupsOn === false ? 'Groups aren’t switched on yet. Check back soon.'
    : null;

  return (
    <DragSheet
      fitContent
      closeSignal={closeSignal}
      onDismissed={done}
      peekFraction={0.8}
      onSettled={() => { if (!editing && allowed) nameBox.current?.focus(); }}
      header={(
        <SheetTitle
          title={editing ? 'Edit group' : 'Start a group'}
          line={editing ? undefined : 'A feed only the group sees.'}
          onClose={dismiss}
        />
      )}
    >
      <ScrollView contentContainerStyle={formBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {gone ? (
          <Text style={styles.note}>This group isn’t here any more.</Text>
        ) : (
          <>
            {why ? <Text style={styles.why}>{why}</Text> : null}
            <Field
              inputRef={nameBox}
              label="Name"
              labelRight={<Text style={styles.count}>{name.length}/40</Text>}
              value={name}
              onChangeText={(t) => setName(t.slice(0, 40))}
              placeholder="Wakefield crew"
              autoCapitalize="words"
              soft
            />
            <Field
              label="About (optional)"
              value={about}
              onChangeText={(t) => setAbout(t.slice(0, 140))}
              placeholder="Saturday doubles, then coffee"
              multiline
              minHeight={72}
              soft
            />
            <Section title="Who can join" hint={JOIN_HELP[mode]}>
              <SegmentedControl<JoinMode>
                segments={[{ value: 'open', label: 'Anyone with the link' }, { value: 'ask', label: 'Ask to join' }]}
                value={mode}
                onChange={setMode}
              />
            </Section>
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            <View style={styles.submit}>
              <Submit
                label={editing ? 'Save' : 'Start group'}
                busyLabel={editing ? 'Saving…' : 'Starting…'}
                waiting={allowed ? 'Give it a name' : undefined}
                onPress={() => { void submit(); }}
                disabled={!ready}
                busy={busy}
              />
            </View>
          </>
        )}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingVertical: spacing.md },
  why: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  count: { ...typography.small, color: colors.textFaint },
  error: { ...typography.small, color: colors.danger, lineHeight: 19 },
  submit: { paddingTop: spacing.xs },
});
