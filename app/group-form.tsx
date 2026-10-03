import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DragSheet } from '@/components/DragSheet';
import { Section, Submit } from '@/components/sheet/SheetForm';
import { Field } from '@/components/ui';
import type { GroupLook, ID } from '@/data/types';
import { Celebrate } from '@/features/groups/create/Celebrate';
import { GroupPreview } from '@/features/groups/create/GroupPreview';
import { InvitePeople } from '@/features/groups/create/InvitePeople';
import { JoinChoice, ListedCard } from '@/features/groups/create/JoinChoice';
import { LookPicker } from '@/features/groups/create/LookPicker';
import { StepDots } from '@/features/groups/create/StepDots';
import { plainLook } from '@/features/groups/look';
import { openGroupFeed } from '@/features/groups/openGroupFeed';
import * as haptics from '@/lib/haptics';
import { KeyboardScrollContext, afterKeyboard, currentKeyboardHeight, type Measurable } from '@/lib/keyboardScroll';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { ABOUT_MAX, GROUPS_AGE_LINE, MAX_GROUPS, NAME_MAX, NAME_MIN, groupsOpenTo, tidyGroupName } from '@/store/feedGroups';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Start a group, in three short steps on one tall sheet (the way Strava
 * starts a club or WhatsApp a community), with three dots saying where you
 * are, Back between steps, and the one green button pinned at the bottom,
 * riding on the keyboard so nothing is ever typed behind it:
 *
 *   1. Name & look: a big name box (it has the keyboard as the sheet
 *      settles) under a live preview of the group exactly where people will
 *      meet it, the Feed's top row and Find groups. Then its face: a colour
 *      and an emoji or its initials, or a photo. 2 to 30 characters, and
 *      not the name of a group you already run; the button says what is
 *      missing until it can go.
 *   2. About & who can join: a line about it (optional, 120), Open or Ask
 *      to join as two big cards, and whether it shows in Find groups.
 *      "Create group" makes it here, so the next step has a real link.
 *   3. Invite: its link to copy or share, and the people you follow to
 *      tick, each sent the invite as a card in your chat with them.
 *
 * Then a short "ready" moment (a tick, a little confetti, a soft tap on a
 * phone) and the sheet goes, landing on the new group's feed, whose empty
 * page offers "Post to <group>". Back from step 3 still works: Next then
 * saves the change instead of making a second group. Closing at any point
 * after it was made lands on it too.
 *
 * Who can't start one is told before filling anything in: under 18 (the
 * server's rule too), already in 3 groups, or groups not loading (with Try
 * again). With ?id=, the same parts on one page edit a group you run.
 */

type Step = 0 | 1 | 2 | 3;

/** A group's fields as one string, for "has anything changed since it was saved". */
const snap = (v: { name: string; about: string; ask: boolean; listed: boolean; look: GroupLook }) =>
  JSON.stringify({ n: tidyGroupName(v.name), a: v.about.trim(), ask: v.ask, listed: v.listed, look: plainLook(v.look) });

const TITLES: Record<0 | 1 | 2, { title: string; line: string }> = {
  0: { title: 'Name your group', line: 'A feed only the group sees. Give it a name and a face.' },
  1: { title: 'About & who can join', line: 'Say what it’s for and how people get in.' },
  2: { title: 'Invite your people', line: 'Pick people you follow, or share the link.' },
};

export default function GroupForm() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { feedGroups, feedGroupsOn, currentUser, currentUserId, actions } = useApp();
  const isEdit = !!id;
  const editing = id ? feedGroups.find((g) => g.id === id) : undefined;
  const reduced = useReducedMotion();

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState(editing?.name ?? '');
  const [about, setAbout] = useState(editing?.description ?? '');
  const [ask, setAsk] = useState(!!editing?.ask);
  const [listed, setListed] = useState(editing?.discoverable !== false);
  const [look, setLook] = useState<GroupLook>(editing?.look ?? {});
  const [createdId, setCreatedId] = useState<ID | null>(null);
  const [picked, setPicked] = useState<ID[]>([]);
  const [invited, setInvited] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);
  const nameBox = useRef<TextInput>(null);
  // Where to go once the sheet has gone: the new group's feed, or another page.
  const landing = useRef<{ group?: ID; href?: string } | null>(null);

  // ---------------------------------------------------------------- can you?
  useEffect(() => { if (currentUserId && feedGroupsOn !== true) void actions.loadFeedGroups(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tooYoung = !isEdit && !groupsOpenTo(currentUser);
  const loading = !isEdit && feedGroupsOn === null;
  const off = !isEdit && feedGroupsOn === false;
  // Once this sheet has made the group, being in 3 is the point, not a stop.
  const full = !isEdit && !createdId && feedGroups.length >= MAX_GROUPS;
  const gate: 'young' | 'loading' | 'off' | 'full' | 'gone' | null = id && !editing ? (feedGroupsOn === null ? 'loading' : 'gone')
    : tooYoung ? 'young' : loading ? 'loading' : off ? 'off' : full ? 'full' : null;
  const retry = async () => { setRetrying(true); await actions.loadFeedGroups().catch(() => undefined); setRetrying(false); };

  // ---------------------------------------------------------------- the name
  const clean = tidyGroupName(name);
  const chars = Array.from(clean).length;
  const self = editing?.id ?? createdId;
  const nameMax = Math.max(NAME_MAX, editing ? Array.from(editing.name).length : 0);
  const aboutMax = Math.max(ABOUT_MAX, editing?.description ? Array.from(editing.description).length : 0);
  const dup = clean ? feedGroups.find((g) => g.id !== self
    && g.members.some((m) => m.id === currentUserId && m.admin)
    && tidyGroupName(g.name).toLowerCase() === clean.toLowerCase()) : undefined;
  const short = chars > 0 && chars < NAME_MIN;
  const nameOk = chars >= NAME_MIN && !dup;
  const nameIssue = dup ? `You already run a group called “${dup.name}”. Pick another name.`
    : short && nameTouched ? `At least ${NAME_MIN} characters.` : null;
  const nameWaiting = !chars ? 'Give it a name' : short ? 'A little longer' : dup ? 'Pick another name' : undefined;

  // What was last saved, so going Back and Next again only saves a real change.
  const snapshot = () => snap({ name: clean, about, ask, listed, look });
  const saved = useRef<string | null>(editing ? snap({ name: editing.name, about: editing.description ?? '', ask: editing.ask, listed: editing.discoverable !== false, look: editing.look ?? {} }) : null);
  const dirty = saved.current !== snapshot();
  // A group to edit that arrives after the sheet opened (its link opened cold): filled in once it does.
  useEffect(() => {
    if (!editing || saved.current !== null) return;
    setName(editing.name); setAbout(editing.description ?? ''); setAsk(editing.ask); setListed(editing.discoverable !== false); setLook(editing.look ?? {});
    saved.current = snap({ name: editing.name, about: editing.description ?? '', ask: editing.ask, listed: editing.discoverable !== false, look: editing.look ?? {} });
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- moving between steps
  const scroller = useRef<ScrollView | null>(null);
  const offset = useRef(0);
  const enter = useSharedValue(1);
  const shownOnce = useRef(false);
  const direction = useSharedValue(1);
  const go = (next: Step) => {
    direction.value = next >= step ? 1 : -1;
    setError(null);
    if (next !== 0) Keyboard.dismiss();
    enter.value = 0;
    setStep(next);
  };
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
    enter.value = withTiming(1, { duration: reduced ? 120 : 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never });
    // Back on the name: its box takes the keyboard again. (On the way in the sheet
    // does that once it has settled: focusing a box mid-rise makes a browser scroll for it.)
    if (step === 0 && !isEdit && shownOnce.current) setTimeout(() => nameBox.current?.focus(), 60);
    shownOnce.current = true;
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: reduced ? 0 : (1 - enter.value) * 28 * direction.value }],
  }));

  // A box you tap is lifted clear of the keyboard and the button riding on it.
  const reveal = useCallback((node: Measurable | null) => {
    if (!node?.measureInWindow) { node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); return; }
    afterKeyboard(() => {
      node.measureInWindow?.((_x, y, _w, h) => {
        const visibleBottom = Dimensions.get('window').height - currentKeyboardHeight() - 96;
        const overflow = y + h - visibleBottom;
        if (overflow > 0) scroller.current?.scrollTo({ y: offset.current + overflow, animated: true });
      });
    });
  }, []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = e.nativeEvent.contentOffset.y; };

  // ---------------------------------------------------------------- saving
  const fields = () => ({ name: clean, description: about, ask, discoverable: listed, look });
  const commit = async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      if (isEdit && editing) {
        await actions.updateFeedGroup(editing.id, fields());
      } else if (!createdId) {
        const made = await actions.createFeedGroup(fields());
        setCreatedId(made);
        landing.current = { group: made };
      } else if (dirty) {
        await actions.updateFeedGroup(createdId, fields());
      }
      saved.current = snapshot();
      return true;
    } catch (e) {
      haptics.reject();
      setError(e instanceof Error ? e.message : 'That didn’t go through. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendInvites = () => {
    if (!createdId) return;
    if (picked.length) actions.shareToChats({ userIds: picked }, { kind: 'group', id: createdId, name: clean });
    setInvited(picked.length);
    haptics.reward();
    go(3);
  };

  // The ready moment lasts long enough to read, then the sheet goes to the group.
  useEffect(() => {
    if (step !== 3) return undefined;
    const t = setTimeout(dismiss, 2600);
    return () => clearTimeout(t);
  }, [step]);

  const done = () => {
    router.back();
    const next = landing.current;
    if (next?.group) openGroupFeed(next.group);
    else if (next?.href) router.push(next.href as never);
  };

  // ---------------------------------------------------------------- the button
  let primary: { label: string; busyLabel?: string; waiting?: string; disabled: boolean; onPress: () => void } | null = null;
  if (gate === 'young' || gate === 'gone') primary = { label: 'OK', disabled: false, onPress: dismiss };
  else if (gate === 'off') primary = { label: retrying ? 'Trying again…' : 'Try again', disabled: retrying, onPress: () => { void retry(); } };
  else if (gate === 'full') primary = { label: 'See your groups', disabled: false, onPress: () => { landing.current = { href: '/groups' }; dismiss(); } };
  else if (gate === 'loading') primary = null;
  else if (isEdit) primary = { label: 'Save', busyLabel: 'Saving…', waiting: nameWaiting ?? 'Save', disabled: !nameOk || !dirty, onPress: () => { void commit().then((ok) => { if (ok) { haptics.commit(); dismiss(); } }); } };
  else if (step === 0) primary = { label: 'Next', waiting: nameWaiting, disabled: !nameOk, onPress: () => { setNameTouched(true); if (nameOk) go(1); } };
  else if (step === 1) primary = { label: createdId ? 'Next' : 'Create group', busyLabel: createdId ? 'Saving…' : 'Creating…', disabled: !nameOk, waiting: nameWaiting, onPress: () => { void commit().then((ok) => { if (ok) go(2); }); } };
  else if (step === 2) primary = { label: picked.length ? `Send ${picked.length} ${picked.length === 1 ? 'invite' : 'invites'}` : 'Done', disabled: false, onPress: sendInvites };
  else primary = { label: `Go to ${clean}`, disabled: false, onPress: dismiss };

  const canBack = !isEdit && !gate && (step === 1 || step === 2) && !busy;
  const heading = gate ? (isEdit ? 'Edit group' : 'Start a group') : isEdit ? 'Edit group' : step < 3 ? TITLES[step as 0 | 1 | 2].title : '';
  const subline = gate || isEdit || step === 3 ? undefined : TITLES[step as 0 | 1 | 2].line;

  // ---------------------------------------------------------------- the parts
  const nameField = (
    <View style={styles.nameWrap}>
      <View style={[styles.nameBox, !!nameIssue && styles.nameBoxIssue]}>
        <TextInput
          ref={nameBox}
          value={name}
          onChangeText={(t) => { setName(Array.from(t.replace(/\n/g, ' ')).slice(0, nameMax).join('')); setError(null); }}
          onBlur={() => setNameTouched(true)}
          onFocus={() => reveal(nameBox.current as unknown as Measurable)}
          placeholder="e.g. Sunday hitters"
          placeholderTextColor={colors.borderStrong}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType={isEdit ? 'done' : 'next'}
          onSubmitEditing={() => { setNameTouched(true); if (!isEdit && nameOk) go(1); }}
          accessibilityLabel="Group name"
          accessibilityHint={`${NAME_MIN} to ${nameMax} characters`}
          style={styles.nameInput}
        />
        <Text style={[styles.counter, chars > nameMax - 5 && styles.counterNear]} accessibilityLabel={`${chars} of ${nameMax} characters`}>{chars}/{nameMax}</Text>
      </View>
      <Text style={nameIssue ? styles.issue : styles.help} accessibilityLiveRegion="polite">
        {nameIssue ?? 'Your crew, your club, your team. You can change it later.'}
      </Text>
    </View>
  );
  const aboutField = (
    <Field
      label="About"
      labelRight={<Text style={styles.count}>{Array.from(about).length}/{aboutMax}</Text>}
      value={about}
      onChangeText={(t) => setAbout(Array.from(t).slice(0, aboutMax).join(''))}
      placeholder="Saturday doubles at the park, then coffee"
      accessibilityLabel={`About the group, optional, up to ${aboutMax} characters`}
      hint="Optional. Shown in Find groups and on its invite."
      multiline
      minHeight={84}
      soft
    />
  );
  const preview = <GroupPreview name={clean} look={look} ask={ask} listed={listed} about={about} members={editing?.members.length ?? 1} />;
  const lookPart = (
    <Section title="Look" hint="A colour and an emoji or its initials, or a photo.">
      <LookPicker name={clean} look={look} onChange={setLook} />
    </Section>
  );
  const joinPart = (
    <>
      <Section title="Who can join"><JoinChoice ask={ask} onChange={setAsk} /></Section>
      <ListedCard listed={listed} onChange={setListed} />
    </>
  );

  let body: React.ReactNode;
  if (gate === 'loading') {
    body = <View style={styles.center}><ActivityIndicator color={colors.textFaint} /><Text style={styles.gateBody}>Checking your groups…</Text></View>;
  } else if (gate) {
    const g = {
      gone: { icon: 'help-circle-outline', title: 'This group isn’t here any more', line: 'It may have been changed by another admin, or you’re no longer its admin.' },
      young: { icon: 'lock-closed-outline', title: GROUPS_AGE_LINE, line: 'Until then the For you feed is all yours, and you can still message the people you follow.' },
      off: { icon: 'cloud-offline-outline', title: 'Groups didn’t load', line: 'Check your connection and try again. If it keeps happening, groups may not be switched on yet.' },
      full: { icon: 'people-outline', title: `You’re in ${MAX_GROUPS} groups`, line: `That’s the most anyone can be in. Leave one to start another.` },
    }[gate];
    body = (
      <View style={styles.gate} accessible accessibilityRole="alert" accessibilityLabel={`${g.title}. ${g.line}`}>
        <View style={styles.gateIcon}><Ionicons name={g.icon as 'people-outline'} size={26} color={colors.textMuted} /></View>
        <Text style={styles.gateTitle}>{g.title}</Text>
        <Text style={styles.gateBody}>{g.line}</Text>
      </View>
    );
  } else if (isEdit) {
    body = (
      <>
        {preview}
        <Section title="Name">{nameField}</Section>
        {lookPart}
        {aboutField}
        {joinPart}
      </>
    );
  } else if (step === 0) {
    body = <>{preview}{nameField}{lookPart}</>;
  } else if (step === 1) {
    body = <>{preview}{aboutField}{joinPart}</>;
  } else if (step === 2 && createdId) {
    body = <InvitePeople groupId={createdId} groupName={clean} picked={picked} onPicked={setPicked} />;
  } else {
    body = <Celebrate name={clean} look={look} invited={invited} />;
  }

  const round = (icon: 'chevron-back' | 'close', label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
      <Ionicons name={icon} size={icon === 'close' ? 18 : 20} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={done}
      peekFraction={0.94}
      onSettled={() => { if (!isEdit && !gate && step === 0) nameBox.current?.focus(); }}
      header={(
        <View style={styles.head}>
          <View style={styles.topRow}>
            {canBack ? round('chevron-back', 'Back', () => go((step - 1) as Step)) : <View style={styles.roundSpace} />}
            {!isEdit && !gate && step < 3 ? <StepDots step={step} /> : null}
            {round('close', 'Close', dismiss)}
          </View>
          {heading ? (
            <View style={styles.titles}>
              <Text style={styles.title} accessibilityRole="header">{heading}</Text>
              {subline ? <Text style={styles.line}>{subline}</Text> : null}
            </View>
          ) : null}
        </View>
      )}
    >
      <View style={styles.fill}>
        <KeyboardScrollContext.Provider value={reveal}>
          <ScrollView
            ref={scroller}
            onScroll={onScroll}
            scrollEventThrottle={32}
            style={styles.fill}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <Animated.View style={[styles.stepBody, (gate || step === 3) && styles.centred, stepStyle]} key={gate ?? `step-${step}`}>{body}</Animated.View>
          </ScrollView>
        </KeyboardScrollContext.Provider>
        {primary ? (
          <View style={styles.footer}>
            {error ? (
              <View style={styles.errorRow} accessibilityLiveRegion="assertive">
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            <Submit
              label={primary.label}
              busyLabel={primary.busyLabel}
              waiting={primary.waiting}
              onPress={primary.onPress}
              disabled={primary.disabled}
              busy={busy}
            />
          </View>
        ) : null}
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  roundSpace: { width: 34, height: 34 },
  pressed: { opacity: 0.7 },
  titles: { gap: 3 },
  title: { ...typography.title, fontSize: 26, letterSpacing: -0.9, color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  body: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  stepBody: { gap: 20 },
  // The ready moment and the can't-start notes sit in the middle of the sheet, not at its top.
  centred: { flexGrow: 1, justifyContent: 'center', paddingBottom: spacing.xxxl },
  nameWrap: { gap: 6 },
  nameBox: {
    ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 62, paddingLeft: spacing.lg, paddingRight: spacing.md,
    borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.surface,
  },
  nameBoxIssue: { borderColor: colors.danger },
  nameInput: { flex: 1, minWidth: 0, ...font('600'), fontSize: 21, letterSpacing: -0.5, color: colors.text, paddingVertical: 14, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  counter: { ...typography.small, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  counterNear: { color: colors.warning },
  help: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.xs, lineHeight: 18 },
  issue: { ...typography.small, color: colors.danger, paddingHorizontal: spacing.xs, lineHeight: 18 },
  count: { ...typography.small, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: spacing.xs },
  error: { ...typography.small, color: colors.danger, flex: 1, lineHeight: 18 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: 60 },
  gate: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.md },
  gateIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  gateTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  gateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
});
