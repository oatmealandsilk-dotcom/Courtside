// One-off: fills in who may play at the courts already stored (public,
// members only, pay to book, private), plus fees, indoors and Book links,
// from OpenStreetMap. New courts get this from the courts function itself
// (supabase/functions/courts); this catches up the ones stored before
// migration 60. It needs migration 60 on the database first.
//
// It asks OpenStreetMap's public query server for only the tennis courts
// that carry one of those tags (about 1 in 10), one 5-degree square at a
// time, and hands them to import_court_access in batches of 1,000. That
// only ever sets the map's answer: never a name or a spot, and never over
// what players or an admin said (the database keeps theirs).
//
// Run from the project folder:
//   node scripts/backfill-court-access.mjs --dry                      look only: what would change, nothing written
//   node scripts/backfill-court-access.mjs                            write, through the linked Supabase CLI (no key needed)
//   node scripts/backfill-court-access.mjs --box 35,-79,36,-78 --dry  one area only (south, west, north, east)
//   node scripts/backfill-court-access.mjs --list                     just list the squares (reads only)
// With SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set it writes over the
// API instead of the CLI. It remembers finished squares in a file in the
// temp folder, so it can be stopped and started again (--fresh starts over).
//
// Uses Node 23 or later (it reads the courts function's tags.ts directly;
// Node prints a harmless warning about that file's module type).
//
// Timing, measured Oct 2 on the 258,000 stored courts: 107 squares; a busy
// one (35,-80) took under a minute and found 1,162 tagged courts. The whole
// run should take 30 to 60 minutes and change about 18,000 courts.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { courtTagFacts, saysSomething } from '../supabase/functions/courts/tags.ts';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const boxArg = args.includes('--box') ? args[args.indexOf('--box') + 1] : null;
const STEP = 5;
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const AGENT = 'CourtSide/1.0 (https://courtsidebase.com; support@courtsidebase.com)';
const stateFile = join(tmpdir(), `courtside-backfill-court-access${dry ? '-dry' : ''}.json`);
const viaApi = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One SQL statement through the linked Supabase CLI. Returns its rows. */
function sql(text) {
  const dir = mkdtempSync(join(tmpdir(), 'courtside-sql-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, text);
  try {
    const run = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--output-format', 'json', '-f', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) throw new Error((run.stderr || run.stdout || 'supabase db query failed').slice(0, 400));
    const out = run.stdout.slice(run.stdout.indexOf('{'));
    return JSON.parse(out).rows ?? [];
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The 5-degree squares that hold stored courts, busiest first (read only). */
function squares() {
  if (boxArg) {
    const [s, w, n, e] = boxArg.split(',').map(Number);
    if (![s, w, n, e].every(Number.isFinite) || s >= n || w >= e) throw new Error('--box south,west,north,east');
    return [{ s, w, n, e, courts: null }];
  }
  return sql(`select floor(lat / ${STEP})::int as i, floor(lng / ${STEP})::int as j, count(*)::int as n from public.courts group by 1, 2 order by 3 desc`)
    .map((r) => ({ s: r.i * STEP, w: r.j * STEP, n: (r.i + 1) * STEP, e: (r.j + 1) * STEP, courts: r.n }));
}

/** Tennis courts in a box that carry an access, fee, indoor or website tag: id and tags only. */
async function fetchTagged(b) {
  const box = `${b.s},${b.w},${b.n},${b.e}`;
  const query = `[out:json][timeout:600];nwr["leisure"="pitch"]["sport"~"(^|;)tennis(;|$)"][~"^(access|fee|indoor|covered|building|website|contact:website|reservation:website|booking|booking:website|url)$"~"."](${box});out tags;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': AGENT }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(660_000) });
      if (res.ok) return (await res.json()).elements ?? [];
      console.log(`   ${new URL(url).host} said ${res.status}; waiting`);
    } catch (e) { console.log(`   ${new URL(url).host}: ${String(e).slice(0, 80)}; waiting`); }
    // Busy or rate-limited: back off, longer each time.
    await sleep(15_000 * (attempt + 1));
  }
  throw new Error(`no answer for ${box}`);
}

/** Hands one batch to the database. Returns how many courts changed. */
async function save(rows) {
  if (viaApi) {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/import_court_access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ p_rows: rows }),
    });
    if (!res.ok) throw new Error(`import_court_access ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return Number(await res.json());
  }
  const body = JSON.stringify(rows);
  // Dollar quotes carry the JSON as it is; a court tag containing the marker would end it early.
  if (body.includes('$courts$')) throw new Error('unexpected text in the tags');
  return Number(Object.values(sql(`select public.import_court_access($courts$${body}$courts$::jsonb) as n`)[0] ?? { n: 0 })[0]);
}

if (args.includes('--list')) {
  const all = squares();
  console.log(`${all.length} squares, ${all.reduce((n, b) => n + (b.courts ?? 0), 0)} stored courts. Busiest: ${all.slice(0, 5).map((b) => `${b.s},${b.w} (${b.courts})`).join(', ')}`);
  process.exit(0);
}
const done = new Set(!args.includes('--fresh') && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : []);
const list = squares();
console.log(`${list.length} square${list.length === 1 ? '' : 's'} to read${done.size ? `, ${done.size} already done` : ''}${dry ? ' (dry run: nothing is written)' : ''}`);
const started = Date.now();
let found = 0, changed = 0;
const tally = { public: 0, members: 0, pay: 0, private: 0, unknown: 0 };
for (const [k, b] of list.entries()) {
  const key = `${b.s},${b.w}`;
  if (done.has(key)) continue;
  const t0 = Date.now();
  const elements = await fetchTagged(b);
  const rows = elements
    .map((el) => ({ id: `${el.type}${el.id}`, ...courtTagFacts(el.tags) }))
    .filter((r) => /^(node|way|relation)[0-9]{1,15}$/.test(r.id) && saysSomething(r))
    .map((r) => ({ id: r.id, access: r.osm_access, fee: r.fee, indoor: r.indoor, book_url: r.book_url }));
  for (const r of rows) tally[r.access] += 1;
  found += rows.length;
  let here = 0;
  if (!dry) for (let i = 0; i < rows.length; i += 1000) here += await save(rows.slice(i, i + 1000));
  changed += here;
  done.add(key);
  writeFileSync(stateFile, JSON.stringify([...done]));
  console.log(`${String(k + 1).padStart(4)}/${list.length}  ${key.padEnd(9)} ${b.courts === null ? '' : `${b.courts} stored courts, `}${rows.length} tagged${dry ? '' : `, ${here} changed`}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  // Be polite to the free public server.
  await sleep(3_000);
}
console.log(`\nDone in ${((Date.now() - started) / 60000).toFixed(1)} min: ${found} tagged courts read (${Object.entries(tally).map(([a, n]) => `${a} ${n}`).join(', ')})${dry ? '' : `, ${changed} stored courts changed`}.`);
