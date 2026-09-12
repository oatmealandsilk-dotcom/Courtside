import React, { useEffect, useRef, useState } from 'react';
import { useResponsive } from '@/lib/useResponsive';

export interface SwipeSurfaceProps {
  children: React.ReactNode;
  onSwipe: (direction: 1 | -1) => void;
  enabled?: boolean;
  fill?: boolean;
  delegateRight?: boolean;
  delegateLeft?: boolean;
  renderPreview?: (direction: 1 | -1) => React.ReactNode;
}

export function SwipeSurface({ children, onSwipe, enabled: requestedEnabled = true, fill = true, renderPreview, delegateRight = false, delegateLeft = false }: SwipeSurfaceProps) {
  const { isPhone } = useResponsive();
  const enabled = requestedEnabled && isPhone;
  const start = useRef<{ x: number; y: number; lastX: number; time: number; velocity: number; horizontal: boolean; delegateOnly?: boolean; delegateDirection?: string | null } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [settling, setSettling] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!enabled) {
      clearTimeout(timer.current);
      start.current = null;
      setOffset(0);
      setSettling(false);
    }
  }, [enabled]);
  const settle = (commit: boolean, next: 1 | -1) => {
    const width = surface.current?.clientWidth ?? 1;
    setSettling(true);
    setOffset(commit ? -next * width : 0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => {
      if (commit) onSwipe(next);
      setSettling(false);
      setOffset(0);
    }, reduced ? 0 : 320);
  };
  const preview = offset ? renderPreview?.(direction) : null;
  const transition = settling ? 'transform 320ms cubic-bezier(.22,.78,.22,1)' : 'none';
  return <div ref={surface} data-swipe-delegate-right={delegateRight ? "true" : undefined} data-swipe-delegate-left={delegateLeft ? "true" : undefined} data-swipe-surface={enabled ? 'true' : undefined}
    style={{ display: 'flex', flexDirection: 'column', flex: fill ? 1 : undefined, minWidth: 0, minHeight: 0,
      position: 'relative', overflow: 'hidden', touchAction: enabled ? 'pan-y' : 'auto', userSelect: enabled ? 'none' : 'auto' }}
    onPointerDownCapture={event => {
      suppressClick.current = false;
      if (!enabled || settling || !event.isPrimary || event.button !== 0) return;
      const target = event.target as HTMLElement;
      const nearest = target.closest('[data-swipe-surface="true"]');
      const delegateOnly = nearest !== event.currentTarget;
      if ((delegateOnly && nearest?.getAttribute('data-swipe-delegate-right') !== 'true' && nearest?.getAttribute('data-swipe-delegate-left') !== 'true') ||
        target.closest('input,textarea,select,video,#topic-filter-strip,#who-to-follow,[data-swipe-ignore="true"]')) return;
      start.current = { x: event.clientX, y: event.clientY, lastX: event.clientX, time: performance.now(), velocity: 0, horizontal: false, delegateOnly, delegateDirection: nearest?.getAttribute("data-swipe-delegate-right") === "true" ? "right" : "left" };
    }}
    onPointerMoveCapture={event => {
      const point = start.current;
      if (!point) return;
      const dx = event.clientX - point.x;
      const dy = event.clientY - point.y;
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
      setDirection(next);
      const width = event.currentTarget.clientWidth;
      // At a boundary, provide resistance instead of revealing an empty page.
      const available = !renderPreview || !!renderPreview(next);
      setOffset(available ? Math.max(-width, Math.min(width, dx)) : dx * 0.16);
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
      const available = !renderPreview || !!renderPreview(next);
      const velocity = performance.now() - point.time < 100 ? point.velocity : 0;
      const commit = available && (Math.abs(dx) > width * 0.36 || (Math.abs(dx) > 35 && Math.abs(velocity) > 0.5 && Math.sign(velocity) === Math.sign(dx)));
      settle(commit, next);
    }}
    onPointerCancel={() => { start.current = null; settle(false, direction); }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    <div style={{ display: 'flex', flexDirection: 'column', flex: fill ? 1 : undefined, minHeight: 0, width: '100%',
      transform: `translate3d(${offset}px,0,0)`, transition }}>{children}</div>
    {preview && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', pointerEvents: 'none',
      transform: `translate3d(calc(${direction * 100}% + ${offset}px),0,0)`, transition }}>{preview}</div>}
  </div>;
}
