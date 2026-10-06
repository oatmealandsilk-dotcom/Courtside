import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { LocationLink } from '@/components/LocationChip';
import { HealthShareRow } from '@/components/session/HealthShareRow';
import type { DetectedActivity, TaggedCourt } from '@/data/types';
import { availableShare, chosenShare, choiceFromTicks, postShare, type HealthChoice } from '@/features/activity/healthShare';
import { POST_MAX } from '@/features/feed/limits';
import { notKnownAdult } from '@/features/players/age';
import { openPlacePicker } from '@/features/places/picker';
import { TagPlayers } from '@/components/TagPlayers';
import { Button, Field } from '@/components/ui';
import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/**
 * Editing something of yours after it is up: a post's caption, who is in it
 * and where it was, or a thread's question and details. Saving stamps it
 * "Edited" next to the date. A tracker session's post also has "Share health
 * data" (Oct 4, owner), as in the composer.
 */
export default function EditPost() {
  const styles = useThemedStyles(styleDefinitions);
  const { id = '', kind: rawKind, pickPlace: pickParam } = useLocalSearchParams<{ id?: string; kind?: string; pickPlace?: string }>();
  const { posts, questions, currentUserId, currentUser, detectedActivities, actions } = useApp();
  const isQuestion = rawKind === 'question';
  const post = isQuestion ? undefined : posts.find((p) => p.id === id);
  const question = isQuestion ? questions.find((q) => q.id === id) : undefined;
  const mine = (post?.authorId ?? question?.authorId) === currentUserId;

  const [body, setBody] = useState(post?.body ?? question?.body ?? '');
  const [title, setTitle] = useState(question?.title ?? '');
  const [tagged, setTagged] = useState<string[]>(post?.taggedUserIds ?? []);
  const [location, setLocation] = useState(post?.location ?? '');
  const [court, setCourt] = useState<TaggedCourt | null>(post?.court ?? null);
  // A court goes on a post only for someone known to be an adult (owner
  // decision 7), and never on a group-only post (the server keeps those off
  // every court's page). Otherwise the place stays as words.
  const courtOk = !!currentUser && !notKnownAdult(currentUser) && !post?.groupId;
  const pickPlace = (typed: string) => openPlacePicker((value, picked) => { setLocation(value); setCourt(courtOk ? picked ?? null : null); }, typed);
  const [closeSignal, setCloseSignal] = useState(0);
  // Opened before the post had loaded (a reload, a link): the fields fill in
  // once, when it arrives, and Save stays off until then, so saving can
  // never write a blank caption over the real one.
  const [filled, setFilled] = useState(!!(post || question));
  useEffect(() => {
    if (filled || !(post || question)) return;
    setBody(post?.body ?? question?.body ?? '');
    setTitle(question?.title ?? '');
    setTagged(post?.taggedUserIds ?? []);
    setLocation(post?.location ?? '');
    setCourt(post?.court ?? null);
    setFilled(true);
  }, [filled, post, question]);

  // Opened from "Add the court" in the post's menu: straight to the place picker
  // once the post is here, a beat after the sheet is up.
  const picked = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pickParam !== '1' || picked.current || !filled || !post || !mine) return;
    const typed = post.location ?? '';
    picked.current = setTimeout(() => pickPlace(typed), 350);
  }, [pickParam, filled, post, mine]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (picked.current) clearTimeout(picked.current); }, []);

  // "Share health data" (Oct 4, owner): only on a post from your own tracker
  // while its numbers are still kept (30 days), the same switch and Choose as
  // the composer, starting from what the post shows now (an older post only
  // ever had the time). Held once found, so a refresh of your sessions while
  // this is open cannot take the row away.
  const activityId = mine ? post?.session?.activityId : undefined;
  const held = activityId ? detectedActivities.find((a) => a.id === activityId && a.userId === currentUserId) : undefined;
  const [tracker, setTracker] = useState<DetectedActivity | null>(held ?? null);
  useEffect(() => {
    if (tracker || !activityId) return undefined;
    if (held) { setTracker(held); return undefined; }
    // Older than the two weeks the app holds: asked for on its own.
    let on = true;
    void actions.fetchActivity(activityId).then((a) => { if (on && a) setTracker(a); });
    return () => { on = false; };
  }, [activityId, !!held]); // eslint-disable-line react-hooks/exhaustive-deps
  const available = tracker ? availableShare(tracker) : [];
  // Null until it is changed here: until then it reads what the post shares.
  const [health, setHealth] = useState<HealthChoice | null>(null);
  const healthShown = health ?? choiceFromTicks(postShare(post?.session), available);

  const canSave = filled && mine && (isQuestion ? title.trim().length >= 3 : true);
  // A quick second tap on Save would ask twice.
  const [checking, setChecking] = useState(false);
  const save = () => {
    if (!canSave || checking) return;
    setChecking(true);
    // Words CourtSide refuses (migration 117) are said here, and the sheet
    // stays open with what you wrote, to change and save again.
    void actions.wordsRefused(isQuestion ? [title, body] : [body, location]).then((refused) => {
      setChecking(false);
      if (refused) {
        haptics.reject();
        showToast({ title: BLOCKED_WORDS_NOTE, body: 'Change them and save again.', icon: 'alert-circle-outline', long: true });
        return;
      }
      if (post) actions.editPost(post.id, { body: body.trim(), taggedUserIds: tagged, location, court: courtOk ? court : null, ...(health && available.length ? { share: chosenShare(health, available) } : {}) });
      if (question) actions.editQuestion(question.id, { title: title.trim(), body: body.trim() });
      setCloseSignal((n) => n + 1);
    });
  };

  return (
    <DragSheet fitContent
      closeSignal={closeSignal}
      onDismissed={() => router.back()}
      peekFraction={0.72}
      header={
        <View style={styles.headerRow}>
          <Text style={styles.heading}>{isQuestion ? 'Edit thread' : post?.kind === 'clip' ? 'Edit clip' : 'Edit post'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {!mine ? (
          <Text style={styles.note}>Only the person who posted this can change it.</Text>
        ) : isQuestion ? (
          <>
            <Field label="Question" value={title} onChangeText={setTitle} />
            <Field label="Details" value={body} onChangeText={setBody} multiline minHeight={120} mentions />
          </>
        ) : (
          <>
            <Field label="Caption" labelRight={<LocationLink value={location} court={!!court && courtOk} onPress={() => pickPlace(location)} onClear={() => { setLocation(''); setCourt(null); }} />} value={body} onChangeText={setBody} multiline minHeight={80} mentions maxLength={POST_MAX} />
            <TagPlayers tagged={tagged} onChange={setTagged} />
            {tracker && available.length ? <HealthShareRow activity={tracker} choice={healthShown} onChoice={setHealth} /> : null}
          </>
        )}
        {mine ? <Button label="Save" onPress={save} disabled={!canSave} loading={checking} full /> : null}
        <Text style={styles.note}>It will say “Edited” next to the date.</Text>
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  form: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  note: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});
