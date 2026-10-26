import React, { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withSpring } from 'react-native-reanimated';

import * as haptics from '@/lib/haptics';
import { HOLD_MS, SPRING_SCRUB, endFeedScrub, winF, winFinger, winGeo, winLive, winScrub, winSel, type ScrubEnd } from './feedWindows';

/*
 * The hold that opens the Feed's windows, and the slide after it, as one gesture (Oct 25, owner:
 * "for the new windows thing if I hold. I should be able to drag between the tabs while my finger
 * is still down"). Wraps a top-row word or the bar's Feed tab:
 *
 *  - A finger resting HOLD_MS without moving more than 10 points opens the windows under it
 *    (react-native-gesture-handler's long-press pan; a tap or a swipe fails it, so those are untouched,
 *    and once it takes the finger the word's own press is cancelled, so it never also switches feeds).
 *  - Without lifting, sliding sideways moves between the cards, one card per step of the finger
 *    (each step a light tick), in the row's order: right is the card to the right.
 *  - Lifting opens the card pointed at (the one it started on = back to it); a quick flick down
 *    before lifting goes back; a finger that never slid leaves the cards up, to swipe and tap as before.
 *
 * The finger stays with the word it landed on, so the gesture keeps tracking under the windows'
 * overlay (a browser: the pointer is captured, and the page is kept from scrolling meanwhile).
 */

const clamp = (v: number, lo: number, hi: number) => {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
};

/** A light tick each time the finger moves on to another card. */
const tick = () => haptics.tick();
/** The end, on the JS side (the windows' controller decides; it re-checks they are still up). */
const end = (how: ScrubEnd, sel: number) => endFeedScrub(how, sel);

// A browser: while a finger slides between the cards, the page underneath never scrolls (iOS Safari).
// One listener for the page, added the first time a hold is wrapped, and quiet unless a finger slides.
let webGuarded = false;
function useNoScrollWhileSliding() {
  useEffect(() => {
    if (webGuarded || Platform.OS !== 'web' || typeof document === 'undefined') return;
    webGuarded = true;
    document.addEventListener('touchmove', (e) => { if (winScrub.value) e.preventDefault(); }, { passive: false });
  }, []);
}

/**
 * `onHold(x)`: the hold landed (JS side): open the windows with the finger still down, at `x` across
 * the screen. Without it, the children are given back exactly as they are (no gesture at all).
 */
export function FeedHold({ onHold, children }: { onHold?: (x: number) => void; children: React.ReactElement }) {
  if (!onHold) return children;
  return <HoldDetector onHold={onHold}>{children}</HoldDetector>;
}

function HoldDetector({ onHold, children }: { onHold: (x: number) => void; children: React.ReactElement }) {
  useNoScrollWhileSliding();
  const x0 = useSharedValue(0);
  const y0 = useSharedValue(0);
  const far = useSharedValue(0);
  const stepped = useSharedValue(0);
  const aim = useSharedValue(0);
  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(HOLD_MS)
    .onStart((e) => {
      'worklet';
      x0.value = e.absoluteX;
      y0.value = e.absoluteY;
      far.value = 0;
      stepped.value = 0;
      aim.value = -1;
      winFinger.value = 1;
      runOnJS(onHold)(e.absoluteX);
    })
    .onUpdate((e) => {
      'worklet';
      // Only once the windows are up for this finger (they may have said no: pinched in, the tutorial).
      if (!winScrub.value) return;
      const g = winGeo.value;
      const n = g.n;
      const o = winLive.value;
      const x = x0.value;
      const dx = e.absoluteX - x;
      if (Math.abs(dx) >= 12) far.value = 1;
      // One card per step of the finger, the steps sized so every card can be reached on screen.
      const pitchR = n - 1 - o > 0 ? clamp((g.W - 20 - x) / (n - 1 - o), 44, 76) : 76;
      const pitchL = o > 0 ? clamp((x - 20) / o, 44, 76) : 76;
      const raw = o + (dx >= 0 ? dx / pitchR : dx / pitchL);
      let sel = winSel.value;
      // A little past half a step before it moves on, so it never flickers on the line.
      if (Math.abs(raw - sel) > 0.65) {
        const next = clamp(Math.round(raw), 0, n - 1);
        if (next !== sel) {
          sel = next;
          winSel.value = next;
          stepped.value = 1;
          runOnJS(tick)();
        }
      }
      // The row leans a little after the finger between steps.
      const target = sel + clamp((raw - sel) * 0.25, -0.15, 0.15);
      if (Math.abs(target - aim.value) > 0.002) {
        aim.value = target;
        winF.value = withSpring(target, SPRING_SCRUB);
      }
      // The cards never follow the finger up or down (Oct 26, owner: "there shouldn't rly be up and down movement").
    })
    .onEnd((e, success) => {
      'worklet';
      winFinger.value = 0;
      if (!winScrub.value) return;
      winScrub.value = 0;
      const sel = winSel.value;
      // The system took the finger (a call, the app sent away): the cards stay up.
      if (!success) { runOnJS(end)('stay', sel); return; }
      const dx = e.absoluteX - x0.value;
      const dy = e.absoluteY - y0.value;
      if (e.velocityY > 900 && dy > 30 && dy > Math.abs(dx)) runOnJS(end)('close', sel);
      else if (!stepped.value && !far.value) runOnJS(end)('stay', sel);
      else runOnJS(end)('choose', sel);
    })
    .onFinalize(() => {
      'worklet';
      winFinger.value = 0;
      if (!winScrub.value) return;
      winScrub.value = 0;
      runOnJS(end)('stay', winSel.value);
    }), [onHold, x0, y0, far, stepped, aim]);
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
