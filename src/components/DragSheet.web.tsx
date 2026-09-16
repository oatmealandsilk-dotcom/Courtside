import React, { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

const EASE = 'cubic-bezier(.22,.61,.36,1)';
const OPEN_MS = 320;
const SETTLE_MS = 220;
/** Faster than this, in px per ms, and a drag counts as a flick regardless of distance. */
const FLICK = 0.7;

/**
 * The web twin of DragSheet: same two resting places (fully open, or gone),
 * same starting height, built on plain pointer events and direct DOM writes
 * while dragging rather than component state, the way every other drag
 * surface in this app is done on the web — state per frame is what made
 * earlier swipes stutter.
 */
export function DragSheet({
  header,
  children,
  onDismissed,
  peekFraction = 0.66,
  closeSignal = 0,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onDismissed: () => void;
  peekFraction?: number;
  /** Bump this number to close the sheet from outside (a Close button, a finished send). */
  closeSignal?: number;
}) {
  const insets = useSafeAreaInsets();
  const area = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);
  const geometry = useRef({ fullHeight: 1, openOffset: 0 });
  /** The sheet's current translateY, kept here so a drag can start from wherever it sits. */
  const current = useRef(0);
  const drag = useRef<{ startY: number; originY: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null>(null);

  /**
   * Moves the sheet (and dims the backdrop to match); 0 ms means "follow the
   * finger, no easing". The sheet is a card of height (fullHeight − y) pinned
   * to the bottom edge, not a full card slid down, so the bottom of its body
   * — a comment box, a send button — is always on screen.
   */
  const place = (y: number, ms: number) => {
    current.current = y;
    const transition = ms ? `${ms}ms ${EASE}` : 'none';
    if (sheet.current) {
      sheet.current.style.transition = ms ? `height ${transition}` : 'none';
      sheet.current.style.height = `${Math.max(0, geometry.current.fullHeight - y)}px`;
    }
    if (backdrop.current) {
      backdrop.current.style.transition = ms ? `opacity ${transition}` : 'none';
      backdrop.current.style.opacity = String(Math.max(0, 1 - y / Math.max(1, geometry.current.fullHeight)));
    }
  };

  useEffect(() => {
    const measure = () => {
      // The area the sheet lives in: the page above the tab bar, not the whole window.
      const vh = area.current?.clientHeight || window.innerHeight;
      // A sliver of the page behind stays visible even fully open — the
      // depth cue Apple's own card sheets use instead of ever truly covering the screen.
      const fullHeight = Math.max(1, vh - insets.top - 20);
      const peekHeight = Math.min(fullHeight, Math.round(vh * peekFraction));
      geometry.current = { fullHeight, openOffset: fullHeight - peekHeight };
    };
    measure();
    place(geometry.current.fullHeight, 0);
    // One frame so the opening slide is seen rather than starting already open.
    const frame = requestAnimationFrame(() => place(geometry.current.openOffset, OPEN_MS));
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismissed();
  };
  const close = () => {
    place(geometry.current.fullHeight, SETTLE_MS);
    window.setTimeout(finish, SETTLE_MS + 20);
  };
  const openFull = () => place(0, SETTLE_MS);
  const returnTo = (y: number) => place(y, SETTLE_MS);
  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    drag.current = { startY: event.clientY, originY: current.current, lastY: event.clientY, lastT: performance.now(), velocity: 0, moved: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.startY;
    // A tap on something inside the header (the close button) must stay a
    // tap: nothing is treated as a drag until the finger has clearly moved.
    if (!d.moved) {
      if (Math.abs(dy) < 6) return;
      d.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    const now = performance.now();
    d.velocity = (event.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = event.clientY;
    d.lastT = now;
    place(Math.max(0, Math.min(geometry.current.fullHeight, d.originY + dy)), 0);
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    event.preventDefault();
    const { fullHeight } = geometry.current;
    const travelled = current.current - d.originY;
    // Velocity only counts if the finger was still moving when it lifted.
    const velocity = performance.now() - d.lastT < 120 ? d.velocity : 0;
    if (velocity > FLICK || (travelled > 0 && travelled > (fullHeight - d.originY) * 0.32)) close();
    else if (velocity < -FLICK || (travelled < 0 && Math.abs(travelled) > d.originY * 0.32)) openFull();
    else returnTo(d.originY);
  };

  return (
    <div ref={area} style={{ position: 'absolute', inset: 0 }}>
      <div ref={backdrop} style={{ position: 'absolute', inset: 0, backgroundColor: colors.overlay, opacity: 0 }} />
      <div role="button" aria-label="Close" tabIndex={-1} onClick={close} style={{ position: 'absolute', inset: 0 }} />
      <div
        ref={sheet}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          backgroundColor: colors.bg,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 -10px 28px rgba(0,0,0,0.28)',
          display: 'flex', flexDirection: 'column',
          // Starts with no height; the mount effect grows it up.
          height: 0,
        }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10, touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center' }} />
          {header}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  );
}
