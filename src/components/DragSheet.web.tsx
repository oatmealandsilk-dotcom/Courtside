import { useTheme } from '@/theme/ThemeProvider';
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { Wash } from '@/components/Wash';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { setSidePanel } from '@/features/feed/sidePanel';
import { CLOSE_MS, OPEN_MS_WEB, SIDE_MIN_WINDOW, SNAP_MS_WEB, currentY, getStage, glideSamples, onFrame, place as stagePlace, setFull, subscribe as onStageChange, type StageGeo } from '@/features/feed/commentStage';

const EASE = 'cubic-bezier(.22,.61,.36,1)';
/** Apple's own sheet curve: a fast start that glides to rest, the web's stand-in for the phone's spring. */
const SHEET_CURVE = 'cubic-bezier(.32,.72,0,1)';
const OPEN_MS = 380;
const SETTLE_MS = 220;
/** Faster than this, in px per ms, and a drag counts as a flick regardless of distance. */
const FLICK = 0.7;

/** The phone's sheet has a drag for a list inside it to hand a pull over to; a browser's list keeps its own scroll. */
export interface SheetDrag { start: () => void; to: (translationY: number) => void; release: (velocityY: number) => void }
const DragSheetContext = createContext<SheetDrag | null>(null);
export const useSheetDrag = () => useContext(DragSheetContext);

/**
 * Escape closes whichever sheet is up, with its own animation, and goes no
 * further, so the shell's own Escape (a plain step back) never closes the
 * page a second time. Heard on the document on the way in: a confirm card
 * over the sheet, which listens on the window before it, still gets it first.
 * Only while the sheet's page is the one in front (`enabled`): with a page
 * opened over it (a profile, Send to), Escape is that page's.
 */
function useEscape(close: () => void, { notWhileTyping = false, enabled = true } = {}) {
  const latest = useRef(close);
  latest.current = close;
  const on = useRef(enabled);
  on.current = enabled;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !on.current) return;
      // A phone's plain sheet keeps the shell's old rule: Escape in a box is the box's own.
      const t = e.target as HTMLElement | null;
      if (notWhileTyping && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}

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
  contentHeight,
  side = false,
  onSettled,
  stage,
  stageOverlay,
  active = true,
  beforeClose,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onDismissed: () => void;
  peekFraction?: number;
  /** Whether the sheet's page is the one in front; Escape closes it only then. */
  active?: boolean;
  /** Bump this number to close the sheet from outside (a Close button, a finished send). */
  closeSignal?: number;
  /** On a computer, size the box to its contents (a short form) rather than a fixed height (a list). */
  fitContent?: boolean;
  /** How tall its contents are, once known: a phone's sheet opens only as tall as its header and that need (see the native twin). */
  contentHeight?: number;
  /** On a wide computer screen, dock to the right instead of covering the middle, so what it is about stays in view. */
  side?: boolean;
  /** The sheet has come to rest where it was going (first: it has finished opening). */
  onSettled?: () => void;
  /** The comments stage on a phone's browser (see StageSheet). Opt-in; every other sheet leaves it out. */
  stage?: StageGeo | null;
  /** Drawn on the stage above the sheet, over its tap-to-close area (the small rail). */
  stageOverlay?: React.ReactNode;
  /** Asked before a drag down, a click outside or Escape closes it: false keeps it open (see the native twin). Never for closeSignal. */
  beforeClose?: () => boolean;
}) {
  // On a computer a bottom sheet stretched across a wide window looks lost;
  // there it is a centred box instead, the way Instagram's dialogs are.
  const dialog = typeof window !== 'undefined' && isDesktopBrowser() && window.innerWidth >= 700;
  if (dialog && side && window.innerWidth >= SIDE_MIN_WINDOW) return <SidePanel header={header} onDismissed={onDismissed} closeSignal={closeSignal} onSettled={onSettled} active={active} beforeClose={beforeClose}>{children}</SidePanel>;
  if (dialog) return <DialogBox header={header} onDismissed={onDismissed} closeSignal={closeSignal} fitContent={fitContent} onSettled={onSettled} active={active} beforeClose={beforeClose}>{children}</DialogBox>;
  if (stage) return <StageSheet header={header} onDismissed={onDismissed} closeSignal={closeSignal} onSettled={onSettled} geo={stage} stageOverlay={stageOverlay} active={active}>{children}</StageSheet>;
  return <Sheet header={header} onDismissed={onDismissed} peekFraction={peekFraction} closeSignal={closeSignal} onSettled={onSettled} active={active} contentHeight={contentHeight} beforeClose={beforeClose}>{children}</Sheet>;
}

/** The latest beforeClose, and whether a close the person started may go ahead now. */
function useMayClose(beforeClose?: () => boolean) {
  const latest = useRef(beforeClose);
  latest.current = beforeClose;
  return () => !latest.current || latest.current();
}

/**
 * A click on the backdrop closes only when the press began there. A hold
 * that opens a sheet (your ring in Open to hit, held) ends, in a browser,
 * with a click aimed at whatever is under the finger by then: often this
 * backdrop, which closed the sheet the moment it opened (Oct 5). A click with
 * no pointer behind it (a screen reader, a keyboard) still closes.
 */
function useBackdropPress(onClose: () => void) {
  const began = useRef(false);
  return {
    area: { onPointerDownCapture: () => { began.current = false; } },
    backdrop: {
      onPointerDown: () => { began.current = true; },
      onClick: (e: React.MouseEvent) => {
        const ok = began.current || e.detail === 0;
        began.current = false;
        if (ok) onClose();
      },
    },
  };
}

const SIDE_WIDTH = 420;
const SIDE_GAP = 12;

/**
 * Comments on a wide computer screen: a panel docked to the right, like
 * TikTok's, with nothing dimmed or blurred, so the clip stays in view and
 * keeps playing. Home hears the panel's width and slides the clip left to
 * sit beside it. A click anywhere outside the panel, or Escape, closes it.
 */
function SidePanel({ header, children, onDismissed, closeSignal, onSettled, active, beforeClose }: { header: React.ReactNode; children: React.ReactNode; onDismissed: () => void; closeSignal: number; onSettled?: () => void; active: boolean; beforeClose?: () => boolean }) {
  useTheme();
  const mayClose = useMayClose(beforeClose);
  const panel = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    setSidePanel(SIDE_WIDTH + SIDE_GAP);
    panel.current?.animate([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 280, easing: EASE });
    const settled = setTimeout(() => onSettled?.(), 280);
    return () => { clearTimeout(settled); setSidePanel(0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEscape(() => { if (mayClose()) close(); }, { enabled: active });
  const close = () => {
    if (done.current) return;
    done.current = true;
    setSidePanel(0);
    const out = panel.current?.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(28px)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    if (out) out.onfinish = () => onDismissed(); else onDismissed();
  };
  const outside = useBackdropPress(() => { if (mayClose()) close(); });
  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);
  return (
    <div {...outside.area} style={{ position: 'absolute', inset: 0 }}>
      <div {...outside.backdrop} role="button" aria-label="Close comments" tabIndex={-1} style={{ position: 'absolute', inset: 0 }} />
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
function DialogBox({ header, children, onDismissed, closeSignal, fitContent, onSettled, active, beforeClose }: { header: React.ReactNode; children: React.ReactNode; onDismissed: () => void; closeSignal: number; fitContent: boolean; onSettled?: () => void; active: boolean; beforeClose?: () => boolean }) {
  useTheme();
  const mayClose = useMayClose(beforeClose);
  const box = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    box.current?.animate([{ opacity: 0, transform: 'translate(-50%, calc(-50% + 10px)) scale(0.97)' }, { opacity: 1, transform: 'translate(-50%, -50%)' }], { duration: 240, easing: EASE });
    const settled = setTimeout(() => onSettled?.(), 240);
    return () => clearTimeout(settled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEscape(() => { if (mayClose()) close(); }, { enabled: active });
  const close = () => {
    if (done.current) return;
    done.current = true;
    box.current?.animate([{ opacity: 1, transform: 'translate(-50%, -50%)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(0.97)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    const out = backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    if (out) out.onfinish = () => onDismissed(); else onDismissed();
  };
  const outside = useBackdropPress(() => { if (mayClose()) close(); });
  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);
  return (
    <div {...outside.area} style={{ position: 'absolute', inset: 0 }}>
      <div ref={backdrop} {...outside.backdrop} role="button" aria-label="Close" tabIndex={-1}
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
  onSettled,
  active,
  contentHeight,
  beforeClose,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onDismissed: () => void;
  peekFraction?: number;
  closeSignal?: number;
  onSettled?: () => void;
  active: boolean;
  contentHeight?: number;
  beforeClose?: () => boolean;
}) {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const mayClose = useMayClose(beforeClose);
  const insets = useSafeAreaInsets();
  const area = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  // Fitted to a short sheet's contents once measured; a drag or the keyboard ends that.
  const fit = useRef(contentHeight ?? 0);
  fit.current = contentHeight ?? 0;
  const touched = useRef(false);
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
  const place = (y: number, ms: number, curve = SHEET_CURVE) => {
    current.current = y;
    const transition = ms ? `${ms}ms ${curve}` : 'none';
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
      const peek = Math.min(fullHeight, Math.round(vh * peekFraction));
      const headH = head.current?.offsetHeight ?? 0;
      const peekHeight = fit.current && headH ? Math.min(peek, Math.round(headH + fit.current + insets.bottom)) : peek;
      geometry.current = { fullHeight, openOffset: fullHeight - peekHeight };
    };
    measureRef.current = measure;
    measure();
    place(geometry.current.fullHeight, 0);
    // One frame so the opening slide is seen rather than starting already open.
    const frame = requestAnimationFrame(() => place(geometry.current.openOffset, OPEN_MS));
    const settled = setTimeout(() => onSettled?.(), OPEN_MS + 20);
    window.addEventListener('resize', measure);
    // A phone's keyboard shrinks the visible area without a window resize; the sheet re-measures and keeps its box above it.
    const vv = window.visualViewport;
    const onViewport = () => { measure(); touched.current = true; place(0, 160); };
    vv?.addEventListener('resize', onViewport);
    return () => { cancelAnimationFrame(frame); clearTimeout(settled); window.removeEventListener('resize', measure); vv?.removeEventListener('resize', onViewport); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The contents measured after the opening began: it settles at their height instead.
  const measureRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!contentHeight || touched.current || dismissed.current) return;
    measureRef.current();
    place(geometry.current.openOffset, OPEN_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentHeight]);

  const finish = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismissed();
  };
  const close = () => {
    touched.current = true;
    place(geometry.current.fullHeight, SETTLE_MS, 'cubic-bezier(.4,0,1,1)');
    window.setTimeout(finish, SETTLE_MS + 20);
  };
  const outside = useBackdropPress(() => { if (mayClose()) close(); });
  const openFull = () => place(0, SETTLE_MS);
  const returnTo = (y: number) => place(y, SETTLE_MS);
  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);
  useEscape(() => { if (!dismissed.current && mayClose()) close(); }, { notWhileTyping: true, enabled: active });

  const onPointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    drag.current = { startY: event.clientY, originY: current.current, lastY: event.clientY, lastT: performance.now(), velocity: 0, moved: false };
    touched.current = true;
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
    if (velocity > FLICK || (travelled > 0 && travelled > (fullHeight - d.originY) * 0.32)) { if (mayClose()) close(); else returnTo(d.originY); }
    else if (velocity < -FLICK || (travelled < 0 && Math.abs(travelled) > d.originY * 0.32)) openFull();
    else returnTo(d.originY);
  };

  return (
    <div ref={area} {...outside.area} style={{ position: 'absolute', inset: 0 }}>
      <div ref={backdrop} style={{ position: 'absolute', inset: 0, backgroundColor: colors.overlay, opacity: 0 }} />
      <div role="button" aria-label="Close" tabIndex={-1} {...outside.backdrop} style={{ position: 'absolute', inset: 0 }} />
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
          ref={head}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ position: 'relative', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10, touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center' }} />
          {header}
        </div>
        {/* Clear of a phone's home bar, the same as the app's own sheet. */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingBottom: insets.bottom }}>{children}</div>
      </div>
    </div>
  );
}

/** Reduce Motion, read when a stage opens: fades in place of travel. */
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The comments stage in a phone's browser, the twin of the phone's
 * StageSheet: the clip it is about stays playing above it, shrunk into the
 * room left. Three stops (closed, half, full), no dim; the stage above the
 * sheet is the close target, and a drag on it moves the sheet as a drag on
 * the header does. Every move is told to the stage (commentStage.place) so
 * the clip, the words over it, the small rail and the tab bar move with it
 * (useStageMotion.web): the open and every close as a glide (the sheet a card
 * of fixed height sliding, everything off the page's main thread), anything
 * else frame by frame with the sheet's height following the finger.
 */
function StageSheet({
  header,
  children,
  onDismissed,
  closeSignal = 0,
  onSettled,
  geo,
  stageOverlay,
  active,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onDismissed: () => void;
  closeSignal?: number;
  onSettled?: () => void;
  geo: StageGeo;
  stageOverlay?: React.ReactNode;
  active: boolean;
}) {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const insets = useSafeAreaInsets();
  const { H, yh, yf } = geo;
  const sheetH = H - yh;
  const [reduced] = React.useState(reducedMotion);
  const area = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // Where the sheet's top is going (window points), whether the keyboard
  // (not the person) took it to full, and whether it is on its way out.
  const y = useRef(H);
  const raised = useRef(false);
  const closing = useRef(false);
  const dismissed = useRef(false);
  // Gone (closed, or its stage taken down): it no longer catches a single touch, even before the page has left.
  const [over, setOver] = React.useState(false);
  /** Risen to half: from then on a tap on the stage counts. */
  const opened = useRef(false);
  const drag = useRef<{ startY: number; startX: number; originY: number; lastY: number; lastT: number; velocity: number; moved: boolean; stage: boolean; typing: boolean } | null>(null);
  /** The room the sheet has: the page, which a phone's keyboard may shorten. */
  const room = () => area.current?.clientHeight || H;

  // Moved on the stage's clock (a drag, half to full), the sheet's height
  // follows it frame by frame, in step with the clip and everything else on
  // the stage. Held while it fades out under Reduce Motion, so it never
  // collapses mid-fade.
  const holdHeight = useRef(false);
  useEffect(() => onFrame((top) => {
    const el = sheet.current;
    if (!el || holdHeight.current) return;
    el.style.height = `${Math.max(0, room() - top)}px`;
  }), [H]); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * A glide (rising from closed, or going down to closed): the sheet is a
   * card of fixed height, as tall as it is at the higher end, slid down and
   * up by position alone, which the browser runs off the page's main thread.
   * It lands back on a plain height.
   */
  const gliding = useRef<Animation | null>(null);
  /** The sheet to `to` over `ms` (0: at once, under a finger), from wherever it is right now. */
  const place = (to: number, ms: number) => {
    y.current = to;
    const from = currentY();
    const el = sheet.current;
    if (gliding.current) {
      // Taken up wherever it is: a plain height there, before anything else draws.
      gliding.current.cancel();
      gliding.current = null;
      if (el) { el.style.transform = ''; el.style.height = `${Math.max(0, room() - from)}px`; }
    }
    const move = stagePlace({ fromY: from, toY: to, ms });
    if (!move.glide || !el) return;
    const top = Math.min(move.fromY, move.toY);
    const slide = (at: number) => `translateY(${at - top}px)`;
    el.style.height = `${Math.max(0, room() - top)}px`;
    el.style.transform = slide(move.fromY);
    const anim = el.animate(glideSamples(move).map((f) => ({ offset: f.offset, transform: slide(f.y) })), { duration: move.ms, easing: 'linear', fill: 'both' });
    anim.startTime = move.glide.start;
    gliding.current = anim;
    anim.onfinish = () => {
      if (gliding.current !== anim) return;
      gliding.current = null;
      el.style.height = `${Math.max(0, room() - move.toY)}px`;
      el.style.transform = '';
      anim.cancel();
    };
  };
  const finish = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    setOver(true);
    onDismissed();
  };
  const toStop = (to: number, ms = SNAP_MS_WEB) => {
    setFull(to === yf);
    place(to, reduced ? 180 : ms);
  };
  const typing = () => {
    const active = document.activeElement as HTMLElement | null;
    return !!active && !!sheet.current?.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
  };
  const putKeyboardAway = () => { if (typing()) (document.activeElement as HTMLElement).blur(); };

  /** One way out for ×, a tap on the stage and Escape: the clip lands softly back to full size. */
  const closeStage = () => {
    if (closing.current) return;
    closing.current = true;
    raised.current = false;
    putKeyboardAway();
    if (reduced) {
      // The card fades where it is; the page dips out, is back at full size unseen, and fades in.
      holdHeight.current = true;
      sheet.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      stagePlace({ fromY: currentY(), toY: H, ms: 0, dip: true });
      y.current = H;
      window.setTimeout(finish, 240);
      return;
    }
    place(H, CLOSE_MS);
    window.setTimeout(finish, CLOSE_MS + 20);
  };

  // The stage this sheet took on was taken down under it (the feed gave up
  // on it, or it ended some other way): there is nothing left to close, so
  // the page goes at once rather than sitting over the feed, untouchable.
  useEffect(() => onStageChange(() => {
    const now = getStage();
    if (now && now.geo === geo && !now.ending) return;
    if (closing.current) return;
    closing.current = true;
    finish();
  }), [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    place(H, 0);
    let frame = 0;
    if (reduced) {
      // Nothing travels: the page dips out, the sheet is at half unseen, then both fade in.
      sheet.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 100, fill: 'backwards' });
      frame = requestAnimationFrame(() => {
        y.current = yh;
        stagePlace({ fromY: currentY(), toY: yh, ms: 0, dip: true });
      });
    } else {
      // One frame so the rise is seen rather than starting already open.
      frame = requestAnimationFrame(() => place(yh, OPEN_MS_WEB));
    }
    const settled = window.setTimeout(() => { opened.current = true; onSettled?.(); }, (reduced ? 300 : OPEN_MS_WEB) + 20);

    // The keyboard: the sheet goes to full while you type and comes back to
    // half when it goes, if the keyboard is what took it up. A browser says
    // so through the box taking focus and the visible area shrinking.
    const raise = () => {
      if (closing.current || drag.current?.moved || y.current <= yf + 1) return;
      raised.current = true;
      toStop(yf);
    };
    const lower = () => {
      if (closing.current || !raised.current || typing()) return;
      raised.current = false;
      toStop(yh);
    };
    const el = sheet.current;
    const onFocusIn = () => { if (typing()) raise(); };
    // Focus moves between the box and the send or emoji buttons for a moment; only a box left behind counts.
    const onFocusOut = () => { window.setTimeout(lower, 120); };
    el?.addEventListener('focusin', onFocusIn);
    el?.addEventListener('focusout', onFocusOut);
    const vv = window.visualViewport;
    const roomAtOpen = vv?.height ?? window.innerHeight;
    const onViewport = () => {
      if (!vv) return;
      if (vv.height < roomAtOpen - 120) raise();
      else if (vv.height > roomAtOpen - 40) lower();
    };
    vv?.addEventListener('resize', onViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settled);
      el?.removeEventListener('focusin', onFocusIn);
      el?.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewport);
      gliding.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    closeStage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);
  useEscape(closeStage, { enabled: active });

  // A tap on the stage steps back one place, never further: the keyboard
  // goes first (a stray tap never throws away a half-written comment), then
  // full comes down to half, then half closes. Not while the sheet is still
  // rising: the second tap of a quick double tap on the words lands here,
  // and would close what the first one opened.
  const tapStage = (wasTyping: boolean) => {
    if (closing.current || !opened.current) return;
    if (wasTyping || typing()) { putKeyboardAway(); return; }
    if (y.current < (yh + yf) / 2) { toStop(yh); return; }
    closeStage();
  };

  // Letting go: the same rules as the phone's (see DragSheet).
  const release = (vY: number, originY: number) => {
    const proj = y.current + 0.18 * vY;
    const fromHalf = originY >= (yh + yf) / 2;
    let target = yh;
    if (fromHalf) {
      if (vY >= 800 || proj - yh > 0.3 * sheetH) target = H;
      else if (vY <= -700 || yh - proj > 0.25 * (yh - yf)) target = yf;
    } else if (vY >= 2000 || proj > yh + 0.4 * sheetH) target = H;
    else if (proj <= yf + 0.5) target = yf;
    if (target === H) {
      closing.current = true;
      place(H, reduced ? 180 : SNAP_MS_WEB);
      window.setTimeout(finish, (reduced ? 180 : SNAP_MS_WEB) + 20);
      return;
    }
    toStop(target);
  };

  const onPointerDown = (stage: boolean) => (event: React.PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || closing.current) return;
    // Read now: the box loses the keyboard the moment anything else is pressed.
    drag.current = { startY: event.clientY, startX: event.clientX, originY: y.current, lastY: event.clientY, lastT: performance.now(), velocity: 0, moved: false, stage, typing: typing() };
    // A press on the stage ends on the stage, even if the sheet has risen
    // under the finger meanwhile: let go over a comment's button, the press
    // was left half-done there and the sheet's own buttons stopped answering.
    if (stage) (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || closing.current) return;
    const dy = event.clientY - d.startY;
    // A tap on something inside the header (the close button) must stay a
    // tap, and a sideways move on the stage is not a drag at all.
    if (!d.moved) {
      if (d.stage && Math.abs(event.clientX - d.startX) > 24 && Math.abs(dy) < 8) { drag.current = null; return; }
      if (Math.abs(dy) < 8) return;
      d.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      // Picked up wherever it is, even mid-move.
      d.originY = currentY();
      d.startY = event.clientY;
      raised.current = false;
      putKeyboardAway();
    }
    event.preventDefault();
    const now = performance.now();
    d.velocity = (event.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = event.clientY;
    d.lastT = now;
    // 1:1 with the finger between full and closed; past full it gives, a little and less.
    const to = d.originY + (event.clientY - d.startY);
    place(Math.min(H, to < yf ? yf - Math.min(24, (yf - to) * 0.33) : to), 0);
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || closing.current) return;
    if (!d.moved) { if (d.stage) tapStage(d.typing); return; }
    event.preventDefault();
    // Speed only counts if the finger was still moving when it lifted (points per second).
    const velocity = performance.now() - d.lastT < 120 ? d.velocity * 1000 : 0;
    release(velocity, d.originY);
  };
  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && !closing.current) release(0, d.originY);
  };

  return (
    // The dialog is the whole layer, so a screen reader keeps the stage's close and the small rail as well as the sheet.
    <div ref={area} role="dialog" aria-modal="true" aria-label="Comments" style={{ position: 'absolute', inset: 0, pointerEvents: over ? 'none' : undefined }}>
      {/* The stage: a tap steps back one place, a drag moves the sheet. One button to a screen reader. */}
      <div
        role="button"
        aria-label="Close comments"
        aria-description="The clip keeps playing"
        tabIndex={-1}
        onPointerDown={onPointerDown(true)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
      />
      {stageOverlay}
      <div
        ref={sheet}
        data-stage-sheet=""
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          backgroundColor: colors.bg,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          // On black rather than a dimmed page: a hairline edge keeps the dark themes' sheets reading as a card.
          borderTop: `0.5px solid ${colors.border}`, borderLeft: `0.5px solid ${colors.border}`, borderRight: `0.5px solid ${colors.border}`,
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          // Starts with no height; the mount effect grows it up.
          height: 0,
        }}
      >
        <Wash height={300} strength={0.85} />
        <div
          onPointerDown={onPointerDown(false)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          style={{ position: 'relative', paddingTop: 10, minHeight: 60, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center' }} />
          {header}
        </div>
        {/* Clear of a phone's home bar, the same as the app's own sheet. */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingBottom: insets.bottom }}>{children}</div>
      </div>
    </div>
  );
}
