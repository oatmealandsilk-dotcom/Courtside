/**
 * CourtSide domain model.
 *
 * Everything in this app is currently backed by in-memory mock data
 * (see src/data/mock/*). These types are written so a real backend
 * (Postgres/Supabase) can be dropped in behind src/data/api.ts without
 * touching the UI layer.
 */

export type ID = string;

/* ----------------------------- Player profile ---------------------------- */

export type SkillSystem = 'NTRP' | 'UTR' | 'ITF';

export type PlayStyle =
  | 'aggressive-baseliner'
  | 'counterpuncher'
  | 'all-court'
  | 'serve-and-volley'
  | 'pusher';

export type Handedness = 'right' | 'left';
export type Backhand = 'one-handed' | 'two-handed';
export type SurfacePreference = 'hard' | 'clay' | 'grass' | 'indoor';

export type FitnessLevel = 'beginner' | 'recreational' | 'competitive' | 'elite';

export interface PlayerGoal {
  id: ID;
  label: string;
  /** ISO date the player wants to hit this by. */
  targetDate?: string;
  done: boolean;
}

export interface Constraint {
  id: ID;
  /** e.g. "Right shoulder", "Only 3 sessions a week", "No gym access" */
  label: string;
  kind: 'injury' | 'schedule' | 'equipment' | 'other';
  /** Free text the coach (human or AI) should respect when planning. */
  note?: string;
  active: boolean;
}

export interface TournamentEntry {
  id: ID;
  name: string;
  /** ISO date. */
  startsAt: string;
  surface: SurfacePreference;
  level: string;
  location: string;
  registered: boolean;
}

export interface PlayerProfile {
  /** Set when the intro quiz was finished, so it is never asked twice — even with every optional step skipped. */
  onboardedAt?: string;
  skillSystem: SkillSystem;
  /** NTRP 1.0–7.0, UTR 1–16, ITF 1–3. Stored as a number for sorting. */
  rating: number;
  playStyle: PlayStyle;
  handedness: Handedness;
  backhand: Backhand;
  fitnessLevel: FitnessLevel;
  preferredSurface: SurfacePreference;
  /** Sessions the player can realistically commit to each week. */
  sessionsPerWeek: number;
  yearsPlaying: number;
  goals: PlayerGoal[];
  constraints: Constraint[];
  tournaments: TournamentEntry[];
}

/* --------------------------------- Users --------------------------------- */

export interface User {
  id: ID;
  handle: string;
  name: string;
  bio: string;
  location: string;
  joinedAt: string;
  /** Deterministic avatar tint; no network images in the mock build. */
  avatarSeed: string;
  avatarUrl?: string;
  readReceiptsEnabled?: boolean;
  /** Only followers see their posts, hits and stats; following needs a request they accept. */
  isPrivate?: boolean;
  isCoach: boolean;
  followers: number;
  following: number;
  profile: PlayerProfile;
  achievementIds: ID[];
  stats: PlayerStats;
}

export interface PlayerStats {
  sessionsLogged: number;
  matchesPlayed: number;
  matchesWon: number;
  hoursOnCourt: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

/* ------------------------------ Achievements ----------------------------- */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Achievement {
  id: ID;
  name: string;
  description: string;
  tier: AchievementTier;
  icon: string;
  /** Human-readable unlock rule; evaluated in src/lib/badges.ts. */
  rule: string;
}

/* ---------------------------------- Feed --------------------------------- */

export type PostKind = 'clip' | 'match' | 'session' | 'note' | 'gear' | 'milestone';

export interface MatchResult {
  opponentName: string;
  /** e.g. ["6-4", "3-6", "7-5"] */
  sets: string[];
  won: boolean;
  surface: SurfacePreference;
}

export interface SessionDetail {
  focus: string;
  minutes: number;
  drills: string[];
  intensity: 1 | 2 | 3 | 4 | 5;
}

/** scale ≥ 1; x and y are the picture's centre offset as fractions of the frame's width and height. */
export interface MediaCrop { scale: number; x: number; y: number }

export interface Post {
  id: ID;
  authorId: ID;
  kind: PostKind;
  createdAt: string;
  body: string;
  /** Placeholder media: rendered as a tinted court card, not a network image. */
  mediaLabel?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** Cover image shown before a clip plays and in every grid tile. */
  thumbnailUrl?: string;
  /** How the clip was shot. Landscape plays letterboxed so nothing is cropped. */
  orientation?: 'portrait' | 'landscape';
  /** A trim, in seconds, honoured at playback rather than cut into the file. */
  trimStart?: number;
  trimEnd?: number;
  /** A zoom and shift applied inside the frame at playback — for cutting black edges out of a recording. */
  crop?: MediaCrop;
  /** Posted without sound. */
  muted?: boolean;
  taggedUserIds?: ID[];
  match?: MatchResult;
  session?: SessionDetail;
  likedBy: ID[];
  commentIds: ID[];
  tags: string[];
  /** Times this has been watched or opened. */
  views?: number;
  /** Times this has been sent to someone or shared out. */
  shares?: number;
  /** Everyone who bookmarked it, so the count is global rather than per-device. */
  savedBy?: ID[];
  /** Put away by its author. Hidden everywhere except their own archive. */
  archived?: boolean;
  /** Pinned by its author: first in their profile grid. */
  pinned?: boolean;
  /** Where it was, in the author's words. */
  location?: string;
  /** When the author last changed it; shown as "Edited". */
  editedAt?: string;
}

/* --------------------------------- Stories ------------------------------- */

/** A moment that lasts a day on the rail, then keeps in the author's archive. */
export interface Story {
  id: ID;
  authorId: ID;
  createdAt: string;
  /** Leaves the rail after this, whether or not anyone archived it. */
  expiresAt: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  /** Placeholder media, same as a post: a tinted court card. */
  mediaLabel?: string;
  caption?: string;
  viewedBy: ID[];
  likedBy: ID[];
  /** Comments on a hit live in the same comment list as post comments, keyed by this id. */
  commentIds: ID[];
  /** Taken down early by the author. Stays in their archive. */
  archived?: boolean;
}

export interface Comment {
  id: ID;
  postId: ID;
  authorId: ID;
  body: string;
  createdAt: string;
  likedBy: ID[];
}

/* ------------------------------- Discussions ----------------------------- */

export type QuestionTopic = 'gear' | 'technique' | 'strategy' | 'injury' | 'fitness' | 'rules' | 'mental';

export interface Question {
  id: ID;
  authorId: ID;
  title: string;
  body: string;
  topic: QuestionTopic;
  createdAt: string;
  tags: string[];
  votes: number;
  votedBy: Record<ID, 1 | -1>;
  answerIds: ID[];
  acceptedAnswerId?: ID;
  views?: number;
  shares?: number;
  savedBy?: ID[];
  /** When the asker last changed it; shown as "Edited". */
  editedAt?: string;
  /**
   * Set when the thread was pulled in from another community rather than
   * posted here. Replies stay on the original site; `replies` is their count.
   */
  source?: ThreadSource;
}

export type ThreadSourceName = 'reddit' | 'tennis-warehouse';

export interface ThreadSource {
  name: ThreadSourceName;
  /** e.g. "r/10s" or "Talk Tennis" */
  label: string;
  url: string;
  author: string;
  replies: number;
}

export interface Answer {
  parentAnswerId?: ID;
  id: ID;
  questionId: ID;
  authorId: ID;
  body: string;
  createdAt: string;
  votes: number;
  votedBy: Record<ID, 1 | -1>;
  /** True when written by a verified coach — surfaces a badge in the UI. */
  fromCoach: boolean;
}

/* --------------------------------- Coaching ------------------------------ */

export type CoachSpecialty =
  | 'serve'
  | 'forehand'
  | 'backhand'
  | 'volleys'
  | 'footwork'
  | 'strategy'
  | 'mental'
  | 'fitness'
  | 'juniors';

export interface CoachService {
  id: ID;
  title: string;
  description: string;
  priceCents: number;
  turnaroundHours: number;
  kind: 'video-review' | 'written-qa' | 'live-session' | 'plan';
}

export interface Coach {
  id: ID;
  userId: ID;
  headline: string;
  credentials: string[];
  specialties: CoachSpecialty[];
  yearsCoaching: number;
  ratingAvg: number;
  ratingCount: number;
  services: CoachService[];
  verified: boolean;
  responseTimeHours: number;
}

/** A before-and-after a coach shows on their page. Numbers are whatever the coach measured. */
export interface CoachResult {
  id: ID;
  coachId: ID;
  /** First name or handle — the client decides how much to show. */
  clientName: string;
  /** "Second serve in", "First-serve speed", "Rally tolerance"… */
  focus: string;
  before: string;
  after: string;
  weeks: number;
  note?: string;
}

export interface CoachReview {
  id: ID;
  coachId: ID;
  authorId: ID;
  /** 1–5 */
  rating: number;
  body: string;
  createdAt: string;
}

export type CoachingRequestStatus = 'draft' | 'submitted' | 'in-review' | 'answered';

export interface CoachingRequest {
  id: ID;
  coachId: ID;
  userId: ID;
  serviceId: ID;
  question: string;
  /** Placeholder for uploaded footage; no real upload in the mock build. */
  videoLabel?: string;
  status: CoachingRequestStatus;
  createdAt: string;
  response?: string;
  respondedAt?: string;
}

/* --------------------------- Health and nutrition ------------------------ */

export type IntegrationProvider =
  | 'cronometer'
  | 'myfitnesspal'
  | 'apple-health'
  | 'whoop'
  | 'garmin'
  | 'strava';

export interface Integration {
  provider: IntegrationProvider;
  label: string;
  category: 'nutrition' | 'wearable' | 'activity';
  connected: boolean;
  lastSyncedAt?: string;
  /** What the AI coach reads from this source once it is wired up. */
  provides: string[];
}

export interface DailyHealth {
  date: string;
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
  restingHeartRate: number;
  hrvMs: number;
  sleepHours: number;
  /** 0–100 composite readiness score, as reported by the wearable. */
  recovery: number;
  steps: number;
}

/* -------------------------------- AI coach ------------------------------- */

export type TrainingBlockKind = 'on-court' | 'fitness' | 'recovery' | 'match-play' | 'mental';

export interface TrainingBlock {
  id: ID;
  title: string;
  kind: TrainingBlockKind;
  minutes: number;
  detail: string[];
  /** Why the AI coach picked this, in plain language. */
  rationale: string;
}

export interface TrainingDay {
  id: ID;
  dayIndex: number;
  label: string;
  blocks: TrainingBlock[];
  /** Empty blocks = deliberate rest day. */
  restDay: boolean;
}

export interface TrainingPlan {
  id: ID;
  generatedAt: string;
  weekOf: string;
  headline: string;
  summary: string;
  focusAreas: string[];
  days: TrainingDay[];
  cautions: string[];
}

export interface AiMessage {
  id: ID;
  role: 'user' | 'coach';
  body: string;
  createdAt: string;
}

/* ------------------------- Ask a coach (open board) ---------------------- */

/**
 * A question addressed to the coaching pool rather than a single coach.
 * Free to post; any verified coach can answer. This is the funnel that turns
 * a struggling player into a paying client.
 */
export interface CoachQuestion {
  id: ID;
  authorId: ID;
  title: string;
  body: string;
  specialty: CoachSpecialty;
  createdAt: string;
  /** Optional clip the player is asking about. */
  videoUrl?: string;
  mediaLabel?: string;
  replyIds: ID[];
  resolved: boolean;
}

export interface CoachReply {
  id: ID;
  questionId: ID;
  coachUserId: ID;
  body: string;
  createdAt: string;
  helpfulBy: ID[];
}

/* --------------------------- Coach applications -------------------------- */

export type CoachApplicationStatus = 'submitted' | 'in-review' | 'approved' | 'rejected';

/** Everything we collect to verify a coach before they can take money. */
export interface CoachApplication {
  id: ID;
  userId: ID;
  fullName: string;
  email: string;
  phone: string;
  /** Highest verified rating the applicant holds. */
  utr?: string;
  ntrp?: string;
  yearsCoaching: number;
  certifications: string;
  /** Résumé / CV, stored as a file label in the mock build. */
  resumeLabel?: string;
  currentClients: string;
  specialties: CoachSpecialty[];
  references: string;
  about: string;
  status: CoachApplicationStatus;
  createdAt: string;
}

/* ---------------------------------- Tips --------------------------------- */

/** A suggestion from an early user; everyone can vote it up or down. */
export interface Tip {
  id: ID;
  authorId: ID;
  body: string;
  createdAt: string;
  votes: number;
  votedBy: Record<ID, 1 | -1>;
}

/* -------------------------------- Messaging ------------------------------ */

export type MessageKind = 'text' | 'post' | 'question' | 'profile';

export interface Message {
  openedAtBy?: Record<ID, string>;
  readAtBy?: Record<ID, string>;
  id: ID;
  conversationId: ID;
  senderId: ID;
  body: string;
  createdAt: string;
  kind: MessageKind;
  /** Set when kind is 'post' or 'question' — the shared item. */
  sharedId?: ID;
  /** One reaction per person, keyed by who left it. */
  reactions?: Record<ID, string>;
}

export interface Conversation {
  id: ID;
  /** Exactly two participants in this build; the shape allows groups later. */
  participantIds: ID[];
  messageIds: ID[];
  updatedAt: string;
  /** Message ids the current user has not opened. */
  unreadCount: number;
}

/* -------------------------------- Payments ------------------------------- */

export type PaymentKind = 'apple-pay' | 'google-pay' | 'paypal' | 'card';

/** A way to pay a coach. No card numbers live here — only a label. */
export interface PaymentMethod {
  id: ID;
  kind: PaymentKind;
  label: string;
  /** "•••• 4242 · exp 09/28" or the account email. */
  detail?: string;
}

/* --------------------------------- Saved --------------------------------- */

export interface SavedItems {
  postIds: ID[];
  questionIds: ID[];
}

/* ------------------------------ Notifications ---------------------------- */

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'answer'
  | 'coach-reply'
  | 'helpful'
  | 'share'
  | 'follow'
  /** Someone tagged you in a post. */
  | 'tag'
  /** Someone asked to follow your private account. Actor is them; accept or decline on the row. */
  | 'follow-request'
  /** A private account said yes to your request. */
  | 'follow-accepted'
  /** Your own post, hit, or question went live. Actor is you. */
  | 'posted';

export type NotificationTarget = 'post' | 'hit' | 'question' | 'coach-question' | 'coach-reply';

export interface Notification {
  id: ID;
  /** Who should see this. */
  userId: ID;
  /** Who caused it. Never the recipient. */
  actorId: ID;
  kind: NotificationKind;
  /** What was acted on, and which screen opens it. */
  targetId: ID;
  targetKind: NotificationTarget;
  createdAt: string;
  read: boolean;
  /** Snippet of the thing, cached so a row reads well on its own. */
  preview?: string;
}

/* ---------------------------------- Auth --------------------------------- */

export interface Session {
  userId: ID;
  onboardingComplete: boolean;
}
