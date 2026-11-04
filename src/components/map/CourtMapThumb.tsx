import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import { Directory, File, Paths } from 'expo-file-system';

import { STYLE, lookFor, thumbLook } from '@/components/map/look';
import { ENGINE_JS } from '@/components/map/engineLoader';
import { THUMB_ZOOM, ThumbStandIn, keyName, makeQueue, thumbKey } from '@/components/map/thumbShared';
import { themes, useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';
import { loadInOn } from '@/features/navigation/loadIn';
import { markPhotoShown, photoFirstShowing } from '@/lib/photoSeen';

/*
 * The phone's court picture. The map engine runs in a web view (as the big
 * map does, see MapCanvas), here a small hidden one (CourtMapSnapshots): it
 * draws the spot once, hands back a photograph of itself, and goes. The
 * photograph is kept in the phone's cache folder, so a court card opened
 * again, even after the app was closed, shows its map at once with no
 * engine at all.
 */

const queue = makeQueue();
/** A court picture's first showing: its crossfade over the stand-in (load-in only). */
const THUMB_FADE_MS = 200;
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
interface Job { lat: number; lng: number; zoom: number; width: number; height: number; lookJson: string; ground?: string }
const jobs = new Map<string, Job>();

/**
 * A still map of a spot, `width` × `height` points, in the theme's own map
 * colours. Nothing on it moves or takes a tap: the card it sits in does.
 * It is drawn by CourtMapSnapshots, which the screen showing it mounts once.
 * `zoom`: how close in (a chat's card shows the streets around, Start a
 * session the court's own block).
 */
export function CourtMapThumb({ lat, lng, width, height, zoom = THUMB_ZOOM, draw = true, onShown }: {
  lat: number; lng: number; width: number; height: number; zoom?: number;
  /** False: only a picture kept from before shows (else the stand-in); nothing new is drawn until it turns true. */
  draw?: boolean;
  /** Told whether the real picture is showing (true once it has loaded), or the stand-in (false): a card shows the map's credit only over a real map. */
  onShown?: (shown: boolean) => void;
}) {
  const { theme } = useTheme();
  const key = thumbKey(theme, lat, lng, width, height, zoom);
  const look = useMemo(() => thumbLook(lookFor(themes[theme])), [theme]);
  const shot = useSyncExternalStore(queue.subscribe, () => shots.get(key) ?? null, () => null);
  // Checked once per spot: kept from before, or into the line to be drawn.
  useEffect(() => {
    if (shots.has(key) || failed.has(key)) return undefined;
    if (fromDisk(key)) { queue.emit(); return undefined; }
    if (!draw) return undefined;
    jobs.set(key, { lat, lng, zoom, width, height, lookJson: JSON.stringify(look), ground: look.background?.fill });
    queue.join(key);
    return () => { if (!shots.has(key)) { queue.leave(key); jobs.delete(key); } };
  }, [key, draw]); // eslint-disable-line react-hooks/exhaustive-deps
  // The picture fades in over the stand-in once it has loaded, never popping.
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(false); }, [shot]);
  useEffect(() => { onShown?.(shown); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  // With the load-in (admins first, loadIn.ts): React Native's fadeDuration only ever worked on Android, so on an iPhone
  // the picture popped in over the stand-in. Now, the first time this session, it fades in over the stand-in (200 ms, a
  // transition of its own style, so it always ends shown however busy the phone is), and the stand-in is taken away under
  // it once the fade is over. Any later time it shows as it loads, as before. Still React Native's own image, which
  // decodes off the main thread (expo-image was tried, Nov 4: its resizing on the main thread made a scroll past the
  // court cards drop frames on the Simulator).
  const fast = loadInOn();
  // Whether this picture's showing is its first this session, decided once per picture (its load marks it shown).
  const firstOf = useRef(new Map<string, boolean>());
  if (shot && !firstOf.current.has(shot)) firstOf.current.set(shot, photoFirstShowing(shot));
  const first = !!shot && !!firstOf.current.get(shot);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [shot]);
  const fadeEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (fadeEnd.current) clearTimeout(fadeEnd.current); }, []);
  if (fast && first) {
    const onLoad = () => {
      if (shot) markPhotoShown(shot);
      setLoaded(true);
      if (fadeEnd.current) clearTimeout(fadeEnd.current);
      fadeEnd.current = setTimeout(() => { fadeEnd.current = null; setShown(true); }, THUMB_FADE_MS + 40);
    };
    return (
      <View style={{ width, height, overflow: 'hidden' }} pointerEvents="none">
        {!shown ? <ThumbStandIn look={look} seed={key} /> : null}
        {shot ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: loaded ? 1 : 0, transitionProperty: 'opacity', transitionDuration: THUMB_FADE_MS, transitionTimingFunction: 'ease-out' }]}>
            <Image source={{ uri: shot }} onLoad={onLoad} fadeDuration={0} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </Animated.View>
        ) : null}
      </View>
    );
  }
  const loadedNow = () => { if (fast && shot) markPhotoShown(shot); setShown(true); };

  return (
    <View style={{ width, height, overflow: 'hidden' }} pointerEvents="none">
      {!shown ? <ThumbStandIn look={look} seed={key} /> : null}
      {shot ? <Image source={{ uri: shot }} onLoad={loadedNow} fadeDuration={180} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
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
function SnapshotView({ lat, lng, zoom, width, height, lookJson, ground, onShot, onFail }: {
  lat: number; lng: number; zoom: number; width: number; height: number; lookJson: string; ground?: string;
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
var map=new maplibregl.Map({container:'m',style:'${STYLE}',center:[${lng},${lat}],zoom:${zoom},interactive:false,attributionControl:false,preserveDrawingBuffer:true,fadeDuration:0,pixelRatio:2});
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
