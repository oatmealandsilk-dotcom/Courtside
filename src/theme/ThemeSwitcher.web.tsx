import { forwardRef, useImperativeHandle } from 'react';
import type { View } from 'react-native';
import { flushSync } from 'react-dom';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { CROSSFADE_MS, REVEAL_MS, THEME_SWITCH, coverRadius, middleOf, type ThemeSwitcherHandle } from './themeSwitch';

type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };
type TransitionDocument = Document & { startViewTransition?: (update: () => void) => Transition };

let styled = false;

/**
 * A theme change in a browser (Oct 21; the phone's is ThemeSwitcher.tsx). The
 * browser photographs the page, the app redraws in the new court's colours,
 * and the new page spreads out over the photograph in a circle from the card
 * you tapped (the browser's view transitions: Chrome, Edge, Safari 18+);
 * with THEME_SWITCH 'crossfade', the photograph fades away over the new page.
 * Taps go straight through to the page while it runs, so a second pick starts
 * again from where the first was heading. Browsers without view transitions
 * switch at once, and so does Reduce Motion when the app honours it
 * (src/lib/useReducedMotion, the same answer as on a phone).
 */
export const ThemeSwitcher = forwardRef<ThemeSwitcherHandle, { app: React.RefObject<View | null> }>(function ThemeSwitcher(_props, ref) {
  const reduced = useReducedMotion();
  useImperativeHandle(ref, () => ({
    start(_name, apply, from) {
      const doc = typeof document !== 'undefined' ? (document as TransitionDocument) : null;
      if (!doc?.startViewTransition || reduced) {
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
          // For a crossfade the old photograph is the one on top (it fades away); a reveal keeps the new on top.
          THEME_SWITCH === 'crossfade' ? '::view-transition-old(root){z-index:1}' : '',
        ].join('');
        doc.head.appendChild(style);
      }
      const point = from ?? middleOf(innerWidth, innerHeight);
      const reach = coverRadius(point, innerWidth, innerHeight);
      const transition = doc.startViewTransition(() => { flushSync(apply); });
      transition.ready
        .then(() => {
          if (THEME_SWITCH === 'crossfade') {
            // The photograph of the old page sits on top and fades away over the new one.
            doc.documentElement.animate(
              { opacity: [1, 0] },
              { duration: CROSSFADE_MS, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', pseudoElement: '::view-transition-old(root)' },
            );
            return;
          }
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
