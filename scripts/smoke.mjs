#!/usr/bin/env node
/**
 * The auto-tester ("smoke test"): opens the web app the way a person would and
 * clicks through the main screens, so a change that breaks one shows up as a
 * red cross instead of on the live site.
 *
 *   npm run smoke                       build the web app, then test it
 *   npm run smoke -- --dist dist        test a build that already exists
 *   npm run smoke -- --serve            build and serve it, no test (to look around)
 *   npm run smoke -- --headed           watch the browser while it runs
 *   npm run smoke -- --out shots        put the screenshots in shots/ (only the
 *                                       tester's own NN-step.png files there are
 *                                       ever replaced; nothing else is deleted)
 *
 * What it does:
 *   1. Builds the web app in demo mode: no Supabase settings, so the app runs
 *      on its built-in sample data and never talks to the live database. Any
 *      request to Supabase is blocked as well, and fails the run. Each run
 *      builds into a fresh folder of its own (removed when it ends), so runs
 *      in several worktrees at once never trip over each other.
 *   2. Serves the build on a free port on this machine.
 *   3. Drives headless Chrome at a phone's width (390px) through sign-in, every
 *      tab and the main pages, over Chrome's own debugging connection (no
 *      extra packages).
 *   4. Fails on an uncaught error, a console error that is not on the known-
 *      harmless list, a blank screen, or a screen missing what it should show.
 *   5. Saves a screenshot of every step (smoke-screenshots/ by default) and
 *      prints a one-line summary.
 *
 * Exit code 0 is a pass, 1 a failure, 2 a problem with the tester itself
 * (no Chrome, the build failed).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : fallback;
};
const OPTS = {
  dist: option('dist', process.env.SMOKE_DIST || ''),
  out: path.resolve(ROOT, option('out', process.env.SMOKE_OUT || 'smoke-screenshots')),
  serve: flag('serve'),
  headed: flag('headed'),
  verbose: flag('verbose') || !!process.env.SMOKE_VERBOSE,
  // Block every other site (map tiles, weather), to check the app copes without them.
  offline: flag('offline') || !!process.env.SMOKE_OFFLINE,
  // Make the page's processor this many times slower, to try out a slow machine.
  slowdown: Number(option('slowdown', process.env.SMOKE_SLOWDOWN || '1')) || 1,
  // Draw in software, as on a machine with no graphics chip (always so on Linux).
  softwareGl: flag('software-gl') || !!process.env.SMOKE_SOFTWARE_GL || process.platform === 'linux',
  timezone: option('timezone', process.env.SMOKE_TIMEZONE || 'America/Los_Angeles'),
  width: 390,
  height: 844,
};

/** The phone the browser pretends to be: a touch screen, so the app lays itself out as it does on a phone. */
const PHONE_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

/**
 * Console errors known to be harmless. Each is a pattern on the message text;
 * anything else logged as an error fails the run. Add to this list only for a
 * message that is expected in the demo build, with a line saying why.
 */
const HARMLESS = [
  // The demo build says so, on purpose (src/lib/supabase.ts).
  /\[supabase\] EXPO_PUBLIC_SUPABASE_URL \/ _KEY are not set/,
];

/**
 * The live backend: Supabase itself and its own address (auth.courtsidebase.com).
 * A test must never reach it, so the browser blocks it outright and the run
 * fails if the app even tries.
 */
const LIVE_BACKEND = /^https?:\/\/([^/]*\.)?(supabase\.(co|in)|courtsidebase\.com)(\/|:|$)/i;
const LIVE_BACKEND_PATTERNS = ['*supabase.co*', '*supabase.in*', '*courtsidebase.com*'];

/** How long to wait for any one thing to show up. GitHub's machines are slower than a Mac. */
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS) || (process.env.CI ? 30000 : 15000);

/** The map draws with the graphics chip; on a machine without one (GitHub's) it is drawn in software, slowly. */
const MAP_TIMEOUT = TIMEOUT * 2;

const started = Date.now();
const log = (...parts) => { if (OPTS.verbose) console.log(`[smoke ${((Date.now() - started) / 1000).toFixed(1)}s]`, ...parts); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** A deadline to race against, which never keeps the script running by itself. */
const deadline = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());

class SetupError extends Error {}

// ---------------------------------------------------------------------------
// 1. Build (demo mode)
// ---------------------------------------------------------------------------

/** How long the build may take before the run gives up on it, rather than hanging until GitHub stops the job. */
const BUILD_TIMEOUT = Number(process.env.SMOKE_BUILD_TIMEOUT_MS) || 5 * 60 * 1000;

/** Build folders this run made, removed again when it ends (however it ends). */
const madeBuilds = new Set();
function removeBuilds() {
  for (const dist of madeBuilds) {
    try { fs.rmSync(dist, { recursive: true, force: true }); } catch { /* best effort */ }
    madeBuilds.delete(dist);
  }
}
process.on('exit', removeBuilds);

/**
 * Build folders left behind by a run that was killed outright (nothing gets
 * to tidy up then). Only ones over a day old: a run that old is not running.
 */
function removeStaleBuilds(scratch) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(scratch, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('dist-')) continue;
    const folder = path.join(scratch, entry.name);
    try { if (fs.statSync(folder).mtimeMs < dayAgo) fs.rmSync(folder, { recursive: true, force: true }); } catch { /* another run's, or gone */ }
  }
}

function buildDemo() {
  // Its own scratch folder, so its own Metro cache (Metro keeps it in the
  // system's temp folder). Metro's shared cache does not notice the Supabase
  // settings changing, so sharing it would hand this build the real settings
  // from an earlier real build, or hand a later real build the empty ones.
  // Every smoke run shares this one (it is demo-only), so later builds are quick.
  // SMOKE_CACHE_DIR moves it (GitHub keeps it between runs from there).
  const scratch = path.resolve(process.env.SMOKE_CACHE_DIR || path.join(os.tmpdir(), 'courtside-smoke'));
  fs.mkdirSync(scratch, { recursive: true });
  removeStaleBuilds(scratch);
  // The build itself goes in a folder of its own for this run: several
  // worktrees may run the tester at once, and a shared folder would be wiped
  // or replaced by another run halfway through this one.
  const dist = fs.mkdtempSync(path.join(scratch, 'dist-'));
  madeBuilds.add(dist);
  log('building the web app in demo mode →', dist);
  const expo = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
  if (!fs.existsSync(expo)) throw new SetupError('node_modules is missing: run `npm install --legacy-peer-deps` first.');
  const result = spawnSync(expo, ['export', '--platform', 'web', '--output-dir', dist], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
    timeout: BUILD_TIMEOUT,
    killSignal: 'SIGKILL',
    stdio: OPTS.verbose ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      // Demo mode: no Supabase settings at all, and the .env file is not read,
      // so a Mac with the real settings in .env still tests the demo build.
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_SUPABASE_URL: '',
      EXPO_PUBLIC_SUPABASE_KEY: '',
      EXPO_BASE_URL: '',
      CI: '1',
      TMPDIR: scratch,
      TMP: scratch,
      TEMP: scratch,
    },
  });
  if (result.error?.code === 'ETIMEDOUT') {
    if (!OPTS.verbose) process.stderr.write(`${result.stdout ?? ''}\n${result.stderr ?? ''}\n`);
    throw new SetupError(`the web build took longer than ${(BUILD_TIMEOUT / 60000).toFixed(0)} minutes, so it was stopped (SMOKE_BUILD_TIMEOUT_MS sets the limit)`);
  }
  if (result.status !== 0) {
    if (!OPTS.verbose) process.stderr.write(`${result.stdout ?? ''}\n${result.stderr ?? ''}\n`);
    throw new SetupError(`the web build failed (expo export exited ${result.status ?? result.signal ?? result.error?.message})`);
  }
  return dist;
}

// ---------------------------------------------------------------------------
// 2. Serve
// ---------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.pbf': 'application/x-protobuf',
};

/** A tiny static server with the same fallback as the live site: an unknown page gets the app, which routes it. */
function serve(dist) {
  const index = path.join(dist, 'index.html');
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { pathname = '/'; }
    let file = path.join(dist, pathname);
    if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      // A page of the app (no file extension): hand over the app. A missing file is a real 404.
      if (path.extname(pathname) && !pathname.endsWith('.html')) { res.writeHead(404).end(); return; }
      file = index;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

// ---------------------------------------------------------------------------
// 3. Chrome, over its debugging pipe
// ---------------------------------------------------------------------------

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
    if (found) return found;
  }
  throw new SetupError('Chrome was not found: install Google Chrome, or set CHROME_PATH to it.');
}

/** A minimal Chrome DevTools Protocol client over --remote-debugging-pipe (JSON messages ending in a zero byte). */
class Cdp {
  constructor(input, output) {
    this.input = input;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = null;
    input.on('error', () => {}); // Chrome gone: reported through close() instead
    let buffer = Buffer.alloc(0);
    output.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let end;
      while ((end = buffer.indexOf(0)) >= 0) {
        const message = JSON.parse(buffer.subarray(0, end).toString('utf8'));
        buffer = buffer.subarray(end + 1);
        if (message.id && this.pending.has(message.id)) {
          const { resolve, reject, method, timer } = this.pending.get(message.id);
          clearTimeout(timer);
          this.pending.delete(message.id);
          if (message.error) reject(new Error(`${method}: ${message.error.message}`));
          else resolve(message.result);
        } else if (message.method) {
          for (const listener of this.listeners) listener(message);
        }
      }
    });
  }
  /**
   * Sends one command. A page stuck in an endless loop never answers, so
   * every command gives up after a minute rather than hanging the run.
   */
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error(`${method}: ${this.closed}`));
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: Chrome did not answer within 60s (the page may be frozen)`));
      }, 60000);
      this.pending.set(id, { resolve, reject, method, timer });
      this.input.write(`${JSON.stringify(message)}\0`);
    });
  }
  /** Chrome has gone: everything still waiting fails now instead of hanging. */
  close(reason) {
    this.closed = reason;
    for (const { reject, method, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error(`${method}: ${reason}`)); }
    this.pending.clear();
  }
  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

async function launchChrome() {
  const bin = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'courtside-smoke-chrome-'));
  const args = [
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    '--password-store=basic',
    '--use-mock-keychain',
    `--window-size=${OPTS.width},${OPTS.height}`,
    ...(OPTS.headed ? [] : ['--headless=new']),
    // The map needs WebGL; with no graphics chip, Chrome only offers it in software when asked.
    ...(OPTS.softwareGl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
    '--lang=en-US',
    // GitHub's Ubuntu 24.04 runners do not allow Chrome's sandbox.
    ...(process.env.CI && process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    'about:blank',
  ];
  log('starting Chrome:', bin);
  const chrome = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  const cdp = new Cdp(chrome.stdio[3], chrome.stdio[4]);
  const exited = new Promise((resolve) => chrome.on('exit', (code, signal) => {
    cdp.close(`Chrome quit (${signal ?? `exit ${code}`})`);
    resolve(code ?? signal);
  }));
  const version = await Promise.race([
    cdp.send('Browser.getVersion'),
    exited.then((code) => { throw new SetupError(`Chrome quit on start (exit ${code}): ${stderr.trim().split('\n').slice(-3).join(' ')}`); }),
    new Promise((_, reject) => setTimeout(() => reject(new SetupError('Chrome did not answer within 30s')), 30000).unref()),
  ]);
  log('Chrome', version.product);
  const close = async () => {
    try { await Promise.race([cdp.send('Browser.close'), deadline(3000)]); } catch { /* already gone */ }
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
    await Promise.race([exited, deadline(3000)]);
    for (const stream of chrome.stdio) stream?.destroy();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
  };
  return { cdp, close, product: version.product };
}

// ---------------------------------------------------------------------------
// The page: driving it, and watching it for trouble
// ---------------------------------------------------------------------------

/**
 * Runs inside the page. `find` looks for what a step names, on screen:
 *   text:  the visible words (a string is an exact match after trimming, a
 *          { re } a regular expression)
 *   label: the accessibility label (aria-label), same matching
 *   placeholder, testId (data-testid), css (a CSS selector)
 *   any:   counts it even when something else lies over it
 *   index: the nth match (0 is the first)
 */
const PAGE_HELPERS = String.raw`
(() => {
  if (window.__smoke) return;
  const matches = (value, want) => {
    if (value == null) return false;
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (typeof want === 'string') return text === want;
    return new RegExp(want.re, want.flags || '').test(text);
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return null;
    // Hidden itself, or inside something hidden or see-through (a page fading out).
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
    return r;
  };
  const ownText = (el) => {
    // The element's own words: what it says, without counting a large container as a match.
    let text = '';
    for (const node of el.childNodes) if (node.nodeType === 3) text += node.textContent;
    return text;
  };
  const candidates = (spec) => {
    if (spec.css) return [...document.querySelectorAll(spec.css)];
    if (spec.testId) return [...document.querySelectorAll('[data-testid]')].filter((el) => matches(el.getAttribute('data-testid'), spec.testId));
    if (spec.label) return [...document.querySelectorAll('[aria-label]')].filter((el) => matches(el.getAttribute('aria-label'), spec.label));
    if (spec.placeholder) return [...document.querySelectorAll('[placeholder]')].filter((el) => matches(el.getAttribute('placeholder'), spec.placeholder));
    if (spec.text) return [...document.body.querySelectorAll('*')].filter((el) => matches(ownText(el), spec.text) || (el.children.length === 0 && matches(el.textContent, spec.text)));
    return [];
  };
  const topAt = (r) => document.elementFromPoint(
    Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)),
    Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)),
  );
  const onTop = (el, r) => {
    const hit = topAt(r);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  };
  const name = (el) => {
    if (!el) return 'nothing';
    const labelled = el.closest('[aria-label]');
    if (labelled) return labelled.getAttribute('aria-label').slice(0, 80);
    return el.tagName.toLowerCase() + ' "' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) + '"';
  };
  window.__smoke = {
    /**
     * The match on screen and on top: { x, y, … }. When every match on
     * screen is under something else: { covered: true, by }. None: null.
     */
    find(spec) {
      const found = [];
      let covered = null;
      for (const el of candidates(spec)) {
        const r = visible(el);
        if (!r) continue;
        if (!spec.any && !onTop(el, r)) { covered = covered || { covered: true, by: name(topAt(r)) }; continue; }
        found.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, label: el.getAttribute('aria-label'), text: (el.textContent || '').trim().slice(0, 80) });
      }
      return found[spec.index || 0] || covered;
    },
    /** Scrolls the first drawn match into the middle of the screen, as a thumb would; false while there is none. */
    reveal(spec) {
      const el = candidates(spec).find((e) => {
        const r = e.getBoundingClientRect();
        return r.width >= 2 && r.height >= 2 && e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      });
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      return true;
    },
    /** Tips ("Tip: … Tap to close.") that sit over what we want to tap. */
    tips() {
      return candidates({ label: { re: '^Tip: .*Tap to close' } })
        .map((el) => [el, visible(el)])
        .filter(([el, r]) => r && onTop(el, r))
        .map(([, r]) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }));
    },
    /**
     * What is on screen right now: the topmost element at points spread over
     * the whole screen. A blank page (or a stuck curtain) hits only one or two
     * things; a real screen hits dozens.
     */
    health() {
      const seen = new Set();
      let words = '';
      for (let gx = 1; gx < 8; gx++) {
        for (let gy = 1; gy < 16; gy++) {
          const el = document.elementFromPoint((innerWidth * gx) / 8, (innerHeight * gy) / 16);
          if (!el || seen.has(el)) continue;
          seen.add(el);
          if (el.childElementCount === 0) words += ' ' + (el.textContent || '');
        }
      }
      const root = document.getElementById('root');
      const all = (root ? root.innerText : '').replace(/\s+/g, ' ').trim();
      return {
        distinct: seen.size,
        words: words.replace(/\s+/g, ' ').trim().slice(0, 160),
        mounted: !!root && root.childElementCount > 0 && all.length > 0,
        crashed: (all.match(/Something went wrong|Unmatched Route|This screen doesn.t exist|Page could not be found/) || [null])[0],
        path: location.pathname + location.search,
      };
    },
  };
})();
`;

class Page {
  constructor(cdp, sessionId, origin) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.origin = origin;
    this.problems = []; // { kind, text } — anything that fails the run
    this.notes = [];    // harmless noise, kept for --verbose
    this.blockedSupabase = [];
    this.elsewhere = new Set(); // other sites the app loaded something from (map tiles, weather)
    this.requests = new Map(); // request id → address, to name a failed download
    this.failedElsewhere = []; // downloads from other sites that failed: the network's doing, not the app's
    this.warnings = []; // shown with the result, but not a failure
  }
  send(method, params) { return this.cdp.send(method, params, this.sessionId); }

  async start() {
    this.cdp.on((message) => { if (message.sessionId === this.sessionId) this.onEvent(message); });
    await Promise.all([
      this.send('Page.enable'),
      this.send('Runtime.enable'),
      this.send('Log.enable'),
      this.send('Network.enable'),
    ]);
    // The live database must never be reached from a test.
    await this.send('Network.setBlockedURLs', { urls: LIVE_BACKEND_PATTERNS });
    // --offline: every request to another site fails, as with no network beyond this machine.
    if (OPTS.offline) await this.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    if (OPTS.slowdown > 1) await this.send('Emulation.setCPUThrottlingRate', { rate: OPTS.slowdown });
    await this.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    // The same clock everywhere (GitHub's machines run on UTC): the demo's players are in Los Angeles.
    await this.send('Emulation.setTimezoneOverride', { timezoneId: OPTS.timezone });
    await this.send('Emulation.setDeviceMetricsOverride', { width: OPTS.width, height: OPTS.height, deviceScaleFactor: 2, mobile: true });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await this.send('Emulation.setUserAgentOverride', { userAgent: PHONE_AGENT, platform: 'Linux armv8l', userAgentMetadata: { mobile: true, platform: 'Android', platformVersion: '14', architecture: '', model: 'Pixel 8', brands: [{ brand: 'Chromium', version: '129' }, { brand: 'Google Chrome', version: '129' }] } });
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });
  }

  onEvent({ method, params }) {
    if (method === 'Fetch.requestPaused') {
      const local = params.request.url.startsWith(this.origin);
      this.send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: params.requestId } : { requestId: params.requestId, errorReason: 'InternetDisconnected' }).catch(() => {});
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      const text = d.exception?.description || d.exception?.value || d.text || 'unknown exception';
      this.problems.push({ kind: 'uncaught exception', text: String(text).split('\n').slice(0, 4).join(' | ') });
    } else if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
      const text = params.args.map((a) => a.value ?? a.description ?? a.unserializableValue ?? `[${a.type}]`).join(' ');
      if (HARMLESS.some((re) => re.test(text))) this.notes.push(`console.error (harmless): ${text}`);
      else this.problems.push({ kind: 'console error', text: text.slice(0, 400) });
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      const { text, url = '' } = params.entry;
      const local = url.startsWith(this.origin);
      if (LIVE_BACKEND.test(url)) this.blockedSupabase.push(url);
      // The browser asks every site for /favicon.ico on its own; the app has none.
      else if (/\/favicon\.ico$/.test(url)) this.notes.push(`no favicon: ${url}`);
      else if (local || !url) this.problems.push({ kind: 'browser error', text: `${text}${url ? ` (${url.replace(this.origin, '')})` : ''}`.slice(0, 400) });
      // Another site's picture or map tile failing to load is the network's doing, not the app's.
      else this.notes.push(`external load failed: ${text} ${url}`);
    } else if (method === 'Network.loadingFailed' && !params.canceled) {
      const url = this.requests.get(params.requestId) ?? '';
      if (/^https?:/.test(url) && !url.startsWith(this.origin) && !LIVE_BACKEND.test(url)) this.failedElsewhere.push({ url, error: params.errorText });
    } else if (method === 'Network.requestWillBeSent') {
      this.requests.set(params.requestId, params.request.url);
      const url = params.request.url;
      if (LIVE_BACKEND.test(url)) this.blockedSupabase.push(url);
      else if (/^https?:/.test(url) && !url.startsWith(this.origin)) this.elsewhere.add(new URL(url).host);
    }
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`in-page: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result.value;
  }
  async call(fn, ...args) {
    return this.eval(`${PAGE_HELPERS}\n(${fn})(...${JSON.stringify(args)})`);
  }

  async goto(pathname) {
    await this.send('Page.navigate', { url: this.origin + pathname });
    await this.waitUntil(async () => (await this.eval('document.readyState')) === 'complete', 30000, `page ${pathname} to load`);
  }

  /** Waits until `check` returns something truthy, and returns it. `what` names it in the error (a function is asked at the end). */
  async waitUntil(check, timeout, what) {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      try { last = await check(); if (last) return last; } catch (err) { last = err; if (this.cdp.closed) throw err; }
      await sleep(150);
    }
    const named = typeof what === 'function' ? what() : what;
    throw new Error(`timed out after ${(timeout / 1000).toFixed(0)}s waiting for ${named}${last instanceof Error ? ` (${last.message})` : ''}`);
  }

  find(spec) { return this.call((s) => window.__smoke.find(s), normalise(spec)); }
  /** Scrolls down (or up) to something further along the page, once it is there. */
  async reveal(spec, timeout = TIMEOUT) {
    await this.waitUntil(() => this.call((s) => window.__smoke.reveal(s), normalise(spec)), timeout, `${describe(spec)} to scroll into view`);
    await sleep(300);
  }

  /**
   * Waits for something to be on screen and on top, and returns where it is.
   * With `still`, also waits for it to stop moving (a page sliding in), so a
   * tap lands on it. A tip lying over it is closed, the way a person would.
   */
  async waitFor(spec, timeout = TIMEOUT, { still = false } = {}) {
    let before = null;
    let coveredBy = null;
    return this.waitUntil(async () => {
      let at = await this.find(spec);
      if (at?.covered) {
        coveredBy = at.by;
        if (/^Tip: /.test(at.by)) await this.closeTips();
        at = null;
      }
      if (!still) return at;
      const settled = at && before && Math.abs(at.x - before.x) < 1 && Math.abs(at.y - before.y) < 1;
      before = at;
      return settled ? at : null;
    }, timeout, () => `${describe(spec)}${coveredBy ? ` (it is there, but under "${coveredBy}")` : ''}`);
  }
  waitForStill(spec, timeout) { return this.waitFor(spec, timeout, { still: true }); }

  /** Waits for the first of several things to show, and says which (its place in the list). */
  async waitForAny(specs, timeout = TIMEOUT) {
    return this.waitUntil(async () => {
      for (const [index, spec] of specs.entries()) {
        const at = await this.find(spec);
        if (at && !at.covered) return { index, at };
      }
      return null;
    }, timeout, `any of ${specs.map(describe).join(', ')}`);
  }

  async gone(spec, timeout = TIMEOUT) {
    return this.waitUntil(async () => !(await this.find(spec)), timeout, `${describe(spec)} to go away`);
  }

  /** Closes the app's tips (each says "Tap to close"), the way a person would. */
  async closeTips() {
    const tips = await this.call(() => window.__smoke.tips());
    for (const tip of tips) { log('closing a tip'); await this.tapAt(tip.x, tip.y); await sleep(250); }
  }

  /** A finger tap: touch down and up on the spot. */
  async tapAt(x, y) {
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
    await sleep(50);
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async tap(spec, timeout) {
    const at = await this.waitForStill(spec, timeout);
    log('tap', describe(spec), `@${Math.round(at.x)},${Math.round(at.y)}`);
    await this.tapAt(at.x, at.y);
    return at;
  }
  /** A press held down (a long-press), for the menus that open on a hold. */
  async hold(spec, ms = 900, timeout) {
    const at = await this.waitForStill(spec, timeout);
    log('hold', describe(spec));
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
    await sleep(ms);
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return at;
  }
  /** Types into whatever has the keyboard, as a phone's keyboard would. */
  async type(text) { await this.send('Input.insertText', { text }); }

  async health() { return this.call(() => window.__smoke.health()); }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
}

const normalise = (spec) => {
  if (typeof spec === 'string' || spec instanceof RegExp) spec = { text: spec };
  const out = { ...spec };
  for (const key of ['text', 'label', 'testId', 'placeholder']) {
    if (out[key] instanceof RegExp) out[key] = { re: out[key].source, flags: out[key].flags };
  }
  return out;
};
const describe = (spec) => {
  if (typeof spec === 'string' || spec instanceof RegExp) return `"${spec}"`;
  const key = ['label', 'text', 'testId', 'placeholder', 'css'].find((k) => spec[k]);
  return `${key} ${spec[key] instanceof RegExp ? spec[key] : `"${spec[key]}"`}`;
};

// ---------------------------------------------------------------------------
// The flows: what a person does, in order. Each step ends on a screen that
// must show what `expect` lists; each is photographed.
// ---------------------------------------------------------------------------

/** Waits for every one of `specs` to be on screen. */
async function expectAll(page, specs) {
  for (const spec of specs) { await page.waitFor(spec); log('saw', describe(spec)); }
}


/**
 * Your sessions opens with the week's summary and To do above the sessions
 * (Oct 6), so the first session can sit below the fold: brought
 * into view the way a person would scroll to it.
 */
const showFirstSession = (page) => page.waitUntil(() => page.call(() => {
  const el = document.querySelector('[aria-label^="Share to Instagram: "]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  return true;
}), 15000, 'a session in Your sessions');

/** A day's bar in the This week chart, named by its weekday ("Thursday, 1 hour 20 minutes"); today's says "Today". */
const WEEKDAY_BAR = /^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day, /;

const STEPS = [
  {
    name: 'sign-in',
    title: 'Sign in to the demo',
    async run(page) {
      await page.goto('/');
      await page.tap('I already have an account', 45000);
      // The demo form, not the real one: proof this build has no database behind it.
      await page.waitFor({ text: /^Demo build — no accounts, no database/ });
      await page.tap({ text: 'Enter' });
    },
    expect: [{ label: 'Community' }, { text: 'Find Players' }],
  },
  {
    name: 'community-map',
    title: 'Community: the map card',
    async run(page) {
      await page.waitFor({ label: 'Map of players, courts and hits near you' });
      // Either the map draws (its canvas appears), or the app shows its own
      // "Map didn’t load" card. Never stuck on "Loading map…".
      const { index } = await page.waitForAny([{ css: 'canvas.maplibregl-canvas', any: true }, { text: 'Map didn’t load', any: true }], MAP_TIMEOUT);
      const mapDownload = page.failedElsewhere.find((f) => /tile|style|sprite|glyph|font|map/i.test(f.url));
      if (index === 0) {
        await page.gone({ label: 'Loading map' }, MAP_TIMEOUT);
      } else if (mapDownload) {
        // The map server could not be reached (GitHub's network, or theirs): the
        // card is the app doing the right thing, so it is noted, not failed.
        page.warnings.push(`the map server could not be reached (${new URL(mapDownload.url).host}: ${mapDownload.error}), so the map card showed "Map didn’t load"`);
      } else {
        throw new Error('the map card says "Map didn’t load", though the map server answered');
      }
    },
    expect: [{ text: 'Open to hit' }, { text: 'Open hits' }],
  },
  {
    name: 'community-discussions',
    title: 'Community: Discussions',
    async run(page) {
      await page.tap({ text: 'Discussions' });
    },
    expect: [{ text: /^\d+ threads?$/ }],
    after: async (page) => { await page.tap({ text: 'Find Players' }); },
  },
  {
    name: 'feed',
    title: 'Feed tab',
    async run(page) {
      await page.tap({ label: 'Feed' });
    },
    expect: [{ label: 'Clip comments' }, { label: 'For you' }],
  },
  {
    name: 'clip-comments',
    title: 'A clip’s comments',
    async run(page) {
      await page.tap({ label: 'Clip comments' });
    },
    expect: [{ text: 'Comments' }, { label: /^Add a comment/ }],
    after: async (page) => { await page.tap({ label: 'Close' }); await page.gone({ label: /^Add a comment/ }); },
  },
  {
    name: 'coaching',
    title: 'Coaching tab',
    async run(page) {
      await page.tap({ label: 'Coaching' });
    },
    expect: [{ text: 'Ask a coach' }, { label: 'AI coach' }],
  },
  {
    name: 'profile',
    title: 'Profile tab',
    async run(page) {
      await page.tap({ label: 'Profile' });
    },
    expect: [{ text: 'Edit Profile' }, { text: '@you' }],
  },
  {
    name: 'settings',
    title: 'Settings',
    async run(page) {
      // The ☰ button opens a small menu (Groups, Settings) since the Tennis profile redesign.
      await page.tap({ label: /^Menu: groups and settings/ });
      await page.tap({ label: 'Settings' });
    },
    expect: [{ label: 'Account center' }, { label: 'Privacy center' }],
    after: async (page) => { await page.tap({ label: 'Go back' }); await page.waitFor({ text: 'Edit Profile' }); },
  },
  {
    name: 'week-chart',
    title: 'This week chart',
    async run(page) {
      // The Tennis profile's Activity tab (the first, on a fresh browser): the week's time over a bar a day.
      await page.tap({ label: /tennis profile\./ });
      await page.reveal({ label: /^Today, / });
    },
    expect: [{ text: 'on court in the last 7 days' }, { label: /^Today, / }],
  },
  {
    name: 'week-chart-day',
    title: 'This week chart: tap a day',
    async run(page) {
      // Like the phone's Screen Time: yesterday's bar (the sixth with a weekday's name; today's says "Today")
      // shows that day's time, counting up, and that day's numbers.
      await page.tap({ label: WEEKDAY_BAR, index: 5 });
      await sleep(800); // the count-up, finished before the picture
    },
    expect: [{ text: 'on court yesterday' }],
    after: async (page) => {
      // The same bar again: back to the whole week.
      await page.tap({ label: WEEKDAY_BAR, index: 5 });
      await page.waitFor({ text: 'on court in the last 7 days' });
      await page.tap({ label: 'Go back' });
      await page.waitFor({ text: 'Edit Profile' });
    },
  },
  {
    name: 'your-sessions',
    title: 'Your sessions',
    async run(page) {
      // Your sessions lives inside the Tennis profile since the redesign: its
      // Activity tab (the first, on a fresh browser), under This week.
      await page.tap({ label: /tennis profile\./ });
      await page.reveal({ label: 'See all your sessions' });
      await page.tap({ label: 'See all your sessions' });
      await showFirstSession(page);
    },
    expect: [{ label: /^Share to Instagram: / }],
  },
  {
    name: 'share-session',
    title: 'Share a session (Instagram story picture)',
    async run(page) {
      await page.tap({ label: /^Share to Instagram: / });
    },
    expect: [{ label: 'Share to Instagram Stories' }, { label: 'Save the picture' }, { text: 'Card' }],
    after: async (page) => { await page.tap({ label: 'Go back' }); await showFirstSession(page); await page.waitFor({ label: /^Share to Instagram: / }); },
  },
  {
    name: 'post',
    title: 'Open a post',
    async run(page) {
      await page.tap({ label: /^Posted\. Open the post/ });
    },
    expect: [{ label: 'Comments' }, { label: 'Share this post' }],
  },
  {
    name: 'post-comments',
    title: 'The post’s comments',
    async run(page) {
      await page.tap({ label: 'Comments' });
    },
    expect: [{ label: /^Add a comment/ }],
    after: async (page) => {
      await page.tap({ label: 'Close' });
      await page.gone({ label: /^Add a comment/ });
      await page.tap({ label: 'Profile' });
      await page.waitFor({ text: 'Edit Profile' });
    },
  },
  {
    name: 'messages',
    title: 'Messages',
    async run(page) {
      await page.tap({ label: /^Messages/ });
    },
    expect: [{ label: /^Open conversation with / }, { label: 'Start a new message' }],
  },
  {
    name: 'chat',
    title: 'Open a chat and send a message',
    async run(page) {
      await page.tap({ label: /^Open conversation with / });
      await page.tap({ label: 'Message text' });
      await page.type('Smoke test: hello from the auto-tester');
      await page.tap({ label: 'Send message' });
      // Sent: it shows in the chat (a tip may lie over it, which is fine).
      await page.waitFor({ text: 'Smoke test: hello from the auto-tester', any: true });
    },
    expect: [{ label: 'Message text' }, { label: 'Chat details' }],
    after: async (page) => {
      await page.tap({ label: 'Back' });
      await page.tap({ label: 'Go back' });
      await page.waitFor({ text: 'Edit Profile' });
    },
  },
  {
    name: 'search',
    title: 'Search',
    async run(page) {
      await page.tap({ label: 'Community' });
      await page.tap({ label: 'Search discussions and players' });
      await page.tap({ label: 'Search CourtSide' });
      await page.type('serve');
    },
    expect: [{ label: /@\w*serve/ }],
    after: async (page) => { await page.tap({ label: 'Go back' }); await page.waitFor({ text: 'Find Players' }); },
  },
  {
    name: 'open-to-hit',
    title: 'Open to hit: hold your ring',
    async run(page) {
      // Your own ring, off ("I’m free") or on ("You’re open to hit…"); a hold opens its sheet.
      await page.hold({ label: /^I’m free\. Turn on open to hit$|^You’re open to hit.*Turn off$/ });
    },
    expect: [{ text: 'Open until' }, { text: 'Save' }],
    after: async (page) => { await page.tap({ label: 'Close' }); await page.gone({ text: 'Open until' }); },
  },
];

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

async function checkScreen(page) {
  const health = await page.health();
  if (health.crashed) throw new Error(`the screen shows "${health.crashed}" (${health.path})`);
  if (!health.mounted || health.distinct < 5) throw new Error(`the screen is blank (${health.path}; ${health.distinct} things on screen)`);
  return health;
}

function takeProblems(page, since) {
  return page.problems.slice(since);
}

/** The tester's own screenshots ("01-sign-in.png", "07-settings-FAILED.png"): the only files it ever deletes. */
const SCREENSHOT = /^\d{2}-[a-z0-9-]+(-FAILED)?\.png$/;

/**
 * Makes the screenshot folder, and clears out the last run's screenshots.
 * Nothing else in it is touched: `--out` can name any folder (even the
 * project, or the Desktop), so the folder itself is never deleted.
 */
function prepareScreenshots(out) {
  try {
    fs.mkdirSync(out, { recursive: true });
  } catch (err) {
    throw new SetupError(`cannot use ${out} for the screenshots: ${err.message}`);
  }
  if (!fs.statSync(out).isDirectory()) throw new SetupError(`${out} is a file, not a folder: choose another --out`);
  for (const entry of fs.readdirSync(out, { withFileTypes: true })) {
    if (entry.isFile() && SCREENSHOT.test(entry.name)) fs.rmSync(path.join(out, entry.name));
  }
}

async function main() {
  try {
    return await run();
  } finally {
    removeBuilds();
  }
}

async function run() {
  let dist = OPTS.dist ? path.resolve(ROOT, OPTS.dist) : '';
  if (dist && !fs.existsSync(path.join(dist, 'index.html'))) throw new SetupError(`no web build at ${dist}`);
  if (!dist) dist = buildDemo();
  checkDemoBuild(dist);

  const { server, origin } = await serve(dist);
  if (OPTS.serve) {
    console.log(`Serving the demo build at ${origin} — press Ctrl+C to stop.`);
    // Stopped by Ctrl+C: leave through process.exit, so the build folder is removed.
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, () => { server.close(); process.exit(code); });
    return new Promise(() => {});
  }

  prepareScreenshots(OPTS.out);
  const chrome = await launchChrome();
  const results = [];
  let page;
  try {
    const { targetId } = await chrome.cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await chrome.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    page = new Page(chrome.cdp, sessionId, origin);
    await page.start();

    for (const [index, step] of STEPS.entries()) {
      const number = String(index + 1).padStart(2, '0');
      const since = page.problems.length;
      const stepStarted = Date.now();
      log(`step ${number} ${step.title}`);
      try {
        await step.run(page);
        await expectAll(page, step.expect ?? []);
        await sleep(300); // let the screen settle before judging and photographing it
        await checkScreen(page);
        await page.screenshot(path.join(OPTS.out, `${number}-${step.name}.png`));
        if (step.after) await step.after(page);
        const problems = takeProblems(page, since);
        if (problems.length) throw Object.assign(new Error(`${problems.length} error${problems.length > 1 ? 's' : ''} in the page`), { problems });
        if (page.blockedSupabase.length) throw new Error(`the app tried to reach the live backend: ${page.blockedSupabase[0]}`);
        results.push({ step, ok: true, ms: Date.now() - stepStarted });
      } catch (err) {
        try { await page.screenshot(path.join(OPTS.out, `${number}-${step.name}-FAILED.png`)); } catch { /* the page is gone */ }
        let where = '';
        try { where = (await page.health()).path; } catch { /* the page is gone */ }
        results.push({ step, ok: false, ms: Date.now() - stepStarted, error: err.message, where, problems: err.problems ?? takeProblems(page, since) });
        break; // later steps start where this one should have ended
      }
    }
    // Anything that went wrong just after the last step.
    if (results.every((r) => r.ok)) {
      const checked = page.problems.length;
      await sleep(1000);
      const late = page.problems.slice(checked);
      if (late.length) results.push({ step: { name: 'after', title: 'After the last step' }, ok: false, ms: 0, error: 'an error after the last step', problems: late });
    }
  } finally {
    await chrome.close();
    server.close();
  }
  return report(results, page);
}

/**
 * The app's code in a demo build has no Supabase address in it; a real build's
 * would let the test touch live data. Only the app's code is checked: the
 * waitlist page (public/waitlist.html, copied into every build as it is) names
 * auth.courtsidebase.com, but the tester never opens it, and Chrome blocks
 * that address anyway.
 */
function checkDemoBuild(dist) {
  const scripts = path.join(dist, '_expo', 'static', 'js', 'web');
  if (!fs.existsSync(scripts)) return;
  for (const file of fs.readdirSync(scripts)) {
    if (!file.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(scripts, file), 'utf8');
    const live = code.match(/https:\/\/(auth\.courtsidebase\.com|[a-z0-9]{20}\.supabase\.co)/);
    if (live) throw new SetupError(`this build's app code talks to the live backend (${live[1]} in ${file}); the auto-tester only runs demo builds`);
  }
}

function report(results, page) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.find((r) => !r.ok);
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const relative = path.relative(process.cwd(), OPTS.out);
  const shots = relative && !relative.startsWith('..') ? relative : OPTS.out;
  if (OPTS.verbose && page) {
    for (const note of page.notes) console.log(`  note: ${note}`);
    if (page.elsewhere.size) console.log(`  other sites used: ${[...page.elsewhere].join(', ')}`);
  }
  let line;
  if (failed) {
    const which = failed.step.name === 'after' ? 'after the last step' : `step ${results.indexOf(failed) + 1}/${STEPS.length} "${failed.step.title}"`;
    console.error(`\nFailed ${which}${failed.where ? ` on ${failed.where}` : ''}: ${failed.error}`);
    for (const p of failed.problems ?? []) console.error(`  - ${p.kind}: ${p.text}`);
    line = `SMOKE FAIL: ${which}: ${failed.error} (${passed} passed, ${seconds}s, screenshots in ${shots}/)`;
  } else {
    const warned = page?.warnings.length ? `, ${page.warnings.length} warning${page.warnings.length > 1 ? 's' : ''}` : '';
    line = `SMOKE PASS: ${passed}/${STEPS.length} steps at ${OPTS.width}px, no errors${warned} (${seconds}s, screenshots in ${shots}/)`;
  }
  for (const warning of page?.warnings ?? []) console.log(`  warning: ${warning}`);
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const extra = (page?.warnings ?? []).map((w) => `- warning: ${w}\n`).join('');
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Auto-tester\n\n${line}\n\n${extra}`); } catch { /* not important */ }
  }
  return failed ? 1 : 0;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  // Leave on our own once the output is written; never linger on a stray handle.
  const finish = (code) => { process.exitCode = code; setTimeout(() => process.exit(code), 5000).unref(); };
  main().then(
    (code) => { if (code !== undefined) finish(code); },
    (err) => {
      const setup = err instanceof SetupError;
      console.error(`SMOKE ${setup ? 'ERROR' : 'FAIL'}: ${err.message}`);
      if (!setup && OPTS.verbose) console.error(err.stack);
      finish(setup ? 2 : 1);
    },
  );
}

export { OPTS, HARMLESS, SetupError, buildDemo, serve, launchChrome, Page, sleep, log, describe };
