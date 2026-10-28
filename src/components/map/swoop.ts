/*
 * The check-in zoom's camera move (Oct 28, owner: "if you click the check in button. It would be cool
 * if it zoomed you into the map and centered yourself in the full screen", then of the feel: "like if
 * your in a rollar coaster pov or like a jets pov taking off").
 *
 * One continuous move of the map's own camera (MapLibre's flyTo, the same move every other glide on
 * the map makes) from where the map is down to street level over you, with the map tipping forward
 * into perspective on the way (pitch: as if looking ahead over the front of a roller coaster) and, in
 * the "bank" swoop, turning a little (bearing), then settling flat and north up again as it arrives,
 * so the map is the plain map to use. The flyTo carries where and how close; the tilt and the turn ride
 * on it through MapLibre's own camera hook (transformCameraUpdate), read from the same clock, so it is
 * one move with one ease, never two moves one after the other.
 *
 * Plain old JavaScript in a string, as the pins are (pinEngine): the phone's map is MapLibre inside a
 * web view (MapCanvas puts this in its page), and the browser's map (WebMap) makes the same function
 * from the same text, so the phone and the website swoop alike. Both MapLibres in use have the hook
 * (4.7.1 in the phone's page, as a property of the map; 6.9 in the browser, through setTransformCameraUpdate).
 *
 * Reduce Motion (the system's own setting, as the pins read it): no move at all, the map is simply
 * there, close in on you. A finger on the map part way (or any other move) stops it where it is, and
 * the map is laid flat and north up again once it has come to rest.
 */

/** Which swoop: "dive" straight down; "bank" down with a gentle turn; "takeoff" a short pull back, then forward fast. */
export type SwoopKind = 'dive' | 'bank' | 'takeoff';
export const SWOOP_KINDS: SwoopKind[] = ['dive', 'bank', 'takeoff'];

/** The numbers each swoop is made of, read by SWOOP_JS. */
export interface SwoopShape {
  /** How long the whole move takes. */
  ms: number;
  /** Its ease, as a CSS cubic-bezier: a slow start that gathers speed, then a long soft landing. */
  ease: [number, number, number, number];
  /** How far the map tips forward at most (degrees; 0 is straight down), and when in the move (0 to 1) it is tipped furthest. */
  pitch: number;
  peak: number;
  /** How far the map turns at most (degrees), and when. */
  turn: number;
  turnPeak: number;
  /** The takeoff's pull back (zoom levels out) and how much of the move it lasts. */
  pull: number;
  pullEnd: number;
}

export const SWOOPS: Record<SwoopKind, SwoopShape> = {
  dive: { ms: 1500, ease: [0.5, 0, 0.16, 1], pitch: 55, peak: 0.42, turn: 0, turnPeak: 0.5, pull: 0, pullEnd: 0 },
  bank: { ms: 1600, ease: [0.5, 0, 0.16, 1], pitch: 52, peak: 0.42, turn: 26, turnPeak: 0.5, pull: 0, pullEnd: 0 },
  takeoff: { ms: 1700, ease: [0.62, 0, 0.14, 1], pitch: 48, peak: 0.5, turn: 0, turnPeak: 0.5, pull: 0.55, pullEnd: 0.36 },
};

/**
 * What the page is told: where to, how close, the swoop, and whether to skip the move (Reduce Motion).
 * `up`: the map has had its first full drawing already (open a while); otherwise the swoop starts once
 * it has, or `wait` ms from now at most.
 */
export interface SwoopAsk extends SwoopShape { lat: number; lng: number; zoom: number; still: boolean; up: boolean; wait: number; /** Which swoop (checkInZoom's SwoopTo.id), said back as it ends. */ id: number }

/** Runs a swoop on a map: `SWOOP_FN(map, ask, done)`; `done(true)` once it has arrived, `done(false)` if it was stopped part way. */
export type SwoopFn = (map: unknown, ask: SwoopAsk, done: (arrived: boolean) => void) => { stop: () => void };

export const SWOOP_JS = `(function(){
// A CSS cubic-bezier ease, solved for x by Newton's method (and halving, if that stalls).
function bez(x1,y1,x2,y2){
  function f(t,a,b){return ((1-3*b+3*a)*t+(3*b-6*a))*t*t+3*a*t}
  function d(t,a,b){return 3*(1-3*b+3*a)*t*t+2*(3*b-6*a)*t+3*a}
  return function(x){if(x<=0)return 0;if(x>=1)return 1;var t=x,i,s,e;
    for(i=0;i<8;i++){e=f(t,x1,x2)-x;if(Math.abs(e)<1e-5)return f(t,y1,y2);s=d(t,x1,x2);if(Math.abs(s)<1e-6)break;t-=e/s}
    var lo=0,hi=1;t=x;for(i=0;i<40;i++){e=f(t,x1,x2);if(Math.abs(e-x)<1e-5)break;if(e<x)lo=t;else hi=t;t=(lo+hi)/2}
    return f(t,y1,y2)}}
// Up from 0 to 1 and back to 0 over the move, flat at both ends (so nothing jolts as it starts or lands), highest at 'top'.
function hump(t,top){if(t<=0||t>=1)return 0;var u=t<top?0.5*t/top:0.5+0.5*(t-top)/(1-top),s=Math.sin(Math.PI*u);return s*s}
function less(){try{return document.body.classList.contains('cs-still')||!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(e){return false}}
function now(){return window.performance&&performance.now?performance.now():Date.now()}
// The streets on the way down and where it lands, asked for at once (the map's own tiles, the same addresses the map
// asks for, kept by the phone for years): by the time the camera is there they are in, rather than drawing in under it.
// The last few zoom levels only, round the spot, a row more ahead (the far side of the tilted view).
function warm(map,o,seen){try{
  var st=map.getStyle(),ids=st&&st.sources?Object.keys(st.sources):[],any=false;
  ids.forEach(function(id){var src=map.getSource(id);if(!src||src.type!=='vector'||!src.tiles||!src.tiles.length)return;any=true;
    var top=Math.min(src.maxzoom||14,Math.floor(o.zoom)),lat=o.lat*Math.PI/180;
    for(var z=top;z>=top-2&&z>=0;z--){var n=Math.pow(2,z),x=Math.floor((o.lng+180)/360*n),y=Math.floor((1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*n);
      for(var dy=(z===top-2?-1:-2);dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var tx=(x+dx+n)%n,ty=y+dy;if(ty<0||ty>=n)continue;
        var u=src.tiles[0].replace('{z}',z).replace('{x}',tx).replace('{y}',ty);if(seen[u])continue;seen[u]=1;
        try{fetch(u,{mode:'cors',credentials:'omit'}).catch(function(){})}catch(e){}}}});
  return any}catch(e){return false}}
// The camera hook: a property of the map in MapLibre 4 (the phone's page), set through setTransformCameraUpdate from 5 on (the browser's).
function hook(map,fn){if(map.setTransformCameraUpdate)map.setTransformCameraUpdate(fn);else map.transformCameraUpdate=fn}
return function(map,o,done){
  var over=false,started=false,D=o.ms,t0=0,waitT=0,seen={};
  // Its streets asked for now; on a map just made, as soon as its list of streets has come (or as it starts, at the latest).
  function warmSoon(e){if(e&&e.sourceDataType!=='metadata')return;if(over||warm(map,o,seen))map.off('sourcedata',warmSoon)}
  if(!o.still&&!less()&&!warm(map,o,seen))map.on('sourcedata',warmSoon);
  function end(arrived){if(over)return;over=true;clearTimeout(waitT);map.off('load',begin);map.off('sourcedata',warmSoon);hook(map,null);map.off('moveend',onEnd);
    // Stopped part way: once the map has come to rest (a finger let go), it lies flat and north up again.
    if(started&&!arrived){var flat=function(){try{if(map.isMoving()){map.once('moveend',flat);return}if(Math.abs(map.getPitch())>0.5||Math.abs(map.getBearing())>0.5)map.easeTo({pitch:0,bearing:0,duration:300})}catch(e){}};setTimeout(flat,0)}
    if(done)done(arrived)}
  function onEnd(){end(now()-t0>=D-2)}
  function begin(){
    if(over||started)return;started=true;clearTimeout(waitT);map.off('load',begin);
    if(o.still||less()||!(D>0)){map.jumpTo({center:[o.lng,o.lat],zoom:o.zoom,pitch:0,bearing:0});end(true);return}
    warm(map,o,seen);
    var ease=bez(o.ease[0],o.ease[1],o.ease[2],o.ease[3]);
    // The tilt and the turn, and the takeoff's pull back, laid over the flyTo's own path on the same clock.
    hook(map,function(c){
      if(over)return {};
      var t=Math.max(0,Math.min(1,(now()-t0)/D)),r={pitch:o.pitch*hump(t,o.peak),bearing:o.turn*hump(t,o.turnPeak)};
      if(o.pull&&t<o.pullEnd)r.zoom=c.zoom-o.pull*hump(t/o.pullEnd,0.5);
      // For testers only: a page that set window.__csSwoopTrace to a list gets each frame's camera in it.
      var tr=window.__csSwoopTrace;if(tr&&tr.push)tr.push([Math.round(now()-t0),Math.round((r.zoom!=null?r.zoom:c.zoom)*1000)/1000,Math.round(r.pitch*10)/10,Math.round(r.bearing*10)/10]);
      return r});
    t0=now();
    map.flyTo({center:[o.lng,o.lat],zoom:o.zoom,pitch:0,bearing:0,duration:D,easing:ease,essential:true});
    // Listened for after the flyTo has begun: a move it stopped says it ended, and that is not this one.
    map.on('moveend',onEnd)}
  // A map just opened starts once it has drawn where it is (its first full drawing, 'load'), or after o.wait at most: a
  // slow street far off the way down is not worth waiting for, as the streets close in are about to be fetched anyway.
  // Reduce Motion has no move to start from, so it goes there at once: the first streets drawn are yours, not the town's.
  if(o.up||o.still||less())begin();else{map.once('load',begin);waitT=setTimeout(begin,o.wait>0?o.wait:700)}
  return {stop:function(){if(over)return;if(started){try{map.stop()}catch(e){}}end(false)}};
};
})()`;
