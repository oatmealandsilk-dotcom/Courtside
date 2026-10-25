#!/usr/bin/env node
/**
 * The reel start check: proves, with made-up player states, when a clip on a phone may start
 * (Oct 25, owner: "Always ready reels are not live or it dos not work").
 *
 *   node scripts/start-check.mjs
 *
 * It runs the app's own rule (src/features/feed/quickStart.ts, turned into plain JavaScript in a
 * temporary folder: the same decideStart that components/ClipVideo calls on every check) over
 * sample states (how much is fetched, the link, the clip's opening on the phone or not, on screen
 * or waiting off it, admin or not) and prints each decision. It then times a start on a few links.
 * A phone cannot be driven from here (no simulator), so this is what stands in for one.
 * Exit code 0 is a pass, 1 a failure.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadRule() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'courtside-start-'));
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
  const source = fs.readFileSync(path.join(ROOT, 'src/features/feed/quickStart.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  fs.writeFileSync(path.join(dir, 'quickStart.mjs'), outputText);
  return import(pathToFileURL(path.join(dir, 'quickStart.mjs')).href);
}

const q = await loadRule();
let failures = 0;

// A clip 15 s long waiting at its start, the player ready to play: only `buffered` changes.
const probe = (buffered, extra = {}) => ({ status: 'readyToPlay', length: 15, buffered, from: 0, ...extra });
const base = { failed: false, wanted: true, wasReady: false, on: true, link: 'quick', cached: false, heavy: false, stalledBefore: false };

const cases = [
  ['admin, quick link, 1.1 s in, on screen', { probe: probe(1.1) }, true],
  ['admin, quick link, 0.8 s in, on screen', { probe: probe(0.8) }, false],
  ['admin, quick link, 1.1 s in, waiting off screen (a page ahead)', { probe: probe(1.1), wanted: false }, false],
  ['admin, quick link, 3.0 s in, waiting off screen', { probe: probe(3.0), wanted: false }, true],
  ['admin, slow link, 1.5 s in, on screen', { probe: probe(1.5), link: 'slow' }, false],
  ['admin, slow link, 3.0 s in, on screen', { probe: probe(3.0), link: 'slow' }, true],
  ['admin, link not measured yet, 1.2 s in', { probe: probe(1.2), link: 'unknown' }, false],
  ['admin, link not measured yet, opening primed, 1.0 s in', { probe: probe(1.0), link: 'unknown', cached: true }, true],
  ['admin, slow link, opening primed, 1.2 s in', { probe: probe(1.2), link: 'slow', cached: true }, false],
  ['admin, quick link, heavy camera clip (HDR / 13 Mb/s), 1.5 s in', { probe: probe(1.5), heavy: true }, false],
  ['admin, quick link, heavy camera clip, 3.0 s in', { probe: probe(3.0), heavy: true }, true],
  ['admin, quick link, after an early stall this session, 1.5 s in', { probe: probe(1.5), stalledBefore: true }, false],
  ['admin, quick link, player still loading, 2.0 s in', { probe: probe(2.0, { status: 'loading' }) }, false],
  ['admin, quick link, player cannot say yet', { probe: null }, false],
  ['admin, quick link, 0.8 s clip, all of it in (0.75 s)', { probe: probe(0.75, { length: 0.8 }) }, true],
  ['admin, quick link, 0.55 s clip, 0.5 s in (the half-second floor)', { probe: probe(0.5, { length: 0.55 }) }, true],
  ['admin, quick link, trimmed to start at 5 s, 5.9 s in', { probe: probe(5.9, { from: 5 }) }, false],
  ['admin, quick link, trimmed to start at 5 s, 6.0 s in', { probe: probe(6.0, { from: 5 }) }, true],
  ['admin, quick link, ready before (swiped past on the quick rule)', { probe: probe(0.2), wanted: false, wasReady: true }, true],
  ['admin, a clip that cannot load', { probe: probe(0, { status: 'error' }), failed: true }, true],
  ['everyone else, quick link, 1.5 s in, on screen', { probe: probe(1.5), on: false }, false],
  ['everyone else, quick link, opening primed, 1.5 s in', { probe: probe(1.5), on: false, cached: true }, false],
  ['everyone else, quick link, 3.0 s in, on screen', { probe: probe(3.0), on: false }, true],
];

console.log('Decisions (ready = it starts if on screen; its cover lifts)\n');
for (const [name, change, expected] of cases) {
  const d = q.decideStart({ ...base, ...change });
  const ok = d.ready === expected;
  if (!ok) failures += 1;
  const why = d.quick ? 'quick rule' : d.loaded ? 'loaded' : change.failed ? 'cannot load' : d.ready ? 'was ready' : 'waits';
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${d.ready ? 'START' : 'wait '}  (${why.padEnd(11)})  ${name}`);
}

console.log('\nHeavy clips (keep the 3 s rule)\n');
const tracks = [
  ['app-compressed 1080p, 3.5 Mb/s, SDR', { averageBitrate: 3_500_000, videoRange: 'sdr' }, false],
  ['camera file, 13 Mb/s', { averageBitrate: 13_000_000, videoRange: 'sdr' }, true],
  ['camera HDR (Dolby Vision / HLG)', { averageBitrate: 4_000_000, videoRange: 'hlg' }, true],
  ['nothing known yet', null, false],
];
for (const [name, track, expected] of tracks) {
  const heavy = q.heavyTrack(track);
  const ok = heavy === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${heavy ? 'heavy' : 'light'}  ${name}`);
}

// When the clip on screen starts, from the moment it is asked for: 0.3 s before the first byte,
// then fetched at the link's speed. A compressed 1080p clip: about 3.5 Mb/s of picture plus its sound.
console.log('\nTime to start once on screen, on a link measured quick (compressed 1080p clip, 3.6 Mb/s)\n');
const CLIP_BPS = 3_600_000;
const startAt = (linkBps, on, cachedOpening = 0) => {
  for (let ms = 0; ms <= 20_000; ms += 10) {
    // A primed opening is read off the phone in about a tenth of a second.
    const fetched = (ms >= 100 ? cachedOpening : 0) + Math.max(0, ms - 300) / 1000 * (linkBps / CLIP_BPS);
    const d = q.decideStart({ ...base, on, cached: cachedOpening > 0, probe: probe(Math.min(15, fetched)) });
    if (d.ready) return ms;
  }
  return Infinity;
};
console.log('link        3 s rule   quick rule   quick, opening primed (1 s on the phone)');
for (const mbps of [8, 15, 30]) {
  const careful = startAt(mbps * 1e6, false);
  const quick = startAt(mbps * 1e6, true);
  const primed = startAt(mbps * 1e6, true, 1.0);
  if (!(quick < careful) || !(primed <= quick)) failures += 1;
  console.log(`${String(mbps).padStart(2)} Mb/s   ${(careful / 1000).toFixed(2).padStart(6)} s   ${(quick / 1000).toFixed(2).padStart(8)} s   ${(primed / 1000).toFixed(2).padStart(8)} s`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
