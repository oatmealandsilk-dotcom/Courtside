import { useEffect } from 'react';

/**
 * The website loads like Instagram on a phone (Nov 12, owner: "Make a website load like Instagram on the
 * phone", then "Instagram style laoding"). The loader in public/index.html (#cs-launch: the mark, and the
 * line low down) sits OUTSIDE the app's root, so the app's first draws never replace it: it stays over
 * everything while the code downloads and the first page builds, and then simply goes (a cut, as
 * Instagram's), with that page already whole under it: its top bar, its tab bar and its icons. Before
 * this the app's copy of the mark held, faded to a blank white page, and the bar's icons were empty
 * squares for most of a second (the icon font arriving after the page).
 *
 * It goes once the app has left the start page (app/index.tsx, the loading screen's own page; the Feed
 * shares its address, so it is told by the router's segments) for the page it opens on, the icon font has really arrived (document.fonts, not the font loader's word), and two frames
 * have drawn that page. A page that stays on the start page (the "Could not load your account" screen) calls
 * dropWebLoader itself. It never stays longer than MAX_MS, whatever happens.
 */
const MAX_MS = 12000;
/** The icon font, waited on at most this long before the page shows anyway. */
const FONT_WAIT_MS = 3000;

let dropped = false;
let started = false;

export function dropWebLoader() {
  if (dropped || typeof document === 'undefined') return;
  dropped = true;
  document.getElementById('cs-launch')?.remove();
}

function iconFontReady(): Promise<unknown> {
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return Promise.resolve();
    return Promise.race([fonts.load('16px ionicons'), new Promise((done) => setTimeout(done, FONT_WAIT_MS))]);
  } catch {
    return Promise.resolve();
  }
}

const twoFrames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

export function useDropWebLoader(onStartPage: boolean) {
  useEffect(() => {
    if (dropped) return;
    const safety = setTimeout(dropWebLoader, MAX_MS);
    return () => clearTimeout(safety);
  }, []);
  useEffect(() => {
    if (dropped || started || onStartPage) return;
    started = true;
    void iconFontReady().then(twoFrames).then(dropWebLoader);
  }, [onStartPage]);
}
