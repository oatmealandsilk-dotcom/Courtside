import { JUST_OPEN_CLASS, OPEN_CLASS, POP_MS } from '@/components/map/markers';

/*
 * The map's pins, kept on the map: one engine for both canvases. MapLibre
 * draws markers as HTML in the browser and inside the phone's web view
 * alike, so the same code places, updates, gathers and animates them in
 * both. It is written as plain old JavaScript in a string because inside
 * the web view it runs as part of the page there (MapCanvas puts it in the
 * page), and the browser's map (WebMap) makes the same function from the
 * same text: one copy, so the phone and the website can never drift apart.
 *
 * What it does with the list it is given (CanvasMarker below):
 *
 *  - Keeps each pin between changes (by id): a new list only moves,
 *    restyles or redraws what changed, and Open to hit is a class change,
 *    so the green ring draws in place (MAP_PIN_CSS). A pin that appears
 *    already open is drawn open, never drawn in.
 *  - "+N": pins of a kind whose room on screen overlaps (a player's is the
 *    disc and the name under it) gather into one: the leading player's own
 *    pin with a "+4" badge and a second disc peeking behind it; courts into
 *    a court-coloured disc with how many places; hit flags into the soonest
 *    flag with a badge. Worked out for every half step of zoom at once, at
 *    the step's widest-apart point (so nothing overlaps anywhere inside a
 *    step), each step gathering the one above it: zooming in splits a
 *    pin apart the moment there is room; the ones that leave glide out from
 *    where the gathered pin was, or glide back into it.
 *  - You, and whoever is picked, never gather into anyone: players crowding
 *    you (or them) gather into a small "+N" beside your pin instead.
 *  - Room for players: a court someone is standing on lifts above their
 *    disc, and its hit flag above that; a court a player's name would cover
 *    moves aside (or folds away until you zoom in). Zoomed out (below 12),
 *    a flag on top of a court or a player folds into it as a small dot.
 *  - Tapping a gathered pin zooms in until it splits; people standing on the
 *    very same spot (a court) never split by zooming, so a tap fans them out
 *    in rows just under the spot instead (room for each name).
 *  - Only pins in or near the view are made; the rest wait until the map
 *    comes to rest near them. At most 40 glide at once, nearest the middle.
 *  - The full map, just opened: its first pins (players, courts and hits
 *    together) appear in one soft wave, nearest the middle first: each
 *    scales up from 0.6 and fades in (0.34 s), up to 30 ms apart, the last
 *    one done inside 0.6 s. Only once per opening, and only once the map has drawn (and any
 *    sheet over it has gone): panning and later loads just fade in.
 *  - Reduce Motion ("cs-still" on the page, or the system's setting): no
 *    gliding and no scaling, only fades.
 *  - The still card ('quiet'): no pin is a button of its own; the card is.
 */

/** One thing drawn on the map, as the HTML MapLibre will place there. */
export interface CanvasMarker {
  id: string;
  lat: number;
  lng: number;
  html: string;
  /** Which part of it sits on the spot: a hit's flag hangs from its point. */
  anchor?: 'center' | 'top' | 'bottom';
  offsetY?: number;
  /** Stacking: higher sits on top (courts under players under you). */
  z?: number;
  /** Classes on the marker itself (OPEN_CLASS): a change of these animates in place, where a change of `html` redraws it. */
  cls?: string;
  /** Gathers into "+N" with others of its kind when they crowd: 'p' players, 'c' courts, 'h' hit flags. Absent: never gathered (the still card's dots). */
  k?: 'p' | 'c' | 'h';
  /** Within its kind, who leads a gathered pin: lowest first. */
  r?: number;
  /** Picked: never gathered into anything (a picked player leads a "+N" beside them instead). */
  sel?: boolean;
  /** You: like `sel`, never gathered; players crowding you gather beside you. */
  fix?: boolean;
  /** Never gathered with its kind, though it still makes room like one (a court with something on: its glow and label stay in sight). */
  solo?: boolean;
  /** How many it stands for in a gathered pin's count (a court pin: its courts). Absent: one. */
  n?: number;
  /** Half its width, where wider than a court's square (a crowd's "11 courts"), so room for players counts all of it. */
  cw?: number;
  /** A player's disc, across (for room and for lifting what stands under it). */
  ds?: number;
  /** About how wide a player's pin is with its name (`fw`), and without the "· 2h" it drops below zoom 12 (`fws`), so two short names may stand closer than two long ones. */
  fw?: number;
  fws?: number;
  /** Which first wave it joins on the full map: players, courts or hits. */
  g?: 'p' | 'c' | 'h';
  /** Shown only from this zoom in (courts: about a city); further out it fades away and is never made. Absent: at every zoom. */
  mz?: number;
  /** For screen readers. */
  role?: string;
  label?: string;
}

/** What the gathered pins look like, in the theme's colours (markers.ts clusterTemplates). */
export interface ClusterTemplates {
  /** Put into a player's pin or a flag where it says <!--cs-badge-->: "{n}" becomes "+4". */
  badge: string;
  /** Put where it says <!--cs-stack-->: the second disc peeking out behind. */
  stack: string;
  /** A gathered court pin: "{n}" becomes how many places. */
  court: string;
  /** The "+N" beside you (or whoever is picked): "{n}" becomes "+3". */
  chip: string;
}

export interface PinEngine {
  set: (payload: { items: CanvasMarker[]; tpl: ClusterTemplates }) => void;
  /** Holds the first wave back (a sheet is over the map), or lets it go. */
  hold: (on: boolean) => void;
  destroy: () => void;
}

export interface PinEngineOptions {
  /** A pin (not a gathered one) was tapped. On a quiet map, a gathered one too (with its leader's id). */
  tap: (id: string) => void;
  /** The full map, just opened: the first pins come in as one wave. */
  popIn?: boolean;
  /** Start with the wave held back (see PinEngine.hold). */
  hold?: boolean;
  /** The still card: no pin is a button; a tap on a gathered pin is a tap on the card. */
  quiet?: boolean;
  /** Room each kind needs on screen before two gather, [wide, tall] in pixels. `pFar`: players below zoom 12, where names drop the "· 2h". */
  box?: { p?: [number, number]; pFar?: [number, number]; c?: [number, number]; h?: [number, number] };
  /** Room kept clear round the edge when zooming to fit a gathered pin (the bars and the tray). */
  pad?: { top: number; bottom: number; left: number; right: number };
  /** A gathered pin was tapped (a little haptic on the phone). */
  gathered?: () => void;
  /** The first pins have come in (so a map made again for this visit never replays it). */
  cascaded?: () => void;
}

/** Makes a PinEngine: `factory(map, maplibregl, options)`. */
export type PinEngineFactory = (map: unknown, maplibre: unknown, options: PinEngineOptions) => PinEngine;

/** The room each kind needs on the full map, where players' names show: a name is about 100 wide, a disc and its name about 70 tall. */
/** Courts: a crowd of them says "11 courts", about 80 wide, so they gather a little sooner than their 30-wide squares alone would. */
export const FULL_MAP_BOX: NonNullable<PinEngineOptions['box']> = { p: [100, 70], pFar: [74, 70], c: [56, 30], h: [92, 28] };
/** On the still card: faces only. */
export const CARD_BOX: NonNullable<PinEngineOptions['box']> = { p: [48, 48], pFar: [48, 48], c: [22, 22], h: [92, 28] };

export const PIN_ENGINE_JS = `(function(){
var ZMIN=2,ZMAX=17,OPEN=${JSON.stringify(OPEN_CLASS)},JUST=${JSON.stringify(JUST_OPEN_CLASS)},POP_MS=${POP_MS};
// Where a pin takes the badge and the second disc (markers.ts); spelt in two halves so the page's HTML never reads them as a comment.
var BADGE='<'+'!--cs-badge-->',STACK='<'+'!--cs-stack-->';
var GLIDES=40,FOLD_BELOW=12,CHIP_W=44,FAN_W=104,FAN_H=80,FAN_COLS=3,WAVE_MS=595,POP_IN_MS=340;
function wx(lng){return (lng+180)/360*512}
function wy(lat){var s=Math.sin(lat*Math.PI/180);s=Math.min(Math.max(s,-0.9999),0.9999);return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*512}
function has(c,n){return (' '+(c||'')+' ').indexOf(' '+n+' ')>=0}
function ext(a,b){var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=b[k];return o}
function now(){return (window.performance&&performance.now)?performance.now():Date.now()}
return function(map,ml,o){
  o=o||{};
  var B=o.box||{};
  function box(k,z){var b=k==='p'?(z<FOLD_BELOW&&B.pFar?B.pFar:B.p):B[k];return b||(k==='p'?[50,50]:k==='c'?[28,28]:[92,28])}
  var items={},tpl={badge:'',stack:'',court:'{n}',chip:'{n}'},tree={},lvl=-1,fan=null,flying=false,ready=false,held=!!o.hold,ms={},owner={},raf=0,cullT=0,dead=false;
  // The first wave: when it started (0: not yet), and whether it is over.
  var wave0=0,waveDone=!o.popIn,waveMax=1;
  function still(){try{return document.body.classList.contains('cs-still')}catch(e){return false}}
  // Levels come every half step of zoom (lvl counts half steps: 23 is zoom 11.5), so a pin is never gathered for more than a little way past the point it needs.
  function levelNow(){return Math.max(ZMIN*2,Math.min(ZMAX*2,Math.floor(map.getZoom()*2+1e-6)))}
  function zoomOf(l){return l/2}
  function fixed(it){return !!(it&&(it.fix||it.sel))}
  // Each kind's pins gathered at every zoom level: level z gathers the groups of level z+1 whose room overlaps a group's lead.
  // You and whoever is picked lead their own group and are never gathered into another; a picked court or hit stays out altogether.
  function build(){
    tree={};
    ['p','c','h'].forEach(function(k){
      var list=[];for(var id in items){var it=items[id];if(it.k===k&&!it.solo&&!(it.sel&&k!=='p'))list.push(it)}
      if(list.length<2){tree[k]=null;return}
      list.sort(function(a,b){return ((fixed(b)?1:0)-(fixed(a)?1:0))||((a.r||0)-(b.r||0))||(a.id<b.id?-1:1)});
      var groups=list.map(function(it){return {lead:it.id,fx:fixed(it),m:[it.id],x:wx(it.lng),y:wy(it.lat)}});
      var per={};
      // How wide a group's pin is at a zoom: its leader's (a player's own width with or without the "· 2h"; anything else, the kind's box).
      function wide(g,z,dflt){var it=items[g.lead];if(k!=='p'||!it)return dflt;var w=z<FOLD_BELOW?(it.fws||it.fw):it.fw;return w?Math.max(w,it.ds||0):dflt}
      for(var li=ZMAX*2;li>=ZMIN*2;li--){
        var z=zoomOf(li),bx=box(k,z),s=Math.pow(2,z),Hh=bx[1]/s,widest=bx[0],cell={},next=[],used=[];
        for(var i=0;i<groups.length;i++){groups[i].w=wide(groups[i],z,bx[0]);if(groups[i].w+(groups[i].fx?CHIP_W*2:0)>widest)widest=groups[i].w+(groups[i].fx?CHIP_W*2:0)}
        var r=Math.max(widest/s,Hh);
        for(i=0;i<groups.length;i++){var key=Math.floor(groups[i].x/r)+':'+Math.floor(groups[i].y/r);(cell[key]=cell[key]||[]).push(i)}
        for(i=0;i<groups.length;i++){
          if(used[i])continue;used[i]=1;
          var g=groups[i],c={lead:g.lead,fx:g.fx,m:g.m.slice(),x:g.x,y:g.y},cx=Math.floor(g.x/r),cy=Math.floor(g.y/r);
          for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){var b=cell[(cx+dx)+':'+(cy+dy)];if(!b)continue;
            // Two pins crowd when their room overlaps: side by side, half of each one's width; one above the other, a disc and its name.
            // You (or whoever is picked) reach further to the right, where the "+N" beside you goes.
            for(var j=0;j<b.length;j++){var q=b[j];if(used[q]||groups[q].fx)continue;var h=groups[q],ddx=h.x-g.x,reach=(g.w+h.w)/2+(g.fx&&ddx>0?CHIP_W:0);if(Math.abs(ddx)<reach/s&&Math.abs(h.y-g.y)<Hh){used[q]=1;c.m=c.m.concat(h.m)}}}
          next.push(c);
        }
        per[li]=next;groups=next;
      }
      tree[k]=per;
    });
  }
  // Where something sits at this level, in the level's own pixels (its widest-apart point, so room worked out here holds all through the level).
  function lp(lat,lng){var s=Math.pow(2,zoomOf(lvl));return {x:wx(lng)*s,y:wy(lat)*s}}
  // What shows at this level: every pin on its own, gathered, or fanned round its spot; then room made for players.
  function desired(){
    var out={},own={},inFan={},zl=zoomOf(lvl);
    // Too far out for it (its mz): left out at this level, so it fades away and nothing is made for it.
    function off(id){var it=items[id];return !!it&&it.mz!=null&&zl<it.mz}
    if(fan){var live=fan.m.filter(function(id){return !!items[id]&&!off(id)});
      var n=live.length,cols=Math.min(FAN_COLS,n),lead=fan.lead&&items[fan.lead],top=lead?((lead.ds||48)/2+24+10+24):46;
      // In rows just under the spot (under the picked player, if there is one), a name's width apart: the court's badge stays in sight on the spot.
      live.forEach(function(id,i){var row=Math.floor(i/cols),inRow=Math.min(cols,n-row*cols),col=i-row*cols;inFan[id]=1;
        out[id]=ext(items[id],{lat:fan.lat,lng:fan.lng,fx:Math.round((col-(inRow-1)/2)*FAN_W),fy:top+row*FAN_H,z:(items[id].z||0)+1});own[id]=id})}
    for(var id in items){var it=items[id];if(inFan[id]||off(id))continue;if(!it.k||!tree[it.k]||it.solo||(it.sel&&it.k!=='p')){out[id]=it;own[id]=id}}
    ['p','c','h'].forEach(function(k){var per=tree[k];if(!per)return;per[lvl].forEach(function(g){
      var m=g.m.filter(function(id){return !inFan[id]&&!off(id)});if(!m.length)return;
      if(m.length===1){out[m[0]]=items[m[0]];own[m[0]]=m[0];return}
      var lead=items[g.lead],cid='k:'+k+':'+g.lead,rest,html;
      if(g.fx){
        // You (or whoever is picked) stay as you are; the others gather into a small "+N" beside you.
        out[g.lead]=lead;own[g.lead]=g.lead;rest=m.filter(function(id){return id!==g.lead});if(!rest.length)return;
        out[cid]={id:cid,lat:lead.lat,lng:lead.lng,html:tpl.chip.replace('{n}','+'+rest.length),anchor:'center',fx:Math.round((lead.ds||48)/2+20),z:(lead.z||0)+1,g:'p',k:'chip',
          role:o.quiet?undefined:'button',label:o.quiet?undefined:rest.length+(rest.length===1?' more player':' more players')+' here. Show them',cl:{k:k,m:rest,lead:g.lead}};
        rest.forEach(function(id){own[id]=cid});return;
      }
      if(!lead||inFan[g.lead]||off(g.lead))lead=items[m[0]];
      if(k==='p'||k==='h')html=lead.html.replace(BADGE,tpl.badge.replace('{n}','+'+(m.length-1))).replace(STACK,k==='p'?tpl.stack:'');
      else{var total=m.reduce(function(t,id){return t+((items[id]&&items[id].n)||1)},0);html=tpl.court.replace('{n}',String(total))}
      // A court crowd's "11 courts" is wide (cw: half its width), so room for players' faces and names counts all of it.
      out[cid]={id:cid,lat:lead.lat,lng:lead.lng,html:html,anchor:lead.anchor,offsetY:lead.offsetY,z:lead.z,cls:k==='p'?lead.cls:'',g:lead.g,k:k,ds:lead.ds,cw:k==='c'?Math.round((42+6.8*(String(total).length+7))/2):undefined,
        role:o.quiet?undefined:'button',label:o.quiet?undefined:(k==='p'?(lead.label||'A player')+' and '+(m.length-1)+' more here':k==='h'?m.length+' open hits here':m.length+' places to play here')+'. Show them',cl:{k:k,m:m}};
      m.forEach(function(id){own[id]=cid});
    })});
    room(out);
    return {out:out,own:own};
  }
  // Room for players: what stands on a player's spot lifts above their disc; a court their name would cover moves aside; zoomed out, a flag on anything folds into it.
  function room(out){
    var ps=[],id,it,short=zoomOf(lvl)<FOLD_BELOW;
    // A player's half-width: half their name's width at this zoom (never less than the disc).
    function hw(it){return Math.max(((short?(it.fws||it.fw):it.fw)||100)/2,(it.ds||48)/2)}
    for(id in out){it=out[id];if(it.k==='p'||it.fix){var q=lp(it.lat,it.lng);ps.push({x:q.x+(it.fx||0),y:q.y+(it.fy||0),r:(it.ds||48)/2,w:hw(it)})}
      // The "+N" beside you is in the way too (a small round thing, no name under it).
      else if(it.k==='chip'){var qc=lp(it.lat,it.lng);ps.push({x:qc.x+(it.fx||0),y:qc.y,r:15,w:20,chip:true})}}
    // Courts: where each sits now, so one moved aside never lands on another.
    var cs={};for(id in out){it=out[id];if(it.k==='c'){var q1=lp(it.lat,it.lng);cs[id]={x:q1.x,y:q1.y}}}
    function clear(id,x,y){for(var o2 in cs){if(o2===id)continue;if(Math.abs(cs[o2].x-x)<30&&Math.abs(cs[o2].y-y)<30)return false}return true}
    for(id in out){it=out[id];if(it.k!=='c'||it.sel)continue;
      // A crowd's wide "11 courts" (cw) counts its whole width; on a player's very spot it moves aside rather than up.
      var c=lp(it.lat,it.lng),lift=0,shift=0,gone=false,cw=it.cw||14;
      ps.forEach(function(p){var dx=c.x-p.x,dy=c.y-p.y;
        if(Math.abs(dx)<8&&Math.abs(dy)<8&&cw<=14){lift=Math.min(lift,-(p.r+13))}
        else if(Math.abs(dx)<p.w+cw-2&&dy>-p.r-12&&dy<p.r+(p.chip?12:36)){var need=(p.w+cw)-Math.abs(dx);if(need>46+cw)gone=true;else shift=(dx>=0?1:-1)*Math.max(Math.abs(shift),need)}});
      if(gone&&zoomOf(lvl)<15&&!it.solo){delete out[id];delete cs[id];continue}
      // Moved aside only into clear room; with none, zoomed out it folds away until there is room (closer in it stays, under the name).
      if(shift&&!clear(id,c.x+shift,c.y+lift)){shift=0;if(zoomOf(lvl)<14&&!it.solo){delete out[id];delete cs[id];continue}}
      if(lift||shift){out[id]=ext(it,{fx:shift,offsetY:(it.offsetY||0)+lift});cs[id]={x:c.x+shift,y:c.y+lift}}}
    // A flag (about 92 wide, 26 tall, hung above its spot) overlapping a court or a player (their disc and name): zoomed out it folds in as a dot; closer, it lifts clear above the highest of them.
    var hosts=[];for(id in out){it=out[id];if(it.k==='p'||it.fix||it.k==='c'){var q2=lp(it.lat,it.lng),isC=it.k==='c',r2=isC?14:(it.ds||48)/2;
      hosts.push({id:id,x:q2.x+(it.fx||0),y:q2.y+(it.fy||0)+(isC?(it.offsetY||0):0),r:r2,w:isC?r2:hw(it),b:isC?r2:r2+26})}}
    for(id in out){it=out[id];if(it.k!=='h'||it.sel)continue;
      var f=lp(it.lat,it.lng),base=it.offsetY||0,off=base,host=null;
      // Lifted clear of what it lands on, at both ends of this zoom step (a half step on, things are half as far again); lifted onto something else, clear of that too.
      for(var pass=0;pass<3;pass++){var moved=false;
        hosts.forEach(function(h){var dx=f.x-h.x,fb=f.y+off,ft=fb-26;
          if(Math.abs(dx)<46+h.w&&fb>h.y-h.r&&ft<h.y+h.b){host=host||h;var dy=h.y-f.y,want=Math.min(dy-h.r-4,dy*1.42-h.r-4);if(want<off){off=want;moved=true}}});
        if(!moved)break}
      if(host&&zoomOf(lvl)<FOLD_BELOW){var hi=out[host.id];out[host.id]=ext(hi,{cls:((hi.cls||'')+' cs-hit').trim()});delete out[id];continue}
      if(host){if(off<-100){delete out[id];continue}out[id]=ext(it,{offsetY:off})}}
  }
  // Where a pin's spot is on the screen, with its own offset.
  function at(k){var p=map.project(k.m.getLngLat()),f=k.m.getOffset();return {x:p.x+f.x,y:p.y+f.y}}
  function child(k){return k.el.firstElementChild}
  function enter(k,how,delay){var c=child(k);if(!c)return;c.style.animationDelay=(delay||0)+'ms';c.classList.add(how);clearTimeout(k.tidy);k.tidy=setTimeout(function(){c.classList.remove(how);c.style.animationDelay=''},(delay||0)+460)}
  function cls(k,c,fresh){if(c===k.cls)return;var was=has(k.cls,OPEN),on=has(c,OPEN);
    (k.cls||'').split(' ').forEach(function(n){if(n)k.el.classList.remove(n)});(c||'').split(' ').forEach(function(n){if(n)k.el.classList.add(n)});k.cls=c;
    if(on&&!was&&!fresh){k.el.classList.add(JUST);clearTimeout(k.pop);k.pop=setTimeout(function(){k.el.classList.remove(JUST)},POP_MS)}else if(!on)k.el.classList.remove(JUST)}
  // A new pin wears its classes before it is on the map, so a pin already open is drawn open: no ring drawing in, no pop.
  function make(it,off){var el=document.createElement('div');el.innerHTML=it.html;var id=it.id;
    (it.cls||'').split(' ').forEach(function(n){if(n)el.classList.add(n)});
    el.addEventListener('click',function(e){e.stopPropagation();var k=ms[id];if(!k||k.leaving)return;
      if(k.it.cl){if(o.quiet)o.tap(k.it.cl.lead||k.it.cl.m[0]);else expand(id)}else o.tap(id)});
    var k={el:el,html:it.html,a:it.anchor||'center',cls:it.cls||'',it:it};
    k.m=new ml.Marker({element:el,anchor:k.a,offset:off}).setLngLat([it.lng,it.lat]).addTo(map);return k}
  function drop(id){var k=ms[id];if(!k)return;clearTimeout(k.leaving);clearTimeout(k.tidy);k.m.remove();delete ms[id]}
  function render(why){
    if(!ready||dead||held)return;
    var d=desired(),was=owner,st=still(),spot={},glides=[],fresh=[];
    owner=d.own;
    // The view, and a margin of half of it all round: only pins in there are made.
    var ct=map.getContainer(),W=ct.clientWidth||400,H=ct.clientHeight||700,mid={x:W/2,y:H/2};
    function near(p){return p.x>-W*0.5&&p.x<W*1.5&&p.y>-H*0.5&&p.y<H*1.5}
    function onScreen(p){return p.x>-60&&p.x<W+60&&p.y>-60&&p.y<H+60}
    // Where every pin showing now sits, before anything moves.
    for(var id in ms){if(!ms[id].leaving)spot[id]=at(ms[id])}
    for(id in d.out){
      var it=d.out[id],k=ms[id],a=it.anchor||'center',off=[it.fx||0,(it.offsetY||0)+(it.fy||0)];
      var p0=map.project([it.lng,it.lat]),pos={x:p0.x+off[0],y:p0.y+off[1]};
      if(!near(pos)){if(k)drop(id);continue}
      if(k&&k.a!==a){drop(id);k=null}
      if(k&&k.leaving){clearTimeout(k.leaving);k.leaving=0;var c0=child(k);if(c0){c0.classList.remove('cs-out','cs-move');c0.style.translate=''}k.el.style.pointerEvents=''}
      var made=!k;
      if(!k){
        k=ms[id]=make(it,off);
        // Split off from a gathered pin (or fanned out of one): it glides out from where that pin was. A gathered pin goes by its lead.
        var ref=id.indexOf('k:')===0?id.split(':').slice(2).join(':'):id,from=why&&was[ref]&&was[ref]!==id&&spot[was[ref]]?spot[was[ref]]:null;
        if(from&&!st&&onScreen(pos))glides.push({k:k,made:1,dx:from.x-pos.x,dy:from.y-pos.y,d:Math.abs(pos.x-mid.x)+Math.abs(pos.y-mid.y)});
        else fresh.push({k:k,pos:pos,gathered:id.indexOf('k:')===0});
      }else{
        var before=spot[id];
        if(k.html!==it.html){k.el.innerHTML=it.html;k.html=it.html}
        k.m.setLngLat([it.lng,it.lat]);k.m.setOffset(off);
        if(why&&before&&!st&&onScreen(pos)&&Math.abs(pos.x-before.x)+Math.abs(pos.y-before.y)>2)glides.push({k:k,dx:before.x-pos.x,dy:before.y-pos.y,d:Math.abs(pos.x-mid.x)+Math.abs(pos.y-mid.y)});
      }
      k.it=it;
      k.el.style.zIndex=it.z!=null?String(it.z):'';
      if(it.role)k.el.setAttribute('role',it.role);else k.el.removeAttribute('role');
      if(it.label)k.el.setAttribute('aria-label',it.label);else k.el.removeAttribute('aria-label');
      cls(k,it.cls||'',made);
    }
    // Gone from this level (gathered into another pin, or folded away): it glides into its new pin as it fades; off screen, it just goes.
    var leaving=[];
    for(id in ms){if(d.out[id]||ms[id].leaving)continue;var me0=spot[id]||at(ms[id]);
      var tgt=d.own[id.indexOf('k:')===0?id.split(':').slice(2).join(':'):id],into=why&&tgt&&tgt!==id&&d.out[tgt]&&ms[tgt]?at(ms[tgt]):null;
      if(!onScreen(me0)){drop(id);continue}
      leaving.push({id:id,k:ms[id],from:me0,into:into,d:Math.abs(me0.x-mid.x)+Math.abs(me0.y-mid.y)})}
    // At most GLIDES move at once, nearest the middle; the rest just fade. One layout pass for all of them.
    glides.sort(function(a,b){return a.d-b.d});
    glides.slice(GLIDES).forEach(function(g){if(g.made)fresh.push({k:g.k,pos:null,gathered:false})});glides=glides.slice(0,GLIDES);
    leaving.sort(function(a,b){return a.d-b.d});
    leaving.forEach(function(l,i){if(i>=GLIDES||st)l.into=null});
    glides.forEach(function(g){var c=child(g.k);if(!c)return;clearTimeout(g.k.tidy);c.classList.remove('cs-move');c.style.translate=g.dx+'px '+g.dy+'px'});
    leaving.forEach(function(l){var c=child(l.k);clearTimeout(l.k.tidy);l.k.el.style.pointerEvents='none';if(c&&l.into){c.classList.add('cs-move');c.style.translate=(l.into.x-l.from.x)+'px '+(l.into.y-l.from.y)+'px'}if(c)c.classList.add('cs-out');
      var k=l.k,id=l.id;k.leaving=setTimeout(function(){k.m.remove();if(ms[id]===k)delete ms[id]},c?260:0)});
    if(glides.length)void ct.offsetWidth;
    glides.forEach(function(g){var c=child(g.k);if(!c)return;c.classList.add('cs-move','cs-in');c.style.translate='0px 0px';
      g.k.tidy=setTimeout(function(){c.classList.remove('cs-move','cs-in');c.style.translate=''},460)});
    // New pins: the first ones after the full map opens come in as one wave, nearest the middle first; later ones fade in.
    var t=now();
    if(!waveDone&&!wave0&&fresh.length){
      wave0=t;if(o.cascaded)o.cascaded();
      var list=fresh.filter(function(f){return f.pos}).map(function(f){f.d=Math.hypot(f.pos.x-mid.x,f.pos.y-mid.y);return f}).sort(function(a,b){return a.d-b.d});
      waveMax=Math.max(1,list.length?list[list.length-1].d:1);
      var step=Math.min(30,(WAVE_MS-POP_IN_MS)/Math.max(1,list.length-1));
      list.forEach(function(f,i){f.k.waved=1;enter(f.k,'cs-pop',Math.round(i*step))});
      fresh=fresh.filter(function(f){return !f.k.waved});
    }else if(!waveDone&&wave0&&t-wave0<WAVE_MS){
      // Arriving while the wave is still going (courts a moment after the players): they join it, timed by how far out they are.
      fresh.forEach(function(f){if(!f.pos)return;var due=wave0+(WAVE_MS-POP_IN_MS)*Math.min(1,Math.hypot(f.pos.x-mid.x,f.pos.y-mid.y)/waveMax);f.k.waved=1;enter(f.k,'cs-pop',Math.max(0,Math.round(due-t)))});
      fresh=fresh.filter(function(f){return !f.k.waved});
    }
    if(wave0&&t-wave0>=WAVE_MS)waveDone=true;
    fresh.forEach(function(f){enter(f.k,why&&f.gathered&&!st?'cs-pop':'cs-in',why&&f.gathered?90:0)});
  }
  // A gathered pin, tapped: zoom in until it splits, or fan out people standing on the very same spot.
  function expand(cid){
    var k=ms[cid];if(!k||!k.it.cl)return;var cl=k.it.cl,per=tree[cl.k];
    if(o.gathered)o.gathered();
    // Where it first splits; for the "+N" beside you, also where the last of them has left you.
    var split=null,gone=null,first=cl.m[0];
    if(per)for(var li=lvl+1;li<=ZMAX*2;li++){var g=null;per[li].forEach(function(x){if(x.m.indexOf(first)>=0)g=x});
      if(split==null&&(!g||cl.m.some(function(id){return g.m.indexOf(id)<0})))split=zoomOf(li);
      if(cl.lead){var gl=null;per[li].forEach(function(x){if(x.m.indexOf(cl.lead)>=0)gl=x});if(gl&&!cl.m.some(function(id){return gl.m.indexOf(id)>=0})){gone=zoomOf(li);break}}
      else if(split!=null)break}
    var b=new ml.LngLatBounds();cl.m.concat(cl.lead?[cl.lead]:[]).forEach(function(id){var it=items[id];if(it)b.extend([it.lng,it.lat])});
    var pad=o.pad||{top:120,bottom:220,left:60,right:60};
    if(split!=null){
      // Close enough that it splits; closer still if all of them fit, but never more than a level past that.
      var cam=null;try{cam=map.cameraForBounds(b,{padding:pad})}catch(e){}
      // The "+N" beside you: in until they have all left you, or a step past where they all fit (whichever comes first), never short of the first split.
      var need=split+0.02,fit=cam&&cam.zoom!=null?cam.zoom:need,zoom=Math.min(ZMAX+0.4,cl.lead?Math.max(need,Math.min(gone!=null?gone+0.02:split+1,fit+1)):fit>=need?Math.min(fit,split+1):need);
      map.flyTo({center:cam&&cam.center?cam.center:b.getCenter(),zoom:zoom,duration:still()?0:650,essential:true});
      return;
    }
    var it=items[cl.lead||cl.m[0]]||items[cl.m[0]];
    // Fanned once the map is there: the level is taken now, so a zoom frame still to come does not fold the fan straight back.
    var go=function(){flying=false;if(dead)return;if(raf){cancelAnimationFrame(raf);raf=0}lvl=levelNow();fan={k:cl.k,m:cl.m.slice(),lead:cl.lead,lat:it.lat,lng:it.lng,lvl:lvl};render('fan')};
    if(map.getZoom()<14.6){flying=true;map.once('moveend',go);map.flyTo({center:[it.lng,it.lat],zoom:15,duration:still()?0:650,essential:true})}
    else go();
  }
  // A fan stays while you zoom further in (they still stand on one spot); zooming out folds it back.
  function onZoom(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;var L=levelNow();if(L===lvl)return;lvl=L;if(fan&&!flying&&L<fan.lvl)fan=null;render('level')})}
  function onClick(){if(fan){fan=null;render('fan')}}
  // Pins near the edge of the view are made as the map comes to rest (and now and then while it moves).
  function onMove(){if(cullT)return;cullT=setTimeout(function(){cullT=0;render(null)},300)}
  function onEnd(){if(cullT){clearTimeout(cullT);cullT=0}render(null)}
  map.on('zoom',onZoom);map.on('click',onClick);map.on('move',onMove);map.on('moveend',onEnd);
  // The first pins wait for the map's first full drawing (and a frame more), so the wave is seen rather than lost under the tiles coming in.
  function start(){if(ready||dead)return;ready=true;lvl=levelNow();render(null)}
  function soon(){requestAnimationFrame(function(){requestAnimationFrame(start)})}
  if(map.loaded&&map.loaded())soon();else{map.once('idle',soon);setTimeout(start,2500)}
  return {
    set:function(p){var list=(p&&p.items)||[];if(p&&p.tpl)tpl=p.tpl;items={};list.forEach(function(it){items[it.id]=it});build();
      if(fan){var n=0;fan.m.forEach(function(id){if(items[id])n++});if(n<(fan.lead?1:2))fan=null}
      if(ready&&lvl<0)lvl=levelNow();render(null)},
    hold:function(on){var was=held;held=!!on;if(was&&!held)render(null)},
    destroy:function(){dead=true;if(raf)cancelAnimationFrame(raf);if(cullT)clearTimeout(cullT);map.off('zoom',onZoom);map.off('click',onClick);map.off('move',onMove);map.off('moveend',onEnd);for(var id in ms){clearTimeout(ms[id].leaving);ms[id].m.remove()}ms={}}
  };
};
})()`;
