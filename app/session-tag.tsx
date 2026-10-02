import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { FormRow } from '@/components/FormRow';
import { SheetTitle, Submit, formBody } from '@/components/sheet/SheetForm';
import { Avatar, BrandWash, Toggle } from '@/components/ui';
import type { SessionTag } from '@/data/types';
import { KIND_LABEL, shortDay } from '@/features/activity/format';
import { isClosed } from '@/features/activity/sessionTags';
import { confirm } from '@/lib/confirm';
import { duration } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/supabase';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/** How long an alert opened on a slow connection waits for your tags before saying they couldn't be loaded. */
const GIVE_UP_MS = 10_000;

/**
 * Someone tagged you in a session from their log (migration 62): who, what
 * it was (a match with the result from your side, or a practice), when, and
 * how long; Accept or Decline, side by side. "Add to my sessions" (on unless
 * you turn it off) puts the session in your own log too, so it counts
 * toward your streak. Nobody but the two of you sees the tag until you
 * accept; then your name shows on their posts carrying it ("Won vs @you"),
 * those posts sit on your Tagged tab, and "See post" opens the one here.
 * Once accepted, "Remove tag" takes your name back off every post at once,
 * and asks whether your copy of the session goes too. Taking it off is
 * final. A no can still become a yes, until the tagger takes it off their log.
 *
 * Opened from the alert (`?session=`, the tagger's session: the phone alert
 * goes through Your sessions with ?tag=) or from a row in Your sessions
 * (`?tag=`, the tag itself). If your tags can't be loaded (a slow or lost
 * connection), it says so with Try again; "no longer here" is kept for a tag
 * the server says is gone.
 */
export default function SessionTagSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<{ session?: string; tag?: string }>();
  const { currentUserId, sessionTags, users, posts, remoteLoaded, ready, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // A short phone opens the sheet taller, so Accept and Decline are on screen without a drag.
  const { height } = useWindowDimensions();

  const found = sessionTags.find((t) => t.taggedId === currentUserId && (params.tag ? t.id === params.tag : t.sessionId === params.session));
  // Once answered, the sheet keeps showing what it was about while it slides away.
  const [frozen, setFrozen] = useState<SessionTag | null>(null);
  const tag = frozen ?? found;

  // Opened from an alert before your tags have loaded: they are asked for
  // once (and again on Try again). A fetch that worked and has no such tag
  // means it is gone; one that failed, or never came back, means it could
  // not be loaded, which is a different thing to say.
  const [load, setLoad] = useState<'idle' | 'loading' | 'ok' | 'failed'>(isSupabaseConfigured ? 'idle' : 'ok');
  const fetchTags = () => {
    setLoad('loading');
    void actions.refreshSessionTags().then((ok) => setLoad(ok ? 'ok' : 'failed'), () => setLoad('failed'));
  };
  useEffect(() => {
    if (found || load !== 'idle' || !remoteLoaded) return;
    fetchTags();
  }, [found, load, remoteLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (load !== 'idle' && load !== 'loading') return undefined;
    const t = setTimeout(() => setLoad((now) => (now === 'idle' || now === 'loading' ? 'failed' : now)), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [load]);
  const waiting = !tag && (isSupabaseConfigured ? load === 'idle' || load === 'loading' : !ready);
  const failed = !tag && load === 'failed';

  const tagger = tag ? users.find((u) => u.id === tag.taggerId) : undefined;
  const first = tagger?.name.trim().split(/\s+/)[0] || tagger?.handle || 'Someone';
  const hasCopy = !!tag?.mirroredSessionId;
  const [addToMine, setAddToMine] = useState(true);
  const [busy, setBusy] = useState<'accept' | 'decline' | 'remove' | null>(null);
  const [error, setError] = useState('');
  // Their post carrying this session, when this phone has it.
  const post = tag ? posts.find((p) => p.authorId === tag.taggerId && p.session?.sessionId === tag.sessionId) : undefined;

  const answer = async (accept: boolean) => {
    if (!tag || busy) return;
    setBusy(accept ? 'accept' : 'decline');
    setError('');
    try {
      await actions.respondSessionTag(tag.id, accept, addToMine);
      setFrozen({ ...tag, status: accept ? 'accepted' : 'declined' });
      showToast(accept
        ? { title: 'Tag accepted', body: addToMine || hasCopy ? 'It’s in your sessions too.' : `You’re on ${first}’s posts of it.`, icon: 'checkmark-circle-outline' }
        : { title: 'Tag declined', body: 'Your name stays off their posts.', icon: 'close-circle-outline' });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through. Try again.');
      setBusy(null);
    }
  };

  // "Remove tag" asks the one question there is: whether your copy of the session goes too.
  const removeNow = async (dropMine: boolean) => {
    if (!tag) return;
    setBusy('remove');
    setError('');
    try {
      await actions.removeSessionTag(tag.id, dropMine);
      setFrozen({ ...tag, status: 'removed' });
      showToast({ title: 'Tag removed', body: dropMine ? 'It’s out of your sessions too.' : undefined, icon: 'pricetag-outline' });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through. Try again.');
      setBusy(null);
    }
  };
  const remove = () => {
    if (!tag) return;
    confirm({
      title: 'Remove the tag?',
      message: hasCopy ? `Your name comes off ${first}’s posts, for good. Your copy of the session can stay in your log.` : `Your name comes off ${first}’s posts, for good.`,
      confirmLabel: 'Remove tag',
      destructive: true,
      onConfirm: () => removeNow(false),
      ...(hasCopy ? { also: { label: 'Remove tag and my session', destructive: true, onPress: () => removeNow(true) } } : {}),
    });
  };

  const status = frozen?.status ?? tag?.status;
  const closed = !!tag && !frozen && isClosed(tag);
  // What becomes public, and where, in their words.
  const line = !tag ? '' : closed
    ? (tag.status === 'removed' ? `You took your name off ${first}’s posts.` : `${first} took this tag off.`)
    : status === 'accepted' ? `Your name is on ${first}’s posts.`
    : status === 'declined' ? 'You said no. You can still accept.'
    : `Your name goes on ${first}’s posts only if you accept.`;
  const header = tag
    ? <SheetTitle title={`${first} tagged you`} line={line} lines={2} onClose={close} />
    : <SheetTitle title="Tagged" onClose={close} />;

  // What it was, from your side: a match's result is the other side of theirs when you were across the net.
  const tiles = tag ? [
    tag.kind === 'match'
      ? { top: 'Your result', main: tag.won === true ? 'Won' : tag.won === false ? 'Lost' : 'Played' }
      : { top: 'Session', main: KIND_LABEL[tag.kind] },
    { top: 'On court', main: duration(tag.minutes) },
    { top: 'When', main: shortDay(tag.day) },
  ] : [];

  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={height < 720 ? 0.8 : 0.62} header={header}>
      {waiting ? (
        <View style={styles.wait}><CourtSpinner size={34} /></View>
      ) : failed ? (
        <ScrollView contentContainerStyle={formBody}>
          <Text style={styles.notice}>Couldn’t load this tag.</Text>
          <Text style={styles.hint}>Check your connection, then try again.</Text>
          <Submit label="Try again" onPress={fetchTags} />
        </ScrollView>
      ) : !tag ? (
        <ScrollView contentContainerStyle={formBody}>
          <Text style={styles.notice}>This tag is no longer here.</Text>
          <Text style={styles.hint}>{params.session ? 'It was taken off, or the session was deleted.' : 'It may have been taken off.'}</Text>
          <Submit label="Close" onPress={close} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={formBody}>
          {/* Who: a tap opens their profile. */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${tagger?.name ?? first}, open profile`}
            onPress={() => { if (tagger) router.push(`/user/${tagger.id}`); }}
            style={({ pressed }) => [styles.who, pressed && styles.pressed]}
          >
            <Avatar name={tagger?.name ?? first} seed={tagger?.avatarSeed ?? tag.taggerId} uri={tagger?.avatarUrl} size={44} />
            <View style={styles.whoWords}>
              <Text style={styles.whoName} numberOfLines={1}>{tagger?.name ?? first}</Text>
              <Text style={styles.whoSub} numberOfLines={1}>{tagger ? `@${tagger.handle} · ` : ''}{tag.kind === 'match' ? (tag.role === 'partner' ? 'Your doubles partner' : 'Your opponent') : 'Played with you'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>

          <View style={styles.tiles} accessible accessibilityLabel={tiles.map((t) => `${t.top}: ${t.main}`).join(', ')}>
            {tiles.map((t) => (
              <View key={t.top} style={styles.tile}>
                <Text style={styles.tileTop} numberOfLines={1}>{t.top}</Text>
                <Text style={styles.tileMain} numberOfLines={1} adjustsFontSizeToFit>{t.main}</Text>
              </View>
            ))}
          </View>

          {post ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`See ${first}’s post`} hitSlop={6} onPress={() => router.push(`/post/${post.id}`)} style={({ pressed }) => [styles.seePost, pressed && styles.pressed]}>
              <Ionicons name="images-outline" size={15} color={colors.brand} />
              <Text style={styles.seePostText}>See post</Text>
            </Pressable>
          ) : null}

          {closed ? (
            <Submit label="Close" onPress={close} />
          ) : status === 'accepted' ? (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityState={{ busy: busy === 'remove' }} disabled={!!busy} onPress={remove} style={({ pressed }) => [styles.second, pressed && styles.pressed]}>
                {busy === 'remove' ? <ActivityIndicator size="small" color={colors.danger} /> : null}
                <Text style={[styles.secondText, styles.danger]}>Remove tag</Text>
              </Pressable>
            </>
          ) : (
            <>
              {hasCopy ? (
                <View style={styles.inLog}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                  <Text style={styles.inLogText}>Already in your sessions</Text>
                </View>
              ) : (
                <View style={styles.rows}>
                  <FormRow
                    icon="calendar-outline"
                    label="Add to my sessions"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: addToMine }}
                    accessibilityLabel="Add to my sessions. Counts toward your streak"
                    onPress={() => setAddToMine((on) => !on)}
                    accessory={<View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Toggle value={addToMine} onChange={setAddToMine} /></View>}
                  />
                  <Text style={styles.rowHint}>Counts toward your streak. Only you see your log.</Text>
                </View>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {/* Both answers side by side, so neither is ever below the fold. */}
              <View style={styles.answers}>
                {status === 'pending' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decline"
                    accessibilityState={{ busy: busy === 'decline', disabled: !!busy }}
                    disabled={!!busy}
                    onPress={() => { void answer(false); }}
                    style={({ pressed }) => [styles.answer, styles.decline, pressed && styles.pressed, !!busy && busy !== 'decline' && styles.off]}
                  >
                    {busy === 'decline' ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={styles.secondText}>Decline</Text>}
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Accept"
                  accessibilityState={{ busy: busy === 'accept', disabled: !!busy }}
                  disabled={!!busy}
                  onPress={() => { void answer(true); }}
                  style={({ pressed }) => [styles.answer, styles.accept, pressed && styles.pressed, !!busy && busy !== 'accept' && styles.off]}
                >
                  {busy === 'accept' ? <ActivityIndicator size="small" color={colors.brandInk} /> : <><BrandWash /><Text style={[styles.secondText, styles.acceptText]}>Accept</Text></>}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  wait: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  notice: { ...typography.bodyStrong, color: colors.text },
  hint: { ...typography.small, color: colors.textMuted, marginTop: -spacing.sm },
  // Who tagged you: the sheet's white card on a soft shadow.
  who: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, paddingRight: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  whoWords: { flex: 1, minWidth: 0, gap: 2 },
  whoName: { ...typography.body, ...font('600'), color: colors.text },
  whoSub: { ...typography.small, color: colors.textMuted },
  // What it was, in the log sheet's tiles: a small line on top, the big word under it.
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { ...lift, flex: 1, height: 60, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 6 },
  tileTop: { fontSize: 12, ...font('500'), color: colors.textMuted },
  tileMain: { fontSize: 18, ...font('600'), letterSpacing: -0.3, color: colors.text, fontVariant: ['tabular-nums'] },
  seePost: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: spacing.xs, marginTop: -spacing.xs },
  seePostText: { ...typography.smallStrong, color: colors.brand },
  rows: { gap: 2 },
  rowHint: { ...typography.small, color: colors.textFaint, marginLeft: 26 + spacing.md, marginTop: -6 },
  inLog: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.xs },
  inLogText: { ...typography.smallStrong, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger },
  answers: { flexDirection: 'row', gap: spacing.sm },
  answer: { flex: 1, flexDirection: 'row', gap: 8, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  decline: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  // Accept: the sheet's Save button, filled with the court's colour.
  accept: { backgroundColor: colors.brand, boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.16)' },
  acceptText: { color: colors.brandInk },
  // The quieter button: Save's size and shape, outlined rather than filled (the log sheet's "Save and post").
  second: { flexDirection: 'row', gap: 10, height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  secondText: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  danger: { color: colors.danger },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
