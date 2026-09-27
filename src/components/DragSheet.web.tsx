import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { Wash } from '@/components/Wash';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { setSidePanel } from '@/features/feed/sidePanel';

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
  fitContent = false,
  side = false,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onDismissed: () => void;
  peekFraction?: number;
  /** Bump this number to close the sheet from outside (a Close button, a finished send). */
  closeSignal?: number;
  /** On a computer, size the box to its contents (a short form) rather than a fixed height (a list). */
  fitContent?: boolean;
  /** On a wide computer screen, dock to the right instead of covering the middle, so what it is about stays in view. */
  side?: boolean;
}) {
  // On a computer a bottom sheet stretched across a wide window looks lost;
  // there it is a centred box instead, the way Instagram's dialogs are.
  const dialog = typeof window !== 'undefined' && isDesktopBrowser() && window.innerWidth >= 700;
  if (dialog && side && window.innerWidth >= SIDE_MIN_WINDOW) return <SidePanel header={header} onDismissed={onDismissed} closeSignal={closeSignal}>{children}</SidePanel>;
  if (dialog) return <DialogBox header={header} onDismissed={onDismissed} closeSignal={closeSignal} fitContent={fitContent}>{children}</DialogBox>;
  return <Sheet header={header} onDismissed={onDismissed} peekFraction={peekFraction} closeSignal={closeSignal}>{children}</Sheet>;
}

const SIDE_WIDTH = 420;
const SIDE_GAP = 12;
/** Below this the clip and a docked panel don't both fit, so the centred box is used instead. */
const SIDE_MIN_WINDOW = 1100;

/**
 * Comments on a wide computer screen: a panel docked to the right, like
 * TikTok's, with nothing dimmed or blurred, so the clip stays in view and
 * keeps playing. Home hears the panel's width and slides the clip left to
 * sit beside it. A click anywhere outside the panel, or Escape, closes it.
 */
function SidePanel({ header, children, onDismissed, closeSignal }: { header: React.ReactNode; children: React.ReactNode; onDismissed: () => void; closeSignal: number }) {
  useTheme();
  const panel = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    setSidePanel(SIDE_WIDTH + SIDE_GAP);
    panel.current?.animate([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 280, easing: EASE });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); setSidePanel(0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    if (done.current) return;
    done.current = true;
    setSidePanel(0);
    const out = panel.current?.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(28px)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    if (out) out.onfinish = () => onDismissed(); else onDismissed();
  };
  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div onClick={close} role="button" aria-label="Close comments" tabIndex={-1} style={{ position: 'absolute', inset: 0 }} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="false"
        style={{
          position: 'absolute', top: SIDE_GAP, bottom: SIDE_GAP, right: SIDE_GAP, width: SIDE_WIDTH,
          backgroundColor: colors.bg,
          // The page behind is the same colour, and on a dark court the shadow all but vanishes: a faint edge keeps it a panel.
          border: `1px solid ${colors.border}`,
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0 18px 50px rgba(0,0,0,0.22), 0 4px 14px rgba(0,0,0,0.10)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <Wash height={300} strength={0.85} />
        <div style={{ position: 'relative', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>{header}</div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  );
}

/** The centred box a sheet becomes on a computer: fades and settles in, dims and blurs what is behind. */
function DialogBox({ header, children, onDismissed, closeSignal, fitContent }: { header: React.ReactNode; children: React.ReactNode; onDismissed: () => void; closeSignal: number; fitContent: boolean }) {
  useTheme();
  const box = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    box.current?.animate([{ opacity: 0, transform: 'translate(-50%, calc(-50% + 10px)) scale(0.97)' }, { opacity: 1, transform: 'translate(-50%, -50%)' }], { duration: 240, easing: EASE });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    if (done.current) return;
    done.current = true;
    box.current?.animate([{ opacity: 1, transform: 'translate(-50%, -50%)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(0.97)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    const out = backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    if (out) out.onfinish = () => onDismissed(); else onDismissed();
  };
  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={backdrop} onClick={close} role="button" aria-label="Close" tabIndex={-1}
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.overlay, backdropFilter: 'blur(10px) saturate(0.8)', WebkitBackdropFilter: 'blur(10px) saturate(0.8)' } as React.CSSProperties} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(520px, calc(100% - 48px))',
          ...(fitContent ? { maxHeight: 'min(80vh, 720px)' } : { height: 'min(78vh, 680px)' }),
          backgroundColor: colors.bg,
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.28), 0 4px 14px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <Wash height={300} strength={0.85} />
        <div style={{ position: 'relative', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>{header}</div>
        <div style={{ position: 'relative', flex: fitContent ? '0 1 auto' : 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: fitContent ? 'auto' : undefined }}>{children}</div>
      </div>
    </div>
  );
}

/** The phone's pull-up sheet. */
function Sheet({
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
  closeSignal?: number;
}) {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
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
    // A phone's keyboard shrinks the visible area without a window resize; the sheet re-measures and keeps its box above it.
    const vv = window.visualViewport;
    const onViewport = () => { measure(); place(0, 160); };
    vv?.addEventListener('resize', onViewport);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', measure); vv?.removeEventListener('resize', onViewport); };
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
        <Wash height={300} strength={0.85} />
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ position: 'relative', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10, touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center' }} />
          {header}
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  );
}
