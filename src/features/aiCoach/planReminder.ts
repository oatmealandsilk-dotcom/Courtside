import type { TrainingPlan } from '@/data/types';

// Browsers get no morning reminder: there is nowhere to put an 8am alert (see planReminder.native.ts).
export const planRemindersSupported = false;
export async function readPlanReminders(): Promise<boolean> { return false; }
export async function setPlanReminders(_on: boolean): Promise<'on' | 'off' | 'denied'> { return 'off'; }
export async function schedulePlanReminders(_plan: TrainingPlan): Promise<void> {}
