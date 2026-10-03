import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { withTiming, type SharedValue } from 'react-native-reanimated';
import { useResponsive } from '@/lib/useResponsive';

export interface SwipeSurfaceProps {
  children: React.ReactNode;
  onSwipe: (direction: 1 | -1) => void;
  /** Fires the instant the gesture is known to be going through, before the animation. */
  onCommit?: (direction: 1 | -1) => void;
  /** Fires while the finger is still down, or with null when the drag is abandoned. */
  onDragTo?: (direction: 1 | -1 | null) => void;
  /**
   * How far across the page the finger has dragged, -1..1, positive toward
   * the next page. Fires on every move and on the settle, so a tab underline
   * can travel with the content instead of jumping when navigation lands.
   */
  onProgress?: (fraction: number) => void;
  enabled?: boolean;
  fill?: boolean;
  delegateRight?: boolean;
  delegateLeft?: boolean;
  renderPreview?: (direction: 1 | -1) => React.ReactNode;
  /** Changes once the destination has rendered; the old page is held until then. */
  settledKey?: string;
  /** Written as the finger moves: -1..1 toward the next page. */
  progress?: SharedValue<number>;
  /**
   * Filled in with a way to turn the page from code (the tutorial, through
   * pageSlide): the same preview and the same settle as a released swipe.
   * It answers false when it can't right now (mid-swipe, no page that way,
   * the layout has no swipe).
   */
  slideRef?: React.MutableRefObject<((direction: 1 | -1) => boolean) | null>;
  /**
   * Fires once the surface is still again: a swipe or a turn from code has
   * landed or sprung back, or the layout lost its swipe part way. A turn
   * asked for while it was moving (slideRef answered false) can be asked again now.
   */
  onRest?: () => void;
  /**
   * The destination is drawn in the very render that changes `settledKey`
   * (a section of a page, not a route that arrives a beat later), so the page
   * is put back in place before that render is painted. Waiting a frame left
   * one empty frame on every landing.
   */
  landInPlace?: boolean;
  /** Points of page background between the page and the one sliding in beside it. */
  gap?: number;
  /** How far across (0..1) a slow drag must go before letting go turns the page. */
  commitAt?: number;
}

const SETTLE_MS = 300;
const EASE = 'cubic-bezier(.22,.61,.36,1)';

/**
 * Drag-to-swipe between pages on the web.
 *
 * The moving parts are positioned straight on the DOM while the finger is
 * down — React only hears about the gesture when it starts (to mount the
 * preview) and when it ends. Routing every pointer move through state meant
 * re-rendering the whole page per frame, which is what made swipes stutter.
 */
export function SwipeSurface({ children, onSwipe, onCommit, onDragTo, onProgress, enabled: requestedEnabled = true, fill = true, renderPreview, delegateRight = false, delegateLeft = false, settledKey, progress, slideRef, onRest, landInPlace = false, gap = 0, commitAt = 0.28 }: SwipeSurfaceProps) {
  const { isPhone } = useResponsive();
  const enabled = requestedEnabled && isPhone;
  const start = useRef<{ x: number; y: number; lastX: number; time: number; velocity: number; horizontal: boolean; delegateOnly?: boolean; delegateDirection?: string | null } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previewEl = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settling = useRef(false);
  /** A page turn asked for by code, waiting one render for its preview. */
  const queued = useRef<1 | -1 | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ onSwipe, onCommit, onDragTo, onProgress, renderPreview, onRest });
  latest.current = { onSwipe, onCommit, onDragTo, onProgress, renderPreview, onRest };

  const place = (offset: number, animate: boolean) => {
    const transition = animate ? `transform ${SETTLE_MS}ms ${EASE}` : 'none';
    if (content.current) {
      content.current.style.transition = transition;
      content.current.style.transform = `translate3d(${offset}px,0,0)`;
    }
    if (previewEl.current) {
      previewEl.current.style.transition = transition;
      previewEl.current.style.transform = `translate3d(calc(${direction * 100}% + ${direction * gap + offset}px),0,0)`;
    }
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!enabled) {
      clearTimeout(timer.current);
      start.current = null;
      settling.current = false;
      queued.current = null;
      setDragging(false);
      place(0, false);
      latest.current.onRest?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  // The preview mounts one render after the drag starts; put it in position then.
  useEffect(() => {
    if (dragging && previewEl.current && start.current) {
      previewEl.current.style.transition = 'none';
      previewEl.current.style.transform = `translate3d(calc(${direction * 100}% + ${direction * gap + start.current.lastX - start.current.x}px),0,0)`;
    }
  }, [dragging, direction]);

  const settle = (commit: boolean, next: 1 | -1) => {
    const width = surface.current?.clientWidth ?? 1;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    settling.current = true;
    if (commit) latest.current.onCommit?.(next);
    else latest.current.onDragTo?.(null);
    latest.current.onProgress?.(commit ? next : 0);
    if (progress) progress.value = withTiming(commit ? next : 0, { duration: reduced ? 0 : SETTLE_MS });
    place(commit ? -next * (width + gap) : 0, !reduced);
    timer.current = setTimeout(() => {
      if (!commit) return release();
      latest.current.onSwipe(next);
      // Hold until the destination has rendered (settledKey changes), with a
      // ceiling so a page that never changes the key still lets go.
      awaiting.current = setTimeout(() => { awaiting.current = null; release(); }, 700);
    }, reduced ? 0 : SETTLE_MS);
  };
  const release = () => {
    settling.current = false;
    setDragging(false);
    requestAnimationFrame(() => place(0, false));
    latest.current.onRest?.();
  };
  const awaiting = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (landInPlace || !awaiting.current) return;
    clearTimeout(awaiting.current);
    awaiting.current = null;
    release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledKey]);
  // The same, before paint and with no frame's wait (see landInPlace).
  useLayoutEffect(() => {
    if (!landInPlace || !awaiting.current) return;
    clearTimeout(awaiting.current);
    awaiting.current = null;
    settling.current = false;
    setDragging(false);
    place(0, false);
    latest.current.onRest?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledKey]);

  // A page turn asked for by code: the preview is put beside the page the
  // way a drag puts it, then the one settle a released swipe gets.
  useEffect(() => {
    if (!slideRef) return undefined;
    slideRef.current = (next) => {
      if (!enabled || settling.current || start.current) return false;
      if (latest.current.renderPreview && !latest.current.renderPreview(next)) return false;
      settling.current = true;
      queued.current = next;
      setDirection(next);
      setDragging(true);
      return true;
    };
    return () => { slideRef.current = null; };
  });
  useEffect(() => {
    const next = queued.current;
    if (!dragging || next === null || next !== direction) return undefined;
    // One frame for the preview to be drawn beside the page, then away.
    const frame = requestAnimationFrame(() => {
      queued.current = null;
      // Read once so the browser has the preview's starting place before the slide begins.
      void previewEl.current?.offsetWidth;
      settle(true, next);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, direction]);

  const preview = dragging ? renderPreview?.(direction) : null;
  return <div ref={surface} data-swipe-delegate-right={delegateRight ? "true" : undefined} data-swipe-delegate-left={delegateLeft ? "true" : undefined} data-swipe-surface={enabled ? 'true' : undefined}
    style={{ display: 'flex', flexDirection: 'column', flex: fill ? 1 : undefined, minWidth: 0, minHeight: 0,
      position: 'relative', overflow: 'hidden', touchAction: enabled ? 'pan-y' : 'auto', userSelect: enabled ? 'none' : 'auto' }}
    onPointerDownCapture={event => {
      suppressClick.current = false;
      if (!enabled || settling.current || !event.isPrimary || event.button !== 0) return;
      const target = event.target as HTMLElement;
      const nearest = target.closest('[data-swipe-surface="true"]');
      const delegateOnly = nearest !== event.currentTarget;
      if ((delegateOnly && nearest?.getAttribute('data-swipe-delegate-right') !== 'true' && nearest?.getAttribute('data-swipe-delegate-left') !== 'true') ||
        // Sideways strips are their own thing: a drag on them never turns the page,
        // not even at their ends — that is how people ended up in Community by accident.
        target.closest('input,textarea,select,video,#topic-filter-strip,#who-to-follow,#stories-rail,#courts-near-strip,[data-swipe-ignore="true"]')) return;
      start.current = { x: event.clientX, y: event.clientY, lastX: event.clientX, time: performance.now(), velocity: 0, horizontal: false, delegateOnly, delegateDirection: nearest?.getAttribute("data-swipe-delegate-right") === "true" ? "right" : "left" };
    }}
    onPointerMoveCapture={event => {
      const point = start.current;
      if (!point) return;
      const dx = event.clientX - point.x;
      const dy = event.clientY - point.y;
      if ((delegateRight && dx > 0) || (delegateLeft && dx < 0) || (point.delegateOnly && (point.delegateDirection === "right" ? dx < 0 : dx > 0))) {
        start.current = null;
        // A drag that had already taken the page and then turned back past
        // where it began is let go: the page springs back and the surface is
        // still again. Simply dropped, it stayed where the finger left it, and
        // a page that waits for its swipe to finish (Archive's tabs) never moved again.
        if (point.horizontal) { suppressClick.current = true; settle(false, direction); }
        return;
      }
      if (!point.horizontal) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start.current = null; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        point.horizontal = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      const now = performance.now();
      point.velocity = (event.clientX - point.lastX) / Math.max(1, now - point.time);
      point.lastX = event.clientX;
      point.time = now;
      const next = dx < 0 ? 1 : -1;
      // One page along: the page's width and the gap beside it.
      const span = event.currentTarget.clientWidth + gap;
      // At a boundary, provide resistance instead of revealing an empty page.
      const available = !latest.current.renderPreview || !!latest.current.renderPreview(next);
      const offset = available ? Math.max(-span, Math.min(span, dx)) : dx * 0.16;
      if (available) latest.current.onDragTo?.(next);
      latest.current.onProgress?.(-offset / span);
      if (progress) progress.value = -offset / span;
      setDirection(next);
      setDragging(true);
      place(offset, false);
    }}
    onPointerUpCapture={event => {
      const point = start.current;
      start.current = null;
      if (!point?.horizontal) return;
      suppressClick.current = true;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - point.x;
      const next = dx < 0 ? 1 : -1;
      const width = event.currentTarget.clientWidth;
      const available = !latest.current.renderPreview || !!latest.current.renderPreview(next);
      const velocity = performance.now() - point.time < 100 ? point.velocity : 0;
      const commit = available && (Math.abs(dx) > width * commitAt || (Math.abs(dx) > 35 && Math.abs(velocity) > 0.5 && Math.sign(velocity) === Math.sign(dx)));
      settle(commit, next);
    }}
    onPointerCancel={() => { if (start.current?.horizontal) settle(false, direction); start.current = null; }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    <div ref={content} style={{ display: 'flex', flexDirection: 'column', flex: fill ? 1 : undefined, minHeight: 0, width: '100%', willChange: dragging ? 'transform' : undefined }}>{children}</div>
    {preview && <div ref={previewEl} aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', pointerEvents: 'none', willChange: 'transform',
      transform: `translate3d(calc(${direction * 100}% + ${direction * gap}px),0,0)` }}>{preview}</div>}
  </div>;
}
