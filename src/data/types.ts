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
  /** Sessions the player can realistically commit to each week. Missing when they haven't said. */
  sessionsPerWeek?: number;
  /** Missing when they haven't said: a skipped answer is never filled in for them. */
  yearsPlaying?: number;
  goals: PlayerGoal[];
  /** What is in the bag, in the player's own words. Every part optional; nothing shown until something is filled in. */
  gear?: { racket?: string; strings?: string; tension?: string; shoes?: string };
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
  /** Where the profile's city is (migration 49), when it was picked from the search. */
  cityAt?: { lat: number; lng: number };
  joinedAt: string;
  /** Deterministic avatar tint; no network images in the mock build. */
  avatarSeed: string;
  avatarUrl?: string;
  readReceiptsEnabled?: boolean;
  /** Only followers see their posts, hits and stats; following needs a request they accept. */
  isPrivate?: boolean;
  /** Up for a hit: shown as a green ring on the map until this moment (the end of the day they set it). */
  openToHitUntil?: string;
  /** When the handle last changed; it can change again 30 days after. */
  handleChangedAt?: string;
  /** From the age check: a teen account (13 to 17) or an adult one. The date of birth itself is never shown. */
  ageGroup?: 'teen' | 'adult';
  isCoach: boolean;
  /** Reviews reports. Set only from Supabase. */
  isAdmin?: boolean;
  /** Suspended by an admin: cannot post, comment, reply or message. */
  suspended?: boolean;
  followers: number;
  following: number;
  profile: PlayerProfile;
  achievementIds: ID[];
  stats: PlayerStats;
}

/** One session you logged: what kind, how long, and for a match whether you won. Private to you. */
export interface PracticeSession {
  id: ID;
  userId: ID;
  /** The calendar day it was played, in your own time zone (YYYY-MM-DD). */
  day: string;
  minutes: number;
  kind: 'practice' | 'match' | 'drills' | 'fitness';
  won?: boolean;
  opponent?: string;
  /** A few words of your own. A session logged from a hit keeps where it was here ("At Alder Park · with Mira"). */
  note?: string;
  /** The tracker session this was logged from (migration 58). */
  activityId?: ID;
  /**
   * What a fitness session logged from a workout was, as its short name
   * ('run', 'strength'; see features/activity/workouts.ts), so it can still
   * say "Run" after the workout's own record goes at 30 days (migration 107,
   * column workout). Absent on tennis and on anything logged by hand.
   */
  workout?: string;
  /**
   * When you accepted a tag with "Add to my sessions": the tagger's session
   * this copy came from (migration 62, column from_session_id). Accepting the
   * same session again finds this copy instead of making a second one.
   */
  fromSessionId?: ID;
  /**
   * A match's score from your side of the net (migration 91, Oct 4): one
   * [your games, their games] per set, a match tiebreak counting as a set
   * (6-4 3-6 10-7 is [[6,4],[3,6],[10,7]]). Only on a match. When one side
   * took more sets, `won` follows it (the server makes sure). Private to you,
   * like the rest of your log; a player tagged on it reads it from their side.
   */
  sets?: MatchSet[];
  createdAt: string;
}

/** One set of a match: [your games, their games]. */
export type MatchSet = [number, number];

/**
 * Your record against one player (head_to_head, migration 91): only matches
 * with a score where you were across the net from each other, one of you
 * logged it and the other accepted the tag. `last` is the newest, your side.
 */
export interface HeadToHead {
  userId: ID;
  wins: number;
  losses: number;
  last?: { sessionId: ID; day: string; won: boolean; sets: MatchSet[] };
}

/* ------------------------------ Session tags ----------------------------- */

/** In a match: an opponent or a doubles partner. Everyone tagged on a practice is a 'partner' ("with"). */
export type SessionTagRole = 'opponent' | 'partner';

/**
 * Waiting for the tagged person; they said yes (public on posts); they said
 * no (they can still change their mind); they took an accepted tag back off
 * ('removed': final, they cannot put their name back by themselves).
 */
export type SessionTagStatus = 'pending' | 'accepted' | 'declined' | 'removed';

/**
 * Someone tagged in a session from a player's own log (migration 62), as
 * my_session_tags() returns it: every tag you made and every tag of you.
 * Only the tagger and the tagged person ever see one. The session's kind,
 * day and length come with it so the tagged person can see what they are
 * accepting; the tagger's notes, place and free-text opponent never do.
 */
export interface SessionTag {
  id: ID;
  /** The tagger's session. The tagged person cannot open it; these fields are all they get. */
  sessionId: ID;
  taggerId: ID;
  taggedId: ID;
  role: SessionTagRole;
  status: SessionTagStatus;
  /**
   * The tagger took a no (or a removal) off their own log. The tag stays on
   * the server so that person is never asked again on this session, and it
   * can no longer be answered.
   */
  dropped?: boolean;
  /** Your own copy in your log, when you are the tagged person and asked for one. Never set on tags you made. */
  mirroredSessionId?: ID;
  createdAt: string;
  respondedAt?: string;
  kind: PracticeSession['kind'];
  /** YYYY-MM-DD, the tagger's day. */
  day: string;
  minutes: number;
  /** A match's result from YOUR side: the tagger's result on tags you made, the mirrored one on tags of you. */
  won?: boolean;
  /** A match's score from YOUR side, the same way (migration 91). */
  sets?: MatchSet[];
}

/**
 * Why a tag was refused, as tag_session raises it (or session_tag_refusal
 * returns it, for the first six). 'teen_closed': someone not known to be an
 * adult who does not follow you yet. 'declined': they already said no to
 * this session (or took their name off it). 'copy': the session is your
 * copy of someone else's, so it is theirs to tag. 'removed' (an answer, not
 * a tag): the tag was taken off and can no longer be accepted.
 */
export type SessionTagRefusal =
  | 'missing' | 'self' | 'suspended' | 'blocked' | 'teen_closed' | 'signed_out'
  | 'not_your_session' | 'copy' | 'not_a_match_or_practice' | 'bad_role' | 'declined' | 'too_many' | 'rate_limited' | 'removed';

/** One accepted player on a post's session stats, kept by the server (migration 62). */
export interface SessionWith {
  id: ID;
  handle: string;
  name: string;
  role: SessionTagRole;
}

/** Someone picked in "Who you played" on the log sheet: a CourtSide player, and which side of the net they were on. */
export interface SessionPlayer {
  id: ID;
  role: SessionTagRole;
}

/** A tennis session (or, from Apple Health, any workout) a tracker recorded, waiting to be logged. Private to its owner (migrations 58 and 107). */
export interface DetectedActivity {
  id: ID;
  userId: ID;
  source: 'whoop' | 'apple-health' | 'health-connect' | TrackerId;
  /**
   * What it was, as a short name: 'tennis', or since migration 107 any
   * workout from Apple Health ('run', 'walk', 'ride', 'strength', 'hiit',
   * 'yoga', 'swim'…). Put into words by workoutName (features/activity/workouts.ts).
   */
  sport: string;
  /** Its distance in metres, when Health had one (runs, walks, rides, swims; migration 107). */
  distanceM?: number;
  /** The tracker's own id for it (Apple Health's workout id), to match it against the phone's Health list. */
  externalId?: string;
  startedAt: string;
  endedAt: string;
  /** Minutes east of UTC where it was played, when the tracker said. */
  tzOffsetMin?: number;
  minutes: number;
  avgHr?: number;
  maxHr?: number;
  kcal?: number;
  /** WHOOP's own 0–21 score. Only from WHOOP, always called Strain, shown privately only. */
  strain?: number;
  /** 'WHOOP', the Apple device that saved it (such as 'Watch7,1'), or the tracker's own name for itself ('Charge 6'). */
  device?: string;
  /**
   * Minutes in each heart-rate zone, easiest first: [zone 1 Easy, 2 Light,
   * 3 Moderate, 4 Hard, 5 Peak]. WHOOP only (migration 65), and only when the
   * strap was on for at least half the session. Private, like the rest.
   */
  zones?: number[];
  status: 'new' | 'logged' | 'dismissed' | 'duplicate' | 'withdrawn';
  duplicateOf?: ID;
  sessionId?: ID;
  createdAt: string;
}

/** A health number a post can share: heart rate (average and max), heart-rate zones, Strain (WHOOP only), calories. */
export type HealthShareKey = 'hr' | 'zones' | 'strain' | 'kcal';

/** Where a post's session numbers came from, for its label. */
export type StatsSource = 'whoop' | 'apple-watch' | 'apple-health' | 'health-connect' | TrackerId;

/** The trackers the server's trackers function signs in to (migration 69): tennis sessions only. */
export type TrackerId = 'fitbit' | 'oura' | 'polar';

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
  /** Missing when the player didn't rate it. */
  intensity?: 1 | 2 | 3 | 4 | 5;
  /** The tracker session it came from (migration 58); the server rebuilds the numbers from it. */
  activityId?: ID;
  /** Where the numbers came from, for the label under them. */
  source?: StatsSource;
  /** Only when the author chose to share heart rate (any age once migration 72 runs; adults only before). */
  maxHr?: number;
  avgHr?: number;
  /** WHOOP's 0–21 Strain, only when the author chose to share it (migration 72). Written by the server. */
  strain?: number;
  /** Calories, only when the author chose to share them (migration 72). Written by the server. */
  kcal?: number;
  /**
   * Which health numbers the author chose to share on this post ("Share
   * health data"): sent by the phone, read and kept by the server (migration
   * 72), which then adds only those numbers from the author's own tracker.
   * Absent on a post from an older app (heart rate then follows maxHr).
   */
  share?: HealthShareKey[];
  /**
   * The session in your own log it came from, when one you logged by hand is
   * attached to a Post or a Clip (Oct 2). It marks that session as posted;
   * the log itself stays private (only its owner can read it, migration 39).
   * The server keeps it, with `kind` and `won`, and strips only tracker numbers.
   */
  sessionId?: ID;
  /** What a session from your log was: practice, a match, drills or fitness. */
  kind?: PracticeSession['kind'];
  /**
   * A workout's short name ('run', 'strength'), on a fitness session from a
   * workout (migration 107): the server writes it from the private row or
   * the log, never the phone's word. Absent on tennis.
   */
  workout?: string;
  /** A workout's distance in metres (runs, walks, rides, swims), written by the server from the private row (migration 107). Never on tennis. */
  distanceM?: number;
  /** A match's result, when you said. */
  won?: boolean;
  /** A match's score, from the author's side, always as their log says it: only the server writes it (migration 91). */
  sets?: MatchSet[];
  /**
   * The players on the session who accepted their tag (migration 62):
   * opponents first, then partners. Only the server writes it; whatever the
   * phone sends is replaced. Absent when nobody has accepted. Pending and
   * declined names never appear here.
   */
  with?: SessionWith[];
  /**
   * Minutes in each heart-rate zone, easiest first (as DetectedActivity's).
   * Only when the author chose to share them (or, from an older app, beside
   * heart rate), and only from a tracker that recorded them. Written by the
   * server (migrations 65 and 72); "Zones 4–5" is zones[3] + zones[4].
   */
  zones?: number[];
  /** The day it was played, 'YYYY-MM-DD', date only: never the start time. */
  day?: string;
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
  /** Playback rate honoured by the player, never cut into the file: 0.5, 1.5 or 2. Absent means normal speed. */
  speed?: number;
  /** How loud the clip's own sound plays, 0–1. Absent means full; silence is `muted`, not 0. */
  volume?: number;
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
  /** The court it was played on, tagged from the map's courts. Its name is the location too. */
  court?: TaggedCourt;
  /** The author is fine with CourtSide featuring this on its own channels. Kept only when off. */
  featureOk?: boolean;
  /** The author's first post on CourtSide: welcomed with a tag and a nudge up nearby feeds for its first two weeks. */
  isFirst?: boolean;
  /** When the author last changed it; shown as "Edited". */
  editedAt?: string;
  /**
   * Shared to one group only (migration 67): just that group's members can
   * open it, it shows in that group's feed, and never in For you. Fixed once posted.
   */
  groupId?: ID;
}

/* --------------------------------- Groups -------------------------------- */

/**
 * A group's face (migration 73): a colour by name (the theme turns it into
 * its own shade, so it looks right on every theme), and on it an emoji or,
 * with none, the group's initials; or a photo instead of both. Missing
 * parts read as the default: initials on the theme's accent.
 */
export type GroupColor = 'accent' | 'clay' | 'hard' | 'grass' | 'gold' | 'red' | 'ink';
export interface GroupLook {
  color?: GroupColor;
  emoji?: string;
  /** A photo in the media bucket (or, while it is being made, one still on this phone). */
  photoUrl?: string;
}

/** A member of a group, and whether they are its admin. */
export interface FeedGroupMember {
  id: ID;
  admin: boolean;
}

/**
 * A group with a feed of its own (migration 67): everything its members post,
 * plus what was shared to it only (migration 74). Anyone can start one; its
 * starter is the admin, who says yes to requests and can remove people.
 * Nobody is in more than MAX_GROUPS.
 */
export interface FeedGroup {
  id: ID;
  name: string;
  description?: string;
  /** Ask to join: an admin says yes first. Otherwise anyone with the link is straight in. */
  ask: boolean;
  /** Shows in Find groups (migration 70). Off: only its invite link finds it. Missing before 70 runs, which reads as on. */
  discoverable?: boolean;
  /** Its colour and emoji, or its photo (migration 73). Missing: initials on the accent. */
  look?: GroupLook;
  createdAt: string;
  /** Everyone in it you can see (someone you are blocked with is left out), oldest first. */
  members: FeedGroupMember[];
  /** People asking to join; only filled in for its admins. */
  requests: ID[];
}

/** What a group's invite link shows before you are in it. */
export interface FeedGroupCard {
  id: ID;
  name: string;
  description?: string;
  ask: boolean;
  look?: GroupLook;
  memberCount: number;
  member: boolean;
  requested: boolean;
}

/**
 * A group as Find groups lists it (migration 70, discover_groups): enough to
 * decide whether to join, never who is in it or what they posted.
 */
export interface DiscoverGroup extends FeedGroupCard {
  /** Someone in it lives near your city. */
  near: boolean;
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
  /** A photo with the comment (shrunk before upload), like Instagram's. */
  imageUrl?: string;
  /**
   * A reply: the top-level comment it sits under. Always top-level, the way
   * Instagram keeps one level: a reply to a reply goes under the same comment
   * and @mentions the person (migration 56). Absent on a top-level comment.
   */
  parentId?: ID;
  /** The comment actually answered (the parent, or a reply in its thread): whose "replied to your comment" this is. */
  replyToId?: ID;
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
  /** A poll with the thread (migration 41): its options, the totals so far, and your own pick if you voted. */
  poll?: { options: string[]; counts: number[]; myVote?: number };
}

export type ThreadSourceName = 'reddit';

export interface ThreadSource {
  name: ThreadSourceName;
  /** e.g. "r/10s" */
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
  /** A photo or clip with the reply (see migration 40). */
  media?: { kind: 'photo' | 'video'; url: string; thumb?: string };
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
  /** On the Coaching tab for everyone. Off until the coach has services and payouts. */
  listed?: boolean;
  /** Stripe says the coach can be paid. */
  payoutsReady?: boolean;
  /** The coach has started payout setup with Stripe. */
  payoutsStarted?: boolean;
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
  /** 1 to 5 */
  rating: number;
  body: string;
  createdAt: string;
}

/**
 * Where a booking stands. awaiting-payment: the player is at Stripe's pay
 * page. submitted: paid, with the coach. in-review: the coach has opened it.
 * answered: done. declined: the coach said no and the money went back.
 * refunded: not answered in time, money back.
 */
export type CoachingRequestStatus = 'draft' | 'awaiting-payment' | 'submitted' | 'in-review' | 'answered' | 'declined' | 'refunded';

export interface CoachingRequest {
  id: ID;
  coachId: ID;
  userId: ID;
  serviceId: ID;
  question: string;
  /** A short label for attached footage ("Video attached"). */
  videoLabel?: string;
  /** The footage itself, when the player attached some. */
  videoUrl?: string;
  status: CoachingRequestStatus;
  createdAt: string;
  response?: string;
  respondedAt?: string;
  /** The coach's own account, so their inbox can find it. */
  coachUserId?: ID;
  /** What was paid, in cents, and CourtSide's share of it. */
  priceCents?: number;
  feeCents?: number;
  paidAt?: string;
  /** When the coach's answer is due; after this the player can get a refund. */
  dueAt?: string;
  refundedAt?: string;
}

/* --------------------------- Health and nutrition ------------------------ */

export type IntegrationProvider =
  | 'cronometer'
  | 'myfitnesspal'
  | 'apple-health'
  | 'whoop'
  | TrackerId
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
  /** Tennis sessions switched on for this source (migration 58). */
  readsWorkouts?: boolean;
  /**
   * Every workout too, not only tennis (Apple Health; migration 107, column
   * reads_all_workouts): its own yes to "Workouts from Apple Health", never
   * carried over from the tennis one.
   */
  readsAllWorkouts?: boolean;
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
  /** Which source gave which number, keyed by column ('recovery', 'sleep_hours', 'hrv_ms', …). */
  sources?: Record<string, string>;
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
  /** The applicant's UTR profile page (utrsports.net), for checking the rating. */
  utrLink?: string;
  /** The applicant's USTA page showing their NTRP rating (usta.com). */
  ntrpLink?: string;
  yearsCoaching: number;
  certifications: string;
  /** The résumé's file name, when one was attached (the file itself sits in private storage). */
  resumeLabel?: string;
  /** Where the résumé sits in private storage; only the applicant and admins can open it. */
  resumePath?: string;
  /** What the reviewer wrote when approving or turning it down. */
  reviewNote?: string;
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

/**
 * What a message is. 'hit-request' is a shared "Looking for a hit" post (not
 * 'hit', which already means an Instant). 'system' is an event line in a
 * group ("Mira added Dev"): only the server writes those (migration 54).
 * 'photo' is one to ten pictures from the camera roll (migration 61).
 */
export type MessageKind = 'text' | 'post' | 'question' | 'profile' | 'court' | 'voice' | 'hit-request' | 'system' | 'photo';

/**
 * One picture in a chat. Chat photos sit on a private shelf only the chat's
 * own members can open (migration 61), so a message keeps where the file is
 * kept, never a public address; the app asks for a short-lived link to show it.
 */
export interface ChatPhoto {
  /**
   * Where it is kept: "<chat id>/<sender id>/<name>.jpg" on the chat-photos
   * shelf. Until it has gone up, the picked file on this phone instead (and,
   * in the demo, a "demo:" picture drawn by the app).
   */
  path: string;
  /** Its size in pixels, so the bubble has the right shape before the picture arrives. */
  w: number;
  h: number;
}

/**
 * What an event line in a group is about, so the app can word it for whoever
 * reads it ("You added Dev", "Mira added you"). The message's body carries a
 * plain sentence too, for app builds older than this.
 */
export interface ChatEvent {
  type: 'created' | 'added' | 'removed' | 'left' | 'renamed' | 'photo' | 'admin' | 'joined';
  /** Who it was done to: the people added or removed, or made an admin. */
  targetIds?: ID[];
  /** The group's new name ('renamed', and 'created' when it was given one). No name on 'renamed' means the name was taken off. */
  title?: string;
  /** 'photo': a new photo (true) or the photo taken off (false). 'admin': made an admin (true) or no longer one (false). */
  on?: boolean;
}

export interface Message {
  openedAtBy?: Record<ID, string>;
  readAtBy?: Record<ID, string>;
  id: ID;
  conversationId: ID;
  senderId: ID;
  body: string;
  createdAt: string;
  kind: MessageKind;
  /** Set when kind is 'post', 'question', 'profile' or 'hit-request' — the shared item. */
  sharedId?: ID;
  /** Set when kind is 'system': what happened in the group. */
  event?: ChatEvent;
  /** One reaction per person, keyed by who left it. */
  reactions?: Record<ID, string>;
  /** When its sender last changed the words; the chat says "Edited" under it. */
  editedAt?: string;
  /** It never reached the server (no signal, or a server error); the chat offers a retry. */
  failed?: boolean;
  /**
   * Set when kind is 'court': where to meet, with the map's id for the court
   * when it came from the courts list, so the card opens that court's page,
   * and how many courts stand there when the list knew it.
   */
  place?: { id?: string; name: string; lat: number; lng: number; count?: number };
  /** Set when kind is 'voice': the recording and how long it runs. */
  audio?: { url: string; ms: number };
  /** Set when kind is 'photo': the pictures, in the order they were picked. The words (`body`) are the caption, if any. */
  photos?: ChatPhoto[];
  /**
   * The message this one answers (a swipe to the right on a bubble, or Reply
   * in its menu): the chat draws its words as a small quote above this one.
   * Migration 75; cleared by the server when the original is unsent.
   */
  replyToId?: ID;
  /** Yours, on its way to the server: "Sending…" under it until it lands. Never stored. */
  sending?: boolean;
}

export interface Conversation {
  id: ID;
  /** Two people, or up to 16 in a group (migrations 42 and 54; GROUP_CAP in src/features/messages/groupRules.ts). */
  participantIds: ID[];
  /** A group chat, which may have a name; without one it is called by its members. */
  isGroup?: boolean;
  title?: string;
  /** Who started the group. */
  createdBy?: ID;
  /** A group's admins: they can remove people and make others admins (migration 54). Missing on a database without it. */
  adminIds?: ID[];
  /** A group's photo, in our own media bucket. */
  photoUrl?: string;
  /** You muted this chat until then: no alerts, and it stays off the unread badge. Only you can see it. */
  mutedUntil?: string;
  /** You pinned it to the top of your inbox (up to 3), then. Only you can see it (migration 75). */
  pinnedAt?: string;
  /** You marked it unread from the inbox: it shows as new until you open it. Only you can see it. */
  markedUnread?: boolean;
  /**
   * You deleted it from your inbox then: it stays out of the inbox, and what
   * was said before stays out of view, until someone writes in it again.
   * Nothing changes for anyone else. Only you can see it.
   */
  hiddenAt?: string;
  messageIds: ID[];
  updatedAt: string;
  /** Messages from other people the current user has not opened (event lines never count). */
  unreadCount: number;
}

/**
 * Something sent into chats from the Send-to sheet: a post, thread, profile
 * or hit by its id, a court by where it is, or a message forwarded as it is.
 */
export type ShareItem =
  | { kind: 'post' | 'question' | 'profile' | 'hit-request'; id: ID }
  | { kind: 'court'; place: { id?: string; name: string; lat: number; lng: number } }
  | { kind: 'message'; id: ID }
  /** An invite to a group (its page, /g/<id>): sent as a plain message with the group's link, drawn as a card (features/groups/inviteMessage). */
  | { kind: 'group'; id: ID; name: string };

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
  /** Someone replied to your comment on a post or an Instant (migration 56). The target is the post or Instant. */
  | 'comment-reply'
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
  | 'posted'
  /** CourtSide changed the status of your coach application (in review, approved, not approved). */
  | 'coach-application'
  /** Someone sent a report. Only admins get these. */
  | 'report'
  /** A player paid for one of your services (you are the coach). */
  | 'booking'
  /** Your coach answered your booking. */
  | 'coach-answer'
  /** Money came back on a booking. */
  | 'refund'
  /** Someone upvoted your thread. */
  | 'upvote'
  /** Someone upvoted your reply in a thread. */
  | 'upvote-reply'
  /** Your post passed a view count (10, 25, 50, 100...). Actor is you. */
  | 'milestone'
  /** A new player near you just joined. Actor is them. */
  | 'joined'
  /** Someone said "I'm in" to your Looking-for-a-hit post. */
  | 'hit-join'
  /** The poster invited you to their invite-first or invite-only hit (migration 76). Actor is them; the target is the hit ('hit-request'). */
  | 'hit-invite'
  /** Someone nearby posted a hit much like yours (or like what your open-to-hit ring says). Actor is them; the target is their hit (migration 53). */
  | 'hit-match'
  /** A tracker picked up a tennis session. Actor is you; the target is the detected activity (migration 58). */
  | 'activity'
  /** The alerts that open the map (migration 60; see MapAlertKind). */
  | MapAlertKind
  /**
   * Someone tagged you in a session from their log (migration 62). Actor is
   * the tagger; the target is THEIR session's id (find your tag with
   * my_session_tags() by sessionId); preview is 'match' or 'practice', for
   * "tagged you in a match" / "in a practice". Filed once per session and
   * person, so a tag taken off and put back never alerts twice.
   */
  | 'session-tag';

/** 'court': a court you follow, by the map's id for it (migration 60). */
export type NotificationTarget = 'post' | 'hit' | 'question' | 'coach-question' | 'coach-reply' | 'coach-application' | 'report' | 'coaching-request' | 'profile' | 'hit-request' | 'activity' | 'court' | 'session-tag';

/** A court a post is tagged with: the map's id for it, its name, and where it is. */
export interface TaggedCourt { id: string; name: string; lat: number; lng: number }

/** What one player says about a public court on the map. Unsaid is left out. */
export interface CourtNote {
  /** The court's OpenStreetMap id, as the map knows it: "way123456". */
  courtId: string;
  userId: ID;
  lights?: boolean;
  surface?: 'hard' | 'clay' | 'grass' | 'other';
  nets?: 'good' | 'worn' | 'missing';
  /** How busy it usually is: walk on, sometimes a wait, usually busy. */
  busy?: 'quiet' | 'wait' | 'busy';
  photoUrl?: string;
  note?: string;
  updatedAt: string;
}

/**
 * Where a player last had Location on, to about a kilometre, and when
 * (migration 46). Only adults see adults' spots; seenAt is left out for
 * someone who hides their activity status.
 */
export interface LastSeen {
  userId: ID;
  lat: number;
  lng: number;
  city?: string;
  seenAt?: string;
  /**
   * How exact the spot is, as the server decided for you (map_players,
   * migration 63): 'court' snapped onto the court they were at, 'exact'
   * (you, and people who follow each other with you), 'approx' about a
   * kilometre out. Absent on a database before 63, where every spot is
   * rounded to about a kilometre (so it reads as approx).
   */
  place?: MapPlace;
  /** The court they were at (place 'court'). */
  courtId?: string;
  courtName?: string;
  /** Up for a hit until then (today); absent when not, or before migration 63. */
  openUntil?: string;
  /**
   * A friend who follows each other with you (map_players, migration 98).
   * Friends come back from anywhere in the world; everyone else only near
   * you. Absent for yourself, for anyone else, and before migration 98.
   */
  mutual?: boolean;
}

/** How exact a player's pin is. */
export type MapPlace = 'court' | 'exact' | 'approx';

/**
 * Who can see you on the map (migration 63): Players nearby, Only people
 * you follow back, or Only me.
 */
export type MapVisibility = 'nearby' | 'mutuals' | 'none';

/* ---------------------------- Courts (migration 60) ---------------------------- */

/**
 * Who may play at a court. 'unknown' courts are never hidden; 'members' and
 * 'private' (someone's home) are greyed out and never suggested for Play
 * here or Courts near you.
 */
export type CourtAccess = 'public' | 'members' | 'pay' | 'private' | 'unknown';

/** Where a court's access answer came from: the map data, players' reviews, or an admin. Absent while unknown. */
export type CourtAccessSource = 'map' | 'players' | 'admin';

/**
 * What the courts function now sends with each court (absent from a
 * database before migration 60). Nearby courts fold into one pin under the
 * lowest id, and players' answers are saved against that id, so a pin
 * takes these from that court.
 */
export interface CourtAccessInfo {
  access: CourtAccess;
  fee?: boolean;
  indoor?: boolean;
  /** A booking or website link, from the map data or an admin, never from a player. */
  bookUrl?: string;
}

/** A part of the week a court is usually busy, as players say in "Add what you know". */
export type CourtDayPart = 'weekday-morning' | 'weekday-afternoon' | 'weekday-evening' | 'weekend-morning' | 'weekend-afternoon' | 'weekend-evening';

/**
 * One player's facts about one court ("Add what you know"; table
 * court_reviews). Saving again replaces your own, and only you read it back.
 * Unsaid is left out.
 */
export interface CourtReview {
  courtId: string;
  lights?: boolean;
  nets?: 'good' | 'bad';
  surface?: 'good' | 'cracked' | 'wet-prone';
  /** When it is usually busy. An empty list means "never seen it busy". */
  busy?: CourtDayPart[];
  access?: Exclude<CourtAccess, 'unknown'>;
  /** Rules and notes, up to 280 characters. Shown to others, unnamed, only when the author is an adult. */
  notes?: string;
  /** The hit this was added after. The server drops it unless you posted or joined that hit. */
  fromHit?: ID;
  updatedAt?: string;
}

/**
 * Opens the "Add what you know" sheet for a court. The after-hit prompt
 * (the sessions build) calls it with the hit, so the review is linked to it.
 * `name` titles the sheet; without it the sheet takes the hit's place name.
 * The app's own is openCourtReview in features/players/courtLink.
 */
export type OpenCourtReview = (courtId: string, options?: { fromHit?: ID; name?: string }) => void;

/** Everyone's facts about a court, added up, never naming anyone (court_facts). */
export interface CourtFacts extends CourtAccessInfo {
  courtId: string;
  accessBy?: CourtAccessSource;
  /** How many players added something in the last 18 months. */
  players: number;
  lights: { yes: number; no: number };
  nets: { good: number; bad: number };
  surface: { good: number; cracked: number; wetProne: number };
  /** How many players said each part of the week is busy, out of busyAnswers. */
  busy: Partial<Record<CourtDayPart, number>>;
  busyAnswers: number;
  /** Of busyAnswers, how many said they have never seen it busy. */
  busyNever: number;
  /** Up to three notes from adults, newest first, with the day each was written. */
  notes: { text: string; on: string }[];
  updatedAt?: string;
}

/** "How is it right now?" */
export type CourtNow = 'free' | 'wait' | 'full' | 'wet' | 'locked';

/** Right now at a court (court_right_now). */
export interface CourtRightNow {
  courtId: string;
  /** The latest answer in the last 90 minutes, and when. */
  status?: CourtNow;
  statusAt?: string;
  /** Other adults checked in there: 0, or 2 and up (one stranger is never shown). Always 0 for a teen. */
  playing: number;
  /** People checked in there who follow each other with you. */
  friendIds: ID[];
  /** Whether you are checked in there. */
  youHere: boolean;
}

/** "6 players follow this court": a count, never names (court_follow_counts). */
export interface CourtFollowCount { courtId: string; followers: number; following: boolean }

/** A court ring on the map: a real court with a post or open hit there in the last 7 days that you may see (court_rings). */
export interface CourtRing { courtId: string; name?: string; lat: number; lng: number; posts: number; hits: number; lastAt: string }

/** "Sam and Dev, who you follow, play here" (court_people_you_follow): up to 5 people, most recent first. */
export interface CourtRegulars { courtId: string; userIds: ID[] }

/** One of "Your courts" on Find Players, with what is new there (my_courts). */
export interface FollowedCourt {
  courtId: string;
  name?: string;
  lat: number;
  lng: number;
  access: CourtAccess;
  followedAt: string;
  /** Others' posts tagged there in the last 7 days. */
  newPosts: number;
  upcomingHits: number;
  nextHitAt?: string;
  status?: CourtNow;
  statusAt?: string;
  lastAt?: string;
  /** You are checked in there ("I'm playing here"), so its card can say "You're here". */
  youHere?: boolean;
}

/**
 * The alerts that open the map, each with its own switch in Settings. Part
 * of NotificationKind, so app/notifications.tsx lists them with the rest.
 *   map-friend-hit  someone you follow turned on open to hit; actor them, target their profile
 *   map-new-hit     a new open hit near you; actor the poster, target the hit ('hit-request')
 *   map-new-player  a new player shared their spot near you; actor them, target their profile
 *   court-activity  a new hit or post at a court you follow; actor the poster, target the court ('court')
 * At most one a day from the three map- kinds together, and one a day from court-activity.
 */
export type MapAlertKind = 'map-friend-hit' | 'map-new-hit' | 'map-new-player' | 'court-activity';

/** One switch each in Settings for those alerts (user_state push_map_friends, push_map_hits, push_map_players, push_courts). On unless turned off. */
export interface MapAlertPrefs { pushMapFriends: boolean; pushMapHits: boolean; pushMapPlayers: boolean; pushCourts: boolean }

/** "Looking for a hit": someone wants a game, and says when, where and at what level (migration 43). */
export interface HitRequest {
  id: ID;
  authorId: ID;
  startsAt: string;
  /** Where: a court picked from the courts list carries the map's id for it (no migration: place is jsonb); a typed place has only a name. */
  place: { id?: string; name: string; lat?: number; lng?: number };
  levelMin?: number;
  levelMax?: number;
  format: 'singles' | 'doubles' | 'hit';
  /** How many people the poster is looking for. */
  spots: number;
  note?: string;
  /** The group chat the joiners land in, once someone has joined. */
  conversationId?: ID;
  cancelled?: boolean;
  createdAt: string;
  joinedIds: ID[];
  /**
   * People in it that this account may not see (a teen who joined, to
   * someone they do not follow: migration 95). They still take a spot, so
   * spots left and "2 in" count them (joinedCount). Left out: none.
   */
  hiddenJoins?: number;
  /**
   * Who sees it first (migration 76). Left out: everyone, as every hit was
   * before. 'invite_first': only the players invited (and, with
   * includeGroups, the people in the poster's groups) until opensAt, then
   * everyone, unless it is full by then. 'invite_only': never anyone else.
   */
  audience?: HitAudience;
  /** When an invite-first hit opens to everyone: the earlier of an hour after posting and three hours before it starts. The server's. */
  opensAt?: string;
  /** The people in the poster's groups (Groups, migration 67) see it too. */
  includeGroups?: boolean;
  /** Who was invited. The poster has the whole list; an invited player only themselves. */
  invitedIds?: ID[];
}

/** Who sees a hit first: 'everyone' is the same as leaving it out. */
export type HitAudience = 'everyone' | 'invite_first' | 'invite_only';

/* ------------------------------ Shared links ----------------------------- */

/** What a link shared outside the app can point at. */
export type ShareKind = 'post' | 'profile' | 'hit-request' | 'question' | 'court' | 'group';

/** The few things a stranger sees about a person on a shared link (migration 68). */
export interface SharePerson { id: ID; name: string; handle: string; avatarUrl?: string; location?: string; isCoach?: boolean }

/** One post as a small picture tile on a shared profile or court. */
export interface ShareTile { id: ID; kind: PostKind; body?: string; imageUrl?: string; thumbnailUrl?: string }

/**
 * The read-only look a shared link gives someone with no account
 * (share_preview, migration 68). `open: false` says nothing else: a private
 * account, a teen, something taken down or never there all read the same.
 * `gone` is a hit that is over or called off.
 */
export interface SharePreview {
  kind: ShareKind;
  open: boolean;
  gone?: boolean;
  author?: SharePerson;
  post?: {
    id: ID; kind: PostKind; body: string; createdAt: string;
    imageUrl?: string; videoUrl?: string; thumbnailUrl?: string; orientation?: 'portrait' | 'landscape';
    /** Demo posts carry a court card instead of a picture. */
    mediaLabel?: string;
    likes: number; comments: number; courtName?: string; courtId?: string; location?: string;
    session?: { minutes?: number; focus?: string; kind?: PracticeSession['kind'] };
  };
  profile?: { bio?: string; followers: number; posts: number; skillSystem?: SkillSystem; rating?: number; openHits: number; recent: ShareTile[] };
  hit?: {
    id: ID; startsAt: string; format: HitRequest['format']; spots: number; spotsLeft: number;
    levelMin?: number; levelMax?: number; note?: string; place: { id?: string; name: string; lat?: number; lng?: number };
  };
  question?: { id: ID; title: string; body: string; createdAt: string; answers: number };
  court?: { name?: string; openHits: number; posts: number; players: number; recent: ShareTile[] };
}

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

/** What a player who joined through someone's link still has to do before they count (migration 85). */
export type InviteeMissing = 'setup' | 'verify' | 'come-back' | 'do-thing' | 'expired' | 'blocked';

/** Someone who joined through my link or code, as I see them on the Invite screen. */
export interface Invitee {
  id: ID;
  handle: string;
  name?: string;
  avatarUrl?: string;
  joinedAt: string;
  /** Set once they counted ($1). */
  countedAt?: string;
  /** For those not counted yet, in the order they meet them. */
  missing?: InviteeMissing[];
}

/** A CourtSide player found in your phone's contacts (migration 88). `phone`/`email` is the contact detail that matched, as you sent it. */
export interface ContactMatch {
  id: ID;
  handle: string;
  name?: string;
  avatarUrl?: string;
  phone?: string;
  email?: string;
}
