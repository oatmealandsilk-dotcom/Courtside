import React, { useRef } from 'react';

/**
 * The browser twin of ZoomableMedia: two-finger pinch on a touch screen or a
 * trackpad pinch on a computer scales the picture around the fingers, follows
 * them while they are down, and springs back on release.
 */
export function ZoomableMedia({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const start = useRef<{ gap: number; fx: number; fy: number } | null>(null);
  const wheelScale = useRef(1);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = (scale: number, fx: number, fy: number, animate: boolean, driftX = 0, driftY = 0) => {
    const el = inner.current;
    const rect = box.current?.getBoundingClientRect();
    if (!el || !rect) return;
    const dx = (fx - rect.width / 2) * (1 - scale) + driftX;
    const dy = (fy - rect.height / 2) * (1 - scale) + driftY;
    el.style.transition = animate ? 'transform 380ms cubic-bezier(.2,.9,.3,1.15)' : 'none';
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
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={(e) => { if (e.touches.length === 2) { const m = mid(e.touches); start.current = { gap: gap(e.touches), fx: m.x, fy: m.y }; } }}
      onTouchMove={(e) => {
        const s = start.current;
        if (!s || e.touches.length !== 2) return;
        e.preventDefault();
        // The picture rides with the fingers: their midpoint's travel since
        // the pinch began is added on top of the zoom.
        const m = mid(e.touches);
        place(Math.max(1, Math.min(4, gap(e.touches) / Math.max(1, s.gap))), s.fx, s.fy, false, m.x - s.fx, m.y - s.fy);
      }}
      onTouchEnd={() => { const s = start.current; start.current = null; if (s) place(1, s.fx, s.fy, true); }}
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
}
