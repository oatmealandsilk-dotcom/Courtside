import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';

/**
 * Whether the AI coach is open to players.
 *
 * The server decides: its `ai-coach` function answers `on` only once an
 * Anthropic key has been added to Supabase's secrets. So adding the key is
 * what switches the coach on, for everyone, with no app update, and taking
 * the key away switches it off again. Until then the coach's screens say it
 * is coming soon, and nothing can reach the paid service.
 *
 * The demo build (no Supabase, or a demo account) always shows the coach,
 * answering with stand-in replies, so the screens can be seen and worked on.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An "off" is asked again after a few minutes, so a key added mid-session is noticed. */
const RECHECK_OFF_MS = 5 * 60 * 1000;

let known: { on: boolean; at: number } | null = null;
let asking: Promise<boolean> | null = null;

export function aiCoachStatus(): Promise<boolean> {
  if (!supabase) return Promise.resolve(true);
  if (known && (known.on || Date.now() - known.at < RECHECK_OFF_MS)) return Promise.resolve(known.on);
  asking ??= supabase.functions
    .invoke<{ on?: boolean }>('ai-coach', { body: { mode: 'status' } })
    .then(({ data, error }) => !error && !!data?.on)
    .catch(() => false)
    .then((on) => { known = { on, at: Date.now() }; asking = null; return on; });
  return asking;
}

/** True once the coach is on, false while it is not, undefined while asking. */
export function useAiCoachOn(): boolean | undefined {
  const { currentUserId } = useApp();
  const demo = !supabase || (!!currentUserId && !UUID.test(currentUserId));
  const [on, setOn] = useState<boolean | undefined>(demo ? true : known?.on);
  useEffect(() => {
    if (demo) { setOn(true); return; }
    let current = true;
    void aiCoachStatus().then((v) => { if (current) setOn(v); });
    return () => { current = false; };
  }, [demo]);
  return on;
}

/** Whether replies come from the real coach (false: the demo's stand-ins). */
export function useAiCoachLive(): boolean {
  const { currentUserId } = useApp();
  return !!supabase && !!currentUserId && UUID.test(currentUserId);
}
