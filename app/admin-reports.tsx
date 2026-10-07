import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { goBack } from '@/lib/goBack';

import { CourtSpinner } from '@/components/CourtSpinner';
import { TileCover } from '@/components/TileCover';
import { Avatar, Button, EmptyState, Screen, SegmentedControl } from '@/components/ui';
import type { AdminReport, ReportEvidence, ReportedChat, ReportedItem, ReportedItemKind } from '@/data/remote';
import { GroupAvatar, groupName } from '@/features/messages/groups';
import { ChatPhotoImage, PhotoViewer } from '@/features/messages/ChatPhotoViews';
import { confirm } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import { reasonLabel } from '@/features/moderation/reasons';
import type { ChatPhoto, ID, TakedownKind, User } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

type Tab = 'open' | 'done';
type Decision = 'remove' | 'restore' | 'suspend' | 'unsuspend' | 'dismiss';

/** How many of a reported chat's messages show before "Show all". */
const CHAT_PREVIEW = 8;

/** What each kind of report says on its card. */
const KIND_NAME: Record<AdminReport['kind'], string> = {
  post: 'Post', hit: 'Instant', 'hit-request': 'Open hit', question: 'Thread', answer: 'Reply', comment: 'Comment',
  'coach-question': 'Coach question', 'coach-reply': 'Coach reply', tip: 'Tip', profile: 'Profile', conversation: 'Chat', 'ai-coach': 'AI coach',
  group: 'Group', coach: 'Coach page', 'coach-review': 'Coach review', 'court-note': 'Court note',
};
/** Reports whose card shows the account and the words the report carried, with nothing more to load (remote.ReportedOtherKind). */
const NOT_LOADED = new Set<AdminReport['kind']>(['profile', 'conversation', 'ai-coach', 'group', 'coach', 'coach-review', 'court-note']);
/** Things a report can point at, besides an account, a chat, something the AI coach wrote, a group, a coach's page or review, or a court note. */
const isItem = (kind: AdminReport['kind']): kind is ReportedItemKind => !NOT_LOADED.has(kind);

/** The kind to take down for a reported thing, or null for one that can't be taken down (an open hit, a tip, an account). */
function takedownKindOf(report: AdminReport, item: ReportedItem | null | undefined): TakedownKind | null {
  switch (report.kind) {
    case 'post': case 'hit': case 'question': case 'answer': case 'coach-question': case 'coach-reply': return report.kind;
    // A comment under an Instant is its own kind to the server.
    case 'comment': return item ? (item.onHit ? 'hit-comment' : 'comment') : null;
    default: return null;
  }
}

/**
 * Where a report's card opens: the thing itself, in place (a comment in its
 * post's comments, a reply in its thread or under its coach question), the
 * board for a tip, or the account for a profile, or for something since
 * deleted (the card then shows the person). Null when there is nowhere to go.
 */
function whereTo(report: AdminReport, item: ReportedItem | null | undefined, coachOfReview?: ID): Href | null {
  const id = report.targetId;
  if (isItem(report.kind) && item === null) return report.userId ? `/user/${report.userId}` : null;
  switch (report.kind) {
    case 'post': return id ? `/post/${id}` : null;
    case 'hit': return id ? `/hits/${id}` : null;
    case 'hit-request': return id ? `/hit-request/${id}` : null;
    case 'question': return id ? `/question/${id}` : null;
    case 'coach-question': return id ? `/coach-question/${id}` : null;
    case 'comment': return id && item?.parentId ? { pathname: '/comments', params: { kind: item.onHit ? 'hit' : 'post', id: item.parentId, at: id } } : null;
    case 'answer': return id && item?.parentId ? { pathname: '/question/[id]', params: { id: item.parentId, at: id } } : null;
    case 'coach-reply': return id && item?.parentId ? { pathname: '/coach-question/[id]', params: { id: item.parentId, at: id } } : null;
    case 'tip': return id ? { pathname: '/tips', params: { at: id } } : '/tips';
    case 'profile': return report.userId ? `/user/${report.userId}` : null;
    // A group's page (an admin who isn't in it sees its name, photo and about line), a coach's page, a court's page (for a note on it).
    case 'group': return id ? `/g/${id}` : null;
    case 'coach': return id ? `/coach/${id}` : null;
    case 'court-note': return id ? `/court/${id}` : null;
    // A review sits on its coach's page, when this phone has it; otherwise its writer's profile.
    case 'coach-review': return coachOfReview ? `/coach/${coachOfReview}` : report.userId ? `/user/${report.userId}` : null;
    default: return null;
  }
}

/** What Suspend does, said the same way on every card. */
const SUSPEND_NOTE = 'They can’t post, comment, reply or message until you unsuspend them.';

/**
 * Reports, for admins only (the database will not hand them to anyone else).
 * Each one shows what was reported and by whom; from it an admin can take
 * the thing down (one tap to the Take down page, which asks why; it is
 * hidden from everyone but its author, kept, its author told, and the report
 * marked done: migration 108), suspend the account (no posting, commenting,
 * replying or messaging; asked first), or dismiss the report. Both taking
 * down and suspending can be undone from the same card.
 *
 * A tap on what was reported opens it where it sits, scrolled to and lit
 * up for a moment: a comment in its post's comments, a reply in its thread,
 * a coach's reply under its question, a tip on the board. What the AI coach
 * wrote has nowhere to open: its card is the words alone.
 *
 * A reported chat (a group, a one-to-one chat, or one message in either)
 * shows its name, who is in it and its last 30 messages, which admins can
 * read only because it was reported (report_chat_context, migration 54). Its
 * photos show too, and any message in it can be removed for everyone
 * (migration 61: chat photos sit on a private shelf, which admins may open
 * only for a reported chat). The person a chat report is about can be
 * suspended from its card, and so can anyone in a reported group.
 */
export default function AdminReports() {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser, coachReviews, actions } = useApp();
  const [tab, setTab] = useState<Tab>('open');
  // Null while the first load is on its way; 'failed' when it could not load (never shown as "nothing to review").
  const [reports, setReports] = useState<AdminReport[] | null | 'failed'>(null);
  const [items, setItems] = useState<Record<string, ReportedItem | null>>({});
  // Reported chats, by report, and which of them show every message.
  const [chats, setChats] = useState<Record<string, ReportedChat | null>>({});
  // The copy kept when each chat was reported, by report (migration 115).
  const [evidence, setEvidence] = useState<Record<string, ReportEvidence[]>>({});
  const [chatOpen, setChatOpen] = useState<Record<string, boolean>>({});
  // Suspensions decided here, before the next app open brings them in.
  const [suspended, setSuspended] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // A reported photo opened full screen.
  const [viewing, setViewing] = useState<{ photos: ChatPhoto[]; index: number; caption?: string } | null>(null);

  const load = useCallback(async () => {
    const list = await actions.loadReports();
    // A list already on screen stays there if a reload fails; the pull can try again.
    if (!list) { setReports((was) => (Array.isArray(was) ? was : 'failed')); return false; }
    setReports(list);
    const wanted = list.filter((r) => isItem(r.kind) && r.targetId);
    const chatReports = list.filter((r) => r.kind === 'conversation' && r.targetId);
    const [got, gotChats, gotCopies] = await Promise.all([
      Promise.all(wanted.map((r) => actions.loadReportedItem(r.kind as ReportedItemKind, r.targetId!))),
      Promise.all(chatReports.map((r) => actions.loadReportedChat(r.targetId!))),
      Promise.all(chatReports.map((r) => actions.loadReportEvidence(r.id))),
    ]);
    setItems(Object.fromEntries(wanted.map((r, i) => [r.id, got[i]])));
    setChats(Object.fromEntries(chatReports.map((r, i) => [r.id, gotChats[i]])));
    setEvidence(Object.fromEntries(chatReports.map((r, i) => [r.id, gotCopies[i]])));
    return true;
  }, [actions]);
  // Again each time the page comes back into view: a take-down from here closes its report on the server.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Takes one message out of a reported chat, for everyone in it (its photos come off the shelf too).
  const removeLine = (messageId: string, what: string) => confirm({
    title: `Remove this ${what}?`,
    message: 'It’s removed for everyone in the chat. This can’t be undone.',
    confirmLabel: 'Remove',
    destructive: true,
    onConfirm: async () => {
      setBusy(`line:${messageId}`);
      await actions.removeReportedMessage(messageId);
      await load();
      setBusy(null);
    },
  });

  // Restore goes the same way as Restore everywhere else (actions.restoreContent):
  // the app's own copy loses its "Removed" mark at once, a failure puts it back
  // and says why, and the server opens the report again (migration 108).
  const restore = async (report: AdminReport, kind: TakedownKind) => {
    if (!report.targetId) return;
    setBusy(`${report.id}:restore`);
    await actions.restoreContent(kind, report.targetId, { reportId: report.id });
    await load();
    setBusy(null);
  };
  // Someone in a reported chat, suspended from its card (a group's report names nobody).
  const suspendMember = (user: User, conversationId: string) => confirm({
    title: `Suspend @${user.handle}?`,
    message: SUSPEND_NOTE,
    confirmLabel: 'Suspend',
    destructive: true,
    onConfirm: async () => {
      setBusy(`member:${user.id}`);
      const ok = await actions.suspendFromChat(user.id, conversationId);
      if (ok) setSuspended((s) => ({ ...s, [user.id]: true }));
      await load();
      setBusy(null);
    },
  });

  const decide = async (report: AdminReport, decision: Decision) => {
    setBusy(`${report.id}:${decision}`);
    const ok = await actions.decideReport(report.id, decision);
    if (ok && report.userId && (decision === 'suspend' || decision === 'unsuspend')) setSuspended((s) => ({ ...s, [report.userId!]: decision === 'suspend' }));
    await load();
    setBusy(null);
  };
  // Suspending stops someone posting, commenting and messaging: asked first, naming who, as a group's Suspend is.
  const askSuspend = (report: AdminReport, person: User | undefined) => confirm({
    title: person ? `Suspend @${person.handle}?` : 'Suspend this account?',
    message: SUSPEND_NOTE,
    confirmLabel: 'Suspend',
    destructive: true,
    onConfirm: () => decide(report, 'suspend'),
  });

  if (!currentUser?.isAdmin) {
    return (
      <Screen title="Reports" compactTitle onBack={() => goBack()}>
        <EmptyState icon="lock-closed-outline" title="Only admins can see reports" />
      </Screen>
    );
  }

  const list = Array.isArray(reports) ? reports : [];
  const open = list.filter((r) => r.status === 'open');
  const done = list.filter((r) => r.status !== 'open');
  const shown = tab === 'open' ? open : done;

  return (
    <Screen title="Reports" compactTitle onBack={() => goBack()} onRefresh={load}>
      <View style={styles.tabs}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          segments={[{ value: 'open', label: `Open${open.length ? ` (${open.length})` : ''}` }, { value: 'done', label: 'Done' }]}
        />
      </View>
      {reports === null ? (
        <View style={styles.wait}><CourtSpinner size={28} /></View>
      ) : reports === 'failed' ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load reports"
          body="Check your connection and try again."
          action={{ label: 'Try again', onPress: () => { setReports(null); void load(); } }}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon="flag-outline" title={tab === 'open' ? 'Nothing to review' : 'No decisions yet'} body={tab === 'open' ? 'New reports show up here, and you get a notification for each one.' : 'Reports you act on move here.'} />
      ) : (
        shown.map((report) => {
          const reporter = users.find((u) => u.id === report.reporterId);
          const person = report.userId ? users.find((u) => u.id === report.userId) : undefined;
          const item = items[report.id];
          const chat = report.kind === 'conversation' ? chats[report.id] : undefined;
          const isSuspended = report.userId ? suspended[report.userId] ?? !!person?.suspended : false;
          const waiting = (d: Decision) => busy === `${report.id}:${d}`;
          const reportedBy = `Reported by ${reporter ? `@${reporter.handle}` : 'someone'}`;
          // Suspend (or Unsuspend), the same compact button on every card.
          const suspendButton = report.userId ? (
            isSuspended
              ? <Button size="sm" label="Unsuspend" variant="secondary" loading={waiting('unsuspend')} onPress={() => void decide(report, 'unsuspend')} />
              : <Button size="sm" label="Suspend" variant="secondary" loading={waiting('suspend')} onPress={() => askSuspend(report, person)} />
          ) : null;
          // Dismiss: a quiet word at the row's far end, its letters on the card's own edge.
          const dismissButton = report.status === 'open'
            ? <View style={styles.dismiss}><Button size="sm" label="Dismiss" variant="ghost" loading={waiting('dismiss')} onPress={() => void decide(report, 'dismiss')} style={styles.ghostPad} /></View>
            : null;
          if (report.kind === 'conversation') {
            const showAll = !!chatOpen[report.id];
            const lines = chat ? (showAll ? chat.messages : chat.messages.slice(-CHAT_PREVIEW)) : [];
            return (
              <View key={report.id} style={styles.card}>
                <View style={styles.head}>
                  <View style={styles.kind}><Text style={styles.kindText}>{report.messageId ? 'Message' : chat && !chat.isGroup ? 'Chat' : 'Group chat'}</Text></View>
                  <Text style={styles.muted}>{relativeTime(report.createdAt)}</Text>
                  {report.status !== 'open' ? <Text style={styles.status}>{report.status === 'dismissed' ? 'Dismissed' : 'Reviewed'}</Text> : null}
                </View>
                <ReportedChatCard
                  chat={chat} showAll={showAll} lines={lines} onShowAll={() => setChatOpen((o) => ({ ...o, [report.id]: true }))} styles={styles} users={users}
                  busy={busy}
                  flagged={report.messageId}
                  copies={evidence[report.id] ?? []}
                  onOpenPhotos={(photos, index, caption) => setViewing({ photos, index, caption })}
                  onRemove={removeLine}
                  // A group's report names nobody: each person in it can be suspended here instead.
                  onSuspend={chat?.isGroup && !report.userId && report.targetId ? (user) => suspendMember(user, report.targetId!) : undefined}
                  isSuspended={(user) => suspended[user.id] ?? !!user.suspended}
                />
                <Text style={styles.muted}>{reportedBy}{person ? ` · about @${person.handle}` : ''}{report.reason ? ` · ${report.reason}` : ''}</Text>
                {suspendButton || dismissButton ? <View style={styles.actions}>{suspendButton}{dismissButton}</View> : null}
              </View>
            );
          }
          const target = whereTo(report, item, report.kind === 'coach-review' ? coachReviews.find((r) => r.id === report.targetId)?.coachId : undefined);
          const kind = takedownKindOf(report, item);
          const takeDownButton = kind && item && report.targetId ? (
            item.removed
              ? <Button size="sm" label="Restore" variant="secondary" loading={waiting('restore')} onPress={() => void restore(report, kind)} />
              // The reason is picked on the Take down page; the report is marked done there too (migration 108).
              : <Button size="sm" label="Take down" variant="danger" onPress={() => router.push({ pathname: '/take-down', params: { kind, id: report.targetId!, report: report.id, ...(report.userId ? { who: report.userId } : {}) } })} />
          ) : null;
          const what = report.kind === 'ai-coach' ? (
            // Nobody's account and nothing to open: what the AI coach wrote is the whole report.
            <View style={styles.quote}>
              <Text style={styles.body} numberOfLines={8}>{report.reason}</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole={target ? 'link' : undefined}
              accessibilityLabel={target ? 'Open what was reported' : undefined}
              disabled={!target}
              onPress={target ? () => router.push(target) : undefined}
              style={({ pressed }) => [styles.target, pressed && target ? styles.targetPressed : null]}
            >
              {report.kind === 'profile' || !item ? (
                <>
                  <Avatar name={person?.name ?? '?'} seed={person?.avatarSeed ?? report.userId ?? 'x'} uri={person?.avatarUrl} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{person?.name ?? 'Unknown account'}</Text>
                    <Text style={styles.muted} numberOfLines={1}>{person ? `@${person.handle}` : ''}{report.kind !== 'profile' && item === null ? `${person ? ' · ' : ''}This is gone` : ''}</Text>
                  </View>
                </>
              ) : (
                <>
                  {item.picture ? <TileCover uri={item.picture} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, styles.noThumb]}><Ionicons name="document-text-outline" size={18} color={colors.textMuted} /></View>}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.body} numberOfLines={report.kind === 'post' || report.kind === 'hit' ? 2 : 6}>{item.body || 'No caption'}</Text>
                    <Text style={styles.muted} numberOfLines={1}>{person ? `by @${person.handle}` : ''}</Text>
                    {item.removed ? <Text style={styles.removedLine} numberOfLines={1}>Removed{item.reason ? `: ${reasonLabel(item.reason)}` : ''}</Text> : null}
                  </View>
                </>
              )}
              {target ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} /> : null}
            </Pressable>
          );
          return (
            <View key={report.id} style={styles.card}>
              <View style={styles.head}>
                <View style={styles.kind}><Text style={styles.kindText}>{KIND_NAME[report.kind]}</Text></View>
                <Text style={styles.muted}>{relativeTime(report.createdAt)}</Text>
                {report.status !== 'open' ? <Text style={styles.status}>{report.status === 'removed' ? 'Removed' : report.status === 'suspended' ? 'Suspended' : 'Dismissed'}</Text> : null}
              </View>

              {what}

              <Text style={styles.muted}>{reportedBy}{report.reason && report.kind !== 'ai-coach' ? ` · ${report.reason}` : ''}</Text>

              {takeDownButton || suspendButton || dismissButton ? (
                <View style={styles.actions}>{takeDownButton}{suspendButton}{dismissButton}</View>
              ) : null}
            </View>
          );
        })
      )}
      {viewing ? <PhotoViewer photos={viewing.photos} start={viewing.index} caption={viewing.caption} onClose={() => setViewing(null)} /> : null}
    </Screen>
  );
}

/** What a reported chat said, in a few words for a line: a shared item or a voice note has no words of its own. */
function chatLineWords(kind: string, body: string, photos = 1): string {
  if (kind === 'post') return 'Sent a clip';
  if (kind === 'question') return 'Sent a thread';
  if (kind === 'profile') return 'Sent a profile';
  if (kind === 'court') return body ? `Sent a court: ${body}` : 'Sent a court';
  if (kind === 'voice') return 'Sent a voice message';
  if (kind === 'hit-request') return 'Sent a hit';
  // The photos show under the line (an admin may open them for a reported chat); the caption, if any, is what it said.
  if (kind === 'photo') { const sent = photos > 1 ? `Sent ${photos} photos` : 'Sent a photo'; return body ? `${sent}: ${body}` : sent; }
  return body || '(no words)';
}

/**
 * A reported chat on its card: its picture, name and people, then its last
 * messages, oldest first (each person tappable for their profile). Event
 * lines ("Mira added Dev") show as they were written, in grey.
 */
function ReportedChatCard({ chat, showAll, lines, onShowAll, styles, users, busy, flagged, copies, onOpenPhotos, onRemove, onSuspend, isSuspended }: {
  chat: ReportedChat | null | undefined; showAll: boolean; lines: ReportedChat['messages']; onShowAll: () => void;
  styles: typeof styleDefinitions; users: User[];
  /** Which removal is under way ("line:<id>"), or which suspension ("member:<id>"). */
  busy: string | null;
  /** The one message reported, when it was a message: marked on its line. */
  flagged?: string;
  /** The copy kept when it was reported: what has since been unsent, edited or deleted shows under the chat. */
  copies: ReportEvidence[];
  onOpenPhotos: (photos: ChatPhoto[], index: number, caption?: string) => void;
  onRemove: (messageId: string, what: string) => void;
  /** A group's people, each with a Suspend button. */
  onSuspend?: (user: User) => void;
  isSuspended: (user: User) => boolean;
}) {
  if (chat === undefined) return <View style={styles.chatWait}><CourtSpinner size={22} /></View>;
  if (chat === null) {
    return (
      <View style={styles.target}>
        <View style={[styles.thumb, styles.noThumb]}><Ionicons name="chatbubbles-outline" size={18} color={colors.textMuted} /></View>
        <Text style={[styles.muted, { flex: 1 }]}>This chat can’t be shown.</Text>
      </View>
    );
  }
  const people = chat.memberIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const name = groupName({ id: '', participantIds: chat.memberIds, isGroup: chat.isGroup, title: chat.title, messageIds: [], updatedAt: '', unreadCount: 0 }, users, null);
  const firstName = (id: string) => users.find((u) => u.id === id)?.name.trim().split(/\s+/)[0] ?? 'Someone';
  return (
    <>
      <View style={styles.target}>
        <GroupAvatar people={people} size={44} name={name} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.muted} numberOfLines={2}>
            {chat.memberIds.length ? `${chat.memberIds.length} ${chat.memberIds.length === 1 ? 'member' : 'members'}: ${people.map((u) => `@${u.handle}`).join(', ')}` : 'Nobody is in it any more'}
          </Text>
        </View>
      </View>
      {onSuspend && people.length ? (
        <View style={styles.actions}>
          {people.map((u) => (isSuspended(u)
            ? <Text key={u.id} style={styles.muted}>@{u.handle} is suspended</Text>
            : <Button key={u.id} size="sm" label={`Suspend @${u.handle}`} variant="secondary" loading={busy === `member:${u.id}`} onPress={() => onSuspend(u)} />))}
        </View>
      ) : null}
      <View style={styles.chatBox}>
        {!chat.messages.length ? <Text style={styles.muted}>No messages.</Text> : null}
        {flagged && !chat.messages.some((m) => m.id === flagged) ? <Text style={styles.muted}>The reported message is no longer in the chat (unsent, or older than the last 30). The copy kept when it was reported is below.</Text> : null}
        {!showAll && chat.messages.length > lines.length ? (
          <Pressable accessibilityRole="button" onPress={onShowAll} hitSlop={6}>
            <Text style={styles.showAll}>Show all {chat.messages.length} messages</Text>
          </Pressable>
        ) : null}
        {lines.map((m, i) => (
          m.kind === 'system' ? (
            <Text key={`${m.createdAt}-${i}`} style={styles.chatEvent}>{m.body}</Text>
          ) : (
            <View key={`${m.createdAt}-${i}`} style={[styles.chatItem, flagged && m.id === flagged ? styles.flagged : null]}>
              {flagged && m.id === flagged ? <Text style={styles.flagText}>Reported message</Text> : null}
              <Text style={styles.chatLine}>
                <Text style={styles.chatWho} onPress={() => router.push(`/user/${m.senderId}`)}>{firstName(m.senderId)}</Text>
                <Text style={styles.muted}>{` · ${relativeTime(m.createdAt)}  `}</Text>
                {chatLineWords(m.kind, m.body, m.photos?.length)}
              </Text>
              {m.photos?.length ? (
                // The photos themselves, small; a tap opens them full screen.
                <View style={styles.photoRow}>
                  {m.photos.map((p, j) => (
                    <Pressable key={j} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${j + 1} of ${m.photos!.length}. Open`} onPress={() => onOpenPhotos(m.photos!, j, m.body || undefined)} style={styles.photoThumb}>
                      <ChatPhotoImage photo={p} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {/* Any message can be taken out, words as well as photos (remove_reported_message allows both). */}
              {m.id && m.kind === 'photo' ? (
                <View style={styles.lineActions}>
                  <Button size="sm" label={m.photos && m.photos.length > 1 ? 'Remove these photos' : 'Remove this photo'} variant="danger" loading={busy === `line:${m.id}`} onPress={() => onRemove(m.id!, m.photos && m.photos.length > 1 ? 'message and its photos' : 'photo')} />
                </View>
              ) : m.id ? (
                <View style={styles.lineActions}>
                  <View style={styles.lineGhost}><Button size="sm" label="Remove this message" variant="ghost" loading={busy === `line:${m.id}`} onPress={() => onRemove(m.id!, 'message')} style={styles.ghostPad} /></View>
                </View>
              ) : null}
            </View>
          )
        ))}
      </View>
      <SavedCopy chat={chat} copies={copies} flagged={flagged} styles={styles} users={users} onOpenPhotos={onOpenPhotos} />
    </>
  );
}

/** What each kind of saved copy is called on its line. */
const WHY: Record<ReportEvidence['why'], string> = {
  reported: 'As reported', unsent: 'Unsent since', edited: 'Before an edit', removed: 'Removed by an admin', deleted: 'Deleted with an account',
};

/**
 * The copy kept for a reported chat (migration 115), as far as it differs
 * from the chat now: messages unsent, edited (the words before), removed or
 * deleted since the report, and the reported message itself when the chat no
 * longer has it. Empty when nothing changed.
 */
function SavedCopy({ chat, copies, flagged, styles, users, onOpenPhotos }: {
  chat: ReportedChat; copies: ReportEvidence[]; flagged?: string; styles: typeof styleDefinitions; users: User[];
  onOpenPhotos: (photos: ChatPhoto[], index: number, caption?: string) => void;
}) {
  const here = new Set(chat.messages.map((m) => m.id).filter(Boolean));
  const shown = copies.filter((c) => c.why !== 'reported' || (c.messageId && c.messageId === flagged && !here.has(c.messageId)));
  if (!shown.length) return null;
  const firstName = (id?: string) => users.find((u) => u.id === id)?.name.trim().split(/\s+/)[0] ?? 'Someone';
  return (
    <View style={styles.chatBox}>
      <Text style={styles.flagText}>Kept for this report</Text>
      {shown.map((c, i) => (
        <View key={`${c.messageId ?? 'm'}-${c.why}-${i}`} style={styles.chatItem}>
          <Text style={styles.chatLine}>
            <Text style={styles.chatWho}>{firstName(c.senderId)}</Text>
            <Text style={styles.muted}>{` · ${WHY[c.why]}${c.sentAt ? ` · sent ${relativeTime(c.sentAt)}` : ''}  `}</Text>
            {chatLineWords(c.kind, c.body, c.photos?.length)}
          </Text>
          {c.photos?.length ? (
            <View style={styles.photoRow}>
              {c.photos.map((p, j) => (
                <Pressable key={j} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${j + 1} of ${c.photos!.length}. Open`} onPress={() => onOpenPhotos(c.photos!, j, c.body || undefined)} style={styles.photoThumb}>
                  <ChatPhotoImage photo={p} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  tabs: { paddingBottom: spacing.md },
  wait: { paddingTop: spacing.xxxl, alignItems: 'center' },
  chatWait: { paddingVertical: spacing.lg, alignItems: 'center' },
  card: { gap: spacing.sm, padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // What was reported, as a small tag: the court's own tint, its words dark enough to read on it in every court.
  kind: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  kindText: { ...typography.caption, fontSize: 12, letterSpacing: 0.2, color: colors.textMuted },
  status: { ...typography.smallStrong, color: colors.textMuted, marginLeft: 'auto' },
  target: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  targetPressed: { opacity: 0.75 },
  // What the AI coach wrote: the words alone, nothing to open.
  quote: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumb: { width: 44, height: 55, borderRadius: radius.sm, backgroundColor: colors.border },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.bodyStrong, color: colors.text },
  body: { ...typography.body, color: colors.text },
  muted: { ...typography.small, color: colors.textMuted },
  removedLine: { ...typography.smallStrong, color: colors.danger },
  // One row of compact buttons; Dismiss at its far end.
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingTop: 2 },
  // Pushed to the row's far end, its word on the card's content edge rather than its own padding's.
  dismiss: { marginLeft: 'auto', marginRight: -spacing.md },
  lineGhost: { marginLeft: -spacing.md },
  ghostPad: { paddingHorizontal: spacing.md },
  chatBox: { gap: 6, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  chatLine: { ...typography.small, color: colors.text },
  chatItem: { gap: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoThumb: { width: 64, height: 64, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  lineActions: { flexDirection: 'row' },
  chatWho: { ...typography.smallStrong, color: colors.text },
  chatEvent: { ...typography.small, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },
  showAll: { ...typography.smallStrong, color: colors.brand },
  flagged: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.brandDim },
  // Dark enough on the tint, and on the card, in every court.
  flagText: { ...typography.caption, fontSize: 12, letterSpacing: 0.2, color: colors.textMuted },
});
