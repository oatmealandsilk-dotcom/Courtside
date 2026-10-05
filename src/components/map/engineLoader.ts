/**
 * Where the phone's map pages get MapLibre, the code that draws the map
 * (MapCanvas and the court thumbnails run it inside a web view). It comes
 * from a free public file host, so if one is slow, down or blocked the map
 * would stay a blank box: each file is tried at a second host (jsDelivr)
 * before the page gives up and says so ({type: 'fail'}), so the app can
 * show "Map couldn't load · Try again" instead (Oct 5, App Review 2.1).
 * The version is pinned, so after one good load the phone keeps a copy.
 */
const VERSION = '4.7.1';
const HOSTS = [
  `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl`,
  `https://cdn.jsdelivr.net/npm/maplibre-gl@${VERSION}/dist/maplibre-gl`,
];

/** The map's stylesheet, with the second host if the first does not answer. */
export const ENGINE_CSS = `<link rel="stylesheet" href="${HOSTS[0]}.css" onerror="this.onerror=null;this.href='${HOSTS[1]}.css'">`;

/**
 * A script body that loads the map's code from the first host that answers,
 * then calls `start()` (the page's own code, which must be defined, along
 * with `post`, before this runs). When neither host answers, or start()
 * throws, it posts {type: 'fail'}.
 */
export const ENGINE_JS = `(function(){var urls=${JSON.stringify(HOSTS.map((h) => `${h}.js`))};var i=0;function next(){if(window.maplibregl){try{start()}catch(e){post({type:'fail'})}return}if(i>=urls.length){post({type:'fail'});return}var s=document.createElement('script');s.src=urls[i++];s.onload=function(){if(window.maplibregl){try{start()}catch(e){post({type:'fail'})}}else next()};s.onerror=next;document.head.appendChild(s)}next()})();`;
