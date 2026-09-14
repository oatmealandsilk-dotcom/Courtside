// CourtSide AI coach — a Supabase Edge Function.
//
// The app never holds the Anthropic key. Three jobs, chosen by `mode`:
//   plan   — a week of training from the player's profile (Opus 5), cached
//            per week and per profile so it is built once, not on every open
//   chat   — a coaching reply with memory of past sessions (Sonnet 5), a
//            daily cap, and a possible handoff to a human coach
//   memory — read what the coach remembers (the app clears it directly)
//
// Deploy:   supabase functions deploy ai-coach
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided.)
import Anthropic from 'npm:@anthropic-ai/sdk@0.71.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PLAN_MODEL = 'claude-opus-5';
const CHAT_MODEL = 'claude-sonnet-5';
const DAILY_CAP = 20;
const REMEMBERED = 10;          // exchanges fed into every chat request
const SUMMARISE_EVERY = 10;     // exchanges between summary refreshes
const HANDOFF_COOLDOWN_DAYS = 7;
const PLAN_CAP_PER_WEEK = 3;    // regenerations a player gets for one week
const LIMITS = { prompt: 2000, context: 6000, coaches: 12 };

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

/* ------------------------------------------------------------------ voice */

const VOICE = `You are the CourtSide coach: a calm, experienced tennis coach talking to one player.

You are given the player's profile, this week's plan, recent recovery data, and what you remember from earlier conversations. Work from those. Refer to their level, goals, and injury notes by name when they matter.

How to answer:
- Be direct and specific. One clear recommendation beats a list of options.
- A few sentences. A short list only when the question is genuinely a sequence. No headings.
- Give reasons a player can feel on court, not textbook theory.
- Change one variable at a time.
- If the question touches an injury note, cap volume before changing technique, and say so.
- Health, injury and nutrition content is general training information, never a diagnosis. Real pain or a medical question: say to see a professional.
- Never invent data about the player. If you do not know, ask one short question.`;

/* ------------------------------------------------------------------ types */

interface Exchange { role: 'user' | 'coach'; body: string; topic?: string; created_at: string }
interface CoachOption { id: string; name: string; specialties: string[]; fromCents: number }

type Handoff = { coachId: string; reason: 'repeat-topic' | 'needs-eyes' | 'injury'; topic: string; line: string };

/* ------------------------------------------------------------------- auth */

async function whoIs(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await asUser.auth.getUser();
  return data.user?.id ?? null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The Monday of the current week, decided here and never by the client. */
function thisMonday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * The request body, trimmed to what the function actually uses and to sizes
 * that keep one call's cost bounded. Anything else in the body is dropped.
 */
function clean(raw: unknown) {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const coaches: CoachOption[] = Array.isArray(b.coaches)
    ? (b.coaches as unknown[]).slice(0, LIMITS.coaches).flatMap((c) => {
        const o = c as Record<string, unknown>;
        if (!o || typeof o.id !== 'string' || typeof o.name !== 'string' || !Array.isArray(o.specialties) || !Number.isFinite(o.fromCents)) return [];
        return [{ id: o.id.slice(0, 64), name: o.name.slice(0, 80), specialties: (o.specialties as unknown[]).filter((x) => typeof x === 'string').slice(0, 6) as string[], fromCents: Number(o.fromCents) }];
      })
    : [];
  const mode = ['plan', 'chat', 'memory'].includes(String(b.mode)) ? (String(b.mode) as 'plan' | 'chat' | 'memory') : 'chat';
  return { mode, prompt: str(b.prompt, LIMITS.prompt), context: str(b.context, LIMITS.context), profileHash: str(b.profileHash, 64), coaches };
}

/* ------------------------------------------------------------------- plan */

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'focusAreas', 'cautions', 'days'],
  properties: {
    headline: { type: 'string', description: 'One line naming the week, under 60 characters.' },
    summary: { type: 'string', description: 'Two sentences on what the week is for and why.' },
    focusAreas: { type: 'array', items: { type: 'string' }, description: 'Two to four short phrases.' },
    cautions: { type: 'array', items: { type: 'string' }, description: 'What the week works around, one sentence each. Empty if nothing.' },
    days: {
      type: 'array', minItems: 7, maxItems: 7,
      items: {
        type: 'object', additionalProperties: false,
        required: ['label', 'restDay', 'blocks'],
        properties: {
          label: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
          restDay: { type: 'boolean' },
          blocks: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['title', 'kind', 'minutes', 'detail', 'rationale'],
              properties: {
                title: { type: 'string' },
                kind: { type: 'string', enum: ['on-court', 'fitness', 'recovery', 'match-play', 'mental'] },
                minutes: { type: 'integer', minimum: 5, maximum: 180 },
                detail: { type: 'array', items: { type: 'string' }, description: 'Two to four concrete instructions.' },
                rationale: { type: 'string', description: 'One plain sentence: why this block is here for this player.' },
              },
            },
          },
        },
      },
    },
  },
} as const;

async function buildPlan(userId: string, body: { context: string; profileHash: string }) {
  const weekOf = thisMonday();
  const cached = await admin.from('training_plans').select('plan, profile_hash, generations').eq('user_id', userId).eq('week_of', weekOf).maybeSingle();
  if (cached.data && cached.data.profile_hash === body.profileHash) return { plan: cached.data.plan, cached: true };
  // A profile edit earns a fresh plan, but only so many times a week — the
  // cache key comes from the client, and this is what keeps that honest.
  const generations: number = cached.data?.generations ?? 0;
  if (cached.data && generations >= PLAN_CAP_PER_WEEK) return { plan: cached.data.plan, cached: true, capped: true };

  const response = await anthropic.messages.create({
    model: PLAN_MODEL,
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: PLAN_SCHEMA },
    },
    system: [
      { type: 'text', text: `${VOICE}\n\nYou are writing one week of training. Rules:\n- Exactly the number of on-court sessions the player can commit to; the rest are rest or light days.\n- Never two hard days back to back. Rest days have at most one recovery block.\n- Any injury note caps that area's volume and removes back-to-back loading of it; say so in a caution.\n- If a tournament is within 7 days, taper. Within 30 days, sharpen with match patterns. Otherwise build.\n- Recovery below 65% drops intensity across the week.\n- Every block's rationale is one sentence a player can understand, naming what about them made you choose it.`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `About this player:\n${body.context}\n\nThe week starts ${weekOf} (a Monday).` },
    ],
    messages: [{ role: 'user', content: 'Write this week.' }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined to write a plan.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const plan = JSON.parse(text);
  await admin.from('training_plans').upsert({ user_id: userId, week_of: weekOf, profile_hash: body.profileHash, plan, model: PLAN_MODEL, generations: generations + 1 });
  return { plan, cached: false };
}

/* ------------------------------------------------------------------- chat */

const CHAT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reply', 'topic', 'handoff'],
  properties: {
    reply: { type: 'string' },
    topic: { type: 'string', description: 'One or two words for what this exchange was about: serve, backhand, footwork, fitness, injury, strategy, mental, gear, scheduling, other.' },
    handoff: {
      description: 'Suggest a human coach only when it would genuinely help more than another message from you.',
      anyOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false,
          required: ['coachId', 'reason', 'line'],
          properties: {
            coachId: { type: 'string', description: 'An id from the coaches list.' },
            reason: { type: 'string', enum: ['repeat-topic', 'needs-eyes', 'injury'] },
            line: { type: 'string', description: 'One sentence, in your voice, saying why this coach and what they would look at.' },
          },
        },
      ],
    },
  },
} as const;

async function chat(userId: string, body: { prompt: string; context: string; coaches: CoachOption[] }) {
  const day = today();
  const usage = await admin.from('coach_usage').select('messages').eq('user_id', userId).eq('day', day).maybeSingle();
  const used = usage.data?.messages ?? 0;
  if (used >= DAILY_CAP) return { capped: true, remaining: 0 };

  const memoryRow = await admin.from('coach_memory').select('summary, exchanges').eq('user_id', userId).maybeSingle();
  const summary: string = memoryRow.data?.summary ?? '';
  const exchanges: Exchange[] = memoryRow.data?.exchanges ?? [];
  const recent = exchanges.slice(-REMEMBERED);

  // Handoff eligibility is decided here, not by the model: never on the first
  // message, never twice in a week.
  const firstMessage = exchanges.length === 0;
  const since = new Date(Date.now() - HANDOFF_COOLDOWN_DAYS * 86_400_000).toISOString();
  const lastHandoff = await admin.from('coach_handoffs').select('id').eq('user_id', userId).gte('created_at', since).limit(1);
  const handoffAllowed = !firstMessage && !(lastHandoff.data?.length) && body.coaches.length > 0;
  const topicCounts = recent.filter((e) => e.role === 'user' && e.topic).reduce<Record<string, number>>((acc, e) => {
    acc[e.topic!] = (acc[e.topic!] ?? 0) + 1;
    return acc;
  }, {});
  const repeated = Object.entries(topicCounts).filter(([, n]) => n >= 2).map(([t]) => t);

  const response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 800,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: CHAT_SCHEMA } },
    system: [
      { type: 'text', text: VOICE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `About this player:\n${body.context}\n\nWhat you remember from earlier sessions:\n${summary || '(first conversations — nothing yet)'}` },
      { type: 'text', text: handoffAllowed
        ? `Human coaches on CourtSide who could take this player:\n${body.coaches.map((c) => `- id ${c.id}: ${c.name}, ${c.specialties.join(' & ')}, from $${(c.fromCents / 100).toFixed(0)}`).join('\n')}\n\nSuggest one ONLY if: the player has now raised the same topic three times (${repeated.length ? `already twice: ${repeated.join(', ')}` : 'no topic has repeated yet'}), or the question cannot be answered well without watching them play, or an injury needs a person to look at it. Pick the coach whose specialty fits. Otherwise handoff is null.`
        : 'Do not suggest a human coach in this reply; handoff must be null.' },
    ],
    messages: [
      ...recent.map((e) => ({ role: e.role === 'coach' ? 'assistant' as const : 'user' as const, content: e.body })),
      { role: 'user', content: body.prompt.trim() },
    ],
  });

  let reply = 'I would rather not answer that one. Ask me about your game and I am all in.';
  let topic = 'other';
  let handoff: Handoff | null = null;
  if (response.stop_reason !== 'refusal') {
    const parsed = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    reply = parsed.reply;
    topic = parsed.topic;
    if (handoffAllowed && parsed.handoff && body.coaches.some((c) => c.id === parsed.handoff.coachId)) {
      // The repeat-topic rule is a hard rule: two earlier mentions plus this one.
      const okRepeat = parsed.handoff.reason !== 'repeat-topic' || repeated.includes(topic);
      if (okRepeat) handoff = { ...parsed.handoff, topic };
    }
  }

  const now = new Date().toISOString();
  const nextExchanges: Exchange[] = [
    ...exchanges,
    { role: 'user', body: body.prompt.trim(), topic, created_at: now },
    { role: 'coach', body: reply, topic, created_at: now },
  ].slice(-40);

  // Every so often, fold the older exchanges into the running summary.
  let nextSummary = summary;
  const userTurns = nextExchanges.filter((e) => e.role === 'user').length;
  if (userTurns > 0 && userTurns % SUMMARISE_EVERY === 0) {
    const folded = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 400,
      output_config: { effort: 'low' },
      system: 'You keep a coach\'s private notes on one player. Update the notes from the transcript. One paragraph, under 120 words, plain sentences: what they are working on, what was advised, what they said helped or did not, anything to watch (injury, schedule). Drop what is no longer relevant. Output only the paragraph.',
      messages: [{ role: 'user', content: `Current notes:\n${summary || '(none)'}\n\nTranscript since:\n${nextExchanges.slice(-2 * SUMMARISE_EVERY).map((e) => `${e.role}: ${e.body}`).join('\n')}` }],
    });
    nextSummary = folded.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || summary;
  }

  await Promise.all([
    admin.from('coach_memory').upsert({ user_id: userId, summary: nextSummary, exchanges: nextExchanges, updated_at: now }),
    admin.from('coach_usage').upsert({ user_id: userId, day, messages: used + 1 }),
  ]);

  let handoffId: string | null = null;
  if (handoff) {
    const inserted = await admin.from('coach_handoffs').insert({ user_id: userId, coach_id: handoff.coachId, reason: handoff.reason, topic }).select('id').single();
    handoffId = inserted.data?.id ?? null;
  }

  return { reply, topic, handoff: handoff ? { ...handoff, id: handoffId } : null, remaining: DAILY_CAP - used - 1 };
}

/* ---------------------------------------------------------------- serving */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const userId = await whoIs(req);
    if (!userId) return json({ error: 'Sign in to talk to the coach.' }, 401);
    const body = clean(await req.json().catch(() => null));
    switch (body.mode) {
      case 'plan':
        return json(await buildPlan(userId, body));
      case 'chat':
        if (!body.prompt?.trim()) return json({ error: 'Empty prompt' }, 400);
        return json(await chat(userId, body));
      case 'memory': {
        const row = await admin.from('coach_memory').select('summary, exchanges, updated_at').eq('user_id', userId).maybeSingle();
        const usage = await admin.from('coach_usage').select('messages').eq('user_id', userId).eq('day', today()).maybeSingle();
        return json({ summary: row.data?.summary ?? '', exchanges: row.data?.exchanges ?? [], updatedAt: row.data?.updated_at ?? null, remaining: DAILY_CAP - (usage.data?.messages ?? 0) });
      }
    }
  } catch (err) {
    // The detail stays in the function log; the client gets a plain line.
    console.error('[ai-coach]', err);
    return json({ error: 'The coach is unavailable right now. Try again in a minute.' }, 500);
  }
});
