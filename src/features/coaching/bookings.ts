import { useEffect, useState } from 'react';

import { remote } from '@/data/remote';
import type { CoachingRequest, CoachService, CoachSpecialty } from '@/data/types';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';

/** What each kind of service is called on screen. */
export const KIND_LABEL: Record<CoachService['kind'], string> = {
  'video-review': 'Video review',
  'written-qa': 'Written answer',
  'live-session': 'Live session',
  plan: 'Training plan',
};

export const SPECIALTY_LABEL: Record<CoachSpecialty, string> = {
  serve: 'Serve', forehand: 'Forehand', backhand: 'Backhand', volleys: 'Volleys', footwork: 'Footwork',
  strategy: 'Strategy', mental: 'Mental game', fitness: 'Fitness', juniors: 'Juniors',
};

/** "2 days", "36 hours", "1 week": how long a coach takes, in words. */
export function turnaround(hours: number): string {
  if (hours % 168 === 0) return hours === 168 ? '1 week' : `${hours / 168} weeks`;
  if (hours % 24 === 0) return hours === 24 ? '1 day' : `${hours / 24} days`;
  return `${hours} hours`;
}

/** Where a booking stands, in a few words. */
export function statusLabel(r: CoachingRequest, asCoach = false): string {
  switch (r.status) {
    case 'awaiting-payment': return 'Not paid yet';
    case 'submitted': return asCoach ? 'New' : 'With the coach';
    case 'in-review': return asCoach ? 'Opened' : 'Being looked at';
    case 'answered': return 'Answered';
    case 'declined': return 'Declined · refunded';
    case 'refunded': return 'Refunded';
    default: return 'Sent';
  }
}

/** Paid, not answered, and past its deadline: the player can have their money back. */
export const isOverdue = (r: CoachingRequest, now = Date.now()) =>
  !!r.paidAt && !r.refundedAt && r.status !== 'answered' && !!r.dueAt && Date.parse(r.dueAt) < now;

/** Still with the coach: paid, not answered, not refunded. */
export const isOpen = (r: CoachingRequest) =>
  r.status === 'submitted' || r.status === 'in-review';

/** "Tue 3:00 PM" */
export const dueText = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let known: { on: boolean; fee: number; at: number } | null = null;

/**
 * Whether paid booking is switched on: the server answers yes once a Stripe
 * key is in Supabase's secrets. The demo always books (without payment).
 * Also gives CourtSide's fee, for the coach's price preview.
 */
export function usePayments(): { on: boolean | undefined; feePercent: number } {
  const { currentUserId } = useApp();
  const demo = !supabase || (!!currentUserId && !UUID.test(currentUserId));
  const [state, setState] = useState<{ on: boolean | undefined; feePercent: number }>(
    demo ? { on: true, feePercent: 15 } : { on: known?.on, feePercent: known?.fee ?? 15 },
  );
  useEffect(() => {
    if (demo) return;
    if (known && (known.on || Date.now() - known.at < 5 * 60_000)) { setState({ on: known.on, feePercent: known.fee }); return; }
    let current = true;
    void remote.paymentsStatus().then((s) => {
      known = { on: !!s?.on, fee: s?.feePercent ?? 15, at: Date.now() };
      if (current) setState({ on: known.on, feePercent: known.fee });
    });
    return () => { current = false; };
  }, [demo]);
  return state;
}
