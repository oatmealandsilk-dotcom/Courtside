import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { STYLE, type Look } from '@/components/map/look';
import { ENGINE_JS, PAINT_WATCH_JS } from '@/components/map/engineLoader';
import { engineInjection, warmMapEngine } from '@/components/map/engineCopy';
import { useMapLoad, type MapLoadStatus } from '@/components/map/useMapLoad';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { CLOSE_ZOOM_NAMES, FAR_ZOOM, GROW_CLEAR_CSS, MAP_PIN_CSS, SHORT_ZOOM } from '@/components/map/markers';
import { CARD_BOX, FULL_MAP_BOX, PIN_ENGINE_JS, type CanvasMarker, type ClusterTemplates } from '@/components/map/pinEngine';
import { SWOOP_JS, WARM_JS, type SwoopAsk, type SwoopStats } from '@/components/map/swoop';
import { GROW_CAM_JS, PUSH_JS, REVEAL_MS, type GrowFollow } from '@/features/players/mapGrow';
import type { LatLng, ViewBounds } from '@/features/players/positions';
import * as haptics from '@/lib/haptics';

export type { CanvasMarker, MapLoadStatus };

/**
 * `offsetY`: where the spot ends up, in pixels from the middle (negative is higher: clear of a tall card).
 * `exact`: go to exactly that zoom, out as well as in (a place searched for); otherwise the map only ever zooms in.
 */
export interface MapCanvasHandle {
  flyTo: (to: LatLng, zoom?: number, ms?: number, offsetY?: number, exact?: boolean) => void;
  /** From the beginning, with all its tries again ("Tap to try again", on the still card or the full map's pill). */
  retry: () => void;
  /**
   * The still card, moved at once while nobody is looking (a new city): once the page is up, the
   * map jumps there and onPainted is told again when the new place has drawn. Before then it is the
   * same as flyTo with no time, and the first onPainted already shows the new place.
   */
  jump: (to: LatLng, zoom: number) => void;
  /** The still card: asks the page for a picture of its map alone (onShot), for the card's picture cover (cardShot). */
  shoot: () => void;
  /** Whether this try's page has its map up (its style loaded), drawn or not. */
  isUp: () => boolean;
  /**
   * The check-in zoom (swoop.ts): the camera swoops down to a spot, once the page has its map up and
   * has drawn where it starts (or very nearly). onSwooped is told when it has arrived (or was stopped part way).
   */
  swoop: (ask: Omit<SwoopAsk, 'up'>) => void;
  /** How long since this try's page last said anything (ms). */
  quiet: () => number;
  /** The check-in zoom's grow (mapGrow): the still card's pins step aside (a quick fade), or come back at once. */
  clearPins: (clear: boolean) => void;
  /** The check-in zoom's grow: the streets of the full map's first view asked for ahead, while you are found (swoop's WARM_JS). */
  warm: (at: LatLng, zoom: number) => void;
  /**
   * The check-in zoom's push-in (v5), on the card drawing the full map's pins: from `started` (Date.now() of the push-in's
   * start) the page follows it on its own clock (mapGrow's PUSH_JS), the page round the card drawn up to `scale` times
   * bigger, every pin keeping its size on the screen (the pin engine's lens). Null: over, as it was.
   */
  lens: (started: number | null, scale?: number) => void;
  /**
   * The phone's hidden full map (v6, `hidden`) takes over from the pushed-in card, told ahead (as the push-in starts) and
   * done by its own page on the frame its clock reaches `arm.at`, all in one go: its camera set exactly where the card is
   * looking on that frame (worked out there: GROW_CAM_JS on PUSH_JS), its pins shown at once and its streets in over
   * REVEAL_MS (inside its own page: never an opacity on anything of the app's), and the dive begun from there. It says
   * so (onHanded), and again once that frame is on the screen (onUnveiled). Kept until then: a page made afresh meanwhile
   * (the phone stopped the old one) is told again as soon as it is ready, and takes over at once.
   */
  armHandOver: (arm: HandOverArm) => void;
  /** The card, once the full map over it has shown its own pins (v6): its pins go at once (and its lens with them). */
  handed: () => void;
  /** The card's pins back, as they were (the grow over, out of sight). */
  pinsBack: () => void;
}

/** The phone's hand-over, told ahead (handle.armHandOver). */
export interface HandOverArm {
  /** When the map takes over (Date.now(), the phone's one clock): the pushed-in card just covering the screen. */
  at: number;
  /** growFollow's numbers for the grow: where the pushed-in card is looking at any moment. */
  follow: GrowFollow;
  /** The dive, begun on that same frame (null: none asked for yet). */
  swoop: Omit<SwoopAsk, 'up'> | null;
}

interface Props {
  center: LatLng;
  zoom: number;
  /** The theme's own map colours, from lookFor(). */
  look: Look;
  /** Drag and pinch move the map; off, it is a picture. */
  interactive: boolean;
  markers: CanvasMarker[];
  /** What gathered "+N" pins look like, in the theme's colours (markers.ts clusterTemplates). */
  tpl: ClusterTemplates;
  /** The full map, just opened: its first pins come in as one wave (pinEngine). */
  popIn?: boolean;
  /** The Community card drawing the full map's pins (v5): laid out as the full map lays them out (pinEngine's `full`). */
  full?: boolean;
  /** Its pins from the first moment, not once its streets have drawn (the full map a card grew into). */
  now?: boolean;
  /**
   * The phone's full map opened early by the check-in zoom (v6, mapGrow): its page see-through, its streets and pins hidden,
   * its camera still on where it opened, until handOver. Read once, when the page is made.
   */
  hidden?: boolean;
  /** A sheet is over the map ("Who can see you on the map?"): the first wave waits until it has gone. */
  holdPins?: boolean;
  /** Room kept clear round the edge when a tap zooms in to split a "+N" pin. */
  pad?: { top: number; bottom: number; left: number; right: number };
  onTap?: (id: string) => void;
  onMapTap?: () => void;
  /** Where the map came to rest, how close in, and the part of the world in view. */
  onMove?: (center: LatLng, zoom: number, bounds: ViewBounds) => void;
  /**
   * Everything in view has drawn (streets, names, pins and their faces), with the app's own pins,
   * look and any move asked for before the page was ready already on it. Told the first time, and
   * again after a jump (handle.jump) or a fresh page (the phone stopped the old one).
   */
  onPainted?: () => void;
  /** The page's picture of its map alone, as a JPEG data URL (handle.shoot); never told for a blank one. */
  onShot?: (dataUrl: string) => void;
  /** The page's drawing was lost (the phone stopped it, or took its graphics back): a fresh page is on its way. */
  onLost?: () => void;
  /** Whether the map is loading, drawn, or given up on (useMapLoad), told each time it changes: the still card and the full map show it themselves (MapLoadState). */
  onStatus?: (status: MapLoadStatus) => void;
  /** With `onFar`: the zoom below which the map counts as far out (courts hide there: COURTS_MIN_ZOOM). Read once, when the page is made. */
  farBelow?: number;
  /** The map crossed `farBelow`, either way (and once as it starts): told the moment it happens, not only when it comes to rest. */
  onFar?: (far: boolean) => void;
  /**
   * A swoop (handle.swoop) has come to rest: arrived, or stopped part way; `id` is the one asked for (SwoopAsk.id), and how
   * its frames went (the phone's timing log). Given only with the check-in zoom on: it also lets the full map's pins reach
   * the page before it is 'ready'.
   */
  onSwooped?: (arrived: boolean, id: number, stats?: SwoopStats) => void;
  /** The page's map is up (its style is in), the first time on each try: the check-in zoom's timing log. */
  onUp?: () => void;
  /** The phone's hidden full map has taken over (armHandOver), `late` ms after it was due (its own clock), at `at`; `sw` the dive it began (SwoopAsk.id), if any. */
  onHanded?: (late: number, at: number, sw: number | null) => void;
  /** And that frame (its pins showing, its streets coming in) is on the screen: the card's own pins may go. */
  onUnveiled?: () => void;
  style?: StyleProp<ViewStyle>;
  /** On screen: off (a page over it, a hidden pager page, another tab), its load clocks wait (useMapLoad). */
  active?: boolean;
}

/**
 * The phone's hidden full map (v6, `hidden`): the page, its body and the map's own box see-through, its streets (the
 * canvas) and pins hidden, from its very first frame (the classes are on <html> in the page itself, never added after),
 * so nothing of it is ever seen over the Community page while it draws. Handed over, the pins show at once and the
 * streets come in over the pushed-in card (REVEAL_MS), and the page is solid again once they have. And the card's pins
 * going (cs-gone) the moment the full map's identical ones are over them: at once, never a fade.
 */
const HIDE_CSS = `html.cs-veil,html.cs-veil body,html.cs-veil #m{background:transparent!important}html.cs-hide .maplibregl-canvas{opacity:0}html.cs-hide #m .maplibregl-marker{visibility:hidden}html.cs-veil .maplibregl-canvas{transition:opacity ${REVEAL_MS}ms cubic-bezier(.2,.7,.3,1)}#m.cs-gone .maplibregl-marker{visibility:hidden}`;

/**
 * The phone's map: the same MapLibre vector map the browser draws, inside
 * a web view, so the phone gets the app's own warm-paper look instead of
 * Apple's stock map with its shields and yellow motorways. Nothing native
 * to build — Expo Go has the web view — and one look everywhere.
 *
 * The map's code comes from a public file host, with two more to fall back
 * on (engineLoader). A try that fails or stalls before the map is up gets a
 * fresh web view and goes again, a couple of times (useMapLoad); once it is
 * up, slow streets are only slow. What it shows meanwhile is up to the
 * screen it is on (onStatus, MapLoadState): the still card its own loading
 * look and "didn't load", the full map a small pill under its chips, with
 * Tap to try again (retry). If iOS or Android stops the web view to free
 * memory, it is started again by itself (Oct 5).
 */
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ center, zoom, look, interactive, markers, tpl, popIn = false, full = false, now = false, hidden = false, holdPins = false, pad, onTap, onMapTap, onMove, onPainted, onShot, onLost, onStatus, farBelow, onFar, onSwooped, onUp, onHanded, onUnveiled, style, active = true }, ref) {
  const styles = useThemedStyles(styleDefinitions);
  const web = useRef<WebView | null>(null);
  const ready = useRef(false);
  // The page's map is made and its style is in ('up'): a swoop can be handed to it from then, before it is 'ready'.
  const styled = useRef(false);
  // Getting the page going, and again if it fails (useMapLoad): each try is a new web view.
  const load = useMapLoad(interactive ? 'full map' : 'map card', active);
  useEffect(() => { ready.current = false; styled.current = false; }, [load.attempt]);
  const latest = useRef({ onTap, onMapTap, onMove, onPainted, onShot, onLost, onFar, onStatus, onSwooped, onUp, onHanded, onUnveiled });
  latest.current = { onTap, onMapTap, onMove, onPainted, onShot, onLost, onFar, onStatus, onSwooped, onUp, onHanded, onUnveiled };
  // A fresh page (a retry, or one the phone stopped) starts where the map is meant to be now, not where it first was.
  const centerNow = useRef(center);
  centerNow.current = center;
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  /** The page has gone (the phone stopped it, or lost its drawing): a fresh one, and the screen told. */
  const lost = () => { ready.current = false; styled.current = false; load.reboot(); latest.current.onLost?.(); };
  useEffect(() => { latest.current.onStatus?.(load.status); }, [load.status]);
  const send = (js: string) => { if (ready.current) web.current?.injectJavaScript(`${js};true;`); };
  // The page takes a moment to start. A move asked for before then (your
  // location arriving) is kept and made the instant it is ready; dropping
  // it left the map on the default city until it was opened again.
  const pendingMove = useRef<{ to: LatLng; zoom?: number; offsetY?: number; exact?: boolean } | null>(null);
  // A swoop asked for before then (the full map just opened from the card): made the moment the map is up, after any move.
  // Kept only as long as the swoop's own wait (checkInZoom's 9 s stand-in): a page that comes up later (a retry) never swoops by surprise.
  const pendingSwoop = useRef<{ js: string; at: number } | null>(null);
  const takeSwoop = (): string | null => {
    const p = pendingSwoop.current;
    pendingSwoop.current = null;
    return p && Date.now() - p.at < 9000 ? p.js : null;
  };
  // The phone's hand-over (armHandOver), kept until a page says it has taken over (`armDone`): told again to a fresh page.
  const arm = useRef<HandOverArm | null>(null);
  const armDone = useRef(false);
  const armJs = (a: HandOverArm) => `window.__cs&&window.__cs.arm(${JSON.stringify(a)})`;

  useImperativeHandle(ref, () => ({
    flyTo: (to, z, ms = 500, offsetY = 0, exact = false) => {
      if (!ready.current) { pendingMove.current = { to, zoom: z, offsetY, exact }; return; }
      send(`window.__cs.fly(${to.lat},${to.lng},${z ?? 'null'},${ms},${Math.round(offsetY)},${exact ? 'true' : 'false'})`);
    },
    retry: () => load.restart(),
    jump: (to, z) => {
      if (!ready.current) { pendingMove.current = { to, zoom: z }; return; }
      send(`window.__cs.fly(${to.lat},${to.lng},${z},0,0,true);window.__cs.rearm()`);
    },
    shoot: () => send('window.__cs.shot()'),
    clearPins: (clear) => send(`document.getElementById('m').classList.toggle('cs-clear',${clear ? 'true' : 'false'})`),
    warm: (at, z) => send(`window.__cs.warm(${JSON.stringify({ lat: at.lat, lng: at.lng, zoom: z })})`),
    lens: (started, scale = 1) => send(`window.__cs.lens(${started === null ? 'null' : Math.round(started)},${scale})`),
    // Told ahead, done by the page itself on the frame it is due: the camera, the reveal and the dive in the same moment.
    // Told again if asked again before it has happened (the dive known only now): the page keeps the latest.
    armHandOver: (a) => {
      if (armDone.current) return;
      pendingMove.current = null;
      pendingSwoop.current = null;
      arm.current = a;
      send(armJs(a));
    },
    handed: () => send(`document.getElementById('m').classList.add('cs-gone');window.__cs.lens(null)`),
    pinsBack: () => send(`document.getElementById('m').classList.remove('cs-gone')`),
    isUp: () => ready.current,
    quiet: () => load.quiet(),
    swoop: (ask) => {
      // The swoop is the move: one asked for before it (a fix landing) is let go.
      pendingMove.current = null;
      const js = `window.__cs.swoop(${JSON.stringify(ask)})`;
      if (!styled.current) { pendingSwoop.current = { js, at: Date.now() }; return; }
      web.current?.injectJavaScript(`${js};true;`);
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Written out only when the pins change, not on every draw of the page around the map (Oct 10,
  // owner: "the buttons like the settings. msg notifications, etc respond too slow").
  const markerJson = useMemo(() => JSON.stringify({ items: markers, tpl }), [markers, tpl]);
  const markersNow = useRef(markerJson);
  markersNow.current = markerJson;
  // The full map's pins may go to the page once its style is in, before it is 'ready' (which waits for its streets): a
  // check-in zoom lands your pin as the camera settles, not when the last street arrives. The page keeps them for its 'load'.
  const hiddenNow = useRef(hidden);
  useEffect(() => {
    const js = `window.__cs.set(${markerJson})`;
    if (!ready.current && interactive && styled.current && latest.current.onSwooped) web.current?.injectJavaScript(`${js};true;`);
    else send(js);
  }, [markerJson]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reduce Motion, from the phone's own setting: the pins' pulse holds still and the ring only fades.
  const still = useReducedMotion();
  const stillNow = useRef(still);
  stillNow.current = still;
  useEffect(() => { send(`document.body.classList.toggle('cs-still',${still ? 'true' : 'false'})`); }, [still]);
  const lookJson = useMemo(() => JSON.stringify(look), [look]);
  // Same for the theme's colours: whatever is current when the map is ready is what it wears.
  const lookNow = useRef(lookJson);
  lookNow.current = lookJson;
  useEffect(() => { send(`window.__cs.look(${lookJson})`); }, [lookJson]);
  const holdNow = useRef(holdPins);
  holdNow.current = holdPins;
  useEffect(() => { send(`window.__cs.hold(${holdPins ? 'true' : 'false'})`); }, [holdPins]);

  // The page is built once per try; everything after arrives as messages. The theme's
  // colours go on as soon as the style's layers exist ('style.load'), before
  // anything is drawn, and with no fade (P), so the plain style's pale map
  // never shows first (as in the browser's WebMap and applyLook); 'load' puts
  // them on again with the latest theme.
  // The map's code and stylesheet arrive by ENGINE_JS, at the end; PAINT_WATCH_JS
  // says when the map is up and when it has drawn (and fetches again any streets
  // that failed on the way), so the card can show its loading look till then.
  // Hidden (v6): see-through and hidden from the first frame, by the classes on <html> itself.
  const html = useMemo(() => `<!doctype html><html${hiddenNow.current ? ' class="cs-veil cs-hide"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#m{margin:0;height:100%;background:${hiddenNow.current ? 'transparent' : look.background?.fill ?? '#F4EFE6'};overflow:hidden}.maplibregl-ctrl{display:none}.maplibregl-canvas{outline:none}${MAP_PIN_CSS.replace(/\n/g, '')}${GROW_CLEAR_CSS}${HIDE_CSS}</style></head>
<body><div id="m"></div><script>
var LOOK=${lookNow.current};var APPLIED=null;var INIT=${markersNow.current};var SYNCED=false,SETTLING=false,MOVES=0;var SWOOPER=${interactive ? SWOOP_JS : 'null'},SWOOP=null,LOADED=false;
var PUSH=${full || hiddenNow.current ? PUSH_JS : 'null'},LENS=null,LZ=0,HIDE=${hiddenNow.current ? 'true' : 'false'};
var CAM=${hiddenNow.current ? GROW_CAM_JS : 'null'},HAND=null,HANDED=false;
document.body.classList.toggle('cs-still',${stillNow.current ? 'true' : 'false'});
var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
function start(){
var map=new maplibregl.Map({container:'m',style:'${STYLE}',center:[${centerNow.current.lng},${centerNow.current.lat}],zoom:${zoomNow.current},interactive:${interactive},attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false${interactive ? '' : ',preserveDrawingBuffer:true,fadeDuration:0'}});
// 'painted' waits for the app's own pins, look and move (SYNCED, sent on 'ready'), then for every
// face on the pins to have loaded (at most 0.8 s) and two frames, so what the app is told has drawn
// is exactly what stays on screen.
function faces(cb){var urls=[],seen={},els=[],i,bg,u;try{els=document.querySelectorAll('#m .maplibregl-marker, #m .maplibregl-marker *')}catch(e){}
for(i=0;i<els.length;i++){bg=els[i].style&&els[i].style.backgroundImage;if(!bg||bg.indexOf('url(')<0)continue;u=bg.slice(bg.indexOf('(')+1,bg.lastIndexOf(')')).replace(/["']/g,'');if(u&&!seen[u]){seen[u]=1;urls.push(u)}}
var left=urls.length,fin=false;function end(){if(fin)return;fin=true;requestAnimationFrame(function(){requestAnimationFrame(cb)})}
if(!left){end();return}setTimeout(end,800);urls.forEach(function(x){var im=new Image();im.onload=im.onerror=function(){if(--left<=0)end()};im.src=x})}
// A move while it settles (a new place) means what drew is not what stays: it settles again once the new place has drawn.
function settle(){if(SETTLING)return;SETTLING=true;var m0=MOVES;faces(function(){SETTLING=false;if(MOVES!==m0){map.once('idle',settle);return}post({type:'painted'});try{engine.calm(false)}catch(e){}})}
var W=(${PAINT_WATCH_JS})(map,function(what,why){if(what==='painted'){settle();return}post({type:what,why:why})},{gate:function(){return SYNCED}});
// The phone took the map's drawing back. MapLibre draws again by itself once it is given back, so the full map
// (your pan, zoom and pick) is started afresh only if it is not back within 3 s; the still card at once, as its picture covers it meanwhile.
var LOSTT=0;map.on('webglcontextlost',function(){if(LOSTT)return;LOSTT=setTimeout(function(){LOSTT=0;post({type:'lost'})},${interactive ? 3000 : 0})});
map.on('webglcontextrestored',function(){if(LOSTT){clearTimeout(LOSTT);LOSTT=0}try{map.triggerRepaint()}catch(e){}});
function blank(c){try{var k=document.createElement('canvas');k.width=8;k.height=8;var g=k.getContext('2d');g.drawImage(c,0,0,8,8);var p=g.getImageData(0,0,8,8).data,lo=999,hi=0;for(var j=0;j<p.length;j+=4){var v=p[j]+p[j+1]+p[j+2];if(v<lo)lo=v;if(v>hi)hi=v}return hi-lo<6}catch(e){return false}}
map.touchZoomRotate.disableRotation();
function P(id,k,v){map.setPaintProperty(id,k+'-transition',{duration:0,delay:0});map.setPaintProperty(id,k,v)}
function look(l){for(var id in l){if(!map.getLayer(id))continue;var r=l[id];try{if(r.hide){map.setLayoutProperty(id,'visibility','none');continue}if(r.minZoom!=null)map.setLayerZoomRange(id,r.minZoom,24);if(r.fill)P(id,id==='background'?'background-color':'fill-color',r.fill);if(r.fill&&id!=='background')P(id,'fill-outline-color',r.fill);if(r.line)P(id,'line-color',r.line);if(r.opacity!=null)P(id,'line-opacity',r.opacity);if(r.text)P(id,'text-color',r.text);if(r.halo)P(id,'text-halo-color',r.halo)}catch(e){}}}
map.on('style.load',function(){look(LOOK)});
// A theme change that lands while tiles are still coming in is applied once they settle too
// (map.loaded() is false whenever tiles are loading, which used to skip the new colours and
// left, say, Night's dark map under the light Paris page; Oct 2).
map.on('idle',function(){if(LOOK!==APPLIED){APPLIED=LOOK;look(LOOK)}});
map.on('load',function(){LOADED=true;look(LOOK);try{engine.set(INIT)}catch(e){}post({type:'ready'})});
var box=document.getElementById('m');${interactive ? '' : "box.classList.add('cs-quiet');"}var FAR=null;function zoomClass(){var z=map.getZoom()+LZ;box.classList.toggle('cs-close',z>=${CLOSE_ZOOM_NAMES});box.classList.toggle('cs-far',z<${FAR_ZOOM});box.classList.toggle('cs-short',z<${SHORT_ZOOM});${farBelow === undefined ? '' : `var f=z<${farBelow};if(f!==FAR){FAR=f;post({type:'far',far:f})}`}}zoomClass();map.on('zoom',zoomClass);
map.on('click',function(){post({type:'maptap'})});
map.on('moveend',function(){if(HIDE)return;var c=map.getCenter(),b=map.getBounds();post({type:'move',lat:c.lat,lng:c.lng,zoom:map.getZoom(),s:b.getSouth(),w:b.getWest(),n:b.getNorth(),e:b.getEast()})});
// The pins: one engine with the browser's map (pinEngine), so both gather, split and cascade alike.
var engine=(${PIN_ENGINE_JS})(map,maplibregl,{tap:function(id){post({type:'tap',id:id})},gathered:function(){post({type:'gathered'})},popIn:${popIn ? 'true' : 'false'},hold:${holdNow.current ? 'true' : 'false'},quiet:${interactive ? 'false' : 'true'},full:${full ? 'true' : 'false'},now:${now ? 'true' : 'false'},box:${JSON.stringify(interactive || full ? FULL_MAP_BOX : CARD_BOX)},pad:${JSON.stringify(pad ?? null)}});
// The check-in zoom's push-in, on the card (v5): its pins keep their size on the screen as the page grows round them, on this page's own clock.
function lensTick(){if(!LENS)return;var s=Math.pow(LENS.S,Math.max(0,PUSH(Date.now()-LENS.t0)));try{engine.lens(s)}catch(e){}LZ=Math.log(s)/Math.LN2;zoomClass();LENS.raf=requestAnimationFrame(lensTick)}
// The phone's hidden full map taking over (v6, __cs.arm): waits on its own clock for the moment it is due, then on that
// frame puts its camera exactly where the pushed-in card is looking (the push-in's curve from its start, PUSH, and
// growCamera, CAM), shows itself and begins the dive; says so, and again two frames on (that frame is on the screen).
function handWait(){var a=HAND;if(!a)return;var left=a.at-Date.now();if(left>40){a.t=setTimeout(handWait,left-30);return}a.r=requestAnimationFrame(handFrame)}
function handFrame(){var a=HAND;if(!a)return;var tn=Date.now();if(tn<a.at-8){a.r=requestAnimationFrame(handFrame);return}
HAND=null;HANDED=true;var late=tn-a.at,s=Math.pow(a.f.S,Math.max(0,PUSH(tn-a.f.t0))),c=CAM(a.f,s);MOVES++;
try{map.jumpTo({center:[c.lng,c.lat],zoom:c.zoom})}catch(e){}
window.__cs.unveil();
// Very late (a page made afresh after it was due): no dive from where the card was long ago, it is simply there.
if(a.swoop){if(late>1500)a.swoop.still=true;window.__cs.swoop(a.swoop)}
post({type:'handed',late:late,at:tn,sw:a.swoop?a.swoop.id:null});
requestAnimationFrame(function(){requestAnimationFrame(function(){post({type:'unveiled'})})})}
window.__cs={
  set:function(p){INIT=p;engine.set(p)},
  hold:function(on){engine.hold(on)},
  fly:function(lat,lng,z,ms,oy,exact){MOVES++;map.flyTo({center:[lng,lat],zoom:z==null?map.getZoom():exact?z:Math.max(map.getZoom(),z),duration:ms,offset:[0,oy||0]})},
  look:function(l){LOOK=l;document.body.style.background=(l.background&&l.background.fill)||'#F4EFE6';if(map.isStyleLoaded())look(l)},
  synced:function(){if(SYNCED)return;SYNCED=true;W.kick()},
  rearm:function(){try{engine.calm(true)}catch(e){}map.once('idle',settle)},
  // The check-in zoom (swoop.ts): one swoop at a time; the pins come in as it lands, if they had not yet.
  swoop:function(a){MOVES++;var was=SWOOP;SWOOP=null;if(was)try{was.stop()}catch(e){}a.up=LOADED;var s=null,fin=false;s=SWOOPER(map,a,function(ok,st){fin=true;if(SWOOP===s)SWOOP=null;try{engine.wake()}catch(e){}post({type:'swooped',ok:ok,sw:a.id,st:st||null})});if(!fin)SWOOP=s},
  shot:function(){try{var c=map.getCanvas();post({type:'shot',data:c.toDataURL('image/jpeg',0.92),blank:blank(c)})}catch(e){}},
  warm:function(a){try{(${WARM_JS})(map,a,{})}catch(e){}},
  arm:function(a){if(HANDED||!CAM||!PUSH)return;if(HAND){clearTimeout(HAND.t);cancelAnimationFrame(HAND.r)}HAND={at:a.at,f:a.follow,swoop:a.swoop,t:0,r:0};handWait()},
  lens:function(t0,S){if(LENS&&LENS.raf)cancelAnimationFrame(LENS.raf);if(t0==null||!PUSH){LENS=null;LZ=0;try{engine.lens(1)}catch(e){}zoomClass();return}LENS={t0:t0,S:S};lensTick()},
  // The hidden full map shows itself (v6): its pins at once, its streets in over REVEAL_MS; solid again after.
  unveil:function(){var root=document.documentElement;HIDE=false;root.classList.remove('cs-hide');setTimeout(function(){root.classList.remove('cs-veil')},${REVEAL_MS + 60})}
};
}
${ENGINE_JS}
</script></body></html>`, [load.attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  // The engine the app fetched during the splash (engineCopy), in place before the page starts: the
  // page then goes straight to its streets. Without it yet, the page fetches the engine itself.
  const engine = useMemo(() => engineInjection(), [load.attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void warmMapEngine(); }, []);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        key={load.attempt}
        ref={web}
        source={{ html, baseUrl: 'https://app.courtsidebase.com' }}
        injectedJavaScriptBeforeContentLoaded={engine}
        originWhitelist={['*']}
        style={styles.web}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        setBuiltInZoomControls={false}
        // The phone stopped the page to free memory (the map and the video feed both use a lot): start it again.
        onContentProcessDidTerminate={lost}
        onRenderProcessGone={lost}
        onMessage={(e) => {
          let msg: { type: string; ok?: boolean; sw?: number; st?: SwoopStats | null; data?: string; blank?: boolean; id?: string; lat?: number; lng?: number; zoom?: number; s?: number; w?: number; n?: number; e?: number; far?: boolean; stage?: string; detail?: string; why?: string; late?: number; at?: number };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          // How the page is getting on (useMapLoad): a word of any kind shows it is alive.
          if (msg.type === 'fail') { load.failed([msg.stage, msg.detail ?? msg.why].filter(Boolean).join(': ') || 'failed'); return; }
          if (msg.type === 'online') { load.online(); return; }
          if (msg.type === 'lost') { lost(); return; }
          // The style is in: a swoop waiting for the page goes to it now (it starts once the map has drawn, or very nearly).
          if (msg.type === 'up' && !styled.current) {
            styled.current = true;
            latest.current.onUp?.();
            const swoop = takeSwoop();
            if (swoop) web.current?.injectJavaScript(`${swoop};true;`);
          }
          if (msg.type === 'shot') { if (!msg.blank && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) latest.current.onShot?.(msg.data); return; }
          load.heard(msg.type === 'boot' || msg.type === 'progress' || msg.type === 'up' || msg.type === 'painted' ? msg.type : 'other');
          if (msg.type === 'ready') {
            ready.current = true;
            send(`document.body.classList.toggle('cs-still',${stillNow.current ? 'true' : 'false'})`);
            send(`window.__cs.look(${lookNow.current})`);
            send(`window.__cs.hold(${holdNow.current ? 'true' : 'false'})`);
            send(`window.__cs.set(${markersNow.current})`);
            const move = pendingMove.current;
            pendingMove.current = null;
            if (move) send(`window.__cs.fly(${move.to.lat},${move.to.lng},${move.zoom ?? 'null'},0,${Math.round(move.offsetY ?? 0)},${move.exact ? 'true' : 'false'})`);
            styled.current = true;
            const swoop = takeSwoop();
            if (swoop) send(swoop);
            // All of it is on the page now: its first drawing may be reported.
            send('window.__cs.synced()');
            // A hand-over told to a page that has gone since (the phone stopped it): this one takes over (at once, if due).
            if (arm.current && !armDone.current) send(armJs(arm.current));
          }
          // A frame later, so what the page drew is on the phone's screen too.
          else if (msg.type === 'painted') requestAnimationFrame(() => latest.current.onPainted?.());
          else if (msg.type === 'handed') {
            armDone.current = true;
            arm.current = null;
            // Shown from now on: a fresh page after this (the phone stopped this one) is an ordinary full map, never hidden again.
            hiddenNow.current = false;
            latest.current.onHanded?.(msg.late ?? 0, msg.at ?? Date.now(), typeof msg.sw === 'number' ? msg.sw : null);
          }
          else if (msg.type === 'unveiled') latest.current.onUnveiled?.();
          else if (msg.type === 'tap' && msg.id) latest.current.onTap?.(msg.id);
          else if (msg.type === 'gathered') haptics.tap();
          else if (msg.type === 'swooped' && typeof msg.sw === 'number') latest.current.onSwooped?.(!!msg.ok, msg.sw, msg.st ?? undefined);
          else if (msg.type === 'maptap') latest.current.onMapTap?.();
          else if (msg.type === 'far') latest.current.onFar?.(!!msg.far);
          else if (msg.type === 'move' && msg.lat !== undefined && msg.lng !== undefined && msg.zoom !== undefined) {
            latest.current.onMove?.({ lat: msg.lat, lng: msg.lng }, msg.zoom, { minLat: msg.s ?? msg.lat, minLng: msg.w ?? msg.lng, maxLat: msg.n ?? msg.lat, maxLng: msg.e ?? msg.lng });
          }
        }}
      />
    </View>
  );
});

const styleDefinitions = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
