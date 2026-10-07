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
 *  - "+N": pins of a kind whose room on screen overlaps gather into one: the
 *    leading player's own pin with a "+4" badge and a second disc peeking
 *    behind it; courts into a court-coloured disc with how many places; hit
 *    flags into the soonest flag with a badge. Worked out for every half
 *    step of zoom at once (from 2 to 20), at the step's closest-together
 *    point, each step gathering the one above it: zooming in splits a pin
 *    apart the moment there is room; the ones that leave glide out from
 *    where the gathered pin was, or glide back into it.
 *  - Room for players, on the full map: their faces (Oct 7, owner: a group
 *    of three stayed one pin until you were zoomed right in, because each
 *    one's room was its name, about 100 wide). Two players gather only
 *    once their faces would mostly cover each other (centres nearer than
 *    60% of a face across), so faces may overlap a little first: a group
 *    of three about 50 m apart splits at zoom 15 (it was 17, then 15.5).
 *    Their names make way instead (names()).
 *  - Face-stacks (Oct 7, owner: "you keep thinking it will split but you
 *    keep scrolling in"): for the zoom step just before a group of players
 *    splits (two half steps), it shows as the leader's pin with the next
 *    two faces peeking out behind it, each the way that player really is
 *    (above the name), and "+N" for any more; the half step after, they
 *    fan further apart in place; then they split, each face springing out
 *    from where it peeked (a little past its spot and back). So every
 *    pinch moves something: "+N", a face-stack, a wider one, apart.
 *  - Names make way, as on Apple's maps: a player's name shows only where it
 *    is clear of every other face and of the names already shown; the
 *    picked player, then the leading players place theirs first. A face
 *    never moves for a name, and a hidden name comes back as you zoom in.
 *    Yours always shows.
 *  - Rings: only players at one court (checked in there, or placed exactly
 *    and standing on it: CanvasMarker.at) fan out in a small ring round
 *    that court's pin from zoom 15 in (Snap Map style), the leader at the
 *    top; the court stays put in the middle and lets its words go (the
 *    ring says who is there). No lines (Oct 7,
 *    owner): a ring round a court already says they are at it. Players
 *    merely near each other never ring and are never drawn tied to a spot:
 *    they split apart as you zoom in. Only where the ring has room: one
 *    whose faces would land on another pin or ring stays "+N" until you
 *    zoom in, and a crowd too big for a phone (over a dozen) stays "+N" (a
 *    tap lists them in rows). Only how they are drawn: every pin in a ring
 *    still stands at the court (within about 17 m of their own spot), a
 *    ring's width out at most, and zooming out folds it back into "+N".
 *  - You, and whoever is picked, never gather into anyone: players whose
 *    faces crowd yours (or would sit on your name) gather into a small "+N"
 *    beside your pin instead (and anyone that "+N" would cover); standing
 *    on a court, players at it ring round you from zoom 15 in, over the
 *    top, clear of your name however long. The picked player's pin is the
 *    same but for the name (their card says who they are), so picking a
 *    player never pulls the faces round them into a "+N" unless they crowd
 *    their face.
 *  - Room for players: a court someone is standing on lifts above their
 *    disc, and its hit flag above that; a court a player's name would cover
 *    moves aside (or folds away until you zoom in). Zoomed out (below 12),
 *    a flag on top of a court or a player folds into it as a small dot.
 *  - Tapping a gathered pin zooms in just far enough that it is one pin no
 *    longer (it splits, or fans out in its ring), and half a step more if
 *    they all still fit on screen there. Ones that never part by zooming
 *    (courts or hit flags on the very same spot, a crowd too big to ring)
 *    fan out in rows just under the spot instead (room for each).
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
  /** Half its width, where wider than a court's square (a court crowd's number), so room for players counts all of it. */
  cw?: number;
  /** A player's disc, across (for room and for lifting what stands under it). */
  ds?: number;
  /** The court a player is at (checked in there, or placed exactly and standing on it, as you can be): its pin's id. Only players at one court ring round it. */
  at?: string;
  /** A player's face alone, small (markers.ts pileFaceHtml): how they peek out of a face-stack just before it splits. */
  fh?: string;
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
  /** In the middle of a ring of players at a court, only when that court's own pin is not on the map: a small court mark. */
  spot: string;
  /** A face peeking out of a face-stack (put where it says <!--cs-stack-->): "{x}", "{y}" the disc's middle, "{sx}", "{sy}" which way it fans out (a unit step), "{face}" the face. */
  pile: string;
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

/** The room each kind needs on the full map. Players on the full map gather by their faces (and your name), not by this box (pinEngine's FACE_IN); it still sizes the engine's search grid, and the still card keeps its own (CARD_BOX). */
/** Courts gather from about twice a crowd's width apart, so a whole city shows a handful of numbers, not a dozen (Oct 6, owner: "Numbers + fewer"); closer in they split. */
export const FULL_MAP_BOX: NonNullable<PinEngineOptions['box']> = { p: [100, 70], pFar: [74, 70], c: [120, 64], h: [92, 28] };
/** On the still card: faces only. */
export const CARD_BOX: NonNullable<PinEngineOptions['box']> = { p: [48, 48], pFar: [48, 48], c: [22, 22], h: [92, 28] };

export const PIN_ENGINE_JS = `(function(){
var ZMIN=2,ZMAX=20,OPEN=${JSON.stringify(OPEN_CLASS)},JUST=${JSON.stringify(JUST_OPEN_CLASS)},POP_MS=${POP_MS};
// Where a pin takes the badge and the second disc (markers.ts); spelt in two halves so the page's HTML never reads them as a comment.
var BADGE='<'+'!--cs-badge-->',STACK='<'+'!--cs-stack-->';
var GLIDES=40,FOLD_BELOW=12,CHIP_W=44,FAN_W=104,FAN_H=80,FAN_COLS=3,WAVE_MS=595,POP_IN_MS=340;
// Faces on the full map: two players gather only once their white discs (about 40 across) are nearer than FACE_MERGE of one across
// (24 px), so faces overlap a little before they gather and split about half a zoom step sooner (Oct 7, owner: "you keep thinking
// it will split but you keep scrolling in"). FACE_IN: how far a ring's room may overlap another pin's, and "on one spot" for a ring.
var FACE_MERGE=0.6,FACE_IN=14;
// A face-stack: the zoom steps just before a group splits (PILE_STEPS half steps), it shows two or three of its faces fanned out
// behind the leader's, a little further apart each step (PILE_PV, px from the leader's middle), so every pinch shows something move.
// Each peeks out the way it really stands, kept above level (PILE_UP: at least this far, in degrees, so never on the name under it),
// and two at least PILE_GAP degrees apart.
var PILE_STEPS=2,PILE_PV=[22,17],PILE_UP=10,PILE_GAP=70;
// Rings: from zoom 15 in (RING_FROM), players on one spot (every one within a face of the leader at zoom 17, RING_SURE: about 17 m) fan round it, RING_R out (more for a big ring: each face and a gap, RING_GAP, round it), and only where the ring has room (no other pin under it) and fits a phone (RING_MAX out at most);
// round you, clear of your disc by RING_FIX, and never on your name (at most RING_DROP below level each side, less for a long name).
var RING_FROM=15,RING_SURE=17,RING_R=62,RING_GAP=8,RING_FIX=22,RING_DROP=40,RING_MAX=120;
function wx(lng){return (lng+180)/360*512}
function wy(lat){var s=Math.sin(lat*Math.PI/180);s=Math.min(Math.max(s,-0.9999),0.9999);return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*512}
function has(c,n){return (' '+(c||'')+' ').indexOf(' '+n+' ')>=0}
function ext(a,b){var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=b[k];return o}
function now(){return (window.performance&&performance.now)?performance.now():Date.now()}
return function(map,ml,o){
  o=o||{};
  var B=o.box||{};
  function box(k,z){var b=k==='p'?(z<FOLD_BELOW&&B.pFar?B.pFar:B.p):B[k];return b||(k==='p'?[50,50]:k==='c'?[28,28]:[92,28])}
  var items={},tpl={badge:'',stack:'',court:'{n}',chip:'{n}',spot:'',pile:''},tree={},lvl=-1,rings=[],fan=null,flying=false,ready=false,held=!!o.hold,ms={},owner={},raf=0,cullT=0,dead=false;
  // The full map (not the still card): room for faces, names that make way, rings.
  var FULL=!o.quiet;
  // The first wave: when it started (0: not yet), and whether it is over.
  var wave0=0,waveDone=!o.popIn,waveMax=1;
  function still(){try{return document.body.classList.contains('cs-still')}catch(e){return false}}
  // Levels come every half step of zoom (lvl counts half steps: 23 is zoom 11.5), so a pin is never gathered for more than a little way past the point it needs.
  function levelNow(){return Math.max(ZMIN*2,Math.min(ZMAX*2,Math.floor(map.getZoom()*2+1e-6)))}
  function zoomOf(l){return l/2}
  function fixed(it){return !!(it&&(it.fix||it.sel))}
  // Half the width of a player's name at a zoom (it drops the "· 2h" below FOLD_BELOW).
  function nameW(it,z){return ((z<FOLD_BELOW?(it.fws||it.fw):it.fw)||0)/2}
  // A ring of these players (on) round the leader's spot, in screen pixels: how far out (R), where the first face sits (a0) and how far
  // round the next (step). Null when it would not fit a phone. mid: the leader (you, or whoever is picked) stays on the spot and the
  // others go round, over the top, never on the leader's name: each side, at most RING_DROP below level, less for a long name.
  function ringGeom(lead,on,mid,z){
    var n=on.length,d=0;if(!n||!lead)return null;on.forEach(function(id){d=Math.max(d,(items[id]&&items[id].ds)||48)});
    var R,span;
    if(!mid){span=2*Math.PI;R=Math.max(RING_R,n*(d+RING_GAP)/span)}
    else{
      var ld=lead.ds||48,w=nameW(lead,z),t=ld/2-4+5,b=t+21,fr=d/2+2;
      // How far below level a face this far out may sit and stay clear of the name (a pill hung just under the disc).
      var drop=function(Rr){for(var deg=RING_DROP;deg>0;deg-=2){var a=deg*Math.PI/180,x=Rr*Math.cos(a),y=Rr*Math.sin(a),qx=Math.min(x,w),qy=Math.max(t,Math.min(y,b));if((x-qx)*(x-qx)+(y-qy)*(y-qy)>=fr*fr)return a}return 0};
      R=ld/2+d/2+RING_FIX;span=Math.PI+2*drop(R);R=Math.max(R,n*(d+RING_GAP)/span);span=Math.PI+2*drop(R);
    }
    if(R>RING_MAX)return null;
    var step=span/n;
    // Round the full circle from the top (two, or any even number, sit level); round you, from the left over the top to the right.
    return {R:R,d:d,step:step,mid:mid,a0:mid?Math.PI-(span-Math.PI)/2+step/2:-Math.PI/2-(n%2?0:step/2)};
  }
  // Each kind's pins gathered at every zoom level: level z gathers the groups of level z+1 whose room overlaps a group's lead.
  // You and whoever is picked lead their own group and are never gathered into another; a picked court or hit stays out altogether.
  // Players' groups from zoom 15 in also say whether they ring (ring: see ringGeom).
  function build(){
    tree={};
    ['p','c','h'].forEach(function(k){
      var list=[];for(var id in items){var it=items[id];if(it.k===k&&!it.solo&&!(it.sel&&k!=='p'))list.push(it)}
      if(list.length<2){tree[k]=null;return}
      list.sort(function(a,b){return ((fixed(b)?1:0)-(fixed(a)?1:0))||((a.r||0)-(b.r||0))||(a.id<b.id?-1:1)});
      var groups=list.map(function(it){return {lead:it.id,fx:fixed(it),m:[it.id],x:wx(it.lng),y:wy(it.lat),d:it.ds||48}});
      var per={},faces=FULL&&k==='p',s17=Math.pow(2,RING_SURE);
      // How wide a group's pin is at a zoom: its leader's (a player's own width with or without the "· 2h"; anything else, the kind's box).
      function wide(g,z,dflt){var it=items[g.lead];if(k!=='p'||!it)return dflt;var w=z<FOLD_BELOW?(it.fws||it.fw):it.fw;return w?Math.max(w,it.ds||0):dflt}
      for(var li=ZMAX*2;li>=ZMIN*2;li--){
        var z=zoomOf(li),bx=box(k,z),s=Math.pow(2,z),Hh=bx[1]/s,widest=bx[0],cell={},next=[],used=[];
        for(var i=0;i<groups.length;i++){groups[i].w=wide(groups[i],z,bx[0]);if(groups[i].w+(groups[i].fx?CHIP_W*2:0)>widest)widest=groups[i].w+(groups[i].fx?CHIP_W*2:0)}
        var r=Math.max(widest/s,Hh);
        for(i=0;i<groups.length;i++){var key=Math.floor(groups[i].x/r)+':'+Math.floor(groups[i].y/r);(cell[key]=cell[key]||[]).push(i)}
        for(i=0;i<groups.length;i++){
          if(used[i])continue;used[i]=1;
          var g=groups[i],c={lead:g.lead,fx:g.fx,m:g.m.slice(),x:g.x,y:g.y,d:g.d},cx=Math.floor(g.x/r),cy=Math.floor(g.y/r);
          // You, on the full map: your name, a pill just under your disc (nw: half its width; nt to nb: its top and bottom).
          var gl=items[g.lead],mine=faces&&g.fx&&!!gl&&!!gl.fix,nw=0,nt=0,nb=0;if(mine){nw=nameW(gl,z)/s;nt=(g.d/2-4+5)/s;nb=nt+21/s}
          // pass 0: who crowds; pass 1, only once someone has (you, or whoever is picked): anyone the "+N" beside you would cover.
          for(var pass=0;pass<(faces&&g.fx?2:1);pass++){if(pass&&c.m.length<2)break;
          for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){var b=cell[(cx+dx)+':'+(cy+dy)];if(!b)continue;
            for(var j=0;j<b.length;j++){var q=b[j];if(used[q]||groups[q].fx)continue;var h=groups[q],ddx=h.x-g.x,ddy=h.y-g.y,near,hr=(h.d/2-4)/s;
              if(faces&&pass){var ox=ddx-(g.d/2+20)/s,lim=hr+20/s;near=ox*ox+ddy*ddy<lim*lim}
              // Players on the full map crowd only when their faces would mostly cover each other (their names make way: names()).
              // The picked player's the same, so picking someone never pulls the faces round them into a "+N" (their card names them).
              else if(faces){var rr=FACE_MERGE*((g.d+h.d)/2-8)/s;near=ddx*ddx+ddy*ddy<rr*rr;
                // Yours never makes way: a face that would sit on your name gathers beside you instead.
                if(!near&&mine){var qx=Math.max(-nw,Math.min(ddx,nw)),qy=Math.max(nt,Math.min(ddy,nb));near=(ddx-qx)*(ddx-qx)+(ddy-qy)*(ddy-qy)<hr*hr}}
              // Anything else crowds when its room overlaps: side by side, half of each one's width; one above the other, a disc and its name.
              // You (or whoever is picked) reach further to the right, where the "+N" beside you goes.
              else{var reach=(g.w+h.w)/2+(g.fx&&ddx>0?CHIP_W:0);near=Math.abs(ddx)<reach/s&&Math.abs(ddy)<Hh}
              if(near){used[q]=1;c.m=c.m.concat(h.m)}}}}
          next.push(c);
        }
        // Rings, from zoom 15 in: only a group whose players are all checked in at one court (you too, if you lead it: playing there,
        // standing on it), all within a face of its leader at zoom 17 (so the ring is never far from anyone's own spot), and that fits a
        // phone; then only where it has room: one whose faces would land on another pin (or ring) stays "+N". Players merely near each
        // other never ring: they split apart as you zoom in.
        if(faces&&z>=RING_FROM){
          next.forEach(function(c){c.ring=null;if(c.m.length<2)return;var at0=items[c.lead]&&items[c.lead].at;if(!at0)return;
            var one=c.m.every(function(id){var it=items[id];if(!it||it.at!==at0)return false;var lim=((c.d+(it.ds||48))/2-FACE_IN)/s17,ex=wx(it.lng)-c.x,ey=wy(it.lat)-c.y;return ex*ex+ey*ey<=lim*lim});
            if(one)c.ring=ringGeom(items[c.lead],c.m.filter(function(id){return !(c.fx&&id===c.lead)}),c.fx,z)});
          var cut=[];
          next.forEach(function(c){if(!c.ring)return;var F=(c.ring.R+c.ring.d/2)/s;
            // Another pin's room: a ring's, or a face (yours, or the picked player's, with the name under it).
            next.forEach(function(h){if(h===c)return;var Fh=(h.ring?h.ring.R+h.ring.d/2:h.d/2+(h.fx?21:0))/s,lim=F+Fh-FACE_IN/s,ex=h.x-c.x,ey=h.y-c.y;if(ex*ex+ey*ey<lim*lim){cut.push(c);if(h.ring)cut.push(h)}})});
          cut.forEach(function(c){c.ring=null});
        }
        per[li]=next;groups=next;
      }
      // When each players' group next splits (sp: the first level in where its leader's group is smaller, or rings), so the steps just
      // before it can show a face-stack. Never (null): it only parts on a tap (one spot, or a crowd too big to ring).
      if(faces)for(var lj=ZMAX*2;lj>=ZMIN*2;lj--){var up={};if(lj<ZMAX*2)per[lj+1].forEach(function(u){up[u.lead]=u});
        per[lj].forEach(function(g){var u=up[g.lead];g.sp=g.m.length<2||!u?null:(u.m.length<g.m.length||u.ring)?lj+1:u.sp})}
      tree[k]=per;
    });
  }
  // Where something sits at this level, in the level's own pixels (its widest-apart point, so room worked out here holds all through the level).
  function lp(lat,lng){var s=Math.pow(2,zoomOf(lvl));return {x:wx(lng)*s,y:wy(lat)*s}}
  // Whether a group fans out in a ring at its level (build() decides: players on one spot, with room round them; see ring()).
  function ringy(g){return !!(g&&g.ring)}
  // What shows at this level: every pin on its own, gathered, or in a ring round its spot; then room made for players.
  function desired(){
    var out={},own={},inFan={},zl=zoomOf(lvl);rings=[];
    // Too far out for it (its mz): left out at this level, so it fades away and nothing is made for it.
    function off(id){var it=items[id];return !!it&&it.mz!=null&&zl<it.mz}
    // Courts or hit flags on one spot, or a crowd of players too big to ring, tapped: in rows just under the spot, a name's width apart, the court's badge in sight on the spot.
    if(fan){var live=fan.m.filter(function(id){return !!items[id]&&!off(id)});
      var n=live.length,cols=Math.min(FAN_COLS,n),flead=fan.lead&&items[fan.lead],top=flead?((flead.ds||48)/2+24+10+24):46;
      live.forEach(function(id,i){var row=Math.floor(i/cols),inRow=Math.min(cols,n-row*cols),col=i-row*cols;inFan[id]=1;
        out[id]=ext(items[id],{lat:fan.lat,lng:fan.lng,fx:Math.round((col-(inRow-1)/2)*FAN_W),fy:top+row*FAN_H,z:(items[id].z||0)+1});own[id]=id})}
    for(var id in items){var it=items[id];if(inFan[id]||off(id))continue;if(!it.k||!tree[it.k]||it.solo||(it.sel&&it.k!=='p')){out[id]=it;own[id]=id}}
    ['p','c','h'].forEach(function(k){var per=tree[k];if(!per)return;per[lvl].forEach(function(g){
      var m=g.m.filter(function(id){return !inFan[id]&&!off(id)});if(!m.length)return;
      if(m.length===1){out[m[0]]=items[m[0]];own[m[0]]=m[0];return}
      if(ringy(g)){ring(g,m,out,own);return}
      var lead=items[g.lead],cid='k:'+k+':'+g.lead,rest,html;
      if(g.fx){
        // You (or whoever is picked) stay as you are; the others gather into a small "+N" beside you.
        out[g.lead]=lead;own[g.lead]=g.lead;rest=m.filter(function(id){return id!==g.lead});if(!rest.length)return;
        out[cid]={id:cid,lat:lead.lat,lng:lead.lng,html:tpl.chip.replace('{n}','+'+rest.length),anchor:'center',fx:Math.round((lead.ds||48)/2+20),z:(lead.z||0)+1,g:'p',k:'chip',
          role:o.quiet?undefined:'button',label:o.quiet?undefined:rest.length+(rest.length===1?' more player':' more players')+' here. Show them',cl:{k:k,m:rest,lead:g.lead}};
        rest.forEach(function(id){own[id]=cid});return;
      }
      if(!lead||inFan[g.lead]||off(g.lead))lead=items[m[0]];
      // Just before it splits (a step or two of zoom): a face-stack, two or three faces fanned out behind the leader's; else "+N".
      var pl=k==='p'&&FULL&&g.sp!=null&&g.sp-lvl<=PILE_STEPS?pile(lead,m,g.sp-lvl):null;
      if(pl)html=pl.html;
      else if(k==='p'||k==='h')html=lead.html.replace(BADGE,tpl.badge.replace('{n}','+'+(m.length-1))).replace(STACK,k==='p'?tpl.stack:'');
      else{var total=m.reduce(function(t,id){return t+((items[id]&&items[id].n)||1)},0);html=tpl.court.replace('{n}',String(total))}
      // A court crowd is wider than a court (cw: half its width), so room for players' faces and names counts all of it.
      out[cid]={id:cid,lat:lead.lat,lng:lead.lng,html:html,anchor:lead.anchor,offsetY:lead.offsetY,z:lead.z,cls:k==='p'?lead.cls:'',g:lead.g,k:k,ds:lead.ds,fw:k==='p'?lead.fw:undefined,fws:k==='p'?lead.fws:undefined,r:lead.r,cw:k==='c'?Math.round((30+7.2*String(total).length)/2):undefined,
        pv:pl?pl.pv:undefined,po:pl?pl.po:undefined,
        role:o.quiet?undefined:'button',label:o.quiet?undefined:(k==='p'?(lead.label||'A player')+' and '+(m.length-1)+' more here':k==='h'?m.length+' open hits here':m.length+' places to play here')+'. Show them',cl:{k:k,m:m}};
      m.forEach(function(id){own[id]=cid});
    })});
    // A ring whose court's pin is not on the map (not loaded, or gathered): a small court mark in its middle, so it still rings a court.
    rings.forEach(function(r){if(r.mid||(r.ct&&out[r.at]))return;var sid='r:'+r.lead;
      out[sid]={id:sid,lat:r.lat,lng:r.lng,html:tpl.spot||'',anchor:'center',z:0,cls:'cs-spot',g:'p',k:'spot'};own[sid]=sid});
    room(out);
    return {out:out,own:own};
  }
  // A face-stack (a group a step or two from splitting): the leader's own pin with the next two faces fanned out behind it, each the
  // way it really stands from the leader (kept above level, clear of the name; two kept apart), so when they split each springs on
  // the way it was already peeking; "+N" for any more. steps: half steps until it splits (1 or 2); the faces fan further apart at 1.
  // pv: how far out (the pin's --cs-pv, so the faces glide apart in place); po: where each peeks out.
  function pile(lead,m,steps){
    var others=m.filter(function(id){return id!==lead.id&&!!items[id]&&!!items[id].fh});if(!others.length)return null;
    others.sort(function(a,b){return ((items[a].r||0)-(items[b].r||0))||(a<b?-1:1)});
    var D=Math.PI/180,lo=-180+PILE_UP,hi=-PILE_UP,two=others.slice(0,2);
    // Which way each stands (screen degrees, up is negative); below level goes to the nearer side. On the leader's very spot (within
    // about 2 m: a court), one each side, as the ring there opens (the leader to the top, the next round the right, then the left).
    var ang=two.map(function(id,i){var it=items[id],ex=wx(it.lng)-wx(lead.lng),ey=wy(it.lat)-wy(lead.lat);if(Math.abs(ex)+Math.abs(ey)<3e-5)return i?lo:hi;
      var a=Math.atan2(ey,ex)/D;return a>=lo&&a<=hi?a:(a>90||a<lo)?lo:hi});
    if(ang.length===2){var i0=ang[0]<=ang[1]?0:1,i1=1-i0;if(ang[i1]-ang[i0]<PILE_GAP){var mid=(ang[0]+ang[1])/2;ang[i0]=mid-PILE_GAP/2;ang[i1]=mid+PILE_GAP/2;
      var sh=ang[i0]<lo?lo-ang[i0]:ang[i1]>hi?hi-ang[i1]:0;ang[i0]+=sh;ang[i1]+=sh}}
    var pv=PILE_PV[Math.max(0,Math.min(PILE_PV.length-1,steps-1))],c=(lead.ds||48)/2,po={},faces='',extra=m.length-1-two.length;
    two.forEach(function(id,i){var sx=Math.cos(ang[i]*D),sy=Math.sin(ang[i]*D);po[id]=[sx*pv,sy*pv];
      faces+=tpl.pile.split('{x}').join(String(c)).split('{y}').join(String(c)).split('{sx}').join(sx.toFixed(3)).split('{sy}').join(sy.toFixed(3)).split('{face}').join(items[id].fh||'')});
    return {html:lead.html.replace(BADGE,function(){return extra>0?tpl.badge.replace('{n}','+'+extra):''}).replace(STACK,function(){return faces}),pv:pv,po:po};
  }
  // Players checked in at one court: fanned round it in a small ring, the leader at the top (two, or any even number, sit level), the
  // court's own pin in the middle (a small court mark there if its pin is not on the map). No lines: a ring round a court says they
  // are at it. You (playing there, on it), or whoever is picked, stay on your own spot with the others round you, never on your name.
  // Only how they are drawn: each pin stands at the court (within about 17 m of their own spot), its face a ring's width out, and the
  // ring keeps its size on screen as you zoom.
  function ring(g,m,out,own){
    var lead=items[g.lead]||items[m[0]],mid=!!g.fx&&m.indexOf(g.lead)>=0,on=m.filter(function(id){return !(mid&&id===g.lead)});
    on.sort(function(a,b){return (a===g.lead?-1:b===g.lead?1:0)||((items[a].r||0)-(items[b].r||0))||(a<b?-1:1)});
    var G=ringGeom(lead,on,mid,zoomOf(lvl))||g.ring,R=G.R,step=G.step,a0=G.a0;
    // Round the court's own pin when it stands on their spot (within the same 17 m); round the leader's spot otherwise.
    var court=lead.at&&items[lead.at],lim=34/Math.pow(2,RING_SURE),ctr=lead;
    if(!mid&&court&&court.k==='c'){var ex=wx(court.lng)-wx(lead.lng),ey=wy(court.lat)-wy(lead.lat);if(ex*ex+ey*ey<=lim*lim)ctr=court}
    if(mid){out[g.lead]=lead;own[g.lead]=g.lead}
    on.forEach(function(id,i){var a=a0+i*step,it=items[id];
      out[id]=ext(it,{lat:ctr.lat,lng:ctr.lng,fx:Math.round(R*Math.cos(a)),fy:Math.round(R*Math.sin(a))});own[id]=id});
    var q=lp(ctr.lat,ctr.lng);
    rings.push({x:q.x,y:q.y,at:lead.at||null,ct:ctr===court,lead:g.lead,mid:mid,lat:ctr.lat,lng:ctr.lng});
  }
  // Names make way, as on Apple's maps: a player's name shows only where it is clear of every other face and of the names already
  // shown; the picked player, then the leading players (pinList's rank) place theirs first. A face never moves for a name. Yours
  // always shows, first (a face that would sit on it gathers beside you, and rings keep off it).
  function names(out){
    if(!FULL)return;
    var ps=[],shown=[],id,it,short=zoomOf(lvl)<FOLD_BELOW;
    for(id in out){it=out[id];var pl=it.k==='p'||!!it.fix;if(!pl&&it.k!=='chip')continue;var q=lp(it.lat,it.lng);
      // A face's white disc (its box less the room kept for the green ring); the "+N" beside you, a small round thing.
      ps.push({id:id,it:it,x:q.x+(it.fx||0),y:q.y+(it.fy||0),r:pl?(it.ds||48)/2-4:15,pl:pl,o:it.fix?0:it.sel?1:2});
      // The faces peeking out of a face-stack: other names keep off them too.
      if(it.po)for(var pk in it.po)ps.push({id:id+'#'+pk,it:it,x:q.x+(it.fx||0)+it.po[pk][0],y:q.y+(it.fy||0)+it.po[pk][1],r:14,pl:false,o:3})}
    ps.sort(function(a,b){return (a.o-b.o)||((a.it.r||0)-(b.it.r||0))||(a.id<b.id?-1:1)});
    ps.forEach(function(p){if(!p.pl)return;var w=((short?(p.it.fws||p.it.fw):p.it.fw)||0)/2;if(!w)return;
      // The name hangs just under the disc, about 21 tall.
      var t=p.y+p.r+5,b=t+21,ok=true,i;
      if(!p.o){shown.push({x:p.x,w:w,t:t,b:b});return}
      for(i=0;i<ps.length&&ok;i++){var q=ps[i];if(q===p)continue;var cx=Math.max(p.x-w,Math.min(q.x,p.x+w)),cy=Math.max(t,Math.min(q.y,b));if((q.x-cx)*(q.x-cx)+(q.y-cy)*(q.y-cy)<q.r*q.r)ok=false}
      for(i=0;i<shown.length&&ok;i++){var e=shown[i];if(Math.abs(e.x-p.x)<e.w+w+3&&e.t<b+2&&e.b>t-2)ok=false}
      if(ok)shown.push({x:p.x,w:w,t:t,b:b});else out[p.id]=ext(p.it,{cls:((p.it.cls||'')+' cs-nn').trim(),nn:1})});
  }
  // Room for players: what stands on a player's spot lifts above their disc; a court their name would cover moves aside; zoomed out, a flag on anything folds into it.
  function room(out){
    names(out);
    var ps=[],id,it,short=zoomOf(lvl)<FOLD_BELOW;
    // A player's half-width: half their name's width at this zoom (never less than the disc); with their name made way, the disc.
    function hw(it){return it.nn?(it.ds||48)/2:Math.max(((short?(it.fws||it.fw):it.fw)||100)/2,(it.ds||48)/2)}
    // nb: how far below their spot they reach (a disc and its name; a disc alone).
    for(id in out){it=out[id];if(it.k==='p'||it.fix){var q=lp(it.lat,it.lng);ps.push({x:q.x+(it.fx||0),y:q.y+(it.fy||0),r:(it.ds||48)/2,w:hw(it),nb:it.nn?6:36})}
      // The "+N" beside you is in the way too (a small round thing, no name under it).
      else if(it.k==='chip'){var qc=lp(it.lat,it.lng);ps.push({x:qc.x+(it.fx||0),y:qc.y,r:15,w:20,nb:12})}}
    // Courts: where each sits now, so one moved aside never lands on another.
    var cs={};for(id in out){it=out[id];if(it.k==='c'){var q1=lp(it.lat,it.lng);cs[id]={x:q1.x,y:q1.y}}}
    function clear(id,x,y){for(var o2 in cs){if(o2===id)continue;if(Math.abs(cs[o2].x-x)<30&&Math.abs(cs[o2].y-y)<30)return false}return true}
    // Whether a court this wide (cw: half its width) at x, y would sit on any player's face or name: moved aside off one, it must not land on the next.
    function onPlayer(x,y,cw){for(var i=0;i<ps.length;i++){var p=ps[i],dx=x-p.x,dy=y-p.y;if(Math.abs(dx)<p.w+cw-2&&dy>-p.r-12&&dy<p.r+p.nb)return true}return false}
    for(id in out){it=out[id];if(it.k!=='c'||it.sel)continue;
      // A court crowd (cw) counts its whole width; on a player's very spot it moves aside rather than up.
      var c=lp(it.lat,it.lng),lift=0,shift=0,gone=false,cw=it.cw||14;
      // The court a ring of players fans round stays on its spot under them, and its words make way (the ring says who is there).
      if(rings.some(function(r){return (r.ct||r.mid)&&r.at===id||Math.abs(r.x-c.x)<3&&Math.abs(r.y-c.y)<3})){out[id]=ext(it,{cls:((it.cls||'')+' cs-anchor').trim()});continue}
      ps.forEach(function(p){var dx=c.x-p.x,dy=c.y-p.y;
        if(Math.abs(dx)<8&&Math.abs(dy)<8&&cw<=14){lift=Math.min(lift,-(p.r+13))}
        else if(Math.abs(dx)<p.w+cw-2&&dy>-p.r-12&&dy<p.r+p.nb){var need=(p.w+cw)-Math.abs(dx);if(need>46+cw)gone=true;else shift=(dx>=0?1:-1)*Math.max(Math.abs(shift),need)}});
      if(gone&&zoomOf(lvl)<15&&!it.solo){delete out[id];delete cs[id];continue}
      // Moved aside only into clear room; with none, zoomed out it folds away until there is room (closer in it stays, under the name).
      if(shift&&(!clear(id,c.x+shift,c.y+lift)||onPlayer(c.x+shift,c.y+lift,cw))){shift=0;if(zoomOf(lvl)<14&&!it.solo){delete out[id];delete cs[id];continue}}
      if(lift||shift){out[id]=ext(it,{fx:shift,offsetY:(it.offsetY||0)+lift});cs[id]={x:c.x+shift,y:c.y+lift}}}
    // A flag (about 92 wide, 26 tall, hung above its spot) overlapping a court or a player (their disc and name): zoomed out it folds in as a dot; closer, it lifts clear above the highest of them.
    var hosts=[];for(id in out){it=out[id];if(it.k==='p'||it.fix||it.k==='c'){var q2=lp(it.lat,it.lng),isC=it.k==='c',r2=isC?14:(it.ds||48)/2;
      hosts.push({id:id,x:q2.x+(it.fx||0),y:q2.y+(it.fy||0)+(isC?(it.offsetY||0):0),r:r2,w:isC?r2:hw(it),b:isC?r2:r2+(it.nn?4:26)})}}
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
    // Where every pin showing now sits, before anything moves; and where a face-stack's faces peek out (a face that leaves one springs
    // out from there, and one that joins one glides into its place there).
    var peek={};for(var id in ms){if(!ms[id].leaving)spot[id]=at(ms[id]);if(ms[id].it&&ms[id].it.po)peek[id]=ms[id].it.po}
    var peekNow={};for(id in d.out)if(d.out[id].po)peekNow[id]=d.out[id].po;
    function plus(p,po){return po?{x:p.x+po[0],y:p.y+po[1]}:p}
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
        var ref=id.indexOf('k:')===0?id.split(':').slice(2).join(':'):id,src=why&&was[ref]&&was[ref]!==id?was[ref]:null,from=src&&spot[src]?plus(spot[src],peek[src]&&peek[src][ref]):null;
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
      // A face-stack's faces fan out by --cs-pv: changed in place, they glide further apart (MAP_PIN_CSS .cs-pf).
      if(it.pv!=null)k.el.style.setProperty('--cs-pv',it.pv+'px');else k.el.style.removeProperty('--cs-pv');
      if(it.role)k.el.setAttribute('role',it.role);else k.el.removeAttribute('role');
      if(it.label)k.el.setAttribute('aria-label',it.label);else k.el.removeAttribute('aria-label');
      cls(k,it.cls||'',made);
    }
    // Gone from this level (gathered into another pin, or folded away): it glides into its new pin as it fades; off screen, it just goes.
    var leaving=[];
    for(id in ms){if(d.out[id]||ms[id].leaving)continue;var me0=spot[id]||at(ms[id]);
      var ref2=id.indexOf('k:')===0?id.split(':').slice(2).join(':'):id,tgt=d.own[ref2],into=why&&tgt&&tgt!==id&&d.out[tgt]&&ms[tgt]?plus(at(ms[tgt]),peekNow[tgt]&&peekNow[tgt][ref2]):null;
      if(!onScreen(me0)){drop(id);continue}
      leaving.push({id:id,k:ms[id],from:me0,into:into,d:Math.abs(me0.x-mid.x)+Math.abs(me0.y-mid.y)})}
    // At most GLIDES move at once, nearest the middle; the rest just fade. One layout pass for all of them.
    glides.sort(function(a,b){return a.d-b.d});
    glides.slice(GLIDES).forEach(function(g){if(g.made)fresh.push({k:g.k,pos:null,gathered:false})});glides=glides.slice(0,GLIDES);
    leaving.sort(function(a,b){return a.d-b.d});
    leaving.forEach(function(l,i){if(i>=GLIDES||st)l.into=null});
    glides.forEach(function(g){var c=child(g.k);if(!c)return;clearTimeout(g.k.tidy);c.classList.remove('cs-move','cs-spring');c.style.translate=g.dx+'px '+g.dy+'px'});
    leaving.forEach(function(l){var c=child(l.k);clearTimeout(l.k.tidy);l.k.el.style.pointerEvents='none';if(c&&l.into){c.classList.add('cs-move');c.style.translate=(l.into.x-l.from.x)+'px '+(l.into.y-l.from.y)+'px'}if(c)c.classList.add('cs-out');
      var k=l.k,id=l.id;k.leaving=setTimeout(function(){k.m.remove();if(ms[id]===k)delete ms[id]},c?260:0)});
    if(glides.length)void ct.offsetWidth;
    // One split off a gathered pin springs out (a little past its spot and back, growing to full size); anything else just glides.
    glides.forEach(function(g){var c=child(g.k);if(!c)return;c.classList.add('cs-move',g.made?'cs-spring':'cs-in');c.style.translate='0px 0px';
      g.k.tidy=setTimeout(function(){c.classList.remove('cs-move','cs-in','cs-spring');c.style.translate=''},g.made?620:460)});
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
  // A gathered pin, tapped: zoom in just far enough that it is one pin no longer. It splits, fans out in its ring, or (the "+N"
  // beside you) some of them move off you: the first level in where that happens, half a step more if they all still fit there.
  function expand(cid){
    var k=ms[cid];if(!k||!k.it.cl)return;var cl=k.it.cl,per=tree[cl.k];
    if(o.gathered)o.gathered();
    var key=cl.lead||cl.m[0],at=null;
    if(per)for(var li=lvl+1;li<=ZMAX*2&&at==null;li++){var g=null;per[li].forEach(function(x){if(x.m.indexOf(key)>=0)g=x});
      if(!g||ringy(g)||cl.m.some(function(id){return g.m.indexOf(id)<0}))at=zoomOf(li)}
    if(at==null){
      // Never one pin no longer by zooming in (courts or hit flags on the very same spot, a crowd too big to ring): fanned in rows once the map is there.
      // The level is taken then, so a zoom frame still to come does not fold the fan straight back.
      var it0=items[key];if(!it0)return;
      var go=function(){flying=false;if(dead)return;if(raf){cancelAnimationFrame(raf);raf=0}lvl=levelNow();fan={k:cl.k,m:cl.m.slice(),lead:cl.lead,lat:it0.lat,lng:it0.lng,lvl:lvl};render('fan')};
      if(map.getZoom()<14.6){flying=true;map.once('moveend',go);map.flyTo({center:[it0.lng,it0.lat],zoom:15,duration:still()?0:650,essential:true})}
      else go();
      return;
    }
    var b=new ml.LngLatBounds();cl.m.concat(cl.lead?[cl.lead]:[]).forEach(function(id){var it=items[id];if(it)b.extend([it.lng,it.lat])});
    var pad=o.pad||{top:120,bottom:220,left:60,right:60},cam=null;
    try{cam=map.cameraForBounds(b,{padding:pad})}catch(e){}
    var need=at+0.02,fit=cam&&cam.zoom!=null?cam.zoom:need,zoom=Math.min(ZMAX+0.4,fit>=need?Math.min(fit,at+0.5):need);
    map.flyTo({center:cam&&cam.center?cam.center:b.getCenter(),zoom:zoom,duration:still()?0:650,essential:true});
  }
  // A fan stays while you zoom further in (they still stand on one spot); zooming out folds it back, as does a tap on the map.
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
