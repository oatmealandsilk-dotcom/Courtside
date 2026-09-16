import React, { useRef } from 'react';

/**
 * The browser twin of PinchZone: two-finger pinch on a touch screen, or a
 * trackpad pinch (which arrives as a wheel with Ctrl held) on a computer.
 */
export function PinchZone({ children, onPinchOut, onPinchIn }: {
  children: React.ReactNode;
  onPinchOut: () => void;
  onPinchIn: () => void;
}) {
  const start = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });
  /** Places the picture: grown around the fingers and moved with them, or (scale 1) back where it was. */
  const place = (scale: number, driftX: number, driftY: number, animate: boolean) => {
    const el = inner.current;
    const rect = box.current?.getBoundingClientRect();
    if (!el || !rect) return;
    const dx = (origin.current.x - rect.width / 2) * (1 - scale) + driftX;
    const dy = (origin.current.y - rect.height / 2) * (1 - scale) + driftY;
    el.style.transition = animate ? 'transform 300ms cubic-bezier(.33,1,.68,1)' : 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  };
  const mid = (t: React.TouchList) => {
    const rect = box.current?.getBoundingClientRect();
    return { x: (t[0].clientX + t[1].clientX) / 2 - (rect?.left ?? 0), y: (t[0].clientY + t[1].clientY) / 2 - (rect?.top ?? 0) };
  };
  const wheelSum = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gap = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  return (
    <div
      ref={box}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
      onTouchStart={(e) => { if (e.touches.length === 2) { start.current = gap(e.touches); last.current = start.current; origin.current = mid(e.touches); } }}
      onTouchMove={(e) => {
        if (e.touches.length !== 2 || start.current === null) return;
        last.current = gap(e.touches);
        const m = mid(e.touches);
        place(Math.max(0.8, Math.min(4, last.current / Math.max(1, start.current))), m.x - origin.current.x, m.y - origin.current.y, false);
      }}
      onTouchEnd={() => {
        if (start.current !== null && last.current !== null) {
          const scale = last.current / Math.max(1, start.current);
          place(1, 0, 0, true);
          if (scale > 1.18) onPinchOut(); else if (scale < 0.85) onPinchIn();
        }
        start.current = null; last.current = null;
      }}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        // A trackpad pinch is a burst of small wheel events; add them up and
        // decide once the burst ends.
        wheelSum.current += e.deltaY;
        if (wheelTimer.current) clearTimeout(wheelTimer.current);
        wheelTimer.current = setTimeout(() => {
          if (wheelSum.current < -40) onPinchOut(); else if (wheelSum.current > 40) onPinchIn();
          wheelSum.current = 0;
        }, 120);
      }}
    >
      <div ref={inner} style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  );
}
