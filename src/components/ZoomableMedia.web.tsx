import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface HomeRect { x: number; y: number; width: number; height: number; radius?: number }
export interface ZoomableMediaHandle { close: () => void }

/**
 * The browser twin of ZoomableMedia. On a touch screen, a two-finger pinch
 * scales the picture around the fingers, follows them while they are down,
 * and springs back on release, as on Instagram. On a computer's trackpad a
 * pinch zooms around the pointer and stays where you leave it (a trackpad
 * never says when the fingers lift, so nothing springs back on its own);
 * sliding two fingers then moves around the picture, and pinching back out
 * or a double-click returns it to normal.
 */
export const ZoomableMedia = forwardRef<ZoomableMediaHandle, { children: React.ReactNode; onDismiss?: () => void; home?: HomeRect }>(function ZoomableMedia({ children, onDismiss }, ref) {
  useImperativeHandle(ref, () => ({ close: () => onDismiss?.() }), [onDismiss]);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const start = useRef<{ gap: number; fx: number; fy: number } | null>(null);
  // The trackpad zoom: how big, and how far the picture is moved (from centred).
  const zoom = useRef({ s: 1, x: 0, y: 0 });
  const showZoom = (animate: boolean) => {
    const el = inner.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 280ms cubic-bezier(.33,1,.68,1)' : 'none';
    el.style.transform = `translate(${zoom.current.x}px, ${zoom.current.y}px) scale(${zoom.current.s})`;
  };
  // Never past the picture's edge: at 2x the picture can move half a screen each way.
  const keepInside = () => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const z = zoom.current;
    const roomX = ((z.s - 1) * rect.width) / 2;
    const roomY = ((z.s - 1) * rect.height) / 2;
    z.x = Math.max(-roomX, Math.min(roomX, z.x));
    z.y = Math.max(-roomY, Math.min(roomY, z.y));
  };
  const resetZoom = (animate = true) => { zoom.current = { s: 1, x: 0, y: 0 }; showZoom(animate); };
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    // Added by hand with passive off: React's own wheel listener cannot stop
    // the browser from zooming the whole page on a pinch.
    const onWheel = (e: WheelEvent) => {
      const rect = node.getBoundingClientRect();
      const z = zoom.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Zoom around the pointer: the spot under it stays under it.
        const px = e.clientX - rect.left - rect.width / 2;
        const py = e.clientY - rect.top - rect.height / 2;
        const next = Math.max(1, Math.min(4, z.s * Math.exp(-e.deltaY * 0.01)));
        const k = next / z.s;
        z.x = px - k * (px - z.x);
        z.y = py - k * (py - z.y);
        z.s = next;
        if (z.s <= 1.01) { resetZoom(true); return; }
        keepInside();
        showZoom(false);
        return;
      }
      // Two fingers sliding while zoomed in move around the picture.
      if (z.s > 1.01) {
        e.preventDefault();
        z.x -= e.deltaX;
        z.y -= e.deltaY;
        keepInside();
        showZoom(false);
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (zoom.current.s !== 1) zoom.current = { s: 1, x: 0, y: 0 };
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
      // A double-click puts a zoomed picture back to normal.
      onDoubleClick={(e) => { if (zoom.current.s > 1.01) { e.stopPropagation(); resetZoom(true); } }}
    >
      <div ref={inner} style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  );
});
