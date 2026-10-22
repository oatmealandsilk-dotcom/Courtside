/**
 * Small pieces of map code shared by the phone's map page (MapCanvas, as
 * text run inside its web view) and the browser's map (WebMap, made into
 * functions), so the map window (mapWindow) moves the same on both.
 */

/** A CSS-style cubic-bezier(x1, y1, x2, y2) as an easing function for MapLibre's easeTo. */
export const BEZIER_JS = `function(x1,y1,x2,y2){
function A(a,b){return 1-3*b+3*a}function B(a,b){return 3*b-6*a}function C(a){return 3*a}
function f(t,a,b){return((A(a,b)*t+B(a,b))*t+C(a))*t}function d(t,a,b){return 3*A(a,b)*t*t+2*B(a,b)*t+C(a)}
return function(x){if(x<=0)return 0;if(x>=1)return 1;var t=x;for(var i=0;i<8;i++){var e=f(t,x1,x2)-x;if(Math.abs(e)<1e-5)break;var dd=d(t,x1,x2);if(Math.abs(dd)<1e-6)break;t-=e/dd}return f(t,y1,y2)}}`;

/** The place names the still card leaves off (cardLook): in the map window they fade instead, so they can come in as it opens. */
export const CARD_LABELS = ['label_city', 'label_city_capital', 'label_town', 'label_village', 'label_other'];

/** Place names on or off, faded over `ms` after `delay`. */
export const LABELS_JS = `function(map,on,ms,delay){var ids=${JSON.stringify(CARD_LABELS)};ids.forEach(function(id){if(!map.getLayer(id))return;try{
map.setLayoutProperty(id,'visibility','visible');
map.setPaintProperty(id,'text-opacity-transition',{duration:ms,delay:delay});map.setPaintProperty(id,'text-opacity',on?1:0);
map.setPaintProperty(id,'icon-opacity-transition',{duration:ms,delay:delay});map.setPaintProperty(id,'icon-opacity',on?1:0)}catch(e){}})}`;

/** The map's own drag, pinch and double-tap on or off (the window takes touches only once it is nearly open). */
export const INTERACT_JS = `function(map,on,wheel){['dragPan','touchZoomRotate','doubleClickZoom','boxZoom','keyboard'].concat(wheel?['scrollZoom']:[]).forEach(function(h){try{if(map[h])on?map[h].enable():map[h].disable()}catch(e){}});try{map.touchZoomRotate.disableRotation()}catch(e){}}`;
