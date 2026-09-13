// CourtSide AI coach — a Supabase Edge Function.
//
// The app never holds the Anthropic key. It sends the player's question plus
// a compact picture of who they are (rating, style, goals, injury notes, this
// week's plan, recovery), and this function asks Claude on their behalf.
//
// Deploy:   supabase functions deploy ai-coach
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import Anthropic from 'npm:@anthropic-ai/sdk@0.71.0';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const SYSTEM = `You are the CourtSide coach: a calm, experienced tennis coach talking to one player.

You are given the player's profile, this week's training plan, and recent recovery data. Work from those — refer to their level, their goals, and their injury notes by name when they matter.

How to answer:
- Be direct and specific. Prefer one clear recommendation over a list of options.
- Keep it short: a few sentences, or a short list when the question is genuinely a sequence. No headings.
- Give reasons a player can feel on court ("because a rushed toss drops your contact point"), not textbook theory.
- Change one variable at a time.
- If the question touches an injury note, cap volume before changing technique, and say so.
- Health, injury and nutrition content is general training information, never a diagnosis. If something sounds like real pain or a medical issue, say to see a professional.
- Never invent data about the player. If you do not know something, ask one short question.`;

interface Turn { role: 'user' | 'coach'; body: string }

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { prompt, context, history = [] } = (await req.json()) as {
      prompt: string; context: string; history?: Turn[];
    };
    if (!prompt?.trim()) return new Response(JSON.stringify({ error: 'Empty prompt' }), { status: 400, headers: cors });

    const messages: Anthropic.MessageParam[] = [
      ...history.slice(-10).map((t) => ({ role: t.role === 'coach' ? 'assistant' as const : 'user' as const, content: t.body })),
      { role: 'user', content: prompt.trim() },
    ];

    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `About this player:\n${context}` },
      ],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return new Response(JSON.stringify({ reply: 'I would rather not answer that one. Ask me about your game and I am all in.' }), { headers: { ...cors, 'content-type': 'application/json' } });
    }
    const reply = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return new Response(JSON.stringify({ reply }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Coach unavailable';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...cors, 'content-type': 'application/json' } });
  }
});
