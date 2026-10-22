import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { STYLE, type Look } from '@/components/map/look';
import { ENGINE_JS, PAINT_WATCH_JS } from '@/components/map/engineLoader';
import { engineInjection, warmMapEngine } from '@/components/map/engineCopy';
import { useMapLoad, type MapLoadStatus } from '@/components/map/useMapLoad';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { CLOSE_ZOOM_NAMES, FAR_ZOOM, MAP_PIN_CSS, SHORT_ZOOM } from '@/components/map/markers';
import { CARD_BOX, FULL_MAP_BOX, PIN_ENGINE_JS, type CanvasMarker, type ClusterTemplates } from '@/components/map/pinEngine';
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
  style?: StyleProp<ViewStyle>;
  /** On screen: off (a page over it, a hidden pager page, another tab), its load clocks wait (useMapLoad). */
  active?: boolean;
}

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
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ center, zoom, look, interactive, markers, tpl, popIn = false, holdPins = false, pad, onTap, onMapTap, onMove, onPainted, onShot, onLost, onStatus, farBelow, onFar, style, active = true }, ref) {
  const styles = useThemedStyles(styleDefinitions);
  const web = useRef<WebView | null>(null);
  const ready = useRef(false);
  // Getting the page going, and again if it fails (useMapLoad): each try is a new web view.
  const load = useMapLoad(interactive ? 'full map' : 'map card', active);
  useEffect(() => { ready.current = false; }, [load.attempt]);
  const latest = useRef({ onTap, onMapTap, onMove, onPainted, onShot, onLost, onFar, onStatus });
  latest.current = { onTap, onMapTap, onMove, onPainted, onShot, onLost, onFar, onStatus };
  // A fresh page (a retry, or one the phone stopped) starts where the map is meant to be now, not where it first was.
  const centerNow = useRef(center);
  centerNow.current = center;
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  /** The page has gone (the phone stopped it, or lost its drawing): a fresh one, and the screen told. */
  const lost = () => { ready.current = false; load.reboot(); latest.current.onLost?.(); };
  useEffect(() => { latest.current.onStatus?.(load.status); }, [load.status]);
  const send = (js: string) => { if (ready.current) web.current?.injectJavaScript(`${js};true;`); };
  // The page takes a moment to start. A move asked for before then (your
  // location arriving) is kept and made the instant it is ready; dropping
  // it left the map on the default city until it was opened again.
  const pendingMove = useRef<{ to: LatLng; zoom?: number; offsetY?: number; exact?: boolean } | null>(null);

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
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Written out only when the pins change, not on every draw of the page around the map (Oct 10,
  // owner: "the buttons like the settings. msg notifications, etc respond too slow").
  const markerJson = useMemo(() => JSON.stringify({ items: markers, tpl }), [markers, tpl]);
  const markersNow = useRef(markerJson);
  markersNow.current = markerJson;
  useEffect(() => { send(`window.__cs.set(${markerJson})`); }, [markerJson]);
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
  const html = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#m{margin:0;height:100%;background:${look.background?.fill ?? '#F4EFE6'};overflow:hidden}.maplibregl-ctrl{display:none}.maplibregl-canvas{outline:none}${MAP_PIN_CSS.replace(/\n/g, '')}</style></head>
<body><div id="m"></div><script>
var LOOK=${lookNow.current};var APPLIED=null;var INIT=${markersNow.current};var SYNCED=false,SETTLING=false;
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
function settle(){if(SETTLING)return;SETTLING=true;faces(function(){SETTLING=false;post({type:'painted'});try{engine.calm(false)}catch(e){}})}
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
map.on('load',function(){look(LOOK);try{engine.set(INIT)}catch(e){}post({type:'ready'})});
var box=document.getElementById('m');${interactive ? '' : "box.classList.add('cs-quiet');"}var FAR=null;function zoomClass(){var z=map.getZoom();box.classList.toggle('cs-close',z>=${CLOSE_ZOOM_NAMES});box.classList.toggle('cs-far',z<${FAR_ZOOM});box.classList.toggle('cs-short',z<${SHORT_ZOOM});${farBelow === undefined ? '' : `var f=z<${farBelow};if(f!==FAR){FAR=f;post({type:'far',far:f})}`}}zoomClass();map.on('zoom',zoomClass);
map.on('click',function(){post({type:'maptap'})});
map.on('moveend',function(){var c=map.getCenter(),b=map.getBounds();post({type:'move',lat:c.lat,lng:c.lng,zoom:map.getZoom(),s:b.getSouth(),w:b.getWest(),n:b.getNorth(),e:b.getEast()})});
// The pins: one engine with the browser's map (pinEngine), so both gather, split and cascade alike.
var engine=(${PIN_ENGINE_JS})(map,maplibregl,{tap:function(id){post({type:'tap',id:id})},gathered:function(){post({type:'gathered'})},popIn:${popIn ? 'true' : 'false'},hold:${holdNow.current ? 'true' : 'false'},quiet:${interactive ? 'false' : 'true'},box:${JSON.stringify(interactive ? FULL_MAP_BOX : CARD_BOX)},pad:${JSON.stringify(pad ?? null)}});
window.__cs={
  set:function(p){engine.set(p)},
  hold:function(on){engine.hold(on)},
  fly:function(lat,lng,z,ms,oy,exact){map.flyTo({center:[lng,lat],zoom:z==null?map.getZoom():exact?z:Math.max(map.getZoom(),z),duration:ms,offset:[0,oy||0]})},
  look:function(l){LOOK=l;document.body.style.background=(l.background&&l.background.fill)||'#F4EFE6';if(map.isStyleLoaded())look(l)},
  synced:function(){if(SYNCED)return;SYNCED=true;W.kick()},
  rearm:function(){try{engine.calm(true)}catch(e){}map.once('idle',settle)},
  shot:function(){try{var c=map.getCanvas();post({type:'shot',data:c.toDataURL('image/jpeg',0.92),blank:blank(c)})}catch(e){}}
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
          let msg: { type: string; data?: string; blank?: boolean; id?: string; lat?: number; lng?: number; zoom?: number; s?: number; w?: number; n?: number; e?: number; far?: boolean; stage?: string; detail?: string; why?: string };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          // How the page is getting on (useMapLoad): a word of any kind shows it is alive.
          if (msg.type === 'fail') { load.failed([msg.stage, msg.detail ?? msg.why].filter(Boolean).join(': ') || 'failed'); return; }
          if (msg.type === 'online') { load.online(); return; }
          if (msg.type === 'lost') { lost(); return; }
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
            // All of it is on the page now: its first drawing may be reported.
            send('window.__cs.synced()');
          }
          // A frame later, so what the page drew is on the phone's screen too.
          else if (msg.type === 'painted') requestAnimationFrame(() => latest.current.onPainted?.());
          else if (msg.type === 'tap' && msg.id) latest.current.onTap?.(msg.id);
          else if (msg.type === 'gathered') haptics.tap();
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
