import { forwardRef, useImperativeHandle } from 'react';
import type { View } from 'react-native';
import { flushSync } from 'react-dom';
import { REVEAL_MS, coverRadius, middleOf, type ThemeSwitcherHandle } from './themeSwitch';

type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => Transition };

let styled = false;

/**
 * A theme change in a browser (Oct 21; the phone's is ThemeSwitcher.tsx). The
 * browser photographs the page, the app redraws in the new court's colours,
 * and the new page spreads out over the photograph in a circle from the card
 * you tapped (the browser's view transitions: Chrome, Edge, Safari 18+).
 * Taps go straight through to the page while it runs, so a second pick starts
 * again from where the first was heading. Browsers without view transitions,
 * and anyone who asked their system for less motion, switch at once.
 */
export const ThemeSwitcher = forwardRef<ThemeSwitcherHandle, { app: React.RefObject<View | null> }>(function ThemeSwitcher(_props, ref) {
  useImperativeHandle(ref, () => ({
    start(apply, from) {
      const doc = typeof document !== 'undefined' ? (document as TransitionDocument) : null;
      const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!doc?.startViewTransition || still) {
        apply();
        return;
      }
      if (!styled) {
        styled = true;
        const style = doc.createElement('style');
        // The browser's own fade is off: the new page is simply on top, uncovered by the circle below.
        // Taps pass through the browser's photograph to the page beneath.
        style.textContent = [
          '::view-transition{pointer-events:none}',
          '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}',
        ].join('');
        doc.head.appendChild(style);
      }
      const point = from ?? middleOf(innerWidth, innerHeight);
      const reach = coverRadius(point, innerWidth, innerHeight);
      const transition = doc.startViewTransition(() => { flushSync(apply); });
      transition.ready
        .then(() => {
          doc.documentElement.animate(
            { clipPath: [`circle(0px at ${point.x}px ${point.y}px)`, `circle(${reach}px at ${point.x}px ${point.y}px)`] },
            { duration: REVEAL_MS, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', pseudoElement: '::view-transition-new(root)' },
          );
        })
        .catch(() => {}); // a newer pick skipped this one: nothing to animate
      transition.finished.catch(() => {});
      transition.updateCallbackDone.catch(() => {});
    },
    landed() {},
  }));
  return null;
});
