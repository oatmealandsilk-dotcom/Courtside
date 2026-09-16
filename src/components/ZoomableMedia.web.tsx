import React, { forwardRef, useImperativeHandle, useRef } from 'react';

export interface HomeRect { x: number; y: number; width: number; height: number; radius?: number }
export interface ZoomableMediaHandle { close: () => void }

/**
 * The browser twin of ZoomableMedia: two-finger pinch on a touch screen or a
 * trackpad pinch on a computer scales the picture around the fingers, follows
 * them while they are down, and springs back on release.
 */
export const ZoomableMedia = forwardRef<ZoomableMediaHandle, { children: React.ReactNode; onDismiss?: () => void; home?: HomeRect }>(function ZoomableMedia({ children, onDismiss }, ref) {
  useImperativeHandle(ref, () => ({ close: () => onDismiss?.() }), [onDismiss]);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const start = useRef<{ gap: number; fx: number; fy: number } | null>(null);
  const wheelScale = useRef(1);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drag = useRef<{ x: number; y: number } | null>(null);
  const place = (scale: number, fx: number, fy: number, animate: boolean, driftX = 0, driftY = 0) => {
    const el = inner.current;
    const rect = box.current?.getBoundingClientRect();
    if (!el || !rect) return;
    const dx = (fx - rect.width / 2) * (1 - scale) + driftX;
    const dy = (fy - rect.height / 2) * (1 - scale) + driftY;
    // Snaps back in one quick move — no overshoot.
    el.style.transition = animate ? 'transform 320ms cubic-bezier(.33,1,.68,1)' : 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  };
  const gap = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t: React.TouchList) => {
    const rect = box.current?.getBoundingClientRect();
    return { x: (t[0].clientX + t[1].clientX) / 2 - (rect?.left ?? 0), y: (t[0].clientY + t[1].clientY) / 2 - (rect?.top ?? 0) };
  };

  return (
    <div
      ref={box}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', backgroundColor: '#000' }}
      // Every touch stops here: the viewer sits over the feed, and a flick
      // that bubbled through would swipe the page out from under it.
      onTouchStart={(e) => {
        e.stopPropagation();
        if (e.touches.length === 2) { const m = mid(e.touches); start.current = { gap: gap(e.touches), fx: m.x, fy: m.y }; drag.current = null; }
        else if (e.touches.length === 1) drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        const s = start.current;
        if (s && e.touches.length === 2) {
          e.preventDefault();
          // The picture rides with the fingers: their midpoint's travel since
          // the pinch began is added on top of the zoom.
          const m = mid(e.touches);
          place(Math.max(1, Math.min(4, gap(e.touches) / Math.max(1, s.gap))), s.fx, s.fy, false, m.x - s.fx, m.y - s.fy);
          return;
        }
        const d = drag.current;
        if (d && e.touches.length === 1) {
          e.preventDefault();
          const rect = box.current?.getBoundingClientRect();
          const dx = e.touches[0].clientX - d.x;
          const dy = e.touches[0].clientY - d.y;
          const sideways = onDismiss && Math.abs(dx) > Math.abs(dy) * 0.7;
          place(1, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, false, sideways ? dx : dx * 0.35, sideways ? dy * 0.5 : dy * 0.35);
          if (box.current) { box.current.style.transition = 'none'; box.current.style.backgroundColor = sideways ? `rgba(0,0,0,${1 - Math.min(1, Math.abs(dx) / ((rect?.width ?? 400) * 0.7)) * 0.9})` : '#000'; }
        }
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        const s = start.current; start.current = null;
        const d = drag.current; drag.current = null;
        const rect = box.current?.getBoundingClientRect();
        const t = e.changedTouches[0];
        // One finger, swiped sideways (a bit of diagonal is fine) with nothing zoomed: close.
        if (!s && d && t && onDismiss && Math.abs(t.clientX - d.x) > 90 && Math.abs(t.clientX - d.x) > Math.abs(t.clientY - d.y) * 0.7) {
          const el = inner.current;
          const dir = t.clientX - d.x >= 0 ? 1 : -1;
          if (el && rect) {
            el.style.transition = 'transform 240ms cubic-bezier(.33,1,.68,1), opacity 220ms ease-out';
            el.style.transform = `translate(${dir * rect.width * 1.1}px, ${(t.clientY - d.y) * 1.3}px)`;
            el.style.opacity = '0.35';
          }
          if (box.current) { box.current.style.transition = 'background-color 220ms ease-out'; box.current.style.backgroundColor = 'rgba(0,0,0,0)'; }
          setTimeout(onDismiss, 230);
          return;
        }
        if (s) place(1, s.fx, s.fy, true); else place(1, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, true);
        if (box.current) { box.current.style.transition = 'background-color 300ms ease-out'; box.current.style.backgroundColor = '#000'; }
      }}
      onTouchCancel={(e) => { e.stopPropagation(); start.current = null; drag.current = null; }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const rect = box.current?.getBoundingClientRect();
        const fx = e.clientX - (rect?.left ?? 0);
        const fy = e.clientY - (rect?.top ?? 0);
        wheelScale.current = Math.max(1, Math.min(4, wheelScale.current * Math.exp(-e.deltaY * 0.01)));
        place(wheelScale.current, fx, fy, false);
        if (wheelTimer.current) clearTimeout(wheelTimer.current);
        wheelTimer.current = setTimeout(() => { wheelScale.current = 1; place(1, fx, fy, true); }, 160);
      }}
    >
      <div ref={inner} style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  );
});
