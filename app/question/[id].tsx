import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import { ThreadReply } from '@/components/ThreadReplies';
import { MentionSuggestions } from '@/components/MentionSuggestions';
import { useMentionDraft } from '@/features/mentions/useMentionDraft';
import { AttachButton, AttachedPreview, type ReplyAttachment } from '@/components/ReplyMedia';
import { SwipeSurface } from '@/components/SwipeSurface';
import { requestSection } from '@/features/navigation/swipeOrder';
import { goToTab } from '@/features/navigation/startTab';
import Discuss from '../(tabs)/discuss';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { openJoinSheet } from '@/features/guest/joinAsk';
import { goBack } from '@/lib/goBack';
import { afterMenu, confirmAfterMenu, confirmReport } from '@/lib/confirm';
import { RisingSheet } from '@/components/RisingSheet';
import { useModalSheetBottom } from '@/lib/modalSheet';
import { afterReport } from '@/features/moderation/reportThanks';
import { CourtSpinner } from '@/components/CourtSpinner';
import { ThreadSkeleton } from '@/components/Skeleton';
import Ionicons from '@expo/vector-icons/Ionicons';

import { VoteControls } from '@/components/VoteControls';
import { topicMeta, topicTint } from '@/components/QuestionCard';
import { openTopic } from '@/features/community/openTopic';
import { Avatar, Card, Chip, EmptyState, Screen } from '@/components/ui';
import { Fold } from '@/components/ui/Fold';
import { JumpProvider, useJumpTo } from '@/components/JumpTo';
import { relativeTime } from '@/lib/format';
import { RichText } from '@/components/RichText';
import { PollView } from '@/components/PollView';
import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { useApp } from '@/store/AppContext';
import type { Answer } from '@/data/types';
import { colors, inkOn, radius, spacing, typography, buttonShape } from '@/theme';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { RemovedNote } from '@/features/moderation/RemovedNote';
import { HiddenComments, HiddenReplyRow } from '@/components/HiddenComments';
import { hiddenAnswersOn, shownInList } from '@/features/hiddenWords/hiddenWords';
import * as haptics from '@/lib/haptics';
import { publicRoute } from '@/features/share/publicRoute';
import { openPlayer } from '@/features/navigation/openPlayer';
import { show as showToast } from '@/lib/toast';
import { QUESTION_OF_WEEK_MS } from '@/data/api';
import { TextScale } from '@/theme/textScale';
import { LESS_AI_DISCUSS, corner } from '@/theme/look';
import { OfficialCheck } from '@/components/OfficialCheck';

function QuestionDetail() {
  const styles = useThemedStyles(styleDefinitions);
  // `at`: a reply to open the thread at (a reported one, from Reports): scrolled to once the thread is in, and lit up.
  const { id, at } = useLocalSearchParams<{ id: string; at?: string }>();
  const { questions, answers, users, currentUserId, currentUser, actions, isGuest, pinnedQuestion } = useApp();
  const view = actions.recordView;
  useEffect(() => { view('question', String(id)); }, [view, id]);
  // The app arrives with each thread's newest replies; opening one brings them all.
  const loadThread = actions.loadThread;
  const { ready } = useApp();
  const [looked, setLooked] = useState(false);
  useEffect(() => { if (ready) void loadThread(String(id)).finally(() => setLooked(true)); }, [loadThread, id, ready]);
  const jump = useJumpTo(at, looked);
  // The order the replies were put in (most votes first), kept while you read: a vote never moves a
  // reply under your thumb, as on Reddit. Worked out again when the thread has loaded and on a
  // pull to refresh; a reply new since then goes at the end (Oct 22 sweep, item 9).
  const [orderRound, setOrderRound] = useState(0);
  const replyOrder = useRef<{ key: string; rank: Map<string, number> } | null>(null);
  const [draft, setDraft] = useState('');
  const [media, setMedia] = useState<ReplyAttachment | null>(null);
  const [replying, setReplying] = useState(false);
  const replyInput = useRef<TextInput>(null);
  const reveal = useRevealOnFocus();
  const tag = useMentionDraft(draft, setDraft, replyInput);
  // What is in the reply box now, for words sent and then refused (see submit).
  const latest = useRef({ draft, media });
  latest.current = { draft, media };

  const question = questions.find((q) => q.id === id);
  const asker = users.find((u) => u.id === question?.authorId);
  // Admins: only a thread by someone known to be an adult can be the Question of the week (teen rules;
  // the server says, as it alone knows ages). The pin shows only then, or to take off a pin already there.
  const canPin = actions.canPinQuestion;
  const isAdmin = !!currentUser?.isAdmin;
  const [pinnable, setPinnable] = useState(false);
  // The "⋯" menu at the top (Oct 29, owner: the row of icons was "super super confusing"): Share stays out, the rest is in here.
  const [menuOpen, setMenuOpen] = useState(false);
  // The menu clears Android's navigation bar, and a message meanwhile shows as the phone's own alert (modalSheet).
  const menuBottom = useModalSheetBottom(menuOpen, spacing.xxl);
  useEffect(() => {
    if (!isAdmin || !question || question.removed) { setPinnable(false); return undefined; }
    let on = true;
    void canPin(question.id).then((ok) => { if (on) setPinnable(ok); });
    return () => { on = false; };
  }, [isAdmin, question?.id, question?.removed, canPin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!question) {
    return (
      <Screen title="Thread" compactTitle onBack={() => goBack()}>
        {looked ? <EmptyState icon="alert-circle-outline" title="This thread is gone" body="Whoever started it may have deleted it." action={{ label: 'See Discussions', onPress: () => { requestSection('/discuss', 'discussions'); goToTab('/discuss'); } }} /> : <ThreadSkeleton />}
      </Screen>
    );
  }

  const meta = topicMeta(question.topic);
  // The topic's colour on this court, with words that read on it (a fixed dark ink fell short of 4.5:1 on the darker topics).
  const tint = topicTint(question.topic);
  // One hidden by your Hidden words (migration 117) shows only to whoever wrote it;
  // you find it under "Hidden replies" at the end, as the asker.
  const hidden = hiddenAnswersOn(answers, question.id, currentUserId, question.authorId);
  const listed = question.answerIds
    .map((aid) => answers.find((a) => a.id === aid))
    .filter((a): a is Answer => Boolean(a) && shownInList(a!, a!.authorId, currentUserId));
  // Most votes first. No "accepted" answer pinned on top any more (Oct 12, owner: "I don't think this
  // feature is needed" / "Takes away from engagement"): a thread never reads as closed.
  const orderKey = `${question.id}|${looked}|${orderRound}`;
  if (replyOrder.current?.key !== orderKey) {
    replyOrder.current = { key: orderKey, rank: new Map([...listed].sort((a, b) => b.votes - a.votes).map((a, i) => [a.id, i])) };
  }
  const rank = replyOrder.current.rank;
  const placeOf = (a: Answer) => rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const thread = listed.sort((a, b) => placeOf(a) - placeOf(b) || b.votes - a.votes);


  // Taken down by an admin (migration 108): only its author and admins can open it, and nobody can reply.
  const removed = question.removed;
  // Admins: take the thread down (the reason is picked on the next page), or put it back.
  const moderate = currentUser?.isAdmin ? () => {
    haptics.tap();
    if (removed) {
      confirmAfterMenu({ title: 'Restore this thread?', message: 'Everyone who could see it before sees it again, with its replies.', confirmLabel: 'Restore', onConfirm: () => { void actions.restoreContent('question', question.id); } });
    } else {
      // Once the menu has gone: a page opened while it is still fading can fail to appear on a phone.
      afterMenu(() => router.push({ pathname: '/take-down', params: { kind: 'question', id: question.id } }));
    }
  } : undefined;
  // Admins: pin this thread as the Question of the week (Oct 20 sweep, R5), at the top of Discussions
  // for everyone for 7 days; pinning it takes the last one off. Or take this one's pin off.
  const pinnedNow = !!pinnedQuestion && pinnedQuestion.id === question.id && Date.now() - Date.parse(pinnedQuestion.pinnedAt) < QUESTION_OF_WEEK_MS;
  const pin = isAdmin && !removed && (pinnable || pinnedNow) ? () => {
    haptics.tap();
    if (pinnedNow) {
      confirmAfterMenu({ title: 'Unpin the Question of the week?', message: 'It goes back to being an ordinary thread in Discussions.', confirmLabel: 'Unpin', onConfirm: () => {
        void actions.pinQuestionOfWeek(null).then((ok) => showToast(ok ? { title: 'Unpinned', icon: 'pin-outline' } : { title: 'Couldn’t unpin it', body: 'Check your connection and try again.', icon: 'cloud-offline-outline' }));
      } });
    } else {
      confirmAfterMenu({ title: 'Pin as Question of the week?', message: 'It shows at the top of Discussions for everyone for 7 days, marked This week. The last one comes off.', confirmLabel: 'Pin', onConfirm: () => {
        void actions.pinQuestionOfWeek(question.id).then((ok) => showToast(ok ? { title: 'Pinned as Question of the week', icon: 'pin' } : { title: 'Couldn’t pin it', body: 'Check your connection and try again.', icon: 'cloud-offline-outline' }));
      } });
    }
  } : undefined;
  // Someone else's thread can be reported from the "⋯" menu at the top (App Review 1.2, Oct 5).
  // It leaves your screens at once, so the page goes back.
  // A guest can report too (guest mode, Oct 17): by signing in, or by email to support.
  const theirs = (!!currentUserId || isGuest) && question.authorId !== currentUserId;
  const report = isGuest ? () => afterMenu(() => openJoinSheet('report this', { report: `question:${question.id}` })) : () => confirmReport('thread', () => {
    const asker = users.find((u) => u.id === question.authorId);
    afterReport(actions.reportUser(question.authorId, `question:${question.id}`), asker, actions);
    goBack('/discuss');
  }, true);
  const edit = question.authorId === currentUserId && !removed ? () => afterMenu(() => router.push({ pathname: '/edit-post', params: { id: question.id, kind: 'question' } })) : undefined;
  // The menu's rows, in this order, only those that apply: Edit (yours), the Question of the week pin and Take down
  // (admins), Report (someone else's). With none, there is no "⋯" at all, only Share.
  type MenuRow = { key: string; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; spoken: string; danger?: boolean; onPress: () => void };
  const menu: MenuRow[] = [
    edit ? { key: 'edit', icon: 'pencil-outline', label: 'Edit', spoken: 'Edit this thread', onPress: edit } : null,
    pin ? { key: 'pin', icon: pinnedNow ? 'pin' : 'pin-outline', label: pinnedNow ? 'Unpin Question of the week' : 'Pin as Question of the week', spoken: pinnedNow ? 'Unpin the Question of the week' : 'Pin as Question of the week', onPress: pin } : null,
    moderate ? { key: 'moderate', icon: removed ? 'eye-outline' : 'eye-off-outline', label: removed ? 'Restore' : 'Take down', spoken: removed ? 'Restore this thread' : 'Take down this thread', danger: !removed, onPress: moderate } : null,
    theirs && !removed ? { key: 'report', icon: 'flag-outline', label: 'Report', spoken: 'Report this thread', onPress: report } : null,
  ].filter((row): row is MenuRow => !!row);

  const submit = () => {
    const text = draft.trim();
    if (!text && !media) return;
    const attached = media;
    // Refused for its words (migration 117): the toast says why, and the reply
    // box opens again with what you wrote (and its photo or clip), unless
    // you have started another reply since.
    void actions.addAnswer(question.id, text, undefined, attached ?? undefined).then((result) => {
      // Not saved at all ('failed', offline say) gets the words back the same way.
      if (!result || latest.current.draft.trim() || latest.current.media) return;
      setDraft(text);
      setMedia(attached);
      setReplying(true);
    });
    setDraft('');
    setMedia(null);
    setReplying(false);
  };

  return (
    <SwipeSurface onSwipe={direction=>{if(direction===-1) { requestSection('/discuss', 'discussions'); goToTab('/discuss', true); }}} renderPreview={direction=>direction===-1 ? <Discuss previewSection="discussions"/> : null}><Screen title="Thread" compactTitle onBack={() => goBack()} scrollRef={jump.scrollRef} onRefresh={isDesktopBrowser() ? undefined : () => loadThread(String(id)).finally(() => setOrderRound((n) => n + 1))} right={removed && !menu.length ? undefined : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>{removed ? null : <Pressable accessibilityRole="button" accessibilityLabel="Share this thread" hitSlop={10} onPress={() => router.push(`/share?kind=question&id=${question.id}`)}><Ionicons name="arrow-redo-outline" size={23} color={colors.text} /></Pressable>}{menu.length ? <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={10} onPress={() => setMenuOpen(true)} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}><Ionicons name="ellipsis-horizontal" size={24} color={colors.text} /></Pressable> : null}</View>}>
      <Card style={styles.questionCard}>
        {removed ? <RemovedNote removed={removed} align="start" item={{ kind: 'question', id: question.id, authorId: question.authorId }} /> : null}
        {/* Who asked, up top and at full size — the way a reply shows its author. */}
        <View style={styles.askerRow}>
          <Pressable accessibilityRole="link" accessibilityLabel={asker ? `Open ${asker.name}'s profile` : undefined} onPress={() => asker && openPlayer(asker.id, currentUserId)} style={styles.asker}>
            <Avatar name={asker?.name ?? '?'} seed={asker?.avatarSeed ?? question.authorId} uri={asker?.avatarUrl} size={32} />
            <View style={{ flex: 1 }}>
              <View style={styles.askerNameLine}><Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.askerName, styles.shrink]} numberOfLines={1}>{asker?.name ?? 'Unknown'}</Text><OfficialCheck userId={asker?.id} size={13} /></View>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.time}>{asker ? `@${asker.handle}` : ''} · {relativeTime(question.createdAt)}{question.editedAt ? ' · Edited' : ''}</Text>
            </View>
          </Pressable>
          {/* The hand-made look (Oct 24): the topic a muted word, not a filled chip; still a tap to its threads. */}
          {LESS_AI_DISCUSS ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${meta.label} threads`} hitSlop={10} onPress={() => openTopic(question.topic)} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.time}>{meta.label}</Text>
            </Pressable>
          ) : <Chip label={meta.label} selected tint={tint} ink={inkOn(tint)} small onPress={() => openTopic(question.topic)} />}
        </View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>{question.title}</Text>
        <RichText style={styles.body}>{question.body}</RichText>
        {question.poll ? <PollView question={question} /> : null}
        <View style={styles.tagRow}>
          {question.tags.map((tag) => (LESS_AI_DISCUSS ? (
            <Pressable key={tag} accessibilityRole="link" accessibilityLabel={`#${tag}`} hitSlop={8} onPress={() => router.push({pathname:"/search",params:{q:`#${tag}`}})} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.time}>#{tag}</Text>
            </Pressable>
          ) : (
            <Chip key={tag} label={`#${tag}`} onPress={() => router.push({pathname:"/search",params:{q:`#${tag}`}})} small />
          )))}
        </View>
        {question.source ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Read the original on ${question.source.label}`}
            onPress={() => { if (/^https?:\/\//i.test(question.source!.url)) Linking.openURL(question.source!.url); }}
            style={styles.sourceRow}
          >
            <Ionicons name={question.source.name === 'reddit' ? 'logo-reddit' : 'globe-outline'} size={16} color={colors.brand} />
            <Text maxFontSizeMultiplier={TextScale.BODY} style={styles.sourceText}>
              From {question.source.label} · by {question.source.author} · {question.source.replies} replies there
            </Text>
            <Ionicons name="open-outline" size={15} color={colors.brand} />
          </Pressable>
        ) : null}
        <View style={styles.voteRow}>
          <VoteControls item={question} userId={currentUserId} onVote={direction => actions.voteQuestion(question.id, direction)} />
          {/* The same Reply button a reply has; it opens the line to type on right here. None on a removed thread. */}
          {removed ? null : <Pressable accessibilityRole="button" accessibilityLabel="Reply to this thread" onPress={() => { if (isGuest) { openJoinSheet('reply'); return; } setReplying(true); setTimeout(() => replyInput.current?.focus(), 50); }} style={({ pressed }) => [styles.replyButton, pressed && { opacity: PRESS_DIM }]}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted}/>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.replyLabel}>Reply</Text>
          </Pressable>}
        </View>
        {/* The reply box unfolds under the Reply button and folds away on Cancel or Send, so the
            replies below glide rather than jump (Oct 22 sweep, item 9). */}
        <Fold open={replying && !removed} gap={spacing.md}>
          <View style={{ gap: 8 }}>
          <MentionSuggestions candidates={tag.rows} onPick={tag.pick} maxHeight={176} />
          <View style={styles.composer}>
            <TextInput maxFontSizeMultiplier={TextScale.BODY} ref={replyInput} autoFocus keyboardType={Platform.OS === 'ios' ? 'twitter' : undefined} onFocus={() => reveal(replyInput.current)} accessibilityLabel="Reply to this thread" placeholder="Add your reply… (@ to tag)" placeholderTextColor={colors.textFaint} multiline maxLength={10000} value={draft} onChangeText={setDraft} onSelectionChange={tag.onSelectionChange} style={styles.replyInput}
              blurOnSubmit={Platform.OS === 'web' ? true : undefined}
              onSubmitEditing={Platform.OS === 'web' ? submit : undefined} />
            {media ? <AttachedPreview media={media} onRemove={() => setMedia(null)} /> : null}
            <View style={styles.inlineActions}>
              <AttachButton onPick={setMedia} />
              <View style={{ flex: 1 }} />
              <Pressable accessibilityRole="button" onPress={() => { setReplying(false); setDraft(''); setMedia(null); }} hitSlop={8} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}><Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.cancel}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Post reply" disabled={!draft.trim() && !media} onPress={submit} style={({ pressed }) => [styles.send, !draft.trim() && !media && styles.sendOff, pressed && { transform: [{ scale: PRESS_SHRINK }] }]}>
                <Ionicons name="arrow-up" size={18} color={colors.brandInk} />
              </Pressable>
            </View>
          </View>
          </View>
        </Fold>
      </Card>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sectionTitle}>Replies</Text>
          {thread.length > 0 ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sectionCount}>{thread.length}</Text> : null}
        </View>

        {/* Only hidden replies so far: "Hidden replies" below says so, not "No answers yet". */}
        {thread.length === 0 && !hidden.length ? (
          question.source ? (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title={`${question.source.replies} ${question.source.replies === 1 ? 'reply' : 'replies'} on ${question.source.label}`}
              body={LESS_AI_DISCUSS ? undefined : 'Those stay on the original site. Be the first to answer it here.'}
            />
          ) : (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No answers yet"
              // Your own thread: the asker is told what happens next, not asked to answer it.
              body={LESS_AI_DISCUSS ? undefined : question.authorId === currentUserId
                ? 'We’ll let you know when a player or coach answers.'
                : 'Know this one? A specific answer beats three vague ones.'}
            />
          )
        ) : null}

        <JumpProvider value={jump.ctx}>
          {thread.filter(answer => !answer.parentAnswerId || !thread.some(parent => parent.id === answer.parentAnswerId)).map(answer => (
            <ThreadReply key={answer.id} answer={answer} thread={thread} askerId={question.authorId} closed={!!removed} />
          ))}
        </JumpProvider>

        <HiddenComments count={hidden.length} noun="replies">
          {hidden.map((a) => <HiddenReplyRow key={a.id} authorId={a.authorId} body={a.body} createdAt={a.createdAt} onUnhide={() => actions.unhideByWords('answer', a.id)} />)}
        </HiddenComments>

      </View>

      {/* The thread's menu, the same sheet a profile's and a coach question's "⋯" opens. */}
      <RisingSheet visible={menuOpen} onClose={() => setMenuOpen(false)} closeLabel="Close menu" sheetStyle={[styles.sheet, { paddingBottom: menuBottom }]}>
        <View style={styles.grabber} />
        {menu.map((row) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={row.spoken}
            onPress={() => { setMenuOpen(false); row.onPress(); }}
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.surfaceAlt }]}
          >
            <Ionicons name={row.icon} size={21} color={row.danger ? colors.danger : row.key === 'pin' && pinnedNow ? colors.brand : colors.text} />
            <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.menuLabel, row.danger && { color: colors.danger }]}>{row.label}</Text>
          </Pressable>
        ))}
      </RisingSheet>
    </Screen></SwipeSurface>
  );
}

const styleDefinitions = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  menuLabel: { ...typography.body, color: colors.text },
  questionCard: { gap: spacing.md, borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', paddingHorizontal: 0, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  askerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: buttonShape.smallHeight, paddingHorizontal: 14, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.surfaceAlt },
  // A soft rounded box to write in, the way messaging apps do it.
  composer: { gap: 6, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 14, borderRadius: corner(20), backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  // No browser focus ring either: the cursor is the only sign the box is live.
  replyInput: { minHeight: 44, paddingVertical: 0, color: colors.text, fontSize: 16, lineHeight: 22, textAlignVertical: 'top', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  cancel: { ...typography.smallStrong, color: colors.textMuted },
  replyLabel: { ...typography.smallStrong, color: colors.textMuted },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  sendOff: { opacity: 0.35 },
  asker: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  askerName: { ...typography.smallStrong, color: colors.text, fontSize: 14 },
  askerNameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shrink: { flexShrink: 1 },
  time: { ...typography.small, color: colors.textFaint },
  title: { ...typography.title, color: colors.text, lineHeight: 28 },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated },
  sourceText: { ...typography.small, color: colors.textMuted, flex: 1, lineHeight: 19 },
  voteButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteCount: { ...typography.bodyStrong, color: colors.text, minWidth: 24, textAlign: 'center' },
  section: { gap: spacing.md, paddingTop: spacing.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { ...typography.heading, color: colors.text },
  sectionCount: { ...typography.bodyStrong, color: colors.textFaint },
  answerCard: { gap: 12, paddingVertical: 16 },
  nested: { marginLeft: 16, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border },
  replyBody: { fontSize: 15, lineHeight: 23, color: colors.text, paddingLeft: 8 },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  acceptedText: { ...typography.caption, color: colors.court },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  answerMeta: { flex: 1, gap: 2 },
  answerNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  answerName: { ...typography.smallStrong, color: colors.text },
  coachTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  coachTagText: { ...typography.caption, fontSize: 9, color: colors.brandInk },
  answerBody: { ...typography.body, color: colors.text, lineHeight: 24, marginLeft: 16, paddingLeft: 29, borderLeftWidth: 1, borderLeftColor: colors.border },
});

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('question', QuestionDetail);
