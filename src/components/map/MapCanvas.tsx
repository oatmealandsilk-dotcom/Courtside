import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { STYLE, type Look } from '@/components/map/look';
import { ENGINE_JS, PAINT_WATCH_JS } from '@/components/map/engineLoader';
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
  /** Once, the first time everything in view has drawn (streets, names, pins). */
  onPainted?: () => void;
  /** Whether the map is loading, drawn, or given up on (useMapLoad), told each time it changes: the still card and the full map show it themselves (MapLoadState). */
  onStatus?: (status: MapLoadStatus) => void;
  /** With `onFar`: the zoom below which the map counts as far out (courts hide there: COURTS_MIN_ZOOM). Read once, when the page is made. */
  farBelow?: number;
  /** The map crossed `farBelow`, either way (and once as it starts): told the moment it happens, not only when it comes to rest. */
  onFar?: (far: boolean) => void;
  style?: StyleProp<ViewStyle>;
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
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ center, zoom, look, interactive, markers, tpl, popIn = false, holdPins = false, pad, onTap, onMapTap, onMove, onPainted, onStatus, farBelow, onFar, style }, ref) {
  const styles = useThemedStyles(styleDefinitions);
  const web = useRef<WebView | null>(null);
  const ready = useRef(false);
  // Getting the page going, and again if it fails (useMapLoad): each try is a new web view.
  const load = useMapLoad(interactive ? 'full map' : 'map card');
  useEffect(() => { ready.current = false; }, [load.attempt]);
  const latest = useRef({ onTap, onMapTap, onMove, onPainted, onFar, onStatus });
  latest.current = { onTap, onMapTap, onMove, onPainted, onFar, onStatus };
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
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const markerJson = JSON.stringify({ items: markers, tpl });
  const markersNow = useRef(markerJson);
  markersNow.current = markerJson;
  useEffect(() => { send(`window.__cs.set(${markerJson})`); }, [markerJson]);
  // Reduce Motion, from the phone's own setting: the pins' pulse holds still and the ring only fades.
  const still = useReducedMotion();
  const stillNow = useRef(still);
  stillNow.current = still;
  useEffect(() => { send(`document.body.classList.toggle('cs-still',${still ? 'true' : 'false'})`); }, [still]);
  const lookJson = JSON.stringify(look);
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
var LOOK=${lookJson};var APPLIED=null;
var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
function start(){
var map=new maplibregl.Map({container:'m',style:'${STYLE}',center:[${center.lng},${center.lat}],zoom:${zoom},interactive:${interactive},attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false});
(${PAINT_WATCH_JS})(map,function(what,why){post({type:what,why:why})});
map.touchZoomRotate.disableRotation();
function P(id,k,v){map.setPaintProperty(id,k+'-transition',{duration:0,delay:0});map.setPaintProperty(id,k,v)}
function look(l){for(var id in l){if(!map.getLayer(id))continue;var r=l[id];try{if(r.hide){map.setLayoutProperty(id,'visibility','none');continue}if(r.minZoom!=null)map.setLayerZoomRange(id,r.minZoom,24);if(r.fill)P(id,id==='background'?'background-color':'fill-color',r.fill);if(r.fill&&id!=='background')P(id,'fill-outline-color',r.fill);if(r.line)P(id,'line-color',r.line);if(r.opacity!=null)P(id,'line-opacity',r.opacity);if(r.text)P(id,'text-color',r.text);if(r.halo)P(id,'text-halo-color',r.halo)}catch(e){}}}
map.on('style.load',function(){look(LOOK)});
// A theme change that lands while tiles are still coming in is applied once they settle too
// (map.loaded() is false whenever tiles are loading, which used to skip the new colours and
// left, say, Night's dark map under the light Paris page; Oct 2).
map.on('idle',function(){if(LOOK!==APPLIED){APPLIED=LOOK;look(LOOK)}});
map.on('load',function(){look(LOOK);post({type:'ready'})});
var box=document.getElementById('m');${interactive ? '' : "box.classList.add('cs-quiet');"}var FAR=null;function zoomClass(){var z=map.getZoom();box.classList.toggle('cs-close',z>=${CLOSE_ZOOM_NAMES});box.classList.toggle('cs-far',z<${FAR_ZOOM});box.classList.toggle('cs-short',z<${SHORT_ZOOM});${farBelow === undefined ? '' : `var f=z<${farBelow};if(f!==FAR){FAR=f;post({type:'far',far:f})}`}}zoomClass();map.on('zoom',zoomClass);
map.on('click',function(){post({type:'maptap'})});
map.on('moveend',function(){var c=map.getCenter(),b=map.getBounds();post({type:'move',lat:c.lat,lng:c.lng,zoom:map.getZoom(),s:b.getSouth(),w:b.getWest(),n:b.getNorth(),e:b.getEast()})});
// The pins: one engine with the browser's map (pinEngine), so both gather, split and cascade alike.
var engine=(${PIN_ENGINE_JS})(map,maplibregl,{tap:function(id){post({type:'tap',id:id})},gathered:function(){post({type:'gathered'})},popIn:${popIn ? 'true' : 'false'},hold:${holdPins ? 'true' : 'false'},quiet:${interactive ? 'false' : 'true'},box:${JSON.stringify(interactive ? FULL_MAP_BOX : CARD_BOX)},pad:${JSON.stringify(pad ?? null)}});
window.__cs={
  set:function(p){engine.set(p)},
  hold:function(on){engine.hold(on)},
  fly:function(lat,lng,z,ms,oy,exact){map.flyTo({center:[lng,lat],zoom:z==null?map.getZoom():exact?z:Math.max(map.getZoom(),z),duration:ms,offset:[0,oy||0]})},
  look:function(l){LOOK=l;document.body.style.background=(l.background&&l.background.fill)||'#F4EFE6';if(map.isStyleLoaded())look(l)}
};
}
${ENGINE_JS}
</script></body></html>`, [load.attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        key={load.attempt}
        ref={web}
        source={{ html, baseUrl: 'https://app.courtsidebase.com' }}
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
        onContentProcessDidTerminate={() => { ready.current = false; load.reboot(); }}
        onRenderProcessGone={() => { ready.current = false; load.reboot(); }}
        onMessage={(e) => {
          let msg: { type: string; id?: string; lat?: number; lng?: number; zoom?: number; s?: number; w?: number; n?: number; e?: number; far?: boolean; stage?: string; detail?: string; why?: string };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          // How the page is getting on (useMapLoad): a word of any kind shows it is alive.
          if (msg.type === 'fail') { load.failed([msg.stage, msg.detail ?? msg.why].filter(Boolean).join(': ') || 'failed'); return; }
          if (msg.type === 'online') { load.online(); return; }
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
