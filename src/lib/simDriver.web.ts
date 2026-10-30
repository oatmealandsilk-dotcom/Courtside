/* The simulator proof harness (simDriver.ts) is the iPhone Simulator's only: the website has none of it. */
import type { GeoResult } from '@/lib/geo';

export const SIM_DRIVER = false;
export const SIM_ZOOM = false;
export function simAction(_name: string, _fn: (args: Record<string, string>) => void): () => void { return () => undefined; }
export function startSimPolling() { /* never on the website */ }
export function simLog(_line: string) { /* never on the website */ }
export const simCheckIn = {
  on: false,
  fixMs: 0,
  serverMs: 0,
  shiftM: 0,
  fail: false,
  reading: async (fix: GeoResult): Promise<GeoResult> => fix,
  server: async (): Promise<boolean> => true,
};
