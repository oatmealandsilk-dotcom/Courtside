import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { STAGE_IDLE, currentY, getStage, glideSamples, glideUnderWay, onFrame, onPlace, placedY, stageFrame, subscribe, type StageGeo, type StagePlace } from './commentStage';

/**
 * The browser's twin of useStageMotion. Each part that follows the stage
 * registers its node here and is styled straight from stageFrame: frame by
 * frame while the sheet moves on the stage's clock (a drag, half to full), or
 * as one browser animation per part for a glide (the open and every close),
 * all from the same start time and the same sampled moments (see
 * commentStage), so nothing drifts from the sheet even while the page is busy.
 *
 * The words, buttons, mark and sound disc over the page on the stage carry
 * `data-stage-chrome` and are found inside that page only: no other page,
 * and no other feed open over or under this one, ever fades.
 */
export type StageRole = 'page' | 'black' | 'chrome' | 'rail' | 'nav' | 'navInner';

interface Entry { role: StageRole; el: HTMLElement; owner?: string; stageKey?: string; enabled: boolean; height: number; watch?: ResizeObserver }
const entries = new Set<Entry>();
/** Everything given a style here, so all of it can be handed back once the stage is over. */
const touched = new Set<HTMLElement>();
/** The glide's animations now running, stopped the moment the sheet is sent anywhere else. */
const running = new Set<Animation>();

type Look = { transform?: string; opacity?: string; borderRadius?: string };
function look(role: StageRole, y: number, G: StageGeo, fade: number, height: number): Look {
  const f = stageFrame(y, G);
  switch (role) {
    case 'page': return { transform: `translate(${f.tx}px, ${f.ty}px) scale(${f.s})`, opacity: String(f.video * fade), borderRadius: `${(18 * f.p) / Math.max(f.s, 0.01)}px` };
    case 'black': return { opacity: '1' };
    case 'rail': return { transform: `translateY(${f.cy - height / 2 + f.railDy}px)`, opacity: String(f.rail) };
    case 'nav': return { transform: `translateY(${-f.rise}px)`, opacity: String(f.nav) };
    case 'navInner': return { transform: `translateY(${f.rise}px)` };
    default: return { opacity: String(f.chrome) };
  }
}

function put(el: HTMLElement, l: Look) {
  touched.add(el);
  if (l.transform !== undefined) el.style.transform = l.transform;
  if (l.opacity !== undefined) el.style.opacity = l.opacity;
  // Rounded as the clip shrinks above a sheet (see the phone's twin).
  if (l.borderRadius !== undefined) { el.style.borderRadius = l.borderRadius; el.style.overflow = 'hidden'; }
}

const follows = (e: Entry, G: StageGeo) => e.enabled && e.el.isConnected
  && (e.owner === undefined || e.owner === G.owner) && (e.stageKey === undefined || e.stageKey === G.key);

/** The words, buttons, mark and disc over the page on the stage, looked up once per move rather than every frame. */
let chromeFound: { G: StageGeo; page: HTMLElement; els: HTMLElement[] } | null = null;
function stagedChrome(G: StageGeo, fresh: boolean): HTMLElement[] {
  let page: HTMLElement | null = null;
  for (const e of entries) if (e.role === 'page' && follows(e, G)) { page = e.el; break; }
  if (!page) return [];
  if (fresh || !chromeFound || chromeFound.G !== G || chromeFound.page !== page) {
    chromeFound = { G, page, els: [...page.querySelectorAll<HTMLElement>('[data-stage-chrome]')] };
  }
  return chromeFound.els;
}

/** Every part following the stage, with its role and (for the rail) its height. */
function parts(G: StageGeo, fresh: boolean): { role: StageRole; el: HTMLElement; height: number }[] {
  const out: { role: StageRole; el: HTMLElement; height: number }[] = [];
  for (const e of entries) if (follows(e, G)) out.push({ role: e.role, el: e.el, height: e.height });
  for (const el of stagedChrome(G, fresh)) out.push({ role: 'chrome', el, height: 0 });
  return out;
}

function drawAll(y: number, fade: number, fresh = false) {
  const G = getStage()?.geo;
  if (!G) return;
  for (const p of parts(G, fresh)) put(p.el, look(p.role, y, G, fade, p.height));
}

/** One part's glide: its look at each of the glide's moments, played straight between them, landing as a plain style. */
function glide(role: StageRole, el: HTMLElement, height: number, move: StagePlace, G: StageGeo) {
  if (!move.glide || role === 'black') return;
  const frames = glideSamples(move).map(({ offset, y }) => ({ offset, ...look(role, y, G, 1, height) }));
  const anim = el.animate(frames as Keyframe[], { duration: move.ms, easing: 'linear', fill: 'both' });
  anim.startTime = move.glide.start;
  running.add(anim);
  anim.onfinish = () => {
    running.delete(anim);
    if (getStage()?.geo === G) put(el, look(role, move.toY, G, 1, height));
    anim.cancel();
  };
}

function stopGlides() {
  if (!running.size) return false;
  for (const anim of [...running]) anim.cancel();
  running.clear();
  return true;
}

/** A part joining mid-stage (the rail drawing, the tab bar coming back) takes up where the sheet is now, mid-glide too. */
function settle(entry: Entry) {
  const G = getStage()?.geo;
  if (!G || !follows(entry, G)) return;
  put(entry.el, look(entry.role, currentY(), G, 1, entry.height));
  const under = glideUnderWay();
  if (under) glide(entry.role, entry.el, entry.height, under, G);
}

function release(el: HTMLElement) {
  if (!touched.delete(el)) return;
  el.style.transform = '';
  el.style.opacity = '';
  el.style.borderRadius = '';
  el.style.overflow = '';
}

if (typeof window !== 'undefined') {
  onFrame((y, fade) => drawAll(y, fade));
  onPlace((move) => {
    const G = getStage()?.geo;
    // Whatever was gliding stops where it is, written down so nothing jumps
    // in the frame before the next move draws.
    if (stopGlides() && G) drawAll(move.fromY, 1, true);
    if (!G || !move.glide) return;
    for (const p of parts(G, true)) {
      put(p.el, look(p.role, move.fromY, G, 1, p.height));
      glide(p.role, p.el, p.height, move, G);
    }
  });
  // The stage is over: every part goes back to its own style.
  subscribe(() => {
    if (getStage()?.geo) return;
    stopGlides();
    chromeFound = null;
    for (const el of [...touched]) release(el);
  });
}

export function useStageMotion(role: StageRole, { owner, stageKey, enabled = true }: {
  owner?: string;
  stageKey?: string;
  enabled?: boolean;
  railHeight?: SharedValue<number>;
} = {}) {
  // The node is taken once, when it is drawn (an animated view hands its node
  // over only then), and switched on and off here as the part comes and goes.
  const entry = useRef<Entry | null>(null);
  const wanted = useRef({ role, owner, stageKey, enabled });
  wanted.current = { role, owner, stageKey, enabled };
  const drop = () => {
    const e = entry.current;
    if (!e) return;
    entries.delete(e);
    e.watch?.disconnect();
    release(e.el);
    entry.current = null;
  };
  const ref = useCallback((node: unknown) => {
    drop();
    const el = node as HTMLElement | null;
    if (!el || !el.style) return;
    const e: Entry = { ...wanted.current, el, height: 0 };
    // The rail centres on the stage by its own height: kept up to date here,
    // never read in the middle of a move (that would make the page lay out every frame).
    if (e.role === 'rail') {
      e.height = el.offsetHeight;
      if (typeof ResizeObserver !== 'undefined') { e.watch = new ResizeObserver(() => { e.height = el.offsetHeight; }); e.watch.observe(el); }
    }
    entry.current = e;
    entries.add(e);
    settle(e);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const e = entry.current;
    if (!e) return;
    Object.assign(e, { role, owner, stageKey });
    if (e.enabled === enabled) return;
    e.enabled = enabled;
    if (enabled) settle(e); else release(e.el);
  }, [role, owner, stageKey, enabled]);
  useEffect(() => drop, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ref, style: undefined };
}

/** The phone's per-page fade (see useStageMotion); a browser fades through `data-stage-chrome` instead. */
export const StageChromeContext = createContext<SharedValue<number> | null>(null);
export function useStagePageChrome(_owner: string, _stageKey: string): SharedValue<number> | null {
  return null;
}

/** Whether the small rail is showing enough to be touched (see the phone's twin), read from where the sheet is going. */
export function useRailLive(): boolean {
  const showing = (y: number) => {
    const G = getStage()?.geo;
    return !!G && y < STAGE_IDLE && stageFrame(y, G).rail > 0.5;
  };
  const [live, setLive] = useState(() => showing(placedY()));
  useEffect(() => onPlace(({ toY }) => setLive(showing(toY))), []); // eslint-disable-line react-hooks/exhaustive-deps
  return live;
}
