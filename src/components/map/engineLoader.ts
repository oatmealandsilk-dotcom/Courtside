/**
 * How a map gets going, and keeps going on a poor signal (Oct 5: on two
 * bars of 5G the Find Players card showed its city's name over a blank map
 * with "Map couldn't load" on top).
 *
 * Where the phone gets MapLibre, the code that draws the map: MapCanvas and
 * the court pictures run it inside a web view, which fetches it, with its
 * stylesheet, from the first of three hosts that gives it whole: unpkg, then
 * jsDelivr, then our own site (a copy in public/maplibre/4.7.1). A host that
 * has not started answering in 12 seconds, or goes quiet for 10 mid-download,
 * is dropped for the next one; a slow download that keeps arriving is never
 * cut off. Nothing here holds up the page itself: the stylesheet used to be
 * a <link> in its head, and a host that stalled on it stopped the page from
 * running at all. The version is pinned, so after one good load the phone
 * keeps a copy.
 *
 * PAINT_WATCH_JS, run by the phone's page and the browser's map alike, says
 * when the map is up (its style has arrived: from then on a slow network only
 * means streets fill in late, never a failure) and when it has first drawn,
 * fetching again any streets that failed on the way. useMapLoad decides when
 * a map that never drew is tried again, and when to say it didn't load.
 */
const VERSION = '4.7.1';
const HOSTS = [
  `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl`,
  `https://cdn.jsdelivr.net/npm/maplibre-gl@${VERSION}/dist/maplibre-gl`,
  // The same files, byte for byte, on our own site (the web build serves public/).
  `https://app.courtsidebase.com/maplibre/${VERSION}/maplibre-gl`,
];

/**
 * A script body that fetches the map's code and stylesheet, then calls
 * `start()` (the page's own code, which must be defined, along with `post`,
 * before this runs). It posts as it goes, so the app can tell a slow load
 * from a stuck one: {type:'boot'} at once, {type:'progress'} while files
 * arrive, {type:'engine'} once the code runs, {type:'online'} whenever the
 * phone's connection comes back, and {type:'fail', stage} when no host gave
 * the files or start() threw.
 */
export const ENGINE_JS = `(function(){
var hosts=${JSON.stringify(HOSTS)},FIRST=12000,QUIET=10000,beatAt=0;
post({type:'boot'});
window.addEventListener('online',function(){post({type:'online'})});
function beat(n){var t=Date.now();if(t-beatAt<1000)return;beatAt=t;post({type:'progress',got:n})}
function grab(url){return new Promise(function(ok,no){
var ctl=typeof AbortController==='function'?new AbortController():null,timer=0,over=false;
function end(e,text){if(over)return;over=true;clearTimeout(timer);if(e){try{ctl&&ctl.abort()}catch(x){}no(e)}else ok(text)}
function wait(ms){clearTimeout(timer);timer=setTimeout(function(){end(new Error('no answer'))},ms)}
wait(FIRST);
fetch(url,{mode:'cors',credentials:'omit',signal:ctl?ctl.signal:undefined}).then(function(r){
if(!r.ok)throw new Error('HTTP '+r.status);
wait(QUIET);
if(!r.body||!r.body.getReader||typeof TextDecoder!=='function')return r.text();
var rd=r.body.getReader(),dec=new TextDecoder(),parts=[],got=0;
function pump(){return rd.read().then(function(c){if(c.done){parts.push(dec.decode());return parts.join('')}got+=c.value.length;parts.push(dec.decode(c.value,{stream:true}));wait(QUIET);beat(got);return pump()})}
return pump();
}).then(function(t){end(null,t)},function(e){end(e)});
})}
function fromHosts(ext){var i=0;function next(){if(i>=hosts.length)return Promise.reject(new Error('no host answered'));var h=hosts[i++];post({type:'progress',host:i});return grab(h+ext).catch(next)}return next()}
function begin(){post({type:'engine'});try{start()}catch(e){post({type:'fail',stage:'start',detail:String(e&&e.message||e)})}}
if(window.maplibregl){begin();return}
Promise.all([fromHosts('.js'),fromHosts('.css')]).then(function(f){
var css=document.createElement('style');css.textContent=f[1];document.head.appendChild(css);
var js=document.createElement('script');js.textContent=f[0];document.head.appendChild(js);document.head.removeChild(js);
if(window.maplibregl)begin();else post({type:'fail',stage:'engine',detail:'did not start'});
},function(e){post({type:'fail',stage:'engine',detail:String(e&&e.message||e)})});
})();`;

/**
 * Watches one map from its first moment, as `function(map, tell)`; run
 * straight after the map is made, before anything else listens to it.
 *
 * - tell('up'): the style has arrived and the map can draw.
 * - tell('painted'): everything in view has drawn for the first time.
 *   Streets that failed to arrive by then are fetched again (in 1.5, 4 and
 *   9 seconds, or at once when the connection comes back) before it says so.
 *   A street that fails asks for a fresh frame: MapLibre draws nothing new
 *   for a failure, so without one the map never says it has settled. Each
 *   try also forgets any lettering that failed to arrive, which MapLibre 4
 *   would otherwise never ask for again (every street needing it failing
 *   with it).
 * - The list of where the streets are (the one small file the style points
 *   to) failing is fetched again on the same waits straight away: in
 *   MapLibre 4, the phone's, a map without it never settles, so waiting for
 *   it to settle first waited forever (Oct 5 review). Its fetch being
 *   called off by a fresh one (MapLibre 4 reports that as an error too) is
 *   not a failure.
 * - Nothing at all arriving for 40 seconds once the map is up (a request the
 *   network left hanging) gets one fresh fetch of everything; a second time,
 *   it counts as out of tries. A slow download is not this: every piece that
 *   arrives resets the clock (on a 100 kbps line the first street came 26 s
 *   after the style), and a phone that paused the page (the app in the
 *   background) gets a fresh one when it comes back.
 * - tell('tiles') at most every 3 seconds while streets are arriving, and
 *   tell('retry', why) as each fresh fetch is set up: signs of life for
 *   useMapLoad.
 * - tell('fail', why): the style never came; or, out of tries, none of the
 *   streets did (or their list never came). Some did: it is 'painted' with
 *   what came. After a 'fail' about the streets the page keeps watching, so
 *   streets that come after all (the connection back) still say 'painted'.
 *
 * Returns {stop} for a map that is being taken down.
 */
export const PAINT_WATCH_JS = `function(map,tell){
var up=false,painted=false,over=false,told=false,trouble=0,good=0,tries=0,stalls=0,timer=0,seen=Date.now(),tick=seen,beatAt=0,why='',WAITS=[1500,4000,9000],STALL=40000;
function again(){timer=0;trouble=0;seen=Date.now();try{var g=map.style&&map.style.glyphManager,k;if(g&&g.entries)for(k in g.entries)if(g.entries[k]&&g.entries[k].requests)g.entries[k].requests={}}catch(e){}try{var st=map.getStyle(),id,d,s;for(id in st.sources){d=st.sources[id];s=map.getSource(id);if(d&&d.url&&s&&s.setUrl)s.setUrl(d.url)}}catch(e){}}
function done(){if(painted||over)return;painted=true;clearInterval(watch);tell('painted')}
function end(w){if(good){done();return}if(!told){told=true;tell('fail','tiles: '+w)}}
function retry(){if(painted||over||timer)return;if(tries<WAITS.length){tell('retry',why);timer=setTimeout(again,WAITS[tries++]);return}end(why)}
map.on('error',function(e){if(over||painted)return;var er=e&&e.error;if(er&&(er.status===404||er.name==='AbortError'||er.message==='AbortError'))return;if(!up){over=true;tell('fail','style: '+String(er&&er.message||'error'));return}if(e&&e.sourceId){trouble++;why=String(er&&er.message||'error');try{map.triggerRepaint()}catch(x){}if(!e.tile){why='list: '+why;retry()}}});
map.on('sourcedata',function(e){seen=Date.now();if(e&&e.tile){good++;if(!painted&&seen-beatAt>3000){beatAt=seen;tell('tiles')}}});
map.on('style.load',function(){if(!up){up=true;seen=Date.now();tell('up')}});
map.on('idle',function(){if(painted||over)return;if(trouble){retry();return}done()});
var watch=setInterval(function(){var t=Date.now();if(t-tick>6000)seen=t;tick=t;if(!up||painted||over||told||timer||t-seen<STALL)return;seen=t;why='nothing for '+STALL/1000+'s';if(stalls++){end(why);return}tell('retry',why);again()},2000);
function online(){if(painted||over||!up)return;if(timer){clearTimeout(timer);timer=0}if(trouble||told){told=false;again()}}
window.addEventListener('online',online);
return {stop:function(){over=true;clearTimeout(timer);clearInterval(watch);window.removeEventListener('online',online)}};
}`;

/*
 * When a map that has not drawn is tried again (useMapLoad): a page or map
 * that fails is made afresh after 2 seconds, then 6, each new try with its
 * own clock. After the third failure, or a try that ends past 45 seconds,
 * the card says it didn't load. Before the map is up, a try that has said
 * nothing at all for 20 seconds counts as failed; after, one silent for 90
 * (a page that is alive says something far more often: PAINT_WATCH_JS), so
 * a map can never sit on "Loading map…" for good.
 */
export const RETRY_WAITS_MS = [2000, 6000];
export const LOAD_BUDGET_MS = 45_000;
export const LOAD_SILENCE_MS = 20_000;
export const LOAD_STUCK_MS = 90_000;
