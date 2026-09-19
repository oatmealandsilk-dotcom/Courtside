/**
 * Whether the AI coach is open to players.
 *
 * Off, the Coaching tab keeps showing it as coming soon, and its two screens
 * — the coach itself and what it remembers — say the same rather than
 * answering with stand-in replies. Nothing can reach the paid service while
 * this is false, so it cannot run up a bill.
 *
 * To switch it on: change this to true, deploy the `ai-coach` function to
 * Supabase with an Anthropic key, and set a monthly spending limit first.
 */
export const AI_COACH_ON = false;
