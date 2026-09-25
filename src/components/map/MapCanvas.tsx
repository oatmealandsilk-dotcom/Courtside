import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { DAY, NIGHT, STYLE } from '@/components/map/look';
import type { LatLng } from '@/features/players/positions';

/** One thing drawn on the map, as the HTML MapLibre will place there. */
export interface CanvasMarker { id: string; lat: number; lng: number; html: string; anchor?: 'center' | 'top'; offsetY?: number }

export interface MapCanvasHandle { flyTo: (to: LatLng, zoom?: number, ms?: number) => void }

interface Props {
  center: LatLng;
  zoom: number;
  night: boolean;
  /** Drag and pinch move the map; off, it is a picture. */
  interactive: boolean;
  markers: CanvasMarker[];
  onTap?: (id: string) => void;
  onMapTap?: () => void;
  onMove?: (center: LatLng) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The phone's map: the same MapLibre vector map the browser draws, inside
 * a web view, so the phone gets the app's own warm-paper look instead of
 * Apple's stock map with its shields and yellow motorways. Nothing native
 * to build — Expo Go has the web view — and one look everywhere.
 */
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ center, zoom, night, interactive, markers, onTap, onMapTap, onMove, style }, ref) {
  const web = useRef<WebView | null>(null);
  const ready = useRef(false);
  const latest = useRef({ onTap, onMapTap, onMove });
  latest.current = { onTap, onMapTap, onMove };
  const send = (js: string) => { if (ready.current) web.current?.injectJavaScript(`${js};true;`); };

  useImperativeHandle(ref, () => ({ flyTo: (to, z, ms = 500) => send(`window.__cs.fly(${to.lat},${to.lng},${z ?? 'null'},${ms})`) }), []);
  const markerJson = JSON.stringify(markers);
  useEffect(() => { send(`window.__cs.set(${markerJson})`); }, [markerJson]);
  useEffect(() => { send(`window.__cs.night(${night})`); }, [night]);

  // The page is built once; everything after arrives as messages.
  const html = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>html,body,#m{margin:0;height:100%;background:${night ? '#1C1C1E' : '#F6F4EF'};overflow:hidden}.maplibregl-ctrl{display:none}.maplibregl-canvas{outline:none}</style></head>
<body><div id="m"></div><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><script>
var LOOK={day:${JSON.stringify(DAY)},night:${JSON.stringify(NIGHT)}};
var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
var map=new maplibregl.Map({container:'m',style:'${STYLE}',center:[${center.lng},${center.lat}],zoom:${zoom},interactive:${interactive},attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false});
map.touchZoomRotate.disableRotation();
function look(l){for(var id in l){if(!map.getLayer(id))continue;var r=l[id];try{if(r.hide){map.setLayoutProperty(id,'visibility','none');continue}if(r.fill)map.setPaintProperty(id,id==='background'?'background-color':'fill-color',r.fill);if(r.line)map.setPaintProperty(id,'line-color',r.line);if(r.text)map.setPaintProperty(id,'text-color',r.text);if(r.halo)map.setPaintProperty(id,'text-halo-color',r.halo)}catch(e){}}}
var isNight=${night};
map.on('load',function(){look(isNight?LOOK.night:LOOK.day);post({type:'ready'})});
map.on('click',function(){post({type:'maptap'})});
map.on('moveend',function(){var c=map.getCenter();post({type:'move',lat:c.lat,lng:c.lng})});
var ms=[];
window.__cs={
  set:function(list){ms.forEach(function(m){m.remove()});ms=[];list.forEach(function(it){var el=document.createElement('div');el.innerHTML=it.html;el.addEventListener('click',function(e){e.stopPropagation();post({type:'tap',id:it.id})});ms.push(new maplibregl.Marker({element:el,anchor:it.anchor||'center',offset:[0,it.offsetY||0]}).setLngLat([it.lng,it.lat]).addTo(map))})},
  fly:function(lat,lng,z,ms){map.flyTo({center:[lng,lat],zoom:z==null?map.getZoom():Math.max(map.getZoom(),z),duration:ms})},
  night:function(n){isNight=n;document.body.style.background=n?'#1C1C1E':'#F6F4EF';if(map.loaded())look(n?LOOK.night:LOOK.day)}
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
          let msg: { type: string; id?: string; lat?: number; lng?: number };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'ready') { ready.current = true; send(`window.__cs.set(${markerJson})`); }
          else if (msg.type === 'tap' && msg.id) latest.current.onTap?.(msg.id);
          else if (msg.type === 'maptap') latest.current.onMapTap?.();
          else if (msg.type === 'move' && msg.lat !== undefined && msg.lng !== undefined) latest.current.onMove?.({ lat: msg.lat, lng: msg.lng });
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
