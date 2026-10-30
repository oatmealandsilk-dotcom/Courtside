import { useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';

import type { LatLng } from '@/features/players/positions';

/*
 * The check-in zoom on the iPhone, v7 (Oct 29; owner, of v6 on his iPhone: a delay after the tap, then "two different
 * zooms"; and "It should never look anything different from the video I approved"): one camera move, one clock, one ease.
 *
 * The zoom map is a full-screen web view in a layer over the app's pages (ZoomLayer, in AppShell), drawn ahead of time at
 * exactly the Community card's view and kept hidden while Find Players is on screen. The card itself never changes (the
 * city words in its middle, its own pins, the Up to hit pill as it is). When you are found, the layer shows through a
 * window that is the card itself (the same rectangle, corners and edge, with the card's words, pill, weather and credit
 * drawn again on it from the same props), and from then everything follows ONE function of the wall clock:
 *  - the map's zoom z(t) = z0 + dz * E(t / D), E one cubic-bezier ease (V7.ease), in the web view's own page
 *    (V7_CAMERA_JS, through MapLibre's camera hook, so each frame it draws is that moment's camera);
 *  - the Community page pushes in by s(t) = min(2^(z - z0), S) round a fixed point P (mapGrow's geometry), on the UI
 *    thread (ZoomLayer's frame callback); the window grows the same way, so its edge is always the card's edge, and the
 *    web view inside it stays put on the screen;
 *  - P is your own spot on the card (kept V7.margin in from its edges): zooming round the card's middle multiplies your
 *    distance from the middle of town by about 47, which put someone 5-10 km out far off the screen. Once the card covers
 *    the screen, you glide to the middle of it (V7.glide), the zoom carrying on round where you are.
 * There is no tilt and no turn: the bank swoop's tilt read as a second zoom-in as it flattened (measured: two speed humps),
 * and cost frames.
 *
 * As the card covers the screen the layer's pins switch to the full map's own (made ahead in the same page, hidden), and
 * V7.pushBefore before the camera lands the ordinary full map (app/map.tsx) opens under the layer with no slide, at the
 * landing view; once it has drawn and the layer has landed, the layer goes in one frame (the two are the same picture but
 * for your own pin, which then lands) and the map's buttons slide in. Then the layer is let go (it is made again the next
 * time Find Players is on show).
 *
 * The website keeps its own path (NearbyMap.web, mapGrow v5). Admins only, behind checkInZoom's switches.
 */

/** What the web view's page needs to fly the move (window points unless said). */
export interface V7Params {
  /** Wall-clock start of the move (Date.now()). */
  t0: number;
  /** The whole move, ms. */
  D: number;
  /** The zoom's ease (a CSS cubic-bezier). */
  ease: [number, number, number, number];
  z0: number;
  z1: number;
  /** How much the page grows until the card covers the screen. */
  S: number;
  /** The fixed point of the push-in. */
  P: { x: number; y: number };
  /** The web view's size. */
  W: number;
  H: number;
  /** The card's middle: it shows `city` at z0. */
  K: { x: number; y: number };
  city: LatLng;
  /** You: where the camera lands. */
  you: LatLng;
  /** When (ms from t0) the card covers the screen, as a fraction of D. */
  uc: number;
  /** When (ms from t0) you have glided to the middle of the screen. */
  tg: number;
  /** The bank's tilt and turn (both 0: see above), as humps from u = h0 to h1 of the move, highest at peak / turnPeak. */
  pitch: number;
  peak: number;
  turn: number;
  turnPeak: number;
  h0: number;
  h1: number;
  /** The page lists its frames in its landing word (the simulator's proof only). */
  trace?: boolean;
}

export const V7 = {
  /** The whole move, from your spot on the card to street level over you. */
  D: 1400,
  /** One ease for all of it: a quick start, a long soft landing. */
  ease: [0.2, 0.0, 0.2, 1.0] as [number, number, number, number],
  /** Once the card covers the screen, you are in the middle of it this long after. */
  glide: 420,
  /** The push-in's fixed point is your spot on the card, but at least this far in from its edges. */
  margin: 110,
  /** The move starts this long after you are found, so the web view and the UI thread both have it before its first frame. */
  lead: 50,
  /** The full map opens under the layer this long before the camera lands (opening it mid-move stalled the layer's frames). */
  pushBefore: 220,
  /** No tilt, no turn (they read as a second zoom). */
  pitch: 0,
  peak: 0.42,
  turn: 0,
  turnPeak: 0.5,
  h1: 0.8,
  /** The full map takes over by this long after landing, drawn or not (its own loading look then shows). */
  handMax: 2500,
  /** The layer is let go this long after the hand-over (the buttons' slide in is never shared with a web view going). */
  dropAfter: 700,
  /** Find Players out of view this long: the layer is let go. */
  awayMs: 10000,
  /**
   * The card on show this long before the layer is made (again): a web view started as Back slides the Community page in
   * kept the card's own map from drawing for 120-170 ms (it showed blank) on the simulator.
   */
  settleMs: 900,
};

/** The streets asked for ahead at two zooms: where the camera lands (CHECKIN_ZOOM), and this one on the way down. */
export const V7_WARM_MID = 12.5;

/** What the layer's page says about its move: landed (its frames: how many, the longest gap, the first after t0, every gap of 30 ms or more as [ms after t0, gap]), or an error. */
export interface V7PageMsg {
  type: 'v7landed' | 'v7err';
  n?: number;
  gap?: number;
  first?: number;
  gaps?: number[][];
  /** When (ms after t0) the page was handed the move, and when its camera hook first ran (both negative: before t0). */
  recv?: number;
  hook0?: number;
  frames?: number[][];
  e?: string;
}

/** A cubic-bezier ease (CSS), x -> y; a worklet. */
export function bez(x: number, x1: number, y1: number, x2: number, y2: number): number {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    const bx = ((1 - 3 * x2 + 3 * x1) * m + (3 * x2 - 6 * x1)) * m * m + 3 * x1 * m;
    if (bx < x) lo = m; else hi = m;
  }
  const m = (lo + hi) / 2;
  return ((1 - 3 * y2 + 3 * y1) * m + (3 * y2 - 6 * y1)) * m * m + 3 * y1 * m;
}

/** The fraction of D at which the page's scale reaches S (the card covers the screen). */
export function coverU(p: Pick<V7Params, 'ease' | 'z0' | 'z1' | 'S'>): number {
  const need = Math.log2(p.S) / (p.z1 - p.z0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (bez(m, ...p.ease) < need) lo = m; else hi = m; }
  return hi;
}

/* ------------------------------------------------- the UI thread's side of the move (ZoomLayer) */

/** 0 = idle; else the move's numbers. `hidden`: the layer's window is not shown (an instant switch, never a fade). */
export const v7Move = makeMutable({ on: 0, t0: 0, D: 1, x1: 0, y1: 0, x2: 1, y2: 1, dz: 1, S: 1, hidden: 1 });
/** The window's geometry (window points): the card's middle and the push-in's fixed point. */
export const v7Geo = makeMutable({ kx: 0, ky: 0, px: 0, py: 0 });
/** The page's scale now, for the window and what is drawn on it. */
export const v7Scale = makeMutable(1);
/** The UI thread's frames of the move, for the timing log: how many, the longest gap and when, the first after t0. */
export const v7Ui = makeMutable({ n: 0, gap: 0, last: 0, first: -1, at: 0 });

/* ------------------------------------------------- what the card hands the layer */

/** The Community card as the layer draws it ahead (NearbyMap, while the card is drawn and on show). */
export interface V7Card {
  /** The card's own pins, and the full map's (shown as the card covers the screen). CanvasMarker[]. */
  markers: unknown[];
  fullMarkers: unknown[];
  /** "+N" pins' look (ClusterTemplates). */
  tpl: unknown;
  /** The full map's look (lookFor): the layer's page takes its place names off below zoom 15 (MapCanvas `layer`). */
  fullLook: unknown;
  city: LatLng;
  zoom: number;
  /** The card's rectangle in the window (points), its corners, edge and fill. */
  rect: { x: number; y: number; w: number; h: number };
  radius: number;
  border: string;
  bg: string;
}

const subscribeTo = (set: Set<() => void>) => (fn: () => void) => { set.add(fn); return () => { set.delete(fn); }; };

let card: V7Card | null = null;
let offered: V7Card | null = null;
let cardVer = 0;
const cardSubs = new Set<() => void>();
const subscribeCard = subscribeTo(cardSubs);
let awayT: ReturnType<typeof setTimeout> | null = null;
let holdT: ReturnType<typeof setTimeout> | null = null;
let held = false;
let flying = false;
let dropDue = false;
const setCard = (c: V7Card | null) => { if (card === c) return; card = c; cardVer += 1; cardSubs.forEach((f) => f()); };

/** The card offers itself (drawn, on show): the layer is drawn from it, now or (after a memory warning) once the hold is over. */
export function v7Offer(c: V7Card) {
  offered = c;
  if (awayT) { clearTimeout(awayT); awayT = null; }
  if (!held) setCard(c);
}
/** Find Players went out of view: the layer is let go if it is not back within V7.awayMs. */
export function v7Away() {
  if (awayT) return;
  awayT = setTimeout(() => { awayT = null; v7Drop(); }, V7.awayMs);
}
/**
 * The layer is let go (its web view with it), `after` ms from now (unless the card offers itself again meanwhile, or
 * `force`: after a move, it is always made afresh); mid-move, once the move is over.
 */
export function v7Drop(after = 0, force = false) {
  if (awayT) { clearTimeout(awayT); awayT = null; }
  offered = null;
  const go = () => { if (flying) { dropDue = true; return; } dropDue = false; setCard(null); };
  if (after <= 0) { go(); return; }
  setTimeout(() => {
    if (!force && offered) return;
    // Offered again meanwhile (the card back on show): made afresh, not kept.
    const again = offered;
    go();
    if (again && !held) setTimeout(() => { if (offered === again) setCard(again); }, 0);
  }, after);
}
/** The phone is short of memory: the layer goes, and is not made again for a minute. */
export function v7MemoryHold() {
  held = true;
  const keep = offered;
  v7Drop();
  offered = keep;
  if (holdT) clearTimeout(holdT);
  holdT = setTimeout(() => { holdT = null; held = false; if (offered) setCard(offered); }, 60000);
}
export function useV7Card(): V7Card | null {
  useSyncExternalStore(subscribeCard, () => cardVer, () => cardVer);
  return card;
}
/** Whether a move is under way (from `go` until the hand-over or a stop). */
export const v7Flying = () => flying;
export function v7SetFlying(on: boolean) {
  flying = on;
  if (!on && dropDue) { dropDue = false; setCard(null); }
}

/** What sits on the card (PreviewOverlay's props), drawn again in the layer's window over its map. */
let overlay: Record<string, unknown> | null = null;
let overlayVer = 0;
const overlaySubs = new Set<() => void>();
const subscribeOverlay = subscribeTo(overlaySubs);
const sameProps = (a: Record<string, unknown> | null, b: Record<string, unknown> | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.is(a[k], b[k]));
};
export function v7SetOverlay(o: Record<string, unknown> | null) {
  if (sameProps(overlay, o)) return;
  overlay = o;
  overlayVer += 1;
  overlaySubs.forEach((f) => f());
}
export function useV7Overlay(): Record<string, unknown> | null {
  useSyncExternalStore(subscribeOverlay, () => overlayVer, () => overlayVer);
  return overlay;
}

/* ------------------------------------------------- the layer's handle (ZoomLayer registers it) */

export interface V7LayerApi {
  /** Drawn at the card's view, and no move under way. */
  ready: () => boolean;
  /** The card is here now (window points): the layer's view follows it (drawn again, out of sight). */
  aim: (rect: V7Card['rect']) => void;
  /** The move: shown through the card, flown from `p`. */
  go: (p: V7Params) => void;
  /** The card covers the screen: the full map's pins, the web view on whole points. */
  full: () => void;
  /** The streets round a spot, asked for ahead. */
  warm: (at: LatLng, zoom: number) => void;
  /** Hidden at once (the hand-over, or the move stopped). */
  hide: () => void;
}
let api: V7LayerApi | null = null;
export function v7RegisterLayer(a: V7LayerApi | null) { api = a; }
export const v7Layer = () => api;

/* ------------------------------------------------- the move's own timers, and the hand-over */

let timers: ReturnType<typeof setTimeout>[] = [];
/** `fn` in `ms` (or at once), unless the move is stopped first. */
export function v7Later(fn: () => void, ms: number) {
  const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, Math.max(0, ms));
  timers.push(t);
}
/** The move's timers stopped (a stop part way: nothing more of it happens). */
export function v7StopTimers() { timers.forEach(clearTimeout); timers = []; }

/** The layer's camera has landed (on you); the full map under it has drawn: the hand-over, once both are true. */
let landed = false;
let routeUp = false;
let pushed = false;
let handFn: ((forced: boolean) => void) | null = null;
const landSubs = new Set<() => void>();
const tryHand = () => { if (landed && routeUp && handFn) { const f = handFn; handFn = null; f(false); } };
/** A new move: nothing landed, drawn, opened or waiting yet. */
export function v7Reset() { landed = false; routeUp = false; pushed = false; handFn = null; landSubs.clear(); }
/** The full map has been opened under the layer (it takes over from here, whatever happens). */
export function v7SetPushed() { pushed = true; }
export const v7Pushed = () => pushed;
export function v7SetLanded() { landed = true; landSubs.forEach((f) => f()); tryHand(); }
export const v7Landed = () => landed;
/** `fn` as the camera lands (at once if it has); the returned function stops listening. */
export function v7OnLanded(fn: () => void): () => void {
  if (landed) { fn(); return () => undefined; }
  landSubs.add(fn);
  return () => { landSubs.delete(fn); };
}
export function v7SetRouteUp() { routeUp = true; tryHand(); }
/** The full map registers what it does at the hand-over (the layer goes, your pin lands, its buttons slide in). */
export function v7OnHand(fn: (forced: boolean) => void) { handFn = fn; tryHand(); }
export function v7OffHand() { handFn = null; }
/** The hand-over now, drawn or not (a move that ran out of time): true if a full map was there to take over. */
export function v7ForceHand(): boolean {
  const f = handFn;
  if (!f) return false;
  handFn = null;
  f(true);
  return true;
}

/**
 * The web view's camera for the move (plain JavaScript for the map's page): `V7_CAMERA_JS(map, params, post)`. From t0 on,
 * each frame MapLibre draws asks the hook for that moment's camera; an easeTo of the same length keeps the map drawing
 * every frame meanwhile (started 90 ms early, the hook holding the card's view until t0, so the first frame after t0
 * already moves). Lands exactly on the last camera, and says so ('v7landed', with its frames' numbers).
 */
export const V7_CAMERA_JS = `(function(){
function bez(x,x1,y1,x2,y2){if(x<=0)return 0;if(x>=1)return 1;var lo=0,hi=1;for(var i=0;i<30;i++){var m=(lo+hi)/2;var bx=((1-3*x2+3*x1)*m+(3*x2-6*x1))*m*m+3*x1*m;if(bx<x)lo=m;else hi=m}var m=(lo+hi)/2;return ((1-3*y2+3*y1)*m+(3*y2-6*y1))*m*m+3*y1*m}
function hump(t,top){if(t<=0||t>=1)return 0;var u=t<top?0.5*t/top:0.5+0.5*(t-top)/(1-top),s=Math.sin(Math.PI*u);return s*s}
function wx(lng,z){return (lng+180)/360*512*Math.pow(2,z)}
function wy(lat,z){var s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*512*Math.pow(2,z)}
function lng(x,z){return x/(512*Math.pow(2,z))*360-180}
function lat(y,z){var n=Math.PI-2*Math.PI*y/(512*Math.pow(2,z));return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)))}
return function(map,o,post){
  var z0=o.z0,dz=o.z1-o.z0,C={x:o.W/2,y:o.H/2};
  var Y={x:wx(o.you.lng,z0),y:wy(o.you.lat,z0)};
  var frames=[],gaps=[],last=0,maxGap=0,first=-1,n=0,over=false,recv=Date.now()-o.t0,hook0=null;
  // You on the screen at t0 (the card shows the city at its middle K).
  var q0={x:o.K.x+(Y.x-wx(o.city.lng,z0)),y:o.K.y+(Y.y-wy(o.city.lat,z0))};
  var tc=o.D*o.uc;
  function kAt(ms){var u=Math.max(0,Math.min(1,ms/o.D));return Math.pow(2,dz*bez(u,o.ease[0],o.ease[1],o.ease[2],o.ease[3]))}
  // Pinned to the page (zoom round P) until the card covers the screen; then you glide to the middle (a Hermite curve,
  // starting with the speed you had, ending at rest), the zoom now round where you are.
  var qc={x:o.P.x+(q0.x-o.P.x)*kAt(tc),y:o.P.y+(q0.y-o.P.y)*kAt(tc)},kd=(kAt(tc+1)-kAt(tc-1))/2,vc={x:(q0.x-o.P.x)*kd,y:(q0.y-o.P.y)*kd},Tg=Math.max(1,o.tg-tc);
  function herm(p0,v0,p1,t){var s=t/Tg,h00=2*s*s*s-3*s*s+1,h10=s*s*s-2*s*s+s,h01=-2*s*s*s+3*s*s;return h00*p0+h10*Tg*v0+h01*p1}
  function cam(ms){
    var u=Math.max(0,Math.min(1,ms/o.D)),k=kAt(ms),z=z0+Math.log(k)/Math.LN2,q;
    if(ms<=tc)q={x:o.P.x+(q0.x-o.P.x)*k,y:o.P.y+(q0.y-o.P.y)*k};
    else if(ms<o.tg)q={x:herm(qc.x,vc.x,C.x,ms-tc),y:herm(qc.y,vc.y,C.y,ms-tc)};
    else q=C;
    var mx=Y.x-(q.x-C.x)/k,my=Y.y-(q.y-C.y)/k,h=u<=o.h0?0:Math.min(1,(u-o.h0)/(o.h1-o.h0));
    return {center:[lng(mx,z0),lat(my,z0)],zoom:z,pitch:o.pitch*hump(h,o.peak),bearing:o.turn*hump(h,o.turnPeak)};
  }
  function hook(){if(over)return {};var now=Date.now(),ms=now-o.t0,c=cam(ms);if(hook0===null)hook0=ms;
    if(ms>=0){n++;if(first<0)first=ms;if(last){var g=now-last;if(g>maxGap&&n>2)maxGap=g;if(g>=30)gaps.push([ms-g,g])}last=now;if(o.trace)frames.push([ms,Math.round(c.zoom*1000)/1000])}
    return {center:new maplibregl.LngLat(c.center[0],c.center[1]),zoom:c.zoom,pitch:c.pitch,bearing:c.bearing}}
  function setHook(f){if(map.setTransformCameraUpdate)map.setTransformCameraUpdate(f);else map.transformCameraUpdate=f}
  map.jumpTo(cam(0));
  setHook(hook);
  var end=cam(o.D);
  function begin(){if(over)return;map.easeTo({center:end.center,zoom:end.zoom,pitch:0,bearing:0,duration:Math.max(50,o.D+80+Math.max(0,o.t0-Date.now())),easing:function(t){return t},essential:true});
    map.once('moveend',function(){if(over)return;over=true;setHook(null);map.jumpTo(end);post({type:'v7landed',n:n,gap:maxGap,first:first,gaps:gaps,recv:recv,hook0:hook0,frames:o.trace?frames:undefined})})}
  var wait=o.t0-Date.now()-90;if(wait>0)setTimeout(begin,wait);else begin();
  return {stop:function(){if(over)return;over=true;setHook(null);try{map.stop()}catch(e){}}};
};
})()`;
