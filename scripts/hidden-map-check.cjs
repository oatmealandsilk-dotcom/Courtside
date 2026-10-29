#!/usr/bin/env node
/**
 * The phone's hidden full map, checked in a real browser engine (the check-in zoom, mapGrow v6):
 *
 *   npm run hidden-map-check
 *
 * The iPhone's grow opens the full map early, hidden (MapCanvas `hidden`), and that page never runs on the website (the
 * website draws its maps with WebMap), nor in the auto-tester. So this builds the exact page MapCanvas hands its web view
 * (by running MapCanvas itself, with React and the phone's own modules stubbed and the TypeScript turned into plain
 * JavaScript as it loads), opens it in headless Chrome with a stand-in for the phone's message bridge, plays the app's
 * side of the messages, and checks:
 *   - its first frame, and the page once it has drawn, are fully see-through (nothing of it shows over Community);
 *   - it says 'up' before 'painted', its pins are made but hidden, and it tells the app no move while hidden;
 *   - told when to take over (__cs.arm, twice), it does so once, on its own clock, at the right moment: its camera where
 *     the pushed-in card is looking then, its pins at once, its streets in over REVEAL_MS, then solid, and says so
 *     ('handed', then 'unveiled' two frames on), and the dive arrives with nothing told to the app on the way;
 *   - a page made afresh after it was due (the phone stopped the first) takes over at once, with no dive.
 * Chrome is not the iPhone's WebKit, so this proves the page's own logic, not WebKit's drawing. It uses the network
 * (the map's code and streets). Exit code 0 when every check passes. Screenshots go to the system's temp folder.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const REPO = path.resolve(__dirname, '..');
const ts = require(path.join(REPO, 'node_modules/typescript'));
const BUILTINS = new Set(Module.builtinModules);
global.__DEV__ = true;

function deepStub(name) {
  const fn = function () { return deepStub(name + '()'); };
  return new Proxy(fn, {
    get(t, k) {
      if (k === '__esModule') return true;
      if (k === Symbol.toPrimitive) return () => `[stub ${name}]`;
      if (k === 'then') return undefined;
      if (k === 'OS') return 'ios';
      if (k === 'create') return (x) => x; // StyleSheet.create
      if (k === 'select') return (o) => (o && (o.ios ?? o.native ?? o.default));
      if (k === 'bezier') return () => (x) => x;
      if (k === 'get') return () => 3;
      return deepStub(name + '.' + String(k));
    },
    apply() { return deepStub(name + '()'); },
    construct() { return deepStub('new ' + name); },
  });
}
// React, enough to call a component once and read what it renders.
const reactStub = {
  __esModule: true,
  forwardRef: (fn) => fn,
  useRef: (v) => ({ current: v }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {}, useLayoutEffect: () => {}, useImperativeHandle: () => {},
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useContext: () => undefined, createContext: (v) => ({ Provider: 'Provider', _v: v }),
  useSyncExternalStore: (s, g) => g(),
  memo: (x) => x,
};
reactStub.default = reactStub;
const jsxStub = { __esModule: true, jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
const STUB_ALIAS = {
  '@/lib/useReducedMotion': { useReducedMotion: () => false },
  '@/components/map/useMapLoad': { useMapLoad: () => ({ attempt: 0, status: 'loading', restart() {}, reboot() {}, failed() {}, online() {}, heard() {}, quiet: () => 0 }) },
  '@/theme/ThemeProvider': new Proxy({ useThemedStyles: (x) => x, useTheme: () => ({ theme: 'light' }) }, { get: (t, k) => (k in t ? t[k] : deepStub('ThemeProvider.' + String(k))) }),
  '@/components/map/engineCopy': { engineInjection: () => '', warmMapEngine: () => {} },
  '@/lib/haptics': deepStub('haptics'),
  '@/lib/supabase': { supabase: deepStub('supabase'), isSupabaseConfigured: false },
};
const origResolve = Module._resolveFilename;
const stubIds = new Map();
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === 'react') return 'STUB:react';
  if (req === 'react/jsx-runtime' || req === 'react/jsx-dev-runtime') return 'STUB:jsx';
  if (STUB_ALIAS[req]) return 'STUB:' + req;
  if (req.startsWith('@/') || req.startsWith('.')) {
    const base = req.startsWith('@/') ? path.join(REPO, 'src', req.slice(2)) : path.resolve(path.dirname(parent.filename), req);
    for (const c of [base + '.ts', base + '.tsx', base, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base + '.js', base + '.json']) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        // Never a .web sibling: this is the phone's page.
        return c;
      }
    }
  }
  if (!req.startsWith('.') && !req.startsWith('/') && !BUILTINS.has(req.replace(/^node:/, ''))) return 'STUB:' + req;
  return origResolve.call(this, req, parent, ...rest);
};
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  const id = Module._resolveFilename(req, parent, isMain);
  if (typeof id === 'string' && id.startsWith('STUB:')) {
    const n = id.slice(5);
    if (n === 'react') return reactStub;
    if (n === 'jsx') return jsxStub;
    if (STUB_ALIAS[n]) return STUB_ALIAS[n];
    if (!stubIds.has(n)) stubIds.set(n, deepStub(n));
    return stubIds.get(n);
  }
  return origLoad.call(this, req, parent, isMain);
};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = function (m, filename) {
    const src = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(src, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    m._compile(out.outputText, filename);
  };
}


const { MapCanvas } = require(path.join(REPO, 'src/components/map/MapCanvas.tsx'));
const grow = require(path.join(REPO, 'src/features/players/mapGrow.ts'));
const { SWOOPS } = require(path.join(REPO, 'src/components/map/swoop.ts'));
const markers = [
  { id: 'c:1', lat: 34.052, lng: -118.243, html: '<div class="t-pin" style="width:28px;height:28px;border-radius:8px;background:#1f7a4d"></div>', k: 'c', z: 1 },
  { id: 'p:2', lat: 34.054, lng: -118.247, html: '<div class="t-pin" style="width:34px;height:34px;border-radius:50%;background:#c33"></div>', k: 'p', z: 2 },
];
const tpl = { badge: '<b>{n}</b>', stack: '', court: '<i>{n}</i>', chip: '<i>{n}</i>', spot: '' };
// The Community card as an iPhone lays it out (points), growing to fill the screen.
const plan = grow.growPlan({ page: { x: 0, y: 0, w: 390, h: 844 }, card: { x: 16, y: 330, w: 358, h: 210 }, screen: { w: 390, h: 844 }, center: { lat: 34.052, lng: -118.243 }, zoom: 12.4 });
function build(hidden) {
  const tree = MapCanvas({ center: plan.center, zoom: plan.zoom, look: {}, interactive: true, markers, tpl, popIn: false, now: true, hidden, full: false, pad: { top: 120, bottom: 250, left: 50, right: 50 } }, null);
  function find(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.props && node.props.source && node.props.source.html) return node.props;
    for (const k of [].concat((node.props && node.props.children) || [])) { const f = find(k); if (f) return f; }
    return null;
  }
  const web = find(tree);
  if (!web) throw new Error('no WebView found');
  return web.source.html;
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
    if (found) return found;
  }
  throw new Error('Chrome was not found: install Google Chrome, or set CHROME_PATH to it.');
}
/** The most opaque pixel of a PNG (0: fully see-through), for Chrome's 8-bit RGBA screenshots. */
function pngMaxAlpha(buf) {
  let p = 8; let w = 0; let h = 0; let type = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const kind = buf.toString('ascii', p + 4, p + 8); const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8) throw new Error('not 8-bit'); }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (type !== 6) return 255; // no alpha channel: opaque
  const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = 4; const stride = w * bpp;
  let prev = Buffer.alloc(stride); let max = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0; const b = prev[x]; const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255;
    }
    for (let x = 3; x < stride; x += 4) if (line[x] > max) max = line[x];
    prev = line;
  }
  return max;
}
const http = require('http');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const zlib = require('zlib');
const OUTDIR = path.join(os.tmpdir(), 'courtside-hidden-map-check');
fs.mkdirSync(OUTDIR, { recursive: true });
const pages = { '/hidden.html': build(true) };
const server = http.createServer((req, res) => {
  const body = pages[req.url.split('?')[0]];
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-chrome-'));
  const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=390,844', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const killAll = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} server.close(); };
  try {
    let wsUrl = null;
    for (let i = 0; i < 100 && !wsUrl; i++) { await sleep(100); try { const [p, w] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n'); wsUrl = `ws://127.0.0.1:${p}${w}`; } catch {} }
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const waiting = new Map(); const events = [];
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } else events.push(d); };
    const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await S('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__msgs=[];window.ReactNativeWebView={postMessage:function(s){var o=JSON.parse(s);o.__t=Date.now();window.__msgs.push(o)}};' });
    const evaluate = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
    const shot = async (name) => { const r = await S('Page.captureScreenshot', { format: 'png' }); const f = path.join(OUTDIR, name + '.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f; };
    const maxAlpha = (f) => pngMaxAlpha(fs.readFileSync(f));
    const msgs = () => evaluate('window.__msgs.map(function(m){return {type:m.type,t:m.__t,late:m.late,sw:m.sw,ok:m.ok,st:m.st,why:m.why,stage:m.stage,detail:m.detail}})');
    const waitFor = async (type, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const m = (await msgs()).find((x) => x.type === type); if (m) return m; await sleep(25); } return null; };
    const appReady = async () => {
      // The app's side of 'ready' (MapCanvas onMessage): look, hold, pins, synced.
      if (!(await waitFor('ready', 30000))) return false;
      await evaluate("document.body.classList.toggle('cs-still',false);window.__cs.look({});window.__cs.hold(false);window.__cs.set(INIT);window.__cs.synced();true");
      return true;
    };

    // 1. The hidden page: first frame see-through.
    await S('Page.navigate', { url: `http://127.0.0.1:${port}/hidden.html` });
    await sleep(60);
    const first = await shot('1-first-frame');
    check('first frame fully see-through', maxAlpha(first) === 0, `max alpha ${maxAlpha(first)}`);
    check('page reached ready', await appReady());
    const painted = await waitFor('painted', 30000);
    const order = (await msgs()).map((m) => m.type).filter((t) => ['boot', 'up', 'ready', 'painted'].includes(t));
    check("'up' before 'painted'", !!painted && order.indexOf('up') >= 0 && order.indexOf('up') < order.indexOf('painted'), order.join(' > '));
    const fails = (await msgs()).filter((m) => m.type === 'fail');
    check('no load failure', fails.length === 0, JSON.stringify(fails));
    await sleep(300);
    const hiddenState = await evaluate("(function(){var c=document.querySelector('.maplibregl-canvas');var mk=[].slice.call(document.querySelectorAll('#m .maplibregl-marker'));return {cls:document.documentElement.className,canvas:c?getComputedStyle(c).opacity:null,markers:mk.length,vis:mk.map(function(e){return getComputedStyle(e).visibility}),bg:getComputedStyle(document.body).backgroundColor}})()");
    check('painted while hidden: canvas at opacity 0', hiddenState.canvas === '0', JSON.stringify(hiddenState));
    check('painted while hidden: pins made but hidden', hiddenState.markers > 0 && hiddenState.vis.every((v) => v === 'hidden'));
    const painted2 = await shot('2-painted-hidden');
    check('painted while hidden: screen fully see-through', maxAlpha(painted2) === 0, `max alpha ${maxAlpha(painted2)}`);
    const moves = (await msgs()).filter((m) => m.type === 'move').length;
    check('no move told while hidden', moves === 0, `${moves}`);

    // 2. The armed hand-over: due 345 ms on from a push-in started now, told twice (the second replaces the first).
    const started = Date.now();
    const p = { ...plan, started };
    const at = started + grow.COVER_MS;
    const hand = grow.growHandOver(p, 15.25, grow.growTAt(grow.COVER_MS), grow.COVER_MS);
    const swoop = { ...SWOOPS.bank, ms: grow.GROW_SWOOP_MS, ease: hand.ease, now: true, force: true, id: 7, lat: 34.049, lng: -118.238, zoom: 15.25, still: false, wait: 700 };
    const arm = { at, follow: grow.growFollow(p), swoop };
    await evaluate(`window.__csSwoopTrace=[];window.__cs.arm(${JSON.stringify(arm)});window.__cs.arm(${JSON.stringify(arm)});true`);
    const mid = await evaluate("document.documentElement.className");
    check('still hidden before it is due', mid.includes('cs-hide'), mid);
    const handed = await waitFor('handed', 3000);
    check('handed once due', !!handed && handed.t >= at - 9, handed ? `late ${handed.late} ms (page clock), told ${handed.t - at} ms after due` : 'none');
    check('handed says which dive it began', !!handed && handed.sw === 7, handed ? `sw ${handed.sw}` : 'none');
    const unveiled = await waitFor('unveiled', 2000);
    check('unveiled two frames after handed', !!unveiled && unveiled.t >= handed.t, unveiled ? `${unveiled.t - handed.t} ms after` : 'none');
    const nHanded = (await msgs()).filter((m) => m.type === 'handed').length;
    check('armed twice, handed once', nHanded === 1, `${nHanded}`);
    const shown = await evaluate("(function(){var mk=[].slice.call(document.querySelectorAll('#m .maplibregl-marker'));return {cls:document.documentElement.className,vis:mk.map(function(e){return getComputedStyle(e).visibility})}})()");
    check('pins shown at once', shown.vis.length > 0 && shown.vis.every((v) => v === 'visible'), JSON.stringify(shown));
    // Camera at the hand-over: the swoop's first frame starts from where the pushed-in card looks then.
    const trace = await evaluate('window.__csSwoopTrace.slice(0,3)');
    const expectZoom = plan.zoom + (grow.growTAt(handed.t - started) - 1) * Math.log2(plan.scale);
    check('camera at hand-over = where the pushed-in card looks', trace.length > 0 && Math.abs(trace[0][1] - expectZoom) < 0.06, `first swoop frame zoom ${trace[0] && trace[0][1]}, expected ~${expectZoom.toFixed(3)}`);
    await sleep(grow.REVEAL_MS + 120);
    const after = await evaluate("(function(){var c=document.querySelector('.maplibregl-canvas');return {cls:document.documentElement.className,canvas:getComputedStyle(c).opacity}})()");
    check('streets fully in and page solid after REVEAL_MS', after.canvas === '1' && !after.cls.includes('cs-veil'), JSON.stringify(after));
    const sw = await waitFor('swooped', 4000);
    check('dive arrived', !!sw && sw.ok === true, sw ? JSON.stringify(sw.st) : 'none');
    await shot('3-landed');
    const midMoves = (await msgs()).filter((m) => m.type === 'move' && m.t < (sw ? sw.t : Infinity) - 50).length;
    check('no move told between hand-over and landing (no app work mid-dive)', midMoves === 0, `${midMoves}`);
    const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || '').slice(0, 200));
    check('no page errors', errs.length === 0, errs.join(' | '));

    // 3. A page made afresh after it was due (the phone stopped the first): told on 'ready', it takes over at once, no dive.
    await S('Page.navigate', { url: `http://127.0.0.1:${port}/hidden.html?again` });
    await sleep(50);
    check('fresh page reached ready', await appReady());
    const late = { ...arm, at: Date.now() - 2000, swoop: { ...swoop, id: 8 } };
    await evaluate(`window.__cs.arm(${JSON.stringify(late)});true`);
    const h2 = await waitFor('handed', 2000);
    check('late arm handed at once', !!h2 && h2.late >= 1500, h2 ? `late ${h2.late}` : 'none');
    const s2 = await waitFor('swooped', 3000);
    check('late arm: simply there (no dive), and says it arrived', !!s2 && s2.ok === true && (!s2.st || s2.st.n === 0), s2 ? JSON.stringify(s2.st) : 'none');

    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
    fs.writeFileSync(path.join(OUTDIR, 'results.json'), JSON.stringify(results, null, 2));
  } finally {
    killAll();
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
