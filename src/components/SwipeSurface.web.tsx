import React, { useEffect, useRef, useState } from 'react';
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
export function SwipeSurface({ children, onSwipe, onCommit, onDragTo, onProgress, enabled: requestedEnabled = true, fill = true, renderPreview, delegateRight = false, delegateLeft = false }: SwipeSurfaceProps) {
  const { isPhone } = useResponsive();
  const enabled = requestedEnabled && isPhone;
  const start = useRef<{ x: number; y: number; lastX: number; time: number; velocity: number; horizontal: boolean; delegateOnly?: boolean; delegateDirection?: string | null } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previewEl = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const strip = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settling = useRef(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ onSwipe, onCommit, onDragTo, onProgress, renderPreview });
  latest.current = { onSwipe, onCommit, onDragTo, onProgress, renderPreview };

  const place = (offset: number, animate: boolean) => {
    const transition = animate ? `transform ${SETTLE_MS}ms ${EASE}` : 'none';
    if (content.current) {
      content.current.style.transition = transition;
      content.current.style.transform = `translate3d(${offset}px,0,0)`;
    }
    if (previewEl.current) {
      previewEl.current.style.transition = transition;
      previewEl.current.style.transform = `translate3d(calc(${direction * 100}% + ${offset}px),0,0)`;
    }
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!enabled) {
      clearTimeout(timer.current);
      start.current = null;
      settling.current = false;
      setDragging(false);
      place(0, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  // The preview mounts one render after the drag starts; put it in position then.
  useEffect(() => {
    if (dragging && previewEl.current && start.current) {
      previewEl.current.style.transition = 'none';
      previewEl.current.style.transform = `translate3d(calc(${direction * 100}% + ${start.current.lastX - start.current.x}px),0,0)`;
    }
  }, [dragging, direction]);

  const settle = (commit: boolean, next: 1 | -1) => {
    const width = surface.current?.clientWidth ?? 1;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    settling.current = true;
    if (commit) latest.current.onCommit?.(next);
    else latest.current.onDragTo?.(null);
    latest.current.onProgress?.(commit ? next : 0);
    place(commit ? -next * width : 0, !reduced);
    timer.current = setTimeout(() => {
      if (commit) latest.current.onSwipe(next);
      settling.current = false;
      setDragging(false);
      // One frame so the destination paints before the offset resets,
      // otherwise the outgoing page flashes back at full size.
      requestAnimationFrame(() => place(0, false));
    }, reduced ? 0 : SETTLE_MS);
  };

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
        target.closest('input,textarea,select,video,#topic-filter-strip,[data-swipe-ignore="true"]')) return;
      // A sideways strip keeps the gesture only while it has somewhere to
      // scroll; at either end the drag falls through to the page.
      strip.current = (target.closest('#who-to-follow,#stories-rail') as HTMLElement | null) ?? null;
      start.current = { x: event.clientX, y: event.clientY, lastX: event.clientX, time: performance.now(), velocity: 0, horizontal: false, delegateOnly, delegateDirection: nearest?.getAttribute("data-swipe-delegate-right") === "true" ? "right" : "left" };
    }}
    onPointerMoveCapture={event => {
      const point = start.current;
      if (!point) return;
      const dx = event.clientX - point.x;
      const dy = event.clientY - point.y;
      if (strip.current && !point.horizontal) {
        const el = strip.current;
        const canScroll = dx < 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
        if (canScroll) { start.current = null; return; }
      }
      if ((delegateRight && dx > 0) || (delegateLeft && dx < 0) || (point.delegateOnly && (point.delegateDirection === "right" ? dx < 0 : dx > 0))) { start.current = null; return; }
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
      const width = event.currentTarget.clientWidth;
      // At a boundary, provide resistance instead of revealing an empty page.
      const available = !latest.current.renderPreview || !!latest.current.renderPreview(next);
      const offset = available ? Math.max(-width, Math.min(width, dx)) : dx * 0.16;
      if (available) latest.current.onDragTo?.(next);
      latest.current.onProgress?.(-offset / width);
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
      const commit = available && (Math.abs(dx) > width * 0.36 || (Math.abs(dx) > 35 && Math.abs(velocity) > 0.5 && Math.sign(velocity) === Math.sign(dx)));
      settle(commit, next);
    }}
    onPointerCancel={() => { if (start.current?.horizontal) settle(false, direction); start.current = null; }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    <div ref={content} style={{ display: 'flex', flexDirection: 'column', flex: fill ? 1 : undefined, minHeight: 0, width: '100%', willChange: dragging ? 'transform' : undefined }}>{children}</div>
    {preview && <div ref={previewEl} aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', pointerEvents: 'none', willChange: 'transform',
      transform: `translate3d(${direction * 100}%,0,0)` }}>{preview}</div>}
  </div>;
}
