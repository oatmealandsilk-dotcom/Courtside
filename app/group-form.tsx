import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, Dimensions, Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DragSheet } from '@/components/DragSheet';
import { Section, Submit } from '@/components/sheet/SheetForm';
import { Field } from '@/components/ui';
import type { FeedGroup, GroupLook, ID } from '@/data/types';
import { Celebrate } from '@/features/groups/create/Celebrate';
import { FlowHeader } from '@/features/groups/create/FlowHeader';
import { GroupPreview } from '@/features/groups/create/GroupPreview';
import { InvitePeople } from '@/features/groups/create/InvitePeople';
import { JoinChoice, ListedCard } from '@/features/groups/create/JoinChoice';
import { LookPicker } from '@/features/groups/create/LookPicker';
import { plainLook } from '@/features/groups/look';
import { openGroupFeed } from '@/features/groups/openGroupFeed';
import { confirm } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { KeyboardScrollContext, afterKeyboard, visibleAboveKeyboard, type Measurable } from '@/lib/keyboardScroll';
import { show as showToast } from '@/lib/toast';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { ABOUT_MAX, GROUPS_AGE_LINE, GROUPS_BIRTHDAY_LINE, MAX_GROUPS, NAME_MAX, NAME_MIN, groupsOpenTo, tidyGroupName } from '@/store/feedGroups';
import { colors, font, lift, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Start a group, in three short steps on one tall sheet (the way Strava
 * starts a club or WhatsApp a community), with three dots saying where you
 * are, Back between steps, and the one green button pinned at the bottom,
 * riding on the keyboard so nothing is ever typed behind it. Held above
 * what scrolls on the first two steps, one row shows the group exactly as
 * Find groups (or its invite link) will, redrawn with every letter and
 * choice, so it stays in view while you type.
 *
 *   1. Name & look: a big name box first (it has the keyboard as the sheet
 *      settles), then its face: a colour and an emoji or its initials, or a
 *      photo. 2 to 30 characters, and not the name of a group you already
 *      run; the button says what is missing until it can go. (Before
 *      migration 73 runs a look can't be saved, so the Look part waits.)
 *   2. About & who can join: a line about it (optional, 120), Open or Ask
 *      to join as two big cards, and whether it shows in Find groups.
 *      "Create group" makes it here, so the next step has a real link.
 *   3. Invite: its link to copy or share, and the people you follow to
 *      tick, each sent the invite in your chat with them.
 *
 * Then a short "ready" moment (a tick, a little confetti, a soft tap on a
 * phone) and the sheet goes, landing on the new group's feed, whose empty
 * page offers "Post to <group>". With a screen reader on it waits for "Go
 * to …" instead of leaving by itself. Back from step 3 still works: Next
 * then saves the change instead of making a second group, and anything the
 * server didn't keep the first time (its look, or hiding it) is tried again.
 *
 * Nothing is lost without asking: closing (X, a drag down, a tap outside,
 * Escape, Android's Back) before the group is made asks "Discard this
 * group?"; with people ticked on the last step it asks "Send N invites?";
 * while it is being made the sheet stays until it is done. Each new step is
 * read out to a screen reader ("Step 2 of 3, About & who can join"), and so
 * is a problem with the name.
 *
 * Who can't start one is told before filling anything in: under 18 (the
 * server's rule too), no birthday on file yet, already in 3 groups, or
 * groups not loading (with Try again). With ?id=, the same parts on one page
 * edit a group you run.
 */

type Step = 0 | 1 | 2 | 3;
type Gate = 'young' | 'birthday' | 'loading' | 'off' | 'full' | 'gone';

/** A group's fields as one string, for "has anything changed since it was saved". */
const snap = (v: { name: string; about: string; ask: boolean; listed: boolean; look: GroupLook }) =>
  JSON.stringify({ n: tidyGroupName(v.name), a: v.about.replace(/\s+/g, ' ').trim(), ask: v.ask, listed: v.listed, look: plainLook(v.look) });

const TITLES: Record<0 | 1 | 2, { title: string; line: string }> = {
  0: { title: 'Name your group', line: 'A feed only the group sees. Give it a name and a face.' },
  1: { title: 'About & who can join', line: 'Say what it’s for and how people get in.' },
  2: { title: 'Invite your people', line: 'Pick people you follow, or share the link.' },
};

/** Whether VoiceOver or TalkBack is on. A browser can't say, so there it is taken as off. */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    AccessibilityInfo.isScreenReaderEnabled().then(setOn).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/** How long the ready moment stays before the sheet takes you to the group. */
const READY_MS = 3500;

export default function GroupForm() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { feedGroups, feedGroupsOn, feedGroupsLooks, currentUser, currentUserId, actions } = useApp();
  const isEdit = !!id;
  const editing = id ? feedGroups.find((g) => g.id === id) : undefined;
  const reduced = useReducedMotion();
  const screenReader = useScreenReader();
  // A look can be saved only once migration 73 has run (my_feed_groups says so).
  const looksOn = feedGroupsLooks;

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
  // A save on its way (a second tap can't start another), and whether the sheet has already gone.
  const inFlight = useRef(false);
  const gone = useRef(false);

  // ---------------------------------------------------------------- can you?
  // Read once signed in (a link opened cold signs in first).
  useEffect(() => { if (currentUserId && feedGroupsOn !== true) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const tooYoung = !isEdit && !groupsOpenTo(currentUser);
  // Not known to be an adult because there is no birthday on file, rather than a known teen.
  const noBirthday = tooYoung && !!currentUser && !currentUser.ageGroup;
  const loading = !isEdit && feedGroupsOn === null;
  const off = !isEdit && feedGroupsOn === false;
  // Once this sheet has made the group, being in 3 is the point, not a stop.
  const full = !isEdit && !createdId && feedGroups.length >= MAX_GROUPS;
  const gate: Gate | null = id && !editing ? (feedGroupsOn === null ? 'loading' : feedGroupsOn === false ? 'off' : 'gone')
    : noBirthday ? 'birthday' : tooYoung ? 'young' : loading ? 'loading' : off ? 'off' : full ? 'full' : null;
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
  // VoiceOver doesn't read a line that changes under the box (TalkBack does, from its live region): it is said.
  useEffect(() => { if (nameIssue && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(nameIssue); }, [nameIssue]);

  // What the server last kept, so going Back and Next again saves only a real change, and retries what didn't stick.
  const fromGroup = (g: FeedGroup) => snap({ name: g.name, about: g.description ?? '', ask: g.ask, listed: g.discoverable !== false, look: looksOn ? g.look ?? {} : {} });
  const snapshot = () => snap({ name: clean, about, ask, listed, look: looksOn ? look : {} });
  const saved = useRef<string | null>(editing ? fromGroup(editing) : null);
  const dirty = saved.current !== snapshot();
  // A group to edit that arrives after the sheet opened (its link opened cold): filled in once it does.
  useEffect(() => {
    if (!editing || saved.current !== null) return;
    setName(editing.name); setAbout(editing.description ?? ''); setAsk(editing.ask); setListed(editing.discoverable !== false); setLook(editing.look ?? {});
    saved.current = fromGroup(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  // The group just made, as the server holds it (a photo that didn't upload, or a group that couldn't be
  // hidden, stays a change to send again): read once it is in the groups.
  const confirmPending = useRef(false);
  useEffect(() => {
    if (!confirmPending.current || !createdId) return;
    const g = feedGroups.find((x) => x.id === createdId);
    if (!g) return;
    confirmPending.current = false;
    // The photo now lives at its address on the server: the form takes that, so it isn't sent again.
    if (look.photoUrl && g.look?.photoUrl && look.photoUrl !== g.look.photoUrl) setLook((now) => ({ ...now, photoUrl: g.look?.photoUrl }));
    saved.current = fromGroup(g);
  }, [feedGroups, createdId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (shownOnce.current) {
      // Back on the name: its box takes the keyboard again. (On the way in the sheet
      // does that once it has settled: focusing a box mid-rise makes a browser scroll for it.)
      if (step === 0 && !isEdit) setTimeout(() => nameBox.current?.focus(), 60);
      // A screen reader hears where it is now: the button it was on only changed its words.
      if (step < 3 && !isEdit) AccessibilityInfo.announceForAccessibility(`Step ${step + 1} of 3. ${TITLES[step as 0 | 1 | 2].title}`);
    }
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
        const visibleBottom = visibleAboveKeyboard() - 96;
        const overflow = y + h - visibleBottom;
        if (overflow > 0) scroller.current?.scrollTo({ y: offset.current + overflow, animated: true });
      });
    });
  }, []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = e.nativeEvent.contentOffset.y; };

  // ---------------------------------------------------------------- saving
  // Before migration 73 the look isn't sent at all: it would not be kept.
  const fields = () => ({ name: clean, description: about, ask, discoverable: listed, look: looksOn ? look : undefined });
  const commit = async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (isEdit && editing) {
        await actions.updateFeedGroup(editing.id, fields());
        saved.current = snapshot();
      } else if (!createdId) {
        const made = await actions.createFeedGroup(fields());
        landing.current = { group: made };
        // Closed some other way while it was being made: it still takes you to it.
        if (gone.current) { openGroupFeed(made); return true; }
        confirmPending.current = true;
        setCreatedId(made);
      } else if (dirty) {
        await actions.updateFeedGroup(createdId, fields());
        saved.current = snapshot();
      }
      return true;
    } catch (e) {
      haptics.reject();
      setError(e instanceof Error ? e.message : 'That didn’t go through. Check your connection and try again.');
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const sendNow = () => {
    if (!createdId || !picked.length) return 0;
    actions.shareToChats({ userIds: picked }, { kind: 'group', id: createdId, name: clean });
    return picked.length;
  };
  const sendInvites = () => {
    setInvited(sendNow());
    setPicked([]);
    haptics.reward();
    go(3);
  };

  // The ready moment lasts long enough to read, then the sheet goes to the group (not with a screen reader on: it waits for the button).
  const leaving = !screenReader;
  useEffect(() => {
    if (step !== 3 || !leaving) return undefined;
    const t = setTimeout(dismiss, READY_MS);
    return () => clearTimeout(t);
  }, [step, leaving]);

  const done = () => {
    gone.current = true;
    router.back();
    const next = landing.current;
    if (next?.group) openGroupFeed(next.group);
    else if (next?.href) router.push(next.href as never);
  };

  // ---------------------------------------------------------------- closing without losing anything
  const hasInput = !!clean || !!about.trim() || ask || !listed || Object.keys(plainLook(look)).length > 0;
  const askDiscard = (title: string, message: string) => confirm({ title, message, confirmLabel: 'Discard', destructive: true, onConfirm: dismiss });
  const askSend = () => {
    const n = picked.length;
    confirm({
      title: `Send ${n} ${n === 1 ? 'invite' : 'invites'}?`,
      message: `You picked ${n === 1 ? 'someone' : `${n} people`} to invite to ${clean} but haven’t sent ${n === 1 ? 'it' : 'them'} yet.`,
      confirmLabel: 'Send',
      onConfirm: () => {
        const sent = sendNow();
        if (sent) showToast({ title: `${sent === 1 ? 'Invite' : `${sent} invites`} sent`, body: `To join ${clean}.`, icon: 'paper-plane-outline' });
        dismiss();
      },
      also: { label: 'Don’t send', onPress: dismiss },
    });
  };
  /** Whether a close the person started can go ahead now; if not, the question that decides it is asked. */
  const mayClose = (): boolean => {
    if (inFlight.current) return false;
    if (gate || step === 3) return true;
    if (!isEdit && step === 2 && createdId && picked.length) { askSend(); return false; }
    if (!isEdit && !createdId && hasInput) { askDiscard('Discard this group?', 'It hasn’t been made yet, so what you’ve filled in will be lost.'); return false; }
    if (dirty && (isEdit || (createdId && step < 2))) { askDiscard('Discard your changes?', `Your changes to ${clean || 'the group'} won’t be saved.`); return false; }
    return true;
  };
  const guard = useRef(mayClose);
  guard.current = mayClose;
  const requestClose = () => { if (guard.current()) dismiss(); };

  // ---------------------------------------------------------------- the button
  let primary: { label: string; busyLabel?: string; waiting?: string; disabled: boolean; onPress: () => void } | null = null;
  if (gate === 'young' || gate === 'gone') primary = { label: 'OK', disabled: false, onPress: dismiss };
  else if (gate === 'birthday') primary = { label: 'Add your birthday', disabled: false, onPress: () => { landing.current = { href: '/birthday?from=group' }; dismiss(); } };
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
  const subline = gate || isEdit || step === 3 ? undefined
    : step === 0 && !looksOn ? 'A feed only the group sees. Give it a name.' : TITLES[step as 0 | 1 | 2].line;

  // Android's Back: a step back while there is one, otherwise the same as the close button.
  const back = useRef<() => boolean>(() => false);
  back.current = () => {
    if (canBack) go((step - 1) as Step);
    else requestClose();
    return true;
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => back.current());
    return () => sub.remove();
  }, []);

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
          accessibilityHint={nameIssue ?? `${NAME_MIN} to ${nameMax} characters`}
          style={styles.nameInput}
        />
        <Text style={[styles.counter, chars > nameMax - 5 && styles.counterNear]} accessibilityLabel={`${chars} of ${nameMax} characters`}>{chars}/{nameMax}</Text>
      </View>
      <Text style={nameIssue ? styles.issue : styles.help} accessibilityLiveRegion="polite">
        {nameIssue ?? (isEdit ? `${NAME_MIN} to ${nameMax} characters.` : 'Your crew, your club, your team. You can change it later.')}
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
  const lookPart = looksOn ? (
    <Section title="Look" hint="A colour and an emoji or its initials, or a photo.">
      <LookPicker name={clean} look={look} onChange={setLook} />
    </Section>
  ) : null;
  const joinPart = (
    <>
      <Section title="Who can join"><JoinChoice ask={ask} onChange={setAsk} /></Section>
      <ListedCard listed={listed} onChange={setListed} />
    </>
  );
  // The preview stays above what scrolls on the steps that change it, and in Edit.
  const showPreview = !gate && (isEdit || step < 2);

  let body: React.ReactNode;
  if (gate === 'loading') {
    body = <View style={styles.center}><ActivityIndicator color={colors.textFaint} /><Text style={styles.gateBody}>{isEdit ? 'Opening the group…' : 'Checking your groups…'}</Text></View>;
  } else if (gate) {
    const g = {
      gone: { icon: 'help-circle-outline', title: 'This group isn’t here any more', line: 'It may have been changed by another admin, or you’re no longer its admin.' },
      young: { icon: 'lock-closed-outline', title: GROUPS_AGE_LINE, line: 'Until then the For you feed is all yours, and you can still message the people you follow.' },
      birthday: { icon: 'calendar-outline', title: GROUPS_BIRTHDAY_LINE, line: 'Groups are for adults. Add your birthday, and if you’re 18 or over you can start one straight away.' },
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
        <Section title="Name">{nameField}</Section>
        {lookPart}
        {aboutField}
        {joinPart}
      </>
    );
  } else if (step === 0) {
    body = <>{nameField}{lookPart}</>;
  } else if (step === 1) {
    body = <>{aboutField}{joinPart}</>;
  } else if (step === 2 && createdId) {
    body = <InvitePeople groupId={createdId} groupName={clean} picked={picked} onPicked={setPicked} />;
  } else {
    body = <Celebrate name={clean} look={looksOn ? look : {}} invited={invited} leaving={leaving} />;
  }

  return (
    <DragSheet
      ownBack
      closeSignal={closeSignal}
      onDismissed={done}
      beforeClose={() => guard.current()}
      peekFraction={0.94}
      onSettled={() => { if (!isEdit && !gate && step === 0) nameBox.current?.focus(); }}
      header={(
        <FlowHeader
          title={heading}
          line={subline}
          onClose={requestClose}
          closeDisabled={busy}
          onBack={canBack ? () => go((step - 1) as Step) : undefined}
          step={!isEdit && !gate && step < 3 ? step : undefined}
        />
      )}
    >
      <View style={styles.fill}>
        {showPreview ? (
          <View style={styles.previewBar}>
            <GroupPreview name={clean} look={looksOn ? look : {}} ask={ask} listed={listed} about={about} members={editing?.members.length ?? 1} />
          </View>
        ) : null}
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
              <View style={styles.errorRow} accessibilityLiveRegion="assertive" accessibilityRole="alert">
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
  previewBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
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
  // Lined up with the section titles and the cards' edges.
  help: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  issue: { ...typography.small, color: colors.danger, lineHeight: 18 },
  count: { ...typography.small, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  error: { ...typography.small, color: colors.danger, flex: 1, lineHeight: 18 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: 60 },
  gate: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.md },
  gateIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  gateTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  gateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
});
