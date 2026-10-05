import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Directory, File, Paths } from 'expo-file-system';

import { STYLE, lookFor, thumbLook } from '@/components/map/look';
import { ENGINE_JS } from '@/components/map/engineLoader';
import { THUMB_ZOOM, ThumbStandIn, keyName, makeQueue, thumbKey } from '@/components/map/thumbShared';
import { themes, useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

/*
 * The phone's court picture. The map engine runs in a web view (as the big
 * map does, see MapCanvas), here a small hidden one (CourtMapSnapshots): it
 * draws the spot once, hands back a photograph of itself, and goes. The
 * photograph is kept in the phone's cache folder, so a court card opened
 * again, even after the app was closed, shows its map at once with no
 * engine at all.
 */

const queue = makeQueue();
/** Key → the picture's address (a file in the cache folder), once drawn. */
const shots = new Map<string, string>();
/** Spots that could not be drawn this session (no signal): they keep the stand-in, and are tried again next time the app opens. */
const failed = new Set<string>();

const folder = () => {
  const dir = new Directory(Paths.cache, 'court-maps');
  if (!dir.exists) dir.create();
  return dir;
};

/** A picture kept from an earlier session, if there is one. */
function fromDisk(key: string): string | null {
  try {
    const file = new File(Paths.cache, 'court-maps', `${keyName(key)}.jpg`);
    if (!file.exists) return null;
    shots.set(key, file.uri);
    return file.uri;
  } catch {
    return null;
  }
}

/** Keeps a new picture (a JPEG as base64 text) in the cache folder; held in memory if the folder cannot be written. */
function keep(key: string, dataUrl: string) {
  try {
    const file = new File(folder(), `${keyName(key)}.jpg`);
    if (file.exists) file.delete();
    file.create();
    file.write(dataUrl.replace(/^data:image\/\w+;base64,/, ''), { encoding: 'base64' });
    shots.set(key, file.uri);
  } catch {
    shots.set(key, dataUrl);
  }
  queue.leave(key);
}

/** What the drawing needs for each spot waiting in line. */
interface Job { lat: number; lng: number; width: number; height: number; lookJson: string; ground?: string }
const jobs = new Map<string, Job>();

/**
 * A still map of a spot, `width` × `height` points, in the theme's own map
 * colours. Nothing on it moves or takes a tap: the card it sits in does.
 * It is drawn by CourtMapSnapshots, which the screen showing it mounts once.
 */
export function CourtMapThumb({ lat, lng, width, height }: { lat: number; lng: number; width: number; height: number }) {
  const { theme } = useTheme();
  const key = thumbKey(theme, lat, lng, width, height);
  const look = useMemo(() => thumbLook(lookFor(themes[theme])), [theme]);
  const shot = useSyncExternalStore(queue.subscribe, () => shots.get(key) ?? null, () => null);
  // Checked once per spot: kept from before, or into the line to be drawn.
  useEffect(() => {
    if (shots.has(key) || failed.has(key)) return undefined;
    if (fromDisk(key)) { queue.emit(); return undefined; }
    jobs.set(key, { lat, lng, width, height, lookJson: JSON.stringify(look), ground: look.background?.fill });
    queue.join(key);
    return () => { if (!shots.has(key)) { queue.leave(key); jobs.delete(key); } };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // The picture fades in over the stand-in once it has loaded, never popping.
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(false); }, [shot]);

  return (
    <View style={{ width, height, overflow: 'hidden' }} pointerEvents="none">
      {!shown ? <ThumbStandIn look={look} seed={key} /> : null}
      {shot ? <Image source={{ uri: shot }} onLoad={() => setShown(true)} fadeDuration={180} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

/**
 * Where the court pictures are drawn: one small web view at a time, laid at
 * the bottom of the screen and covered by a plain patch of the page's own
 * colour, under everything else. It has to sit inside the visible screen (a
 * web view scrolled out of sight, as a card high up in a chat would be, may
 * not draw at all) and it must never be seen. A screen with court cards
 * mounts this once, first, so the rest of the screen covers it.
 */
export function CourtMapSnapshots() {
  const key = useSyncExternalStore(queue.subscribe, () => queue.first(), () => null);
  const job = key ? jobs.get(key) : undefined;
  if (!key || !job) return null;
  const done = () => { jobs.delete(key); queue.leave(key); };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, bottom: 0, width: job.width, height: job.height, overflow: 'hidden' }}>
      <SnapshotView
        key={key}
        {...job}
        onShot={(data) => { keep(key, data); jobs.delete(key); }}
        onFail={() => { failed.add(key); done(); }}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
    </View>
  );
}

/**
 * The web view that draws one spot and photographs it, gone again as soon
 * as it answers, or after 30 seconds (time for the map's code to come from
 * a second or third host when the first stalls: engineLoader).
 */
function SnapshotView({ lat, lng, width, height, lookJson, ground, onShot, onFail }: {
  lat: number; lng: number; width: number; height: number; lookJson: string; ground?: string;
  onShot: (dataUrl: string) => void; onFail: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onFail, 30_000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const html = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#m{margin:0;width:${width}px;height:${height}px;background:${ground ?? colors.bgElevated};overflow:hidden}.maplibregl-ctrl{display:none}</style></head>
<body><div id="m"></div><script>
var post=function(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))};
var LOOK=${lookJson};
function look(map,l){for(var id in l){if(!map.getLayer(id))continue;var r=l[id];try{if(r.hide){map.setLayoutProperty(id,'visibility','none');continue}if(r.minZoom!=null)map.setLayerZoomRange(id,r.minZoom,24);if(r.fill)map.setPaintProperty(id,id==='background'?'background-color':'fill-color',r.fill);if(r.fill&&id!=='background')map.setPaintProperty(id,'fill-outline-color',r.fill);if(r.line)map.setPaintProperty(id,'line-color',r.line);if(r.opacity!=null)map.setPaintProperty(id,'line-opacity',r.opacity);if(r.text)map.setPaintProperty(id,'text-color',r.text);if(r.halo)map.setPaintProperty(id,'text-halo-color',r.halo)}catch(e){}}}
function start(){
var map=new maplibregl.Map({container:'m',style:'${STYLE}',center:[${lng},${lat}],zoom:${THUMB_ZOOM},interactive:false,attributionControl:false,preserveDrawingBuffer:true,fadeDuration:0,pixelRatio:2});
map.on('load',function(){try{map.style.stylesheet.transition={duration:0,delay:0}}catch(e){}look(map,LOOK);map.once('idle',function(){try{post({type:'shot',data:map.getCanvas().toDataURL('image/jpeg',0.86)})}catch(e){post({type:'fail'})}})});
}
${ENGINE_JS}
</script></body></html>`, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <WebView
        source={{ html, baseUrl: 'https://app.courtsidebase.com' }}
        originWhitelist={['*']}
        style={{ width, height, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        onMessage={(e) => {
          let msg: { type?: string; data?: string };
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (msg.type === 'shot' && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) onShot(msg.data);
          else if (msg.type === 'fail') onFail();
        }}
        onError={onFail}
        onContentProcessDidTerminate={onFail}
        onRenderProcessGone={onFail}
      />
    </View>
  );
}
