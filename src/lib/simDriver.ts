/*
 * The simulator proof harness (the check-in zoom's videos, zoomV7): the demo build in the iPhone Simulator, driven from the
 * Mac without taps, and its timing lines read back. Only in a demo build (no Supabase: the made-up demo data) bundled with
 * an EXPO_PUBLIC_SIM_* switch set, so a store build or an over-the-air update never runs any of it:
 *  - EXPO_PUBLIC_SIM_DRIVER=1: the Mac's commands (one per line, "action a=1&b=2") are written into sim-cmd.txt in the
 *    app's own Documents folder (xcrun simctl get_app_container ... data); this reads and clears it every 150 ms. Lines
 *    for the Mac go into Documents/sim-log.txt, with the wall clock. The pop-ups that come by themselves stay away.
 *  - EXPO_PUBLIC_SIM_ADMIN=1: the demo's player is an admin (api.ts demoAdmin), as ?admin=1 makes them on the website.
 *  - EXPO_PUBLIC_SIM_ZOOM=1: the check-in zoom on for that admin (checkInZoom), its switches staying off in the code.
 * The website has none of it (simDriver.web.ts).
 */
import type { GeoResult } from '@/lib/geo';
import { isSupabaseConfigured } from '@/lib/supabase';

export const SIM_DRIVER = !isSupabaseConfigured && process.env.EXPO_PUBLIC_SIM_DRIVER === '1';
export const SIM_ZOOM = !isSupabaseConfigured && process.env.EXPO_PUBLIC_SIM_ZOOM === '1';

const waitMs = (ms: number) => new Promise<void>((done) => setTimeout(done, Math.max(0, ms)));
/**
 * The demo's Up to hit, made as slow as the owner's phone (the check-in zoom's proof, v8): the demo has no server, and the
 * Simulator's own location answers at once, so the zoom's start could never show the phone's wait. Bundled with
 * EXPO_PUBLIC_SIM_FIX_MS (the new reading takes this long) and EXPO_PUBLIC_SIM_SERVER_MS (then the server's answer); the
 * Mac's "checkin fix=150&server=280&shift=30&fail=1" changes them (`shift`: the new reading this many metres north of
 * where the phone last was; `fail`: the next answer is a no). Nothing at all outside the harness.
 */
export const simCheckIn = {
  on: SIM_DRIVER,
  fixMs: Number(process.env.EXPO_PUBLIC_SIM_FIX_MS ?? '') || 0,
  serverMs: Number(process.env.EXPO_PUBLIC_SIM_SERVER_MS ?? '') || 0,
  shiftM: 0,
  fail: false,
  async reading(fix: GeoResult): Promise<GeoResult> {
    await waitMs(simCheckIn.fixMs);
    if (!fix.ok || !simCheckIn.shiftM) return fix;
    return { ...fix, lat: fix.lat + simCheckIn.shiftM / 111320 };
  },
  /** The server's answer: true, or (once, after "fail=1") no. */
  async server(): Promise<boolean> {
    await waitMs(simCheckIn.serverMs);
    if (!simCheckIn.fail) return true;
    simCheckIn.fail = false;
    return false;
  },
};

const actions = new Map<string, (args: Record<string, string>) => void>();
/** What a command does (`name`), while whoever registered it is up; the returned function unregisters it. */
export function simAction(name: string, fn: (args: Record<string, string>) => void): () => void {
  if (!SIM_DRIVER) return () => undefined;
  actions.set(name, fn);
  return () => { if (actions.get(name) === fn) actions.delete(name); };
}

/** One command ("name", and its "a=1&b=2"), run on the next turn. */
function run(name: string, query: string) {
  const args: Record<string, string> = {};
  for (const kv of query.split('&')) {
    if (!kv) continue;
    const [k, v = ''] = kv.split('=');
    args[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  const fn = actions.get(name);
  simLog(`[sim] ${name}${fn ? '' : ' (nobody listening)'}`);
  setTimeout(() => fn?.(args), 0);
}

let polling = false;
/** Reads the Mac's commands, from now on (the demo build with EXPO_PUBLIC_SIM_DRIVER only). */
export function startSimPolling() {
  if (!SIM_DRIVER || polling) return;
  polling = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const file = new File(Paths.document, 'sim-cmd.txt');
  const tick = () => {
    try {
      if (file.exists) {
        const text = file.textSync();
        file.delete();
        for (const line of text.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          const [name, query = ''] = t.split(/\s+/, 2);
          run(name, query);
        }
      }
    } catch { /* next time */ }
    setTimeout(tick, 150);
  };
  tick();
}

let logBuf: string[] = [];
let logT: ReturnType<typeof setTimeout> | null = null;
/** A line into Documents/sim-log.txt (read from the Mac), with the wall clock; nothing at all outside the harness. */
export function simLog(line: string) {
  if (!SIM_DRIVER) return;
  logBuf.push(`${Date.now()} ${line}`);
  if (logT) return;
  logT = setTimeout(() => {
    logT = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const f = new File(Paths.document, 'sim-log.txt');
      const old = f.exists ? f.textSync() : '';
      f.write(`${old}${logBuf.join('\n')}\n`);
    } catch { /* lost */ }
    logBuf = [];
  }, 200);
}
