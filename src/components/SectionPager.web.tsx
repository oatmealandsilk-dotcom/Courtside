import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { SwipeSurface } from '@/components/SwipeSurface';
import { PAGE_GUTTER } from '@/features/navigation/gestureClaim';
import { listenForSlides } from '@/features/navigation/pageSlide';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * Sections inside a tab, on the web: the drag-to-swipe surface with the
 * neighbouring pane shown as the preview. Same contract as the phone's
 * side-by-side pager, so the pages do not care which they got: whole-width
 * panes, each clipped to itself, a gutter between them, reaching out over
 * the page's side margin (`bleed`), and a slow drag turns the page once it
 * is more than half way.
 */
export function SectionPager({ index, panes, onIndex, progress, delegateLeft = false, delegateRight = false, slideChannel, fill = false, slideOnTap = false, bleed = 0 }: {
  index: number;
  panes: React.ReactNode[];
  onIndex: (next: number) => void;
  progress?: SharedValue<number>;
  depth?: 1 | 2;
  delegateLeft?: boolean;
  delegateRight?: boolean;
  slideChannel?: string;
  /** The surface fills the height it is given, for panes that are scrollers of their own. */
  fill?: boolean;
  /** The phone's back swipe; a browser has its own, so there is nothing to stand aside for. */
  edgeBack?: boolean;
  /**
   * A section picked by its tab slides in too, the way the phone's pager
   * glides, rather than flipping. Only for a page whose sections change by
   * its own tabs (Archive): a tab's section can also change while it is out
   * of sight (a swipe from the next tab asks for one), and there the slide
   * would play after you had arrived.
   */
  slideOnTap?: boolean;
  /** The page's side margin: the row reaches out over it and each pane puts it back inside. */
  bleed?: number;
}) {
  const last = panes.length - 1;
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  // The pane drawn as the page. A tapped tab moves `index` first; this
  // follows once the slide to it has played, so the old pane can slide out.
  const [shown, setShown] = useState(index);
  const drawn = slideOnTap ? shown : index;
  const drawnRef = useRef(drawn);
  drawnRef.current = drawn;
  const indexRef = useRef(index);
  indexRef.current = index;
  // Where a tapped tab's slide is heading (null for a finger or the tutorial).
  const tapTarget = useRef<number | null>(null);
  // While it plays, the underline glides on its own (useTabUnderline), so the
  // slide must not push it along as well.
  const [tapSliding, setTapSliding] = useState(false);
  // Goes up on every landing, so the surface lets go the moment the landed
  // pane is drawn, even when that is the pane it was already drawing.
  const [landings, setLandings] = useState(0);
  // A swipe under way: from its first sideways move until the surface is
  // still again. A tab tapped meanwhile waits for it rather than cutting in,
  // which left the section blank while the swipe finished.
  const moving = useRef(false);
  const nextFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(nextFrame.current), []);
  // A section turn asked for by code (the tutorial) plays as this pager's own swipe.
  const slide = useRef<((direction: 1 | -1) => boolean) | null>(null);
  useEffect(() => (slideChannel ? listenForSlides(slideChannel, ({ direction }) => slide.current?.(direction) ?? false) : undefined), [slideChannel]);
  // Takes the page to the tab picked: a glide when the surface can play one,
  // a flip when it can't (Reduce Motion, a computer's layout). While a swipe
  // or an earlier slide is still moving it waits; the rest asks again.
  const seek = useRef(() => {});
  seek.current = () => {
    if (!slideOnTap || tapTarget.current !== null || moving.current) return;
    const target = indexRef.current;
    const from = drawnRef.current;
    if (target === from) return;
    tapTarget.current = target;
    if (!reducedRef.current && slide.current?.(target > from ? 1 : -1)) { setTapSliding(true); return; }
    tapTarget.current = null;
    setShown(target);
  };
  // Before paint, so a flip never shows the old pane for a frame.
  useLayoutEffect(() => { seek.current(); }, [slideOnTap, index, reduced]);
  // Each pane a page of its own, clipped to itself, with the margin inside.
  const page = (pane: React.ReactNode) => <View style={{ flex: fill ? 1 : undefined, paddingHorizontal: bleed, overflow: 'hidden' }}>{pane}</View>;
  return (
    <View style={{ alignSelf: 'stretch', marginHorizontal: -bleed, flex: fill ? 1 : undefined }}>
    <SwipeSurface
      slideRef={slide}
      fill={fill}
      gap={PAGE_GUTTER}
      commitAt={0.5}
      progress={tapSliding ? undefined : progress}
      settledKey={slideOnTap ? `${shown}:${landings}` : String(index)}
      // Here the landed pane is drawn in the same render as the key changes.
      landInPlace={slideOnTap}
      delegateLeft={delegateLeft && drawn >= last}
      delegateRight={delegateRight && drawn <= 0}
      onProgress={() => { moving.current = true; }}
      onRest={() => {
        moving.current = false;
        // A slide the surface gave up part way (the layout lost its swipe) never landed.
        if (tapTarget.current !== null) { tapTarget.current = null; setTapSliding(false); }
        // A tab tapped while it moved is gone to now. A frame on, so the
        // surface has put its pane back in place before the next slide starts.
        cancelAnimationFrame(nextFrame.current);
        nextFrame.current = requestAnimationFrame(() => seek.current());
      }}
      onSwipe={(direction) => {
        setLandings((n) => n + 1);
        const tapped = tapTarget.current;
        if (tapped !== null) {
          // A tapped tab's slide has landed on its pane. Should another tab
          // have been tapped meanwhile, that one glides in next (onRest).
          tapTarget.current = null;
          setTapSliding(false);
          setShown(tapped);
          return;
        }
        // A finger's swipe (or the tutorial's) landed one pane along. Should
        // a tab have been tapped while it settled, the tap stands: the page
        // goes on to that tab once the surface is still (onRest), and the
        // swipe is not reported over it.
        const next = Math.max(0, Math.min(last, drawnRef.current + direction));
        const tappedMeanwhile = indexRef.current !== drawnRef.current;
        setShown(next);
        if (!tappedMeanwhile) onIndex(next);
      }}
      renderPreview={(direction) => {
        const next = tapTarget.current ?? drawnRef.current + direction;
        return next >= 0 && next <= last && next !== drawnRef.current ? page(panes[next]) : null;
      }}
    >
      {page(panes[drawn])}
    </SwipeSurface>
    </View>
  );
}
