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

export type PostKind = 'reel' | 'match' | 'session' | 'note' | 'gear' | 'milestone';

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
  taggedUserIds?: ID[];
  match?: MatchResult;
  session?: SessionDetail;
  likedBy: ID[];
  commentIds: ID[];
  tags: string[];
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

/* --------------------------------- Saved --------------------------------- */

export interface SavedItems {
  postIds: ID[];
  questionIds: ID[];
}

/* ---------------------------------- Auth --------------------------------- */

export interface Session {
  userId: ID;
  onboardingComplete: boolean;
}
