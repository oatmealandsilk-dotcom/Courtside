import { flushSync } from 'react-dom';
import { SCREEN_FADE_CURVE, SCREEN_FADE_MS } from './fadeTiming';
import { fadeEnded, fadeStarted } from './catchUp';
import { reduceMotionNow } from '@/lib/useReducedMotion';

/*
 * The website's side of the screen's cross-fade when the app changes look by itself (Match phone
 * following the browser into dark mode and out; the phone's side, and why, in screenFade.tsx).
 *
 * The browser does it itself (the View Transitions API: Chrome, Edge, Safari 18 and Firefox 144 on):
 * it keeps a picture of the page as it is, the app turns to the new look underneath in one redraw
 * (flushSync, so the new look is all there before the browser looks again), and the browser dissolves
 * the picture into the live page over SCREEN_FADE_MS, ease-in-out. The page stays live and
 * clickable throughout (pointer-events through the picture), and nothing else on the site uses a
 * view transition, so the class on the page's root keeps these rules to this one.
 *
 * Where the browser cannot (older Safari and Firefox), no picture: for the same time every colour
 * on the page glides from old to new on its own (a CSS transition on the colours only), so the page
 * moves straight from one look to the other, with no flash and no colour in between that is not
 * on one side or the other (a dark clip's ground, the same in both looks, never moves).
 */

export interface ScreenFadeJob {
  land: () => boolean;
  held: () => boolean;
  retry: () => void;
}

const ROOT_CLASS = 'cs-screen-fade';
const GLIDE_CLASS = 'cs-screen-glide';
const CURVE = `cubic-bezier(${SCREEN_FADE_CURVE.join(', ')})`;
const STYLE = `
html.${ROOT_CLASS}::view-transition { pointer-events: none; }
html.${ROOT_CLASS}::view-transition-group(root) { animation-duration: ${SCREEN_FADE_MS}ms; animation-timing-function: ${CURVE}; }
html.${ROOT_CLASS}::view-transition-old(root),
html.${ROOT_CLASS}::view-transition-new(root) { animation-duration: ${SCREEN_FADE_MS}ms; animation-timing-function: ${CURVE}; }
html.${GLIDE_CLASS} *, html.${GLIDE_CLASS} *::before, html.${GLIDE_CLASS} *::after {
  transition-property: background-color, color, border-color, fill, stroke, box-shadow, text-decoration-color, outline-color !important;
  transition-duration: ${SCREEN_FADE_MS}ms !important;
  transition-timing-function: ${CURVE} !important;
  transition-delay: 0s !important;
}
`;

type Stage = 'idle' | 'waiting' | 'fading';
let stage: Stage = 'idle';
let job: ScreenFadeJob | null = null;
let styled = false;
/** For the auto-tester and the timing harness: how many changes have faded, and how. */
const record = { count: 0, way: '' as '' | 'transition' | 'glide' | 'instant' };

function addStyle() {
  if (styled) return;
  styled = true;
  try {
    const el = document.createElement('style');
    el.setAttribute('data-courtside', 'screen-fade');
    el.textContent = STYLE;
    document.head.appendChild(el);
  } catch { /* no page to style: the change is instant */ }
}

/** The change itself, the new look all drawn before this returns. */
function landNow(next: ScreenFadeJob | null) {
  if (!next) return;
  flushSync(() => { next.land(); });
}

function note(way: typeof record.way) {
  record.count++;
  record.way = way;
  (globalThis as { __courtsideScreenFade?: typeof record }).__courtsideScreenFade = record;
}

type Doc = Document & { startViewTransition?: (update: () => void | Promise<void>) => { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> } };

/** Plays the app's own change of look (Match phone) as a cross-fade of the whole page. */
export function fadeScreen(next: ScreenFadeJob): void {
  // The browser is about to keep its picture: this change lands with the one waiting.
  if (stage === 'waiting') { job = next; return; }
  // A fade already running: this one lands under it, and the fade carries on to it.
  if (stage === 'fading') { next.land(); return; }
  const doc = typeof document !== 'undefined' ? (document as Doc) : null;
  if (!doc || reduceMotionNow() || doc.visibilityState === 'hidden') { note('instant'); next.land(); return; }
  addStyle();
  const root = doc.documentElement;
  job = next;
  stage = 'waiting';
  fadeStarted();
  const end = () => {
    root.classList.remove(ROOT_CLASS, GLIDE_CLASS);
    stage = 'idle';
    fadeEnded();
  };

  if (typeof doc.startViewTransition === 'function') {
    root.classList.add(ROOT_CLASS);
    try {
      const transition = doc.startViewTransition(() => {
        const waiting = job;
        job = null;
        stage = 'fading';
        landNow(waiting);
      });
      note('transition');
      transition.ready.catch(() => undefined);
      transition.updateCallbackDone.catch(() => undefined);
      transition.finished.catch(() => undefined).finally(end);
    } catch {
      const waiting = job;
      job = null;
      end();
      note('instant');
      waiting?.land();
    }
    return;
  }

  // No view transitions here: the colours glide.
  root.classList.add(GLIDE_CLASS);
  // The rule in force before anything changes, so every change from here on glides.
  void getComputedStyle(root).color;
  job = null;
  stage = 'fading';
  note('glide');
  landNow(next);
  setTimeout(end, SCREEN_FADE_MS + 60);
}

/** The phone's side starts its fade once the new look is drawn; the browser knows by itself. */
export function screenDrawn() {}

/** The phone's picture layer; the browser keeps its own. */
export function ScreenFadeHost() {
  return null;
}
