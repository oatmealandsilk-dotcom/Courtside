import { useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';

import type { LatLng } from '@/features/players/positions';

/*
 * The check-in zoom on the iPhone, v7 (Oct 29; owner, of v6 on his iPhone: a delay after the tap, then "two different
 * zooms"; and "It should never look anything different from the video I approved"): one camera move, one clock, one ease.
 *
 * The zoom map is a full-screen web view in a layer over the app's pages (ZoomLayer, in AppShell), drawn ahead of time at
 * exactly the Community card's view and kept hidden (its animations paused) while Find Players is on screen. The card
 * itself never changes (the city words in its middle, its own pins, the Up to hit pill as it is). The move shows the layer
 * through a window that is the card itself (the same rectangle, corners and edge, with the card's words, pill, weather and
 * credit drawn again on it from the same props), and from then everything follows ONE function of the wall clock:
 *  - the map's zoom z(t) = z0 + dz * E(t / D), E one cubic-bezier ease (V7.ease), in the web view's own page
 *    (V7_CAMERA_JS, through MapLibre's camera hook, so each frame it draws is that moment's camera);
 *  - the Community page pushes in by s(t) = min(2^(z - z0), S) round a fixed point P (mapGrow's geometry), on the UI
 *    thread (ZoomLayer's frame callback); the window grows the same way, so its edge is always the card's edge, and the
 *    web view inside it stays put on the screen;
 *  - P is your own spot on the card (kept V7.margin in from its edges); once the card covers the screen you glide to the
 *    middle of it (V7.glide), the zoom carrying on round where you are.
 * No tilt and no turn: the bank swoop's tilt read as a second zoom-in as it flattened (measured: two speed humps).
 *
 * v8 (Oct 30, review of v7 on the simulator):
 *  - It starts at the tap, not when the server answers. Once "Who can see you" has said yes, the move starts from where the
 *    phone already is (a reading under 2 minutes old: useCheckIn's early hook), the button green at once; the new reading
 *    and the server carry on underneath. The new reading moves the landing there during the move's tail (never while the
 *    card's edge is on screen). No recent reading: it starts from the new reading itself, before the server is told. The
 *    server saying no mid-move stops it and puts the page back (the button shakes, the toast).
 *  - The arrival is on the camera's clock: copies of the full map's buttons slide in over the last V7.chromeMs, your pin
 *    lands in the layer's own page V7.landLead before the camera stops, and the full map opens only once the camera has
 *    landed (making its web view mid-move stalled the layer's frames); it takes over, unseen, once it has drawn and your
 *    pin's ring is done, its buttons already in.
 *  - As the card covers the screen only the full map's pins that will be on screen at the landing view come in (the full
 *    map's own pop-in); the card's own pins there step aside, the rest carry on out of the frame.
 *  - The ease (V7.ease) is a steady zoom that stops crisply, about 1.15 s, as his reference recording ("faster and more
 *    gratifying") and the approved v5; the old one crept for its last half second.
 *  - The layer is kept after a move and aimed back at the card (never made afresh after Back); a tap before it has drawn
 *    waits for it up to V7.readyWait.
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
  /** You: where the camera lands (moved part way by a newer reading: the page's v7re). */
  you: LatLng;
  /** When the card covers the screen, as a fraction of D. */
  uc: number;
  /** When (ms from t0) you have glided to the middle of the screen. */
  tg: number;
  /** Your pin starts landing this long before the camera stops. */
  landLead: number;
  /** Your own pin as the full map draws it (pinList's 'me'), landed in the layer's page; null: none (Only me). */
  me: unknown | null;
  /** The page lists its frames in its landing word (the simulator's proof only). */
  trace?: boolean;
}

export const V7 = {
  /** The whole move, from your spot on the card to street level over you. */
  D: 1150,
  /**
   * One ease for all of it: a steady zoom from the first frame (6.5 levels a second, easing to 2 by the end) that stops
   * crisply (the last quarter of a level in 133 ms). Its share of the zoom against time follows his reference recording's.
   */
  ease: [0.15, 0.2, 0.7, 0.95] as [number, number, number, number],
  /** Once the card covers the screen, you are in the middle of it this long after. */
  glide: 400,
  /** The push-in's fixed point is your spot on the card, but at least this far in from its edges. */
  margin: 110,
  /** The move starts this long after it is set going, so the web view and the UI thread both have it before its first frame. */
  lead: 50,
  /** The map's buttons (copies over the layer) slide in over the move's last stretch, this long. */
  chromeMs: 260,
  /** Your pin starts landing this long before the camera stops (as the camera settles, v5). */
  landLead: 90,
  /** Your pin's landing and its ring, done this long after it starts: the full map never takes over part way through it. */
  ringMs: 900,
  /**
   * A newer reading this far from where the move is going moves its landing: any real difference, so your pin as it lands
   * is where the full map puts it (its reading) and the hand-over cannot be seen. Blended over the move's tail, a few metres
   * is a pixel or two of drift.
   */
  retargetM: 1,
  /** A tap before the layer has drawn waits this long for it (then you are simply up). */
  readyWait: 300,
  /** The full map takes over by this long after landing if its page has given up; one still loading by handMaxLoading. */
  handMax: 2500,
  handMaxLoading: 5000,
  /** Find Players out of view this long: the layer is let go. */
  awayMs: 10000,
  /**
   * The card on show this long before the layer is made, or aimed back at it after a move: a web view started (or drawn
   * again) as Back slides the Community page in kept the card's own map from drawing for 120-170 ms on the simulator.
   */
  settleMs: 900,
};

/** The streets asked for ahead at two zooms: where the camera lands (CHECKIN_ZOOM), and this one on the way down. */
export const V7_WARM_MID = 12.5;

/** Metres between two spots (a short way: flat ground is near enough). */
export function metresApart(a: LatLng, b: LatLng): number {
  const k = Math.PI / 180;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

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
  /** The full map's pins that came in as the card covered the screen, and the card's that stepped aside. */
  pinsIn?: number;
  pinsOut?: number;
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

/**
 * 0 = idle; else the move's numbers. `hidden`: the layer's window (and the buttons drawn over it) not shown (an instant
 * switch, never a fade). `cMs`: how long the buttons take to slide in, ending as the camera stops.
 */
export const v7Move = makeMutable({ on: 0, t0: 0, D: 1, x1: 0, y1: 0, x2: 1, y2: 1, dz: 1, S: 1, hidden: 1, cMs: 1 });
/** The window's geometry (window points): the card's middle and the push-in's fixed point. */
export const v7Geo = makeMutable({ kx: 0, ky: 0, px: 0, py: 0 });
/** The page's scale now, for the window and what is drawn on it. */
export const v7Scale = makeMutable(1);
/** The map's buttons drawn over the layer: 0 off the screen, 1 in place (the full map's own, at rest). */
export const v7Chrome = makeMutable(0);
/** The phone's tab bar sliding away with the move, from its very first frame (AppShell reads it: never a fade). */
export const v7Bar = makeMutable(0);
/**
 * The UI thread's frames of the move, for the timing log: how many, the longest gap and when, the first after t0, and
 * every gap of 30 ms or more ([ms after t0, gap], the first ten).
 */
export const v7Ui = makeMutable({ n: 0, gap: 0, last: 0, first: -1, at: 0, gaps: [] as number[][] });

/* ------------------------------------------------- what the card hands the layer */

/** The Community card as the layer draws it ahead (NearbyMap, while the card is drawn and on show). */
export interface V7Card {
  /** The card's own pins, and the full map's (only data until the move: the page keeps them for it). CanvasMarker[]. */
  markers: unknown[];
  fullMarkers: unknown[];
  /** "+N" pins' look (ClusterTemplates). */
  tpl: unknown;
  /** The full map's look (lookFor): the layer's page fades its place names in from zoom 14.6 to 15 (MapCanvas `layer`). */
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
/** From the tap until the move is over (or given up): nothing new from the card reaches the layer (zoomV7's v7Hold). */
let inputsHeld = false;
const setCard = (c: V7Card | null) => { if (card === c) return; card = c; cardVer += 1; cardSubs.forEach((f) => f()); };

/** The card offers itself (drawn, on show): the layer is drawn from it, now or (after a memory warning) once the hold is over. */
export function v7Offer(c: V7Card) {
  offered = c;
  if (awayT) { clearTimeout(awayT); awayT = null; }
  if (!held && !inputsHeld) setCard(c);
}
/** Find Players went out of view: the layer is let go if it is not back within V7.awayMs. */
export function v7Away() {
  if (awayT) return;
  awayT = setTimeout(() => { awayT = null; v7Drop(); }, V7.awayMs);
}
/** The layer is let go (its web view with it); mid-move, once the move is over. */
export function v7Drop() {
  if (awayT) { clearTimeout(awayT); awayT = null; }
  offered = null;
  if (flying) { dropDue = true; return; }
  dropDue = false;
  setCard(null);
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
/**
 * Up to hit tapped (you said yes to "Who can see you"): the layer's inputs hold as they are until the move is over or
 * given up (a new list sent to its page as the move starts held up its first frames). Let go with the card still on show
 * (`apply`: no move, or a move stopped), the latest offer is taken then; after a hand-over, the card's next offer (once it
 * is on show again) is.
 */
export function v7Hold(on: boolean, apply = true) {
  if (inputsHeld === on) return;
  inputsHeld = on;
  if (!on && apply && offered && !held && offered !== card) setCard(offered);
}
export const v7Held = () => inputsHeld;

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

/**
 * The full map's buttons as they will be when it opens (NearbyMap's ZoomChromeCopy): what the card works out, drawn over the
 * layer as the move lands, and what the full map itself shows until it has taken over (so the two are the same picture).
 * Held still from the tap until the hand-over.
 */
export interface V7Chrome {
  cityName: string;
  homeKnown: boolean;
  weather: unknown;
  filter: string;
  courtsOn: boolean;
  courtsLoading: boolean;
  zoomNote: boolean;
  tray: unknown[];
  nearestCourts: unknown[];
  lock: unknown;
  nearTown: string;
}
let chrome: V7Chrome | null = null;
let chromeVer = 0;
const chromeSubs = new Set<() => void>();
const subscribeChrome = subscribeTo(chromeSubs);
export function v7SetChrome(c: V7Chrome | null) {
  if (inputsHeld || flying || sameProps(chrome as Record<string, unknown> | null, c as Record<string, unknown> | null)) return;
  chrome = c;
  chromeVer += 1;
  chromeSubs.forEach((f) => f());
}
export const v7ChromeNow = () => chrome;
export function useV7Chrome(): V7Chrome | null {
  useSyncExternalStore(subscribeChrome, () => chromeVer, () => chromeVer);
  return chrome;
}
/**
 * The Up to hit control (CheckInControl) the full map's round arrow shows on the buttons drawn over the layer and on the
 * full map until it has taken over: the card's own, live (never held), so the arrow is green from the tap, as the pill is.
 */
let control: unknown = null;
let controlVer = 0;
const controlSubs = new Set<() => void>();
const subscribeControl = subscribeTo(controlSubs);
export function v7SetChromeControl(c: unknown) {
  if (control === c) return;
  control = c;
  controlVer += 1;
  controlSubs.forEach((f) => f());
}
/** The control, for a screen that shows it (`on`); others never redraw for it. */
export function useV7ChromeControl(on: boolean): unknown {
  useSyncExternalStore(subscribeControl, () => (on ? controlVer : 0), () => 0);
  return on ? control : null;
}

/* ------------------------------------------------- the layer's handle (ZoomLayer registers it) */

export interface V7LayerApi {
  /** Drawn at the card's view, and no move under way. */
  ready: () => boolean;
  /** The card is here now (window points): the layer's view follows it (drawn again, out of sight). */
  aim: (rect: V7Card['rect']) => void;
  /** The move: shown through the card, flown from `p`. */
  go: (p: V7Params) => void;
  /** A newer reading: the landing moves there (during the move's tail). */
  retarget: (to: LatLng) => void;
  /** The streets round a spot, asked for ahead. */
  warm: (at: LatLng, zoom: number) => void;
  /** The move stopped part way (the server said no): hidden at once, put back at the card's view. */
  stop: () => void;
  /** The full map has taken over: hidden at once, aimed back at the card the next time it offers itself. */
  handed: () => void;
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

/** Where the move lands now (the reading it started from, or a newer one). */
let target: LatLng | null = null;
export const v7Target = () => target;
export function v7SetTarget(to: LatLng | null) { target = to; }

/**
 * The move's arrival, for what waits for it (the "Up to hit" toast and the one tip: useCheckIn): over at the hand-over,
 * or when the move is stopped.
 */
let arrival: { promise: Promise<void>; done: () => void } | null = null;
export function v7Arrival(): Promise<void> | null { return arrival?.promise ?? null; }
export function v7Arrived() { const a = arrival; arrival = null; a?.done(); }

/** The layer's camera has landed (on you); the full map under it has drawn: the hand-over, once both are true and your pin's ring is done. */
let landed = false;
let routeUp = false;
let pushed = false;
let handed = false;
let ringDoneAt = 0;
let ringT: ReturnType<typeof setTimeout> | null = null;
let handFn: ((forced: boolean) => void) | null = null;
const landSubs = new Set<() => void>();
const tryHand = () => {
  if (!landed || !routeUp || !handFn) return;
  const wait = ringDoneAt - Date.now();
  if (wait > 0) { if (!ringT) ringT = setTimeout(() => { ringT = null; tryHand(); }, wait); return; }
  const f = handFn;
  handFn = null;
  f(false);
};
/** A new move, its pin's ring done at `ringAt` (Date.now()): nothing landed, drawn, opened or waiting yet. */
export function v7Reset(ringAt: number) {
  landed = false; routeUp = false; pushed = false; handed = false; handFn = null; ringDoneAt = ringAt; landSubs.clear();
  if (ringT) { clearTimeout(ringT); ringT = null; }
  const old = arrival;
  let done = () => undefined as void;
  const promise = new Promise<void>((resolve) => { done = resolve; });
  arrival = { promise, done };
  old?.done();
}
/** The full map has been opened under the layer (it takes over from here, whatever happens). */
export function v7SetPushed() { pushed = true; }
export const v7Pushed = () => pushed;
export function v7SetHanded() { handed = true; if (ringT) { clearTimeout(ringT); ringT = null; } }
export const v7Handed = () => handed;
export function v7SetLanded() { landed = true; landSubs.forEach((f) => f()); tryHand(); }
export const v7Landed = () => landed;
/** `fn` as the camera lands (at once if it has); the returned function stops listening. */
export function v7OnLanded(fn: () => void): () => void {
  if (landed) { fn(); return () => undefined; }
  landSubs.add(fn);
  return () => { landSubs.delete(fn); };
}
export function v7SetRouteUp() { routeUp = true; tryHand(); }
/** The full map registers what it does at the hand-over (the layer goes, its buttons are already where the copies were). */
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
 * The web view's camera for the move (plain JavaScript for the map's page): `V7_CAMERA_JS(map, params, post, on)`. From t0
 * on, each frame MapLibre draws asks the hook for that moment's camera; an easeTo of the same length keeps the map drawing
 * every frame meanwhile (started 90 ms early, the hook holding the card's view until t0, so the first frame after t0
 * already moves). As the card covers the screen it calls on.cover(landing view), V7.landLead before the end on.land(you),
 * and lands exactly on the last camera, saying so ('v7landed', with its frames' numbers). Its handle: stop, and re(lat,
 * lng) for a newer reading (blended in over the move's tail, never before the card covers the screen; after the landing, a
 * short glide there).
 */
export const V7_CAMERA_JS = `(function(){
function bez(x,x1,y1,x2,y2){if(x<=0)return 0;if(x>=1)return 1;var lo=0,hi=1;for(var i=0;i<30;i++){var m=(lo+hi)/2;var bx=((1-3*x2+3*x1)*m+(3*x2-6*x1))*m*m+3*x1*m;if(bx<x)lo=m;else hi=m}var m=(lo+hi)/2;return ((1-3*y2+3*y1)*m+(3*y2-6*y1))*m*m+3*y1*m}
function wx(lng,z){return (lng+180)/360*512*Math.pow(2,z)}
function wy(lat,z){var s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*512*Math.pow(2,z)}
function lng(x,z){return x/(512*Math.pow(2,z))*360-180}
function lat(y,z){var n=Math.PI-2*Math.PI*y/(512*Math.pow(2,z));return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)))}
return function(map,o,post,on){
  var z0=o.z0,dz=o.z1-o.z0,C={x:o.W/2,y:o.H/2};
  var Y0={x:wx(o.you.lng,z0),y:wy(o.you.lat,z0)},RT=null,late=null;
  var frames=[],gaps=[],last=0,maxGap=0,first=-1,n=0,over=false,recv=Date.now()-o.t0,hook0=null,covered=false,landing=false;
  // You on the screen at t0 (the card shows the city at its middle K): the page grows round P from there.
  var q0={x:o.K.x+(Y0.x-wx(o.city.lng,z0)),y:o.K.y+(Y0.y-wy(o.city.lat,z0))};
  var tc=o.D*o.uc;
  function kAt(ms){var u=Math.max(0,Math.min(1,ms/o.D));return Math.pow(2,dz*bez(u,o.ease[0],o.ease[1],o.ease[2],o.ease[3]))}
  // Pinned to the page (zoom round P) until the card covers the screen; then you glide to the middle (a Hermite curve,
  // starting with the speed you had, ending at rest), the zoom now round where you are.
  var qc={x:o.P.x+(q0.x-o.P.x)*kAt(tc),y:o.P.y+(q0.y-o.P.y)*kAt(tc)},kd=(kAt(tc+1)-kAt(tc-1))/2,vc={x:(q0.x-o.P.x)*kd,y:(q0.y-o.P.y)*kd},Tg=Math.max(1,o.tg-tc);
  function herm(p0,v0,p1,t){var s=t/Tg,h00=2*s*s*s-3*s*s+1,h10=s*s*s-2*s*s+s,h01=-2*s*s*s+3*s*s;return h00*p0+h10*Tg*v0+h01*p1}
  // Where you are (world pixels at z0) at a moment: a newer reading is blended in from RT.t1 to RT.t2.
  function you(ms){if(!RT)return Y0;var u=(ms-RT.t1)/Math.max(1,RT.t2-RT.t1);if(u<=0)return RT.f;if(u>=1)return RT.t;var s=u*u*(3-2*u);return {x:RT.f.x+(RT.t.x-RT.f.x)*s,y:RT.f.y+(RT.t.y-RT.f.y)*s}}
  function cam(ms){
    var k=kAt(ms),z=z0+Math.log(k)/Math.LN2,q,Y=you(ms);
    if(ms<=tc)q={x:o.P.x+(q0.x-o.P.x)*k,y:o.P.y+(q0.y-o.P.y)*k};
    else if(ms<o.tg)q={x:herm(qc.x,vc.x,C.x,ms-tc),y:herm(qc.y,vc.y,C.y,ms-tc)};
    else q=C;
    var mx=Y.x-(q.x-C.x)/k,my=Y.y-(q.y-C.y)/k;
    return {center:[lng(mx,z0),lat(my,z0)],zoom:z,pitch:0,bearing:0};
  }
  // The landing view, in world pixels at z1: you in the middle of the screen.
  function view(){var Y=you(o.D),f=Math.pow(2,dz);return {cx:Y.x*f,cy:Y.y*f,W:o.W,H:o.H,z:o.z1}}
  function hook(){if(over)return {};var now=Date.now(),ms=now-o.t0,c=cam(ms);if(hook0===null)hook0=ms;
    if(ms>=0){n++;if(first<0)first=ms;if(last){var g=now-last;if(g>maxGap&&n>2)maxGap=g;if(g>=30)gaps.push([ms-g,g])}last=now;if(o.trace)frames.push([ms,Math.round(c.zoom*1000)/1000])}
    // Each moment's own work goes after this frame's drawing, never in it.
    if(!covered&&ms>=tc){covered=true;setTimeout(function(){try{on.cover(view())}catch(e){post({type:'v7err',e:'cover '+e})}},0)}
    if(!landing&&ms>=o.D-o.landLead){landing=true;var Y=late||you(o.D);setTimeout(function(){try{on.land(lat(Y.y,z0),lng(Y.x,z0))}catch(e){post({type:'v7err',e:'land '+e})}},0)}
    return {center:new maplibregl.LngLat(c.center[0],c.center[1]),zoom:c.zoom,pitch:c.pitch,bearing:c.bearing}}
  function setHook(f){if(map.setTransformCameraUpdate)map.setTransformCameraUpdate(f);else map.transformCameraUpdate=f}
  map.jumpTo(cam(0));
  setHook(hook);
  // A reading too late to blend into the move: once it has landed, a short glide there.
  function glide(){if(!late)return;RT={f:late,t:late,t1:0,t2:1};late=null;var e=cam(o.D);map.easeTo({center:e.center,zoom:o.z1,duration:260,easing:function(t){return t*(2-t)},essential:true})}
  function begin(){if(over)return;var end=cam(o.D);map.easeTo({center:end.center,zoom:end.zoom,pitch:0,bearing:0,duration:Math.max(50,o.D+80+Math.max(0,o.t0-Date.now())),easing:function(t){return t},essential:true});
    map.once('moveend',function(){if(over)return;over=true;setHook(null);map.jumpTo(cam(o.D));post({type:'v7landed',n:n,gap:maxGap,first:first,gaps:gaps,recv:recv,hook0:hook0,pinsIn:on.pinsIn?on.pinsIn():undefined,pinsOut:on.pinsOut?on.pinsOut():undefined,frames:o.trace?frames:undefined});glide()})}
  var wait=o.t0-Date.now()-90;if(wait>0)setTimeout(begin,wait);else begin();
  return {
    stop:function(){if(over)return;over=true;late=null;setHook(null);try{map.stop()}catch(e){}},
    re:function(la,ln){var ms=Date.now()-o.t0,to={x:wx(ln,z0),y:wy(la,z0)};
      if(over||ms>o.D-120){late=to;if(over)glide();if(landing)try{on.move(la,ln)}catch(x){}return}
      var t1=Math.max(ms,tc+16),t2=Math.min(o.D,Math.max(t1+180,o.D-60));RT={f:you(ms),t:to,t1:t1,t2:t2};
      if(landing)try{on.move(la,ln)}catch(x){}}
  };
};
})()`;
