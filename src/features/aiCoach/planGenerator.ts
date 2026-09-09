/**
 * Rule-based stand-in for the AI coach.
 *
 * This is deliberately deterministic and readable: it takes the same inputs a
 * real model would be given (player profile, constraints, tournament calendar,
 * recent recovery/nutrition) and produces a structured TrainingPlan. When a
 * real model is wired up, keep the inputs and the TrainingPlan shape and swap
 * the body of `generatePlan`.
 *
 * TODO(ai): replace with a server call that sends {profile, constraints,
 * tournaments, healthHistory, recentSessions} and returns TrainingPlan JSON.
 */

import type {
  Constraint,
  DailyHealth,
  PlayerProfile,
  TrainingBlock,
  TrainingDay,
  TrainingPlan,
  TrainingBlockKind,
  TournamentEntry,
} from '@/data/types';

export interface PlanInputs {
  profile: PlayerProfile;
  health: DailyHealth[];
  now?: Date;
}

const STYLE_FOCUS: Record<PlayerProfile['playStyle'], string[]> = {
  'aggressive-baseliner': ['First-strike patterns', 'Serve +1 forehand', 'Recovery footwork after the big ball'],
  counterpuncher: ['Depth under pressure', 'Changing direction on the run', 'Finding a first strike of your own'],
  'all-court': ['Transition timing', 'Approach shot quality', 'Volley punch and split step'],
  'serve-and-volley': ['First volley depth', 'Serve placement variety', 'Overhead under pressure'],
  pusher: ['Adding shape and pace', 'Attacking the short ball', 'Net comfort'],
};

const STYLE_PHRASE: Record<PlayerProfile['playStyle'], string> = {
  'aggressive-baseliner': 'an aggressive baseline game',
  counterpuncher: 'a counterpunching game',
  'all-court': 'an all-court game',
  'serve-and-volley': 'a serve-and-volley game',
  pusher: "a retriever's game",
};

const STYLE_NOUN: Record<PlayerProfile['playStyle'], string> = {
  'aggressive-baseliner': 'an aggressive baseliner',
  counterpuncher: 'a counterpuncher',
  'all-court': 'an all-court player',
  'serve-and-volley': 'a serve-and-volley player',
  pusher: 'a retriever',
};

const SURFACE_NOTE: Record<PlayerProfile['preferredSurface'], string> = {
  hard: 'Hard court rewards taking time away — keep the contact point in front.',
  clay: 'On clay the extra ball is free. Build points rather than ending them early.',
  grass: 'Low bounce means bend and short backswings. Slice is a weapon, not a bail-out.',
  indoor: 'Indoors the ball flies. Margin over the net matters more than usual.',
};

function daysUntil(iso: string, now: Date): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function block(
  id: string,
  title: string,
  kind: TrainingBlockKind,
  minutes: number,
  detail: string[],
  rationale: string,
): TrainingBlock {
  return { id, title, kind, minutes, detail, rationale };
}

export function generatePlan({ profile, health, now = new Date() }: PlanInputs): TrainingPlan {
  const activeConstraints: Constraint[] = profile.constraints.filter((c) => c.active);
  const shoulderLimited = activeConstraints.some(
    (c) => c.kind === 'injury' && /shoulder|elbow|arm|wrist/i.test(c.label),
  );
  const legLimited = activeConstraints.some(
    (c) => c.kind === 'injury' && /knee|ankle|hip|back|calf|achilles/i.test(c.label),
  );

  const recentRecovery = avg(health.slice(0, 3).map((d) => d.recovery));
  const recentSleep = avg(health.slice(0, 3).map((d) => d.sleepHours));
  const recentProtein = avg(health.slice(0, 3).map((d) => d.proteinGrams));
  const lowRecovery = recentRecovery > 0 && recentRecovery < 65;

  const nextTournament: TournamentEntry | undefined = profile.tournaments
    .filter((t) => t.registered && daysUntil(t.startsAt, now) >= 0)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];

  const weeksOut = nextTournament ? Math.ceil(daysUntil(nextTournament.startsAt, now) / 7) : undefined;
  const taper = weeksOut !== undefined && weeksOut <= 1;
  const sharpening = weeksOut !== undefined && weeksOut > 1 && weeksOut <= 4;

  const sessions = Math.max(2, Math.min(6, profile.sessionsPerWeek));
  const focusAreas = STYLE_FOCUS[profile.playStyle].slice(0, sharpening ? 2 : 3);

  const cautions: string[] = [];
  for (const c of activeConstraints) {
    cautions.push(c.note ? `${c.label}: ${c.note}` : c.label);
  }
  if (lowRecovery) {
    cautions.push(
      `Recovery has averaged ${Math.round(recentRecovery)} over three days with ${recentSleep.toFixed(
        1,
      )}h sleep. Intensity is dialled back this week — earn it back before adding load.`,
    );
  }
  if (recentProtein > 0 && recentProtein < 1.4 * 70) {
    cautions.push(
      `Protein is averaging ${Math.round(recentProtein)}g/day. On heavy weeks that is on the low side for recovery.`,
    );
  }

  const days: TrainingDay[] = [];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Spread the available sessions across the week, keeping Sunday light.
  const trainingDayIndexes = pickTrainingDays(sessions);

  for (let i = 0; i < 7; i += 1) {
    const isTraining = trainingDayIndexes.includes(i);
    if (!isTraining) {
      days.push({
        id: `d${i}`,
        dayIndex: i,
        label: labels[i],
        restDay: true,
        blocks: [
          block(
            `d${i}-rest`,
            'Active recovery',
            'recovery',
            25,
            ['20 min easy walk or spin', 'Hips and thoracic mobility', 'Shoulder band work, light'],
            'Rest days are where the adaptation happens. Keep it genuinely easy.',
          ),
        ],
      });
      continue;
    }

    const slot = trainingDayIndexes.indexOf(i);
    days.push({
      id: `d${i}`,
      dayIndex: i,
      label: labels[i],
      restDay: false,
      blocks: buildBlocks({
        slot,
        totalSlots: trainingDayIndexes.length,
        profile,
        shoulderLimited,
        legLimited,
        lowRecovery,
        taper,
        sharpening,
      }),
    });
  }

  const headline = taper
    ? `Race week: ${nextTournament?.name}`
    : sharpening && nextTournament
      ? `${weeksOut} weeks to ${nextTournament.name}`
      : lowRecovery
        ? 'Rebuild week'
        : 'Base and sharpening week';

  const summaryParts: string[] = [];
  const ratingLabel =
    profile.skillSystem === 'NTRP' ? profile.rating.toFixed(1) : String(profile.rating);
  summaryParts.push(
    `${sessions} sessions built around ${STYLE_PHRASE[profile.playStyle]} at ${profile.skillSystem} ${ratingLabel}.`,
  );
  if (nextTournament) {
    summaryParts.push(
      taper
        ? `${nextTournament.name} is days away, so volume drops and everything becomes short and sharp.`
        : `${nextTournament.name} is ${weeksOut} weeks out on ${nextTournament.surface}. ${
            SURFACE_NOTE[nextTournament.surface]
          }`,
    );
  } else {
    summaryParts.push(SURFACE_NOTE[profile.preferredSurface]);
  }
  if (shoulderLimited) {
    summaryParts.push('Serve volume is capped and never lands on back-to-back days.');
  }
  if (lowRecovery) {
    summaryParts.push('Recovery numbers are down, so the hardest session moved later in the week.');
  }

  return {
    id: `plan-${now.toISOString().slice(0, 10)}`,
    generatedAt: now.toISOString(),
    weekOf: now.toISOString(),
    headline,
    summary: summaryParts.join(' '),
    focusAreas,
    days,
    cautions,
  };
}

function pickTrainingDays(sessions: number): number[] {
  const patterns: Record<number, number[]> = {
    2: [1, 4],
    3: [0, 2, 5],
    4: [0, 2, 4, 5],
    5: [0, 1, 3, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
  };
  return patterns[sessions] ?? [0, 2, 4];
}

interface BlockArgs {
  slot: number;
  totalSlots: number;
  profile: PlayerProfile;
  shoulderLimited: boolean;
  legLimited: boolean;
  lowRecovery: boolean;
  taper: boolean;
  sharpening: boolean;
}

function buildBlocks(args: BlockArgs): TrainingBlock[] {
  const { slot, totalSlots, profile, shoulderLimited, legLimited, lowRecovery, taper } = args;
  const blocks: TrainingBlock[] = [];
  const isServeDay = slot % 2 === 0;
  const isMatchDay = slot === totalSlots - 1;
  const baseMinutes = taper ? 55 : lowRecovery ? 60 : 75;

  blocks.push(
    block(
      `s${slot}-warmup`,
      'Warm-up',
      'on-court',
      12,
      ['Mini tennis to service line', 'Crosscourt rally, gradual pace', 'Six serves at 50%'],
      'Short, boring, non-negotiable. Cold shoulders are where serve injuries start.',
    ),
  );

  if (isMatchDay) {
    blocks.push(
      block(
        `s${slot}-match`,
        taper ? 'Sharp sets' : 'Match play',
        'match-play',
        baseMinutes,
        taper
          ? ['Two short sets to 4, no-ad', 'Play the patterns you will use in the draw', 'Stop while it still feels good']
          : ['Two full sets against someone who beats you sometimes', 'One tactical rule you must keep all match', 'Write down the score at every changeover'],
        taper
          ? 'Race week is about confidence and timing, not fitness. Leave the court wanting more.'
          : 'Practice only transfers if it is tested under a scoreboard.',
      ),
    );
  } else if (isServeDay) {
    const serveBalls = shoulderLimited ? 80 : taper ? 60 : 120;
    blocks.push(
      block(
        `s${slot}-serve`,
        'Serve block',
        'on-court',
        Math.round(baseMinutes * 0.45),
        [
          `${serveBalls} balls maximum${shoulderLimited ? ' (shoulder cap)' : ''}`,
          'Alternate deuce and ad, targets in the corners',
          'Second serve to the backhand box, 3 sets of 10',
        ],
        shoulderLimited
          ? 'Capped at 80 balls because of the shoulder note on your profile. Quality over volume.'
          : 'Serve is the only shot nobody can take away from you. It gets its own block.',
      ),
      block(
        `s${slot}-patterns`,
        'Serve +1 patterns',
        'on-court',
        Math.round(baseMinutes * 0.55),
        [...STYLE_FOCUS[profile.playStyle].slice(0, 2), 'Live points from the serve, first four shots only'],
        `Built for ${STYLE_NOUN[profile.playStyle]}: the first ball after the serve is where your game is decided.`,
      ),
    );
  } else {
    blocks.push(
      block(
        `s${slot}-ground`,
        'Groundstroke and movement',
        'on-court',
        baseMinutes,
        [
          'Crosscourt depth game to 11, ball must land past the service line',
          'Change of direction drill, 4 x 90 seconds',
          'Short ball attack: approach and finish, 20 reps',
        ],
        'Depth and direction change are the two levers that move a rating. Everything else is downstream.',
      ),
    );
  }

  if (!taper && !isMatchDay) {
    blocks.push(
      block(
        `s${slot}-fitness`,
        legLimited ? 'Fitness (low impact)' : 'Off-court fitness',
        'fitness',
        lowRecovery ? 20 : 30,
        legLimited
          ? ['Bike intervals 6 x 1 min', 'Isometric split squat holds', 'Core anti-rotation, 3 sets']
          : ['Med ball rotational throws 4 x 6', 'Lateral bounds 4 x 6', 'Split squats 3 x 8/side', 'Copenhagen plank 3 x 30s'],
        legLimited
          ? 'Impact work is swapped out because of the lower-body note on your profile.'
          : 'Rotational power and single-leg control are what actually show up in a tennis point.',
      ),
    );
  }

  blocks.push(
    block(
      `s${slot}-cool`,
      'Cool-down',
      'recovery',
      10,
      shoulderLimited
        ? ['External rotation band work, 2 x 15', 'Sleeper stretch, 2 x 30s', 'Hip flexor and thoracic opener']
        : ['Hip flexor and hamstring, 2 x 30s each', 'Thoracic rotations', 'Two minutes of nasal breathing'],
      shoulderLimited
        ? 'Cuff work every single session is the cheapest insurance you can buy.'
        : 'Ten minutes now beats a week off later.',
    ),
  );

  return blocks;
}
