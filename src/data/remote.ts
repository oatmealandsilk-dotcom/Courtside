import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
/**
 * The Supabase side of the API seam.
 *
 * Reads return app types (src/data/types.ts) built from table rows; writes
 * take app types and store rows. src/store/AppContext.tsx updates its own
 * state first and calls these afterwards, so the UI never waits on the
 * network and a failed write only logs. Anything not covered here — the
 * discussions board, coaching, health — still comes from the fixtures.
 */

import { supabase } from '@/lib/supabase';
import type { Answer, CoachQuestion, CoachReply, CoachingRequest, Comment, Conversation, ID, Message, Notification, PaymentMethod, PlayerProfile, PlayerStats, Post, Question, Story, Tip, User, CoachApplication } from './types';

const need = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

/* ------------------------------------------------------------- mappings */

export const emptyProfile: PlayerProfile = {
  skillSystem: 'NTRP',
  rating: 3,
  playStyle: 'all-court',
  handedness: 'right',
  backhand: 'two-handed',
  fitnessLevel: 'recreational',
  preferredSurface: 'hard',
  sessionsPerWeek: 2,
  yearsPlaying: 1,
  goals: [],
  constraints: [],
  tournaments: [],
};

const emptyStats: PlayerStats = {
  sessionsLogged: 0,
  matchesPlayed: 0,
  matchesWon: 0,
  hoursOnCourt: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
};

interface ProfileRow {
  id: string; handle: string; name: string; bio: string; location: string;
  avatar_url: string | null; is_coach: boolean; profile: Partial<PlayerProfile> | null; created_at: string;
  is_private?: boolean | null;
  age_group?: string | null;
  read_receipts?: boolean | null;
}
interface PostRow {
  id: string; author_id: string; kind: Post['kind']; body: string; media_label: string | null;
  image_url: string | null; video_url: string | null; thumbnail_url: string | null;
  match: Post['match'] | null; session: Post['session'] | null; tags: string[]; tagged_user_ids: string[];
  archived: boolean; views: number; shares: number; created_at: string;
  orientation?: string | null;
  trim_start?: number | string | null; trim_end?: number | string | null; muted?: boolean | null; pinned?: boolean | null;
  crop?: { scale: number; x: number; y: number } | null;
  location?: string | null; edited_at?: string | null;
  post_likes?: { user_id: string }[]; post_saves?: { user_id: string }[]; comments?: { id: string }[];
}
interface CommentRow {
  id: string; post_id: string; author_id: string; body: string; created_at: string;
  comment_likes?: { user_id: string }[];
}
interface StoryRow {
  id: string; author_id: string; image_url: string | null; video_url: string | null; thumbnail_url: string | null;
  media_label: string | null; caption: string | null; archived: boolean; created_at: string; expires_at: string;
  story_views?: { user_id: string }[];
  story_likes?: { user_id: string }[];
  story_comments?: { id: string; story_id: string; author_id: string; body: string; created_at: string; story_comment_likes?: { user_id: string }[] }[];
}

const toUser = (row: ProfileRow, followers: number, following: number): User => ({
  id: row.id,
  handle: row.handle,
  name: row.name,
  bio: row.bio ?? '',
  location: row.location ?? '',
  joinedAt: row.created_at,
  avatarSeed: row.id,
  avatarUrl: row.avatar_url ?? undefined,
  isPrivate: row.is_private || undefined,
  ageGroup: row.age_group === 'teen' || row.age_group === 'adult' ? row.age_group : undefined,
  // Off only when its owner turned it off; a database without the setting yet reads as on.
  readReceiptsEnabled: row.read_receipts !== false,
  isCoach: row.is_coach,
  followers,
  following,
  profile: { ...emptyProfile, ...(row.profile ?? {}) },
  achievementIds: [],
  stats: emptyStats,
});

const toPost = (row: PostRow): Post => ({
  id: row.id,
  authorId: row.author_id,
  kind: row.kind,
  createdAt: row.created_at,
  body: row.body,
  mediaLabel: row.media_label ?? undefined,
  imageUrl: row.image_url ?? undefined,
  videoUrl: row.video_url ?? undefined,
  thumbnailUrl: row.thumbnail_url ?? undefined,
  orientation: (row.orientation as 'portrait' | 'landscape' | null) ?? undefined,
  trimStart: row.trim_start != null ? Number(row.trim_start) : undefined,
  trimEnd: row.trim_end != null ? Number(row.trim_end) : undefined,
  muted: row.muted || undefined,
  crop: row.crop && row.crop.scale > 1 ? row.crop : undefined,
  taggedUserIds: row.tagged_user_ids?.length ? row.tagged_user_ids : undefined,
  match: row.match ?? undefined,
  session: row.session ?? undefined,
  likedBy: (row.post_likes ?? []).map((l) => l.user_id),
  commentIds: (row.comments ?? []).map((c) => c.id),
  tags: row.tags ?? [],
  views: row.views,
  shares: row.shares,
  savedBy: (row.post_saves ?? []).map((s) => s.user_id),
  archived: row.archived || undefined,
  pinned: row.pinned || undefined,
  location: row.location ?? undefined,
  editedAt: row.edited_at ?? undefined,
});

const toComment = (row: CommentRow): Comment => ({
  id: row.id,
  postId: row.post_id,
  authorId: row.author_id,
  body: row.body,
  createdAt: row.created_at,
  likedBy: (row.comment_likes ?? []).map((l) => l.user_id),
});

const toStory = (row: StoryRow): Story => ({
  id: row.id,
  authorId: row.author_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  imageUrl: row.image_url ?? undefined,
  videoUrl: row.video_url ?? undefined,
  thumbnailUrl: row.thumbnail_url ?? undefined,
  mediaLabel: row.media_label ?? undefined,
  caption: row.caption ?? undefined,
  viewedBy: (row.story_views ?? []).map((v) => v.user_id),
  likedBy: (row.story_likes ?? []).map((l) => l.user_id),
  commentIds: (row.story_comments ?? []).map((c) => c.id),
  archived: row.archived || undefined,
});

/** A comment on a hit, shaped like any other comment with the hit as its "post". */
const toStoryComment = (row: NonNullable<StoryRow['story_comments']>[number]): Comment => ({
  id: row.id, postId: row.story_id, authorId: row.author_id, body: row.body, createdAt: row.created_at,
  likedBy: (row.story_comment_likes ?? []).map((l) => l.user_id),
});

/* ---------------------------------------------------------------- reads */

export interface RemoteData {
  users: User[];
  posts: Post[];
  comments: Comment[];
  stories: Story[];
  followingIds: ID[];
  /** Every follow between profiles, so any player's lists can be shown. */
  followEdges: { followerId: ID; followingId: ID }[];
  savedPostIds: ID[];
  /** Pending asks to follow a private account, yours and the ones waiting on you. */
  followRequests: { fromId: ID; toId: ID; createdAt: string }[];
  /** Your direct messages; empty until the messages tables exist. */
  conversations: Conversation[];
  messages: Message[];
  /** Discussions, coaching and your own settings; empty until their tables exist. */
  questions: Question[];
  answers: Answer[];
  coachQuestions: CoachQuestion[];
  coachReplies: CoachReply[];
  coachingRequests: CoachingRequest[];
  notifications: Notification[];
  userState: UserState | null;
  tips: Tip[];
  coachApplications: CoachApplication[];
}

interface TipRow { id: string; user_id: string; body: string; created_at: string; votes: number | null; voted_by: Record<string, 1 | -1> | null }
const toTip = (r: TipRow): Tip => ({ id: r.id, authorId: r.user_id, body: r.body, createdAt: r.created_at, votes: r.votes ?? 0, votedBy: r.voted_by ?? {} });

export interface UserState {
  mutedIds: ID[]; blockedIds: ID[]; savedQuestionIds: ID[]; paymentMethods: PaymentMethod[]; defaultPaymentId: ID | null;
  showActivity: boolean; pushLikes: boolean; pushCoach: boolean;
  /** What the coach works around (injuries, schedule, gear): kept in this private row, never on the public profile. Undefined on a database without migration 19. */
  constraints?: PlayerProfile['constraints'];
}

interface QuestionRow { id: string; author_id: string; title: string; body: string; topic: string; tags: string[]; votes: number; voted_by: Record<string, 1 | -1>; accepted_answer_id: string | null; edited_at: string | null; created_at: string }
interface AnswerRow { id: string; question_id: string; author_id: string; parent_answer_id: string | null; body: string; votes: number; voted_by: Record<string, 1 | -1>; from_coach: boolean; created_at: string }
interface CoachQuestionRow { id: string; author_id: string; title: string; body: string; specialty: string; video_url: string | null; media_label: string | null; resolved: boolean; created_at: string }
interface CoachReplyRow { id: string; question_id: string; coach_user_id: string; body: string; helpful_by: string[]; created_at: string }
interface CoachingRequestRow { id: string; coach_id: string; user_id: string; service_id: string; question: string; video_label: string | null; status: string; response: string | null; responded_at: string | null; created_at: string }
interface NotificationRow { id: string; user_id: string; actor_id: string; kind: string; target_id: string; target_kind: string; preview: string | null; read: boolean; created_at: string }
interface UserStateRow { muted_ids: string[]; blocked_ids: string[]; saved_question_ids: string[]; payment_methods: PaymentMethod[]; default_payment_id: string | null; show_activity: boolean; push_likes: boolean; push_coach: boolean; private_profile?: { constraints?: PlayerProfile['constraints'] } | null }

const toQuestion = (r: QuestionRow, answers: AnswerRow[]): Question => ({
  id: r.id, authorId: r.author_id, title: r.title, body: r.body, topic: r.topic as Question['topic'], tags: r.tags ?? [],
  createdAt: r.created_at, votes: r.votes, votedBy: r.voted_by ?? {}, answerIds: answers.filter((a) => a.question_id === r.id).map((a) => a.id),
  acceptedAnswerId: r.accepted_answer_id ?? undefined, editedAt: r.edited_at ?? undefined,
});
const toAnswer = (r: AnswerRow): Answer => ({
  id: r.id, questionId: r.question_id, authorId: r.author_id, parentAnswerId: r.parent_answer_id ?? undefined, body: r.body,
  createdAt: r.created_at, votes: r.votes, votedBy: r.voted_by ?? {}, fromCoach: r.from_coach,
});
const toCoachQuestion = (r: CoachQuestionRow, replies: CoachReplyRow[]): CoachQuestion => ({
  id: r.id, authorId: r.author_id, title: r.title, body: r.body, specialty: r.specialty as CoachQuestion['specialty'], createdAt: r.created_at,
  videoUrl: r.video_url ?? undefined, mediaLabel: r.media_label ?? undefined, resolved: r.resolved,
  replyIds: replies.filter((x) => x.question_id === r.id).map((x) => x.id),
});
const toCoachReply = (r: CoachReplyRow): CoachReply => ({ id: r.id, questionId: r.question_id, coachUserId: r.coach_user_id, body: r.body, createdAt: r.created_at, helpfulBy: r.helpful_by ?? [] });
const toCoachingRequest = (r: CoachingRequestRow): CoachingRequest => ({
  id: r.id, coachId: r.coach_id, userId: r.user_id, serviceId: r.service_id, question: r.question, videoLabel: r.video_label ?? undefined,
  status: r.status as CoachingRequest['status'], createdAt: r.created_at, response: r.response ?? undefined, respondedAt: r.responded_at ?? undefined,
});
const toNotification = (r: NotificationRow): Notification => ({
  id: r.id, userId: r.user_id, actorId: r.actor_id, kind: r.kind as Notification['kind'], targetId: r.target_id, targetKind: r.target_kind as Notification['targetKind'],
  createdAt: r.created_at, read: r.read, preview: r.preview ?? undefined,
});
const toUserState = (r: UserStateRow): UserState => ({
  mutedIds: r.muted_ids ?? [], blockedIds: r.blocked_ids ?? [], savedQuestionIds: r.saved_question_ids ?? [], paymentMethods: r.payment_methods ?? [],
  defaultPaymentId: r.default_payment_id, showActivity: r.show_activity, pushLikes: r.push_likes, pushCoach: r.push_coach,
  constraints: Array.isArray(r.private_profile?.constraints) ? r.private_profile!.constraints : undefined,
});

interface CoachApplicationRow {
  id: string; user_id: string; full_name: string; email: string; phone: string; utr: string | null; ntrp: string | null; utr_link?: string | null; ntrp_link?: string | null;
  years_coaching: number; certifications: string; resume_name: string | null; current_clients: string; specialties: string[] | null;
  reference_contacts: string; about: string; status: string; created_at: string;
}
const toCoachApplication = (r: CoachApplicationRow): CoachApplication => ({
  id: r.id, userId: r.user_id, fullName: r.full_name, email: r.email, phone: r.phone, utr: r.utr ?? undefined, ntrp: r.ntrp ?? undefined,
  utrLink: r.utr_link ?? undefined, ntrpLink: r.ntrp_link ?? undefined,
  yearsCoaching: r.years_coaching, certifications: r.certifications, resumeLabel: r.resume_name ?? undefined, currentClients: r.current_clients,
  specialties: (r.specialties ?? []) as CoachApplication['specialties'], references: r.reference_contacts, about: r.about,
  status: (['submitted', 'in-review', 'approved', 'rejected'].includes(r.status) ? r.status : 'submitted') as CoachApplication['status'], createdAt: r.created_at,
});

interface ConversationRow { id: string; updated_at: string; conversation_members?: { user_id: string; last_read_at: string | null }[]; messages?: MessageRow[] }
interface MessageRow { id: string; conversation_id: string; sender_id: string; body: string; kind: string; shared_id: string | null; reactions: Record<string, string> | null; created_at: string; edited_at?: string | null }

/** Conversations and messages as the app holds them: who has read what comes from each member's last_read_at. */
export function toConversations(me: ID, convRows: ConversationRow[], messageRows: MessageRow[]): { conversations: Conversation[]; messages: Message[] } {
  const readAt = new Map<string, Map<string, string>>();
  for (const c of convRows) readAt.set(c.id, new Map((c.conversation_members ?? []).filter((m) => m.last_read_at).map((m) => [m.user_id, m.last_read_at as string])));
  const messages: Message[] = messageRows.map((row) => {
    const readers = readAt.get(row.conversation_id);
    const readAtBy: Record<string, string> = {};
    if (readers) for (const [user, at] of readers) if (user !== row.sender_id && at >= row.created_at) readAtBy[user] = at;
    return {
      id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at,
      kind: (row.kind as Message['kind']) || 'text', sharedId: row.shared_id ?? undefined,
      reactions: row.reactions && Object.keys(row.reactions).length ? row.reactions : undefined,
      editedAt: row.edited_at ?? undefined,
      readAtBy: Object.keys(readAtBy).length ? readAtBy : undefined,
      openedAtBy: Object.keys(readAtBy).length ? readAtBy : undefined,
    };
  });
  const conversations: Conversation[] = convRows.map((c) => {
    const mine = messages.filter((m) => m.conversationId === c.id);
    const myRead = readAt.get(c.id)?.get(me) ?? '';
    return {
      id: c.id,
      participantIds: (c.conversation_members ?? []).map((m) => m.user_id),
      messageIds: mine.map((m) => m.id),
      updatedAt: c.updated_at,
      unreadCount: mine.filter((m) => m.senderId !== me && m.createdAt > myRead).length,
    };
  });
  return { conversations, messages };
}

/** How many messages of a chat come at a time: on open, and each time you scroll up for more. */
export const MESSAGE_PAGE = 40;

/** Everything the signed-in player needs on open, in four queries. */
export async function fetchRemote(me: ID): Promise<RemoteData> {
  const db = need();
  // Hits are asked for with their likes and comments; on a database that has
  // not had those tables added yet the request is refused, so it falls back
  // to the plain shape rather than taking the whole load down with it — that
  // is what left people re-doing the quiz: their profile never arrived.
  const storiesFull = db.from('stories').select('*, story_views(user_id), story_likes(user_id), story_comments(id, story_id, author_id, body, created_at, story_comment_likes(user_id))').order('created_at', { ascending: false }).limit(40);
  const storiesPlain = () => db.from('stories').select('*, story_views(user_id)').order('created_at', { ascending: false }).limit(40);
  const [profiles, posts, storiesTry, follows, requests, convs, qs, cqs, creqs, notes, ustate, tipRows, hiddenRows, applicationRows] = await Promise.all([
    db.from('profiles').select('*'),
    db.from('posts').select('*, post_likes(user_id), post_saves(user_id), comments(id, post_id, author_id, body, created_at, comment_likes(user_id))').order('created_at', { ascending: false }).limit(60),
    storiesFull,
    db.from('follows').select('follower_id, following_id'),
    // Only the ones that involve you come back; a database without the table yet just gives none.
    db.from('follow_requests').select('requester_id, target_id, created_at'),
    // Direct messages: every chat, each with only its newest messages (older
    // ones load as you scroll up in the chat), the way Instagram does it. A
    // database without the tables yet just gives none.
    db.from('conversations').select('id, updated_at, conversation_members(user_id, last_read_at), messages(*)')
      .order('updated_at', { ascending: false })
      .order('created_at', { referencedTable: 'messages', ascending: false })
      .limit(MESSAGE_PAGE, { referencedTable: 'messages' }),
    // Threads and coach questions, each with its own newest replies (all of
    // them load when the thread is opened), so no app-wide cap cuts replies off.
    db.from('questions').select('*, answers(*)').order('created_at', { ascending: false }).limit(300)
      .order('created_at', { referencedTable: 'answers', ascending: false })
      .limit(100, { referencedTable: 'answers' }),
    db.from('coach_questions').select('*, coach_replies(*)').order('created_at', { ascending: false }).limit(200)
      .order('created_at', { referencedTable: 'coach_replies', ascending: false })
      .limit(100, { referencedTable: 'coach_replies' }),
    db.from('coaching_requests').select('*').order('created_at', { ascending: false }),
    // The last month of notifications, so the screen can show this week and the weeks before it.
    db.from('notifications').select('*').gte('created_at', new Date(Date.now() - 31 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(600),
    db.from('user_state').select('*').eq('user_id', me).maybeSingle(),
    db.from('tips').select('*').order('created_at', { ascending: false }).limit(300),
    // Messages you deleted for yourself; a database without the table yet just gives none.
    db.from('hidden_messages').select('message_id').eq('user_id', me),
    // Your own coach application, so the form can show where it stands.
    db.from('coach_applications').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(3),
  ]);
  if (qs.error) console.warn('[remote] community tables missing; run the pending migrations', qs.error.message);
  const byTime = <T extends { created_at: string }>(a: T, b: T) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
  const questionRows = (qs.data ?? []) as (QuestionRow & { answers?: AnswerRow[] })[];
  const answerRows = questionRows.flatMap((q) => q.answers ?? []).sort(byTime);
  const coachQuestionRows = (cqs.data ?? []) as (CoachQuestionRow & { coach_replies?: CoachReplyRow[] })[];
  const replyRows = coachQuestionRows.flatMap((q) => q.coach_replies ?? []).sort(byTime);
  if (convs.error) console.warn('[remote] messages tables missing; run the pending migrations', convs.error.message);
  const hidden = new Set(((hiddenRows.data ?? []) as { message_id: string }[]).map((r) => r.message_id));
  const convRows = (convs.data ?? []) as ConversationRow[];
  const messageRows = convRows.flatMap((c) => c.messages ?? []).filter((m) => !hidden.has(m.id)).sort(byTime);
  const dm = toConversations(me, convRows, messageRows);
  if (requests.error) console.warn('[remote] follow requests table missing; run the pending migrations', requests.error.message);
  const stories = storiesTry.error ? await storiesPlain() : storiesTry;
  if (storiesTry.error) console.warn('[remote] hit likes/comments tables missing; run the pending migrations', storiesTry.error.message);
  for (const result of [profiles, posts, stories, follows]) if (result.error) throw result.error;

  const edges = (follows.data ?? []) as { follower_id: string; following_id: string }[];
  const followers = new Map<string, number>();
  const following = new Map<string, number>();
  for (const edge of edges) {
    followers.set(edge.following_id, (followers.get(edge.following_id) ?? 0) + 1);
    following.set(edge.follower_id, (following.get(edge.follower_id) ?? 0) + 1);
  }

  const postRows = (posts.data ?? []) as (PostRow & { comments?: CommentRow[] })[];
  const storyRows = (stories.data ?? []) as StoryRow[];
  return {
    users: ((profiles.data ?? []) as ProfileRow[]).map((row) => toUser(row, followers.get(row.id) ?? 0, following.get(row.id) ?? 0)),
    posts: postRows.map(toPost),
    comments: [
      ...postRows.flatMap((row) => (row.comments ?? []).map(toComment)),
      ...storyRows.flatMap((row) => (row.story_comments ?? []).map(toStoryComment)),
    ],
    stories: storyRows.map(toStory),
    followingIds: edges.filter((e) => e.follower_id === me).map((e) => e.following_id),
    followEdges: edges.map((e) => ({ followerId: e.follower_id, followingId: e.following_id })),
    savedPostIds: postRows.filter((row) => (row.post_saves ?? []).some((s) => s.user_id === me)).map((row) => row.id),
    followRequests: ((requests.data ?? []) as { requester_id: string; target_id: string; created_at: string }[]).map((r) => ({ fromId: r.requester_id, toId: r.target_id, createdAt: r.created_at })),
    conversations: dm.conversations,
    messages: dm.messages,
    questions: questionRows.map((r) => toQuestion(r, answerRows)),
    answers: answerRows.map(toAnswer),
    coachQuestions: coachQuestionRows.map((r) => toCoachQuestion(r, replyRows)),
    coachReplies: replyRows.map(toCoachReply),
    coachingRequests: ((creqs.data ?? []) as CoachingRequestRow[]).map(toCoachingRequest),
    notifications: ((notes.data ?? []) as NotificationRow[]).map(toNotification),
    userState: ustate.data ? toUserState(ustate.data as UserStateRow) : null,
    tips: ((tipRows.data ?? []) as TipRow[]).map(toTip),
    coachApplications: ((applicationRows.data ?? []) as CoachApplicationRow[]).map(toCoachApplication),
  };
}

/* --------------------------------------------------------------- writes */

const fail = (what: string) => (error: unknown) => {
  console.warn(`[remote] ${what} failed`, error);
};

export const remote = {
  /* ------------------------ discussions and coaching ------------------------ */

  /** The words of a thread you wrote; the tally is the server's and is left alone. */
  async upsertQuestion(q: Question) {
    const { error } = await need().from('questions').upsert({
      id: q.id, author_id: q.authorId, title: q.title, body: q.body, topic: q.topic, tags: q.tags, accepted_answer_id: q.acceptedAnswerId ?? null,
      edited_at: q.editedAt ?? null, created_at: q.createdAt,
    });
    if (error) fail('thread save')(error);
  },
  async upsertAnswer(a: Answer) {
    const { error } = await need().from('answers').upsert({
      id: a.id, question_id: a.questionId, author_id: a.authorId, parent_answer_id: a.parentAnswerId ?? null, body: a.body, from_coach: a.fromCoach, created_at: a.createdAt,
    });
    if (error) fail('answer save')(error);
  },
  async voteQuestion(questionId: ID, dir: 1 | -1) { const { error } = await need().rpc('vote_question', { q: questionId, dir }); if (error) fail('vote')(error); },
  async voteAnswer(answerId: ID, dir: 1 | -1) { const { error } = await need().rpc('vote_answer', { a: answerId, dir }); if (error) fail('vote')(error); },
  async upsertCoachQuestion(q: CoachQuestion) {
    const { error } = await need().from('coach_questions').upsert({
      id: q.id, author_id: q.authorId, title: q.title, body: q.body, specialty: q.specialty, video_url: q.videoUrl ?? null, media_label: q.mediaLabel ?? null, resolved: q.resolved, created_at: q.createdAt,
    });
    if (error) fail('coach question save')(error);
  },
  async insertCoachReply(r: CoachReply) {
    const { error } = await need().from('coach_replies').upsert({ id: r.id, question_id: r.questionId, coach_user_id: r.coachUserId, body: r.body, created_at: r.createdAt });
    if (error) fail('coach reply save')(error);
  },
  async toggleReplyHelpful(replyId: ID) { const { error } = await need().rpc('toggle_reply_helpful', { r: replyId }); if (error) fail('helpful')(error); },
  async insertCoachingRequest(r: CoachingRequest) {
    const { error } = await need().from('coaching_requests').upsert({
      id: r.id, coach_id: r.coachId, user_id: r.userId, service_id: r.serviceId, question: r.question, video_label: r.videoLabel ?? null, status: r.status, created_at: r.createdAt,
    });
    if (error) fail('coaching request save')(error);
  },
  async markNotificationsRead(ids: ID[]) {
    if (!ids.length) return;
    const { error } = await need().from('notifications').update({ read: true }).in('id', ids);
    if (error) fail('notification read')(error);
  },
  async insertReport(me: ID, targetUserId: ID | null, target: string, reason: string) {
    const { error } = await need().from('reports').insert({ reporter_id: me, target_user_id: targetUserId, target, reason });
    if (error) fail('report')(error);
  },
  async saveUserState(me: ID, s: UserState) {
    const { error } = await need().from('user_state').upsert({
      user_id: me, muted_ids: s.mutedIds, blocked_ids: s.blockedIds, saved_question_ids: s.savedQuestionIds, payment_methods: s.paymentMethods,
      default_payment_id: s.defaultPaymentId, show_activity: s.showActivity, push_likes: s.pushLikes, push_coach: s.pushCoach, updated_at: new Date().toISOString(),
    });
    if (error) fail('settings save')(error);
  },

  /* ------------------------------ messages ------------------------------ */

  /** The 1:1 you already have with someone, or a new one under the id the app chose. Returns the id that stands. */
  async openConversation(other: ID, wanted: ID): Promise<ID | null> {
    const { data, error } = await need().rpc('open_conversation', { other, wanted });
    // A teen who does not follow you cannot be sent a new chat: null says so.
    if (error && /teen_closed/.test(error.message)) return null;
    if (error) { fail('open conversation')(error); return wanted; }
    return (data as string) || wanted;
  },

  async insertMessage(message: Message) {
    const { error } = await need().from('messages').insert({
      id: message.id, conversation_id: message.conversationId, sender_id: message.senderId, body: message.body,
      kind: message.kind, shared_id: message.sharedId ?? null, created_at: message.createdAt,
    });
    if (error) fail('message send')(error);
  },

  async markConversationRead(conversationId: ID, me: ID) {
    const { error } = await need().from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', me);
    if (error) fail('mark read')(error);
  },

  /**
   * Records your date of birth (the first time only) and returns the account
   * type it makes: 'teen' or 'adult', 'under_13' when it is too young for an
   * account, or null when the database cannot say (its age check not added yet).
   */
  async setBirthDate(dob: string): Promise<'teen' | 'adult' | 'under_13' | null> {
    const { data, error } = await need().rpc('set_birth_date', { dob });
    if (error) {
      if (/under_13/.test(error.message)) return 'under_13';
      fail('birth date')(error);
      return null;
    }
    return data === 'teen' ? 'teen' : 'adult';
  },

  /**
   * Files a coach application. The résumé, if one is attached, goes first to
   * the private coach-applications shelf, in the applicant's own folder.
   * Throws with a readable message if either step fails.
   */
  async submitCoachApplication(me: ID, application: CoachApplication, resume?: { uri: string; name: string; mimeType?: string }) {
    const db = need();
    let resumePath: string | null = null;
    if (resume) {
      const bytes = await (await fetch(resume.uri)).arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('That résumé is over 10 MB. Attach a smaller PDF or Word file.');
      const safeName = resume.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'resume.pdf';
      resumePath = `${me}/${Date.now().toString(36)}-${safeName}`;
      const { error } = await db.storage.from('coach-applications').upload(resumePath, bytes, { contentType: resume.mimeType || 'application/pdf', upsert: false });
      if (error) throw new Error(`The résumé did not upload: ${error.message}`);
    }
    const { error } = await db.from('coach_applications').insert({
      id: application.id, user_id: me, full_name: application.fullName, email: application.email, phone: application.phone,
      utr: application.utr ?? null, ntrp: application.ntrp ?? null, years_coaching: application.yearsCoaching,
      utr_link: application.utrLink ?? null, ntrp_link: application.ntrpLink ?? null,
      certifications: application.certifications, resume_path: resumePath, resume_name: resume?.name ?? null,
      current_clients: application.currentClients, specialties: application.specialties, reference_contacts: application.references,
      about: application.about, status: 'submitted',
    });
    if (error) throw new Error(/relation|schema cache/i.test(error.message) ? 'Applications are not switched on yet. Try again soon.' : error.message);
  },

  /** New words for a message of yours; the database stamps it as edited. */
  async editMessage(messageId: ID, body: string) {
    const { error } = await need().from('messages').update({ body }).eq('id', messageId);
    if (error) fail('message edit')(error);
  },

  /** Unsend: gone for everyone in the chat. */
  async unsendMessage(messageId: ID) {
    const { error } = await need().from('messages').delete().eq('id', messageId);
    if (error) fail('message unsend')(error);
  },

  /** Delete for yourself: hidden from your view only. */
  async hideMessage(me: ID, messageId: ID) {
    const { error } = await need().from('hidden_messages').insert({ user_id: me, message_id: messageId });
    if (error) fail('message delete')(error);
  },

  async setMessageReactions(messageId: ID, reactions: Record<string, string>) {
    const { error } = await need().from('messages').update({ reactions }).eq('id', messageId);
    if (error) fail('message reaction')(error);
  },

  /** One conversation with its messages — for one that just started on another phone. */
  async fetchConversation(me: ID, conversationId: ID): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    const db = need();
    const [conv, msgs] = await Promise.all([
      db.from('conversations').select('id, updated_at, conversation_members(user_id, last_read_at)').eq('id', conversationId).maybeSingle(),
      db.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(MESSAGE_PAGE),
    ]);
    if (conv.error || msgs.error || !conv.data) return null;
    const dm = toConversations(me, [conv.data as ConversationRow], ((msgs.data ?? []) as MessageRow[]).reverse());
    return dm.conversations[0] ? { conversation: dm.conversations[0], messages: dm.messages } : null;
  },

  /**
   * The page of messages just before `before` in one chat, oldest first, for
   * scrolling up. `more` says whether there are older ones still.
   */
  async fetchOlderMessages(me: ID, conversationId: ID, before: string): Promise<{ messages: Message[]; more: boolean } | null> {
    const db = need();
    const [members, msgs, hiddenRows] = await Promise.all([
      db.from('conversation_members').select('user_id, last_read_at').eq('conversation_id', conversationId),
      db.from('messages').select('*').eq('conversation_id', conversationId).lt('created_at', before).order('created_at', { ascending: false }).limit(MESSAGE_PAGE),
      db.from('hidden_messages').select('message_id').eq('user_id', me),
    ]);
    if (msgs.error) { fail('older messages')(msgs.error); return null; }
    const rows = (msgs.data ?? []) as MessageRow[];
    const hidden = new Set(((hiddenRows.data ?? []) as { message_id: string }[]).map((r) => r.message_id));
    const conv: ConversationRow = { id: conversationId, updated_at: before, conversation_members: (members.data ?? []) as ConversationRow['conversation_members'] };
    const dm = toConversations(me, [conv], rows.filter((m) => !hidden.has(m.id)).reverse());
    return { messages: dm.messages, more: rows.length === MESSAGE_PAGE };
  },

  /** Every reply in one thread, oldest first: the whole conversation when it is opened. */
  async fetchThreadAnswers(questionId: ID): Promise<Answer[] | null> {
    const { data, error } = await need().from('answers').select('*').eq('question_id', questionId).order('created_at', { ascending: true }).limit(1000);
    if (error) { fail('thread replies')(error); return null; }
    return ((data ?? []) as AnswerRow[]).map(toAnswer);
  },

  /**
   * Live changes to messages in the conversations you are in: new ones, ones
   * edited or reacted to, and ones their sender unsent. Returns the unsubscribe.
   */
  /** Live: someone in one of your chats has read up to a moment. Returns the unsubscribe. */
  onReads(handle: (conversationId: ID, userId: ID, readAt: string) => void): () => void {
    const db = need();
    const channel = db.channel('reads-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, (payload) => {
        const row = payload.new as { conversation_id?: string; user_id?: string; last_read_at?: string | null };
        if (row.conversation_id && row.user_id && row.last_read_at) handle(row.conversation_id, row.user_id, row.last_read_at);
      })
      .subscribe();
    return () => { void db.removeChannel(channel); };
  },

  onMessages(handle: { added: (message: Message) => void; changed: (message: Message) => void; removed: (messageId: ID) => void }): () => void {
    const db = need();
    const one = (row: MessageRow) => toConversations('', [{ id: row.conversation_id, updated_at: row.created_at }], [row]).messages[0];
    const channel = db.channel('messages-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => handle.added(one(payload.new as MessageRow)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => handle.changed(one(payload.new as MessageRow)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) handle.removed(id);
      })
      .subscribe();
    return () => { void db.removeChannel(channel); };
  },

  async insertTip(tip: Tip) {
    const { error } = await need().from('tips').insert({ id: tip.id, user_id: tip.authorId, body: tip.body, created_at: tip.createdAt });
    if (error) fail('tip')(error);
  },
  async voteTip(tipId: ID, dir: 1 | -1) { const { error } = await need().rpc('vote_tip', { t: tipId, dir }); if (error) fail('tip vote')(error); },

  async updateProfile(me: ID, patch: { name?: string; bio?: string; location?: string; avatarUrl?: string; profile?: PlayerProfile; isPrivate?: boolean; readReceipts?: boolean }) {
    const row: Record<string, unknown> = {};
    if (patch.readReceipts !== undefined) row.read_receipts = patch.readReceipts;
    if (patch.isPrivate !== undefined) row.is_private = patch.isPrivate;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.bio !== undefined) row.bio = patch.bio;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.profile !== undefined) row.profile = patch.profile;
    const { error } = await need().from('profiles').update(row).eq('id', me);
    if (error) fail('profile update')(error);
  },

  /**
   * Makes sure the account has a profile row. The sign-up trigger normally
   * creates it; when it has not (seen with a Google sign-up), everything the
   * app saves about you would fail silently, quiz included.
   */
  async ensureProfile(me: ID, handle: string, name: string) {
    const { error } = await need().from('profiles').upsert({ id: me, handle, name }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) fail('profile create')(error);
  },

  async insertPost(post: Post) {
    const row = {
      id: post.id,
      author_id: post.authorId,
      kind: post.kind,
      body: post.body,
      media_label: post.mediaLabel ?? null,
      image_url: post.imageUrl ?? null,
      video_url: post.videoUrl ?? null,
      thumbnail_url: post.thumbnailUrl ?? null,
      orientation: post.orientation ?? null,
      // Only sent when set, so a plain post still saves on a database that
      // has not had the trim columns added yet.
      match: post.match ?? null,
      session: post.session ?? null,
      tags: post.tags,
      tagged_user_ids: post.taggedUserIds ?? [],
      created_at: post.createdAt,
    };
    const trim = {
      ...(post.trimStart !== undefined ? { trim_start: post.trimStart, trim_end: post.trimEnd ?? null } : {}),
      ...(post.muted ? { muted: true } : {}),
      ...(post.crop ? { crop: post.crop } : {}),
      ...(post.location ? { location: post.location } : {}),
    };
    const { error } = await need().from('posts').insert({ ...row, ...trim });
    if (!error) return;
    // The trim columns arrive with a migration; until it has run, save the
    // post without them rather than losing it. The clip plays untrimmed.
    if (Object.keys(trim).length && /trim_|muted|crop|location/.test(error.message)) {
      console.warn('[remote] trim columns missing; run the pending migration — saving the post untrimmed');
      const retry = await need().from('posts').insert(row);
      if (retry.error) fail('post insert')(retry.error);
      return;
    }
    fail('post insert')(error);
  },

  async deletePost(postId: ID) {
    const { error } = await need().from('posts').delete().eq('id', postId);
    if (error) fail('delete post')(error);
  },
  async setPostArchived(postId: ID, archived: boolean) {
    const { error } = await need().from('posts').update({ archived }).eq('id', postId);
    if (error) fail('post archive')(error);
  },
  /** The author's edit: words, tags, who is in it, where it was — and when. */
  async updatePost(postId: ID, patch: { body: string; tags: string[]; taggedUserIds: ID[]; location?: string; editedAt: string }) {
    const base = { body: patch.body, tags: patch.tags, tagged_user_ids: patch.taggedUserIds };
    const { error } = await need().from('posts').update({ ...base, location: patch.location ?? null, edited_at: patch.editedAt }).eq('id', postId);
    if (!error) return;
    if (/location|edited_at/.test(error.message)) {
      console.warn('[remote] edit columns missing; run the pending migration — saving the words only');
      const retry = await need().from('posts').update(base).eq('id', postId);
      if (retry.error) fail('post edit')(retry.error);
      return;
    }
    fail('post edit')(error);
  },
  async setPostPinned(postId: ID, pinned: boolean) {
    const { error } = await need().from('posts').update({ pinned }).eq('id', postId);
    if (error) fail('post pin')(error);
  },

  async setLike(postId: ID, me: ID, liked: boolean) {
    const db = need();
    const { error } = liked
      ? await db.from('post_likes').upsert({ post_id: postId, user_id: me })
      : await db.from('post_likes').delete().match({ post_id: postId, user_id: me });
    if (error) fail('like')(error);
  },

  async setSaved(postId: ID, me: ID, saved: boolean) {
    const db = need();
    const { error } = saved
      ? await db.from('post_saves').upsert({ post_id: postId, user_id: me })
      : await db.from('post_saves').delete().match({ post_id: postId, user_id: me });
    if (error) fail('save')(error);
  },

  async insertComment(comment: Comment) {
    const { error } = await need().from('comments').insert({
      id: comment.id, post_id: comment.postId, author_id: comment.authorId, body: comment.body, created_at: comment.createdAt,
    });
    if (error) fail('comment insert')(error);
  },

  async insertStory(story: Story) {
    const { error } = await need().from('stories').insert({
      id: story.id,
      author_id: story.authorId,
      image_url: story.imageUrl ?? null,
      video_url: story.videoUrl ?? null,
      thumbnail_url: story.thumbnailUrl ?? null,
      media_label: story.mediaLabel ?? null,
      caption: story.caption ?? null,
      created_at: story.createdAt,
      expires_at: story.expiresAt,
    });
    if (error) fail('story insert')(error);
  },

  async setStoryArchived(storyId: ID, archived: boolean) {
    const { error } = await need().from('stories').update({ archived }).eq('id', storyId);
    if (error) fail('story archive')(error);
  },

  async setStoryLike(storyId: ID, me: ID, liked: boolean) {
    const db = need();
    const { error } = liked
      ? await db.from('story_likes').upsert({ story_id: storyId, user_id: me })
      : await db.from('story_likes').delete().match({ story_id: storyId, user_id: me });
    if (error) fail('hit like')(error);
  },

  /** A heart on a comment; `onHit` picks the table, since hit comments live apart. */
  async setCommentLike(commentId: ID, me: ID, liked: boolean, onHit: boolean) {
    const db = need();
    const table = onHit ? 'story_comment_likes' : 'comment_likes';
    const { error } = liked
      ? await db.from(table).upsert({ comment_id: commentId, user_id: me })
      : await db.from(table).delete().match({ comment_id: commentId, user_id: me });
    if (error) fail('comment like')(error);
  },

  async insertStoryComment(comment: Comment) {
    const { error } = await need().from('story_comments').insert({
      id: comment.id, story_id: comment.postId, author_id: comment.authorId, body: comment.body, created_at: comment.createdAt,
    });
    if (error) fail('hit comment insert')(error);
  },

  async recordStoryView(storyId: ID, me: ID) {
    const { error } = await need().from('story_views').upsert({ story_id: storyId, user_id: me });
    if (error) fail('story view')(error);
  },

  /** Asking to follow a private account, and what happens to the ask. */
  async sendFollowRequest(me: ID, userId: ID) {
    const { error } = await need().from('follow_requests').upsert({ requester_id: me, target_id: userId });
    if (error) fail('follow request')(error);
  },
  async cancelFollowRequest(me: ID, userId: ID) {
    const { error } = await need().from('follow_requests').delete().match({ requester_id: me, target_id: userId });
    if (error) fail('cancel follow request')(error);
  },
  /** The server adds the follow and clears the ask in one go, as the account being followed. */
  async acceptFollowRequest(requesterId: ID) {
    const { error } = await need().rpc('accept_follow_request', { requester: requesterId });
    if (error) fail('accept follow request')(error);
  },
  async declineFollowRequest(me: ID, requesterId: ID) {
    const { error } = await need().from('follow_requests').delete().match({ requester_id: requesterId, target_id: me });
    if (error) fail('decline follow request')(error);
  },
  async updatePostThumbnail(postId: ID, thumbnailUrl: string) {
    const { error } = await need().from('posts').update({ thumbnail_url: thumbnailUrl }).eq('id', postId);
    if (error) fail('post thumbnail')(error);
  },

  async setFollow(me: ID, userId: ID, following: boolean) {
    const db = need();
    const { error } = following
      ? await db.from('follows').upsert({ follower_id: me, following_id: userId })
      : await db.from('follows').delete().match({ follower_id: me, following_id: userId });
    if (error) fail('follow')(error);
  },

  async bumpViews(postId: ID) {
    const { error } = await need().rpc('bump_post_views', { post: postId });
    if (error) fail('view count')(error);
  },
};

/* ------------------------------------------------------------ feed signals */

/**
 * What someone did with a post in the feed, for a smarter feed later: they
 * saw it, how long it was on screen, whether they swiped past it within a
 * second and a half, and whether they tapped through to its author.
 */
export interface FeedSignal {
  kind: 'post' | 'hit' | 'question';
  id: ID;
  seen?: boolean;
  watched?: number;
  skipped?: boolean;
  profileTap?: boolean;
}

// Signals wait here and go up together every few seconds (or as the app goes
// to the background), so a fast scroll is one small request, not dozens.
let pendingSignals: FeedSignal[] = [];
let signalTimer: ReturnType<typeof setTimeout> | null = null;
async function flushSignals() {
  if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  if (!pendingSignals.length || !supabase) return;
  const items = pendingSignals.splice(0, 60).map((sg) => ({ ...sg, watched: sg.watched ? Math.round(sg.watched * 10) / 10 : 0 }));
  const { error } = await supabase.rpc('record_feed_signals', { items });
  // A database without migration 20 simply refuses; nothing to retry.
  if (error && !/function|schema cache/i.test(error.message)) fail('feed signals')(error);
  if (pendingSignals.length) signalTimer = setTimeout(() => { void flushSignals(); }, 8000);
}
export function queueFeedSignal(signal: FeedSignal) {
  pendingSignals.push(signal);
  if (pendingSignals.length >= 40) { void flushSignals(); return; }
  if (!signalTimer) signalTimer = setTimeout(() => { void flushSignals(); }, 8000);
}
AppState.addEventListener('change', (next) => { if (next !== 'active') void flushSignals(); });

/* --------------------------------------------------------------- media */

/** A picker result still on the device, as opposed to something already hosted. */
export const isLocalMedia = (uri?: string) =>
  !!uri && /^(file:|content:|blob:|data:|ph:|assets-library:)/.test(uri);

/**
 * Copies a picked photo or video into the media bucket under the player's
 * folder and returns its public URL. Falls back to the original URI on
 * failure so the local post still shows.
 */
const ALLOWED_MEDIA = /^(image|video)\/[a-z0-9.+-]+$/i;

/** The file's type from its name, for a file the phone hands over without one. */
function guessType(uri: string, kind: 'photo' | 'video'): string {
  const ext = (uri.split('?')[0].split('.').pop() || '').toLowerCase();
  const known: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  return known[ext] ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');
}

/**
 * Sends one file to the bucket with a running report of how much has gone
 * (the posting strip's percentage). Supabase's own upload call gives no
 * progress, so this talks to the storage address directly; if that is
 * refused for any reason, the plain upload runs instead, and the bar simply
 * jumps to the end.
 */
async function uploadWithProgress(path: string, uri: string, contentType: string, onProgress?: (fraction: number) => void): Promise<void> {
  const db = need();
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apikey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  const token = (await db.auth.getSession()).data.session?.access_token;
  if (!base || !apikey || !token || typeof XMLHttpRequest === 'undefined') throw new Error('no direct upload');
  const form = new FormData();
  const name = path.split('/').pop() ?? 'upload';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('', blob, name);
  } else {
    // The phone streams the file from disk itself — no copy into memory.
    form.append('', { uri, name, type: contentType } as unknown as Blob);
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/storage/v1/object/media/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', apikey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}: ${xhr.responseText.slice(0, 200)}`)));
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.send(form);
  });
}

/** The bucket's limit, which is also the most Supabase's free plan accepts per file. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Sends a picked file to the bucket and returns its public address. Throws
 * with a plain-words message if it cannot — a post must never be saved
 * pointing at a file that only exists on one phone.
 */
export async function uploadMedia(me: ID, uri: string, kind: 'photo' | 'video', onProgress?: (fraction: number) => void): Promise<string> {
  try {
    const db = need();
    // Too big is the usual reason an upload fails, and it is worth saying
    // before the bytes go up rather than after.
    const size = await fetch(uri).then((r) => r.blob()).then((b) => b.size).catch(() => 0);
    if (size > MAX_UPLOAD_BYTES) {
      const mb = Math.round(size / 1024 / 1024);
      throw new Error(`This ${kind} is ${mb} MB; the limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Trim it shorter in the editor.`);
    }
    const contentType = Platform.OS === 'web'
      ? ((await fetch(uri, { method: 'HEAD' }).catch(() => null))?.headers.get('content-type') || guessType(uri, kind)).split(';')[0].trim()
      : guessType(uri, kind);
    // The bucket enforces the same list; checking here gives a readable message.
    if (!ALLOWED_MEDIA.test(contentType)) throw new Error('Only photos and videos can be posted.');
    const ext = contentType.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg');
    const path = `${me}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    try {
      await uploadWithProgress(path, uri, contentType, onProgress);
    } catch (direct) {
      console.warn('[remote] direct upload fell back', direct);
      const response = await fetch(uri);
      const bytes = await response.arrayBuffer();
      const { error } = await db.storage.from('media').upload(path, bytes, { contentType, upsert: false });
      if (error) throw error;
    }
    onProgress?.(1);
    return db.storage.from('media').getPublicUrl(path).data.publicUrl;
  } catch (error) {
    fail('media upload')(error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(/exceeded the maximum allowed size/i.test(message) ? `This ${kind} is over the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit. Trim it shorter in the editor.` : message);
  }
}

/* ---------------------------------------------------------------- auth */

/**
 * Where Google sends the phone back to. Supabase refuses any return address
 * whose host is an IP address other than 127.0.0.1, and Expo Go's own address
 * is the Mac's Wi-Fi IP — so on iPhone the app's scheme is used instead. The
 * sign-in sheet catches that address itself, whether or not the phone has an
 * app registered for it, which is why it works in Expo Go too.
 */
function nativeReturnAddress() {
  if (Platform.OS === 'ios') return 'courtside://auth';
  return Linking.createURL('/');
}

export const auth = {
  async signIn(email: string, password: string) {
    const { data, error } = await need().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    return data.session;
  },
  async signUp(email: string, password: string, name: string, handle: string) {
    const { data, error } = await need().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim(), handle: handle.trim().toLowerCase() } },
    });
    if (error) throw new Error(error.message);
    // With email confirmation on, there is no session yet; the screen says so.
    return data.session;
  },
  async signOut() {
    // Local only: the account's other logins, and its saved token on this
    // device, stay valid so switching back is a tap.
    const { error } = await need().auth.signOut({ scope: 'local' });
    if (error) fail('sign out')(error);
  },
  /** Signs in as a remembered account from its refresh token, replacing whoever is signed in now. */
  async resumeAccount(refreshToken: string) {
    const client = need();
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new Error(error?.message ?? 'That login has expired. Sign in again.');
    return data.session;
  },
  /**
   * Google, through Supabase. On the web the whole page goes to Google and
   * comes back to the app, where the client picks the session out of the URL
   * on its own. On a phone the page cannot leave, so an in-app browser opens
   * instead and the session is read out of the URL it hands back.
   */
  async signInWithGoogle() {
    const client = need();
    if (Platform.OS === 'web') {
      const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${base}/` },
      });
      if (error) throw new Error(error.message);
      return null;
    }
    const redirectTo = nativeReturnAddress();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw new Error(error.message);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null;
    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.search.slice(1));
    const code = url.searchParams.get('code');
    if (code) {
      const exchanged = await client.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw new Error(exchanged.error.message);
      return exchanged.data.session;
    }
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) throw new Error(params.get('error_description') ?? 'Google did not return a session.');
    const set = await client.auth.setSession({ access_token, refresh_token });
    if (set.error) throw new Error(set.error.message);
    return set.data.session;
  },

  /* ------------------------------------------------------- account centre */

  /** Who is signed in, as the auth system sees them: email, sign-in methods, since when. */
  async account() {
    const { data, error } = await need().auth.getUser();
    if (error || !data.user) throw new Error(error?.message ?? 'Not signed in');
    const providers = (data.user.identities ?? []).map((i) => i.provider);
    return {
      email: data.user.email ?? '',
      providers,
      createdAt: data.user.created_at,
      lastSignInAt: data.user.last_sign_in_at ?? null,
      emailConfirmed: Boolean(data.user.email_confirmed_at),
    };
  },
  /** Sends the "set a new password" email. The link signs them in on the site, where the account page takes the new password. */
  async requestPasswordReset(email: string) {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const redirectTo = Platform.OS === 'web' ? `${window.location.origin}${base}/account?reset=1` : 'https://oatmealandsilk-dotcom.github.io/Courtside/account?reset=1';
    const { error } = await need().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw new Error(error.message);
  },
  async updatePassword(password: string) {
    const { error } = await need().auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },
  /** Supabase emails both addresses; the change lands when the new one is confirmed. */
  async updateEmail(email: string) {
    const { error } = await need().auth.updateUser({ email: email.trim() });
    if (error) throw new Error(error.message);
  },
  async signOutEverywhere() {
    const { error } = await need().auth.signOut({ scope: 'global' });
    if (error) throw new Error(error.message);
  },
  /** Adds Google as a second way into an email account. Needs "manual linking" on in Supabase. */
  async linkGoogle() {
    const client = need();
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const redirectTo = Platform.OS === 'web' ? `${window.location.origin}${base}/account` : nativeReturnAddress();
    const { data, error } = await client.auth.linkIdentity({ provider: 'google', options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' } });
    if (error) throw new Error(error.message);
    if (Platform.OS !== 'web' && data.url) await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  },
  async deleteAccount() {
    const { data, error } = await need().functions.invoke<{ ok?: boolean; error?: string }>('delete-account', { body: {} });
    if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Could not delete the account.');
    await need().auth.signOut();
  },
};
