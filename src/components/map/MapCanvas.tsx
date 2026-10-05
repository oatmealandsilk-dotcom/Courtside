import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import {  } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { STYLE, type Look } from '@/components/map/look';
import { CLOSE_ZOOM_NAMES, FAR_ZOOM, MAP_PIN_CSS, SHORT_ZOOM } from '@/components/map/markers';
import { CARD_BOX, FULL_MAP_BOX, PIN_ENGINE_JS, type CanvasMarker, type ClusterTemplates } from '@/components/map/pinEngine';
import type { LatLng, ViewBounds } from '@/features/players/positions';
import * as haptics from '@/lib/haptics';

export type { CanvasMarker };

/**
 * `offsetY`: where the spot ends up, in pixels from the middle (negative is higher: clear of a tall card).
 * `exact`: go to exactly that zoom, out as well as in (a place searched for); otherwise the map only ever zooms in.
 */
export interface MapCanvasHandle { flyTo: (to: LatLng, zoom?: number, ms?: number, offsetY?: number, exact?: boolean) => void }

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
 */
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ center, zoom, look, interactive, markers, tpl, popIn = false, holdPins = false, pad, onTap, onMapTap, onMove, onPainted, farBelow, onFar, style }, ref) {
  const web = useRef<WebView | null>(null);
  const ready = useRef(false);
  const latest = useRef({ onTap, onMapTap, onMove, onPainted, onFar });
  latest.current = { onTap, onMapTap, onMove, onPainted, onFar };
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
  }), []);
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

  // The page is built once; everything after arrives as messages. The theme's
  // colours go on as soon as the style's layers exist ('style.load'), before
  // anything is drawn, and with no fade (P), so the plain style's pale map
  // never shows first (as in the browser's WebMap and applyLook); 'load' puts
  // them on again with the latest theme.
  const html = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>html,body,#m{margin:0;height:100%;background:${look.background?.fill ?? '#F4EFE6'};overflow:hidden}.maplibregl-ctrl{display:none}.maplibregl-canvas{outline:none}${MAP_PIN_CSS.replace(/\n/g, '')}</style></head>
<body><div id="m"></div><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><script>
var LOOK=${lookJson};var APPLIED=null;
var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
var map=new maplibregl.Map({container:'m',style:'${STYLE}',center:[${center.lng},${center.lat}],zoom:${zoom},interactive:${interactive},attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false});
map.touchZoomRotate.disableRotation();
function P(id,k,v){map.setPaintProperty(id,k+'-transition',{duration:0,delay:0});map.setPaintProperty(id,k,v)}
function look(l){for(var id in l){if(!map.getLayer(id))continue;var r=l[id];try{if(r.hide){map.setLayoutProperty(id,'visibility','none');continue}if(r.minZoom!=null)map.setLayerZoomRange(id,r.minZoom,24);if(r.fill)P(id,id==='background'?'background-color':'fill-color',r.fill);if(r.fill&&id!=='background')P(id,'fill-outline-color',r.fill);if(r.line)P(id,'line-color',r.line);if(r.opacity!=null)P(id,'line-opacity',r.opacity);if(r.text)P(id,'text-color',r.text);if(r.halo)P(id,'text-halo-color',r.halo)}catch(e){}}}
map.on('style.load',function(){look(LOOK)});
// A theme change that lands while tiles are still coming in is applied once they settle too
// (map.loaded() is false whenever tiles are loading, which used to skip the new colours and
// left, say, Night's dark map under the light Paris page; Oct 2).
map.on('idle',function(){if(LOOK!==APPLIED){APPLIED=LOOK;look(LOOK)}});
map.on('load',function(){look(LOOK);post({type:'ready'})});
map.once('idle',function(){post({type:'painted'})});
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
</script></body></html>`, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
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
        onMessage={(e) => {
          let msg: { type: string; id?: string; lat?: number; lng?: number; zoom?: number; s?: number; w?: number; n?: number; e?: number; far?: boolean };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
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

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
