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
export function SectionPager({ index, panes, onIndex, onLand, progress, delegateLeft = false, delegateRight = false, slideChannel, fill = false, slideOnTap = false, bleed = 0, keepMounted = false }: {
  index: number;
  panes: React.ReactNode[];
  onIndex: (next: number) => void;
  /**
   * Run once a pane is drawn as the page, before the browser paints it, so a
   * page that shares one scroller between its panes (Community) moves it to
   * that pane's own spot without a frame at the wrong place. See the phone's pager.
   */
  onLand?: (dest: number) => void;
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
  /**
   * Panes stay built once they have been on show, hidden while another is,
   * the way the phone's pager keeps them all. A swipe slides the built pane
   * in beside the page instead of building a copy for the swipe and another
   * on landing. Community uses it so Find Players' map is not torn down and
   * made again ("Loading map…") on every trip to Discussions and back
   * (owner, Oct 19: "push 2").
   */
  keepMounted?: boolean;
  /** Only the phone's pager reads this (a held pull); a browser's pull never moves the page. */
  blocked?: SharedValue<boolean>;
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
  // keepMounted: every pane is built from the start (hidden while another is
  // on show), so the first swipe to one never builds a second copy as the
  // swipe's preview, only to build the kept one again on landing.
  const built = useRef(new Set<number>());
  if (keepMounted) panes.forEach((_pane, i) => built.current.add(i));
  // The page is moved to the landed pane's own spot before it is painted.
  const landRef = useRef(onLand);
  landRef.current = onLand;
  const landedOn = useRef(drawn);
  useLayoutEffect(() => {
    if (landedOn.current === drawn) return;
    landedOn.current = drawn;
    landRef.current?.(drawn);
  }, [drawn]);
  // The kept pane a swipe is showing beside the page, from its first move
  // until the surface is still again (null: none, every other pane hidden).
  const [beside, setBeside] = useState<number | null>(null);
  const besideFor = (direction: 1 | -1 | null) => {
    if (!keepMounted || direction === null) return;
    const next = drawnRef.current + direction;
    if (next >= 0 && next <= last && built.current.has(next)) setBeside(next);
  };
  // In the page's row, every built pane under its own key, so it is never
  // rebuilt: the one on show in its place, the others just off either side,
  // riding along with the page as it is dragged (where the swipe's preview
  // would be) and hidden, at no size, while nothing is moving.
  // Full-height kept panes (fill, Community): every pane is laid out the whole
  // time, side by side, each its own scroller at its own place. The ones not
  // on show are only hidden from view (never taken out of the layout, which
  // lost their scroll and remade the map's canvas mid-swipe), and a swipe
  // only lets the one beside the page be seen: a paint, never a layout.
  const keptRefs = useRef(new Map<number, HTMLElement | null>());
  useLayoutEffect(() => {
    if (!keepMounted || !fill) return;
    keptRefs.current.forEach((el, i) => {
      if (!el) return;
      // Hidden panes take no focus or taps (inert, where the browser has it).
      (el as HTMLElement & { inert?: boolean }).inert = i !== drawn;
    });
  });
  const filledPanes = () => (
    <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      {panes.map((pane, i) => {
        const off = i - drawn;
        const seen = i === drawn || beside === i;
        return (
          <View
            key={i}
            ref={(node: unknown) => { keptRefs.current.set(i, node as HTMLElement | null); }}
            aria-hidden={i === drawn ? undefined : true}
            pointerEvents={i === drawn ? 'auto' : 'none'}
            style={{ position: 'absolute', top: 0, bottom: 0, width: '100%', left: (off === 0 ? 0 : `calc(${off * 100}% + ${off * PAGE_GUTTER}px)`) as unknown as number, paddingHorizontal: bleed, overflow: 'hidden', visibility: seen ? 'visible' : 'hidden' } as object}
          >
            {pane}
          </View>
        );
      })}
    </View>
  );
  const keptPanes = () => (
    <View>
      {panes.map((pane, i) => {
        if (!built.current.has(i)) return null;
        if (i === drawn) return <View key={i} style={{ flex: fill ? 1 : undefined, paddingHorizontal: bleed, overflow: 'hidden' }}>{pane}</View>;
        return (
          <View
            key={i}
            aria-hidden
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, width: '100%', left: `calc(${i > drawn ? 100 : -100}% + ${i > drawn ? PAGE_GUTTER : -PAGE_GUTTER}px)` as unknown as number, paddingHorizontal: bleed, overflow: 'hidden', display: beside === i ? 'flex' : 'none' }}
          >
            {pane}
          </View>
        );
      })}
    </View>
  );
  return (
    <View style={{ alignSelf: 'stretch', marginHorizontal: -bleed, flex: fill ? 1 : undefined }}>
    <SwipeSurface
      slideRef={slide}
      fill={fill}
      gap={PAGE_GUTTER}
      commitAt={0.5}
      progress={tapSliding ? undefined : progress}
      settledKey={slideOnTap || (keepMounted && fill) ? `${drawn}:${landings}` : String(index)}
      // Here the landed pane is drawn in the same render as the key changes
      // (full-height kept panes are all there already: only which one is in place changes).
      landInPlace={slideOnTap || (keepMounted && fill)}
      delegateLeft={delegateLeft && drawn >= last}
      delegateRight={delegateRight && drawn <= 0}
      onProgress={() => { moving.current = true; }}
      onDragTo={besideFor}
      onCommit={besideFor}
      onRest={() => {
        moving.current = false;
        if (keepMounted) setBeside(null);
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
        if (!(next >= 0 && next <= last && next !== drawnRef.current)) return null;
        // A kept pane is already there beside the page: the preview is left empty.
        return keepMounted && built.current.has(next) ? <View /> : page(panes[next]);
      }}
    >
      {keepMounted && fill ? filledPanes() : keepMounted ? keptPanes() : page(panes[drawn])}
    </SwipeSurface>
    </View>
  );
}
