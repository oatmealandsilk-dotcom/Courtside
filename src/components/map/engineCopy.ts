import { File, Paths } from 'expo-file-system';

import { ENGINE_HOSTS, ENGINE_VERSION } from '@/components/map/engineLoader';

/**
 * The phone's own copy of MapLibre, the code that draws the map (Oct 21,
 * owner: the Find Players card often sat on "Loading map…"). Each map's web
 * view used to fetch it for itself once the page was already on screen
 * (ENGINE_JS). Now the app fetches it once, during the splash
 * (warmMapEngine, from preloadNearbyMap), keeps it in a file for every open
 * after, and hands it to each map's web view before its page starts
 * (engineInjection), so the map goes straight to its streets. Anything
 * missing or broken here only means the web view fetches it the old way:
 * ENGINE_JS skips its download whenever the engine is already there.
 */

let js: string | null = null;
let css: string | null = null;
let script: string | null = null;
let warming: Promise<void> | null = null;

/** Below this the file is not the engine (a cut-off download, an error page). */
const MIN_JS = 200_000;
const fileFor = (ext: string) => new File(Paths.document, `maplibre-${ENGINE_VERSION}${ext}`);

function fromDisk() {
  try {
    const a = fileFor('.js');
    const b = fileFor('.css');
    if (!a.exists || !b.exists) return;
    const code = a.textSync();
    const style = b.textSync();
    if (code.length >= MIN_JS && code.includes('maplibregl') && style.length) { js = code; css = style; }
  } catch { /* fetched again below */ }
}

/** One file from the first host that gives it whole; 12 seconds each, as the web view's own fetch allows. */
async function grab(ext: string): Promise<string | null> {
  for (const host of ENGINE_HOSTS) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), 12_000);
    try {
      const res = await fetch(host + ext, ctl ? { signal: ctl.signal } : undefined);
      if (res.ok) { const text = await res.text(); if (text.length) return text; }
    } catch { /* the next host */ } finally { clearTimeout(timer); }
  }
  return null;
}

function keep(ext: string, text: string) {
  try {
    const f = fileFor(ext);
    if (f.exists) f.delete();
    f.create();
    f.write(text);
  } catch { /* kept in memory for this session only */ }
}

/** Gets the engine onto the phone, once: from its file, or (the first time) from the network. Never throws. */
export function warmMapEngine(): Promise<void> {
  if (js && css) return Promise.resolve();
  warming ??= (async () => {
    fromDisk();
    if (js && css) return;
    const [code, style] = await Promise.all([grab('.js'), grab('.css')]);
    if (!code || !style || code.length < MIN_JS || !code.includes('maplibregl')) { warming = null; return; }
    js = code;
    css = style;
    keep('.js', code);
    keep('.css', style);
  })().catch(() => { warming = null; });
  return warming ?? Promise.resolve();
}

/**
 * The script a map's web view runs before its page (react-native-webview's
 * injectedJavaScriptBeforeContentLoaded): the engine and its stylesheet, put
 * in place so the page finds `maplibregl` ready. Undefined until warmMapEngine
 * has it, and the page fetches it itself.
 */
export function engineInjection(): string | undefined {
  if (!js || !css) return undefined;
  script ??= `(function(){try{var d=document.documentElement;var s=document.createElement('style');s.textContent=${JSON.stringify(css)};d.appendChild(s);var j=document.createElement('script');j.textContent=${JSON.stringify(js)};d.appendChild(j);d.removeChild(j)}catch(e){}})();true;`;
  return script;
}
