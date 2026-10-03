import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { fontFamily } from '@/theme';

/*
 * The browser's "Upload a photo" for a group's face: the computer's (or
 * phone browser's) file picker, then the same Move and Scale step the phone
 * app has (CircleCrop): the photo on black under a rounded-square window the
 * shape of the group's tile. Drag to move it, scroll, pinch or use the slider
 * to zoom; the window never shows anything but photo. Choose cuts exactly
 * what the window shows, a square 640 across at most, uploaded only when the
 * group is saved. Cancel goes back to the file picker, as on the phone.
 */
export function useGroupPhotoPick(onPicked: (uri: string) => void): { open: () => void; element: React.ReactNode; error: string } {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [cropping, setCropping] = useState<HTMLImageElement | null>(null);
  const open = () => input.current?.click();
  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!file.type.startsWith('image/')) { setError('Choose a photo.'); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const img = new window.Image();
            img.onload = () => { setError(''); setCropping(img); };
            img.onerror = () => setError('This photo couldn’t be opened.');
            img.src = String(reader.result);
          };
          reader.onerror = () => setError('This photo couldn’t be opened.');
          reader.readAsDataURL(file);
        }}
      />
      {cropping && typeof document !== 'undefined'
        ? createPortal(
          <WebCrop
            img={cropping}
            onDone={(uri) => { setCropping(null); onPicked(uri); }}
            onCancel={() => { setCropping(null); open(); }}
            onClose={() => setCropping(null)}
          />,
          document.body,
        )
        : null}
    </>
  );
  return { open, element, error };
}

const CORNER = 0.3;
const MAX_ZOOM = 4;
const OUT_MAX = 640;

/** Move and Scale on the web, the twin of CircleCrop. Shown on black whatever the theme, as the phone's own editor is. */
function WebCrop({ img, onDone, onCancel, onClose }: { img: HTMLImageElement; onDone: (uri: string) => void; onCancel: () => void; onClose: () => void }) {
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const D = Math.max(160, Math.min(420, view.w - 32, view.h - 200));
  const base = D / Math.min(img.naturalWidth, img.naturalHeight);
  const [zoom, setZoom] = useState(1);
  // The photo's top-left corner, in points from the window's top-left (never inside it).
  const [pos, setPos] = useState(() => ({ x: (D - img.naturalWidth * base) / 2, y: (D - img.naturalHeight * base) / 2 }));
  const drag = useRef<{ id: number; x: number; y: number; from: { x: number; y: number } } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  const W = img.naturalWidth * base * zoom;
  const H = img.naturalHeight * base * zoom;
  const clamp = (p: { x: number; y: number }, w = W, h = H) => ({ x: Math.min(0, Math.max(D - w, p.x)), y: Math.min(0, Math.max(D - h, p.y)) });

  // A new zoom keeps the middle of the window on the same spot of the photo.
  const zoomTo = (next: number) => {
    const z = Math.max(1, Math.min(MAX_ZOOM, next));
    const fx = (D / 2 - pos.x) / W;
    const fy = (D / 2 - pos.y) / H;
    const w = img.naturalWidth * base * z;
    const h = img.naturalHeight * base * z;
    setZoom(z);
    setPos(clamp({ x: D / 2 - fx * w, y: D / 2 - fy * h }, w, h));
  };

  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    // Escape here is this step's own: it never reaches the sheet underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey, true); };
  }, [onClose]);
  // A window resized mid-crop: the photo stays filling the (new) window.
  useEffect(() => { setPos((p) => clamp(p)); }, [D]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = () => {
    const scale = base * zoom;
    const side = D / scale;
    const out = Math.round(Math.min(OUT_MAX, side));
    const canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) { onDone(img.src); return; }
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, side, side, 0, 0, out, out);
    onDone(canvas.toDataURL('image/jpeg', 0.88));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
    } else {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: pos };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pinch.current.has(e.pointerId)) return;
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()];
      zoomTo(pinchStart.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinchStart.current.dist)));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clamp({ x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const text: React.CSSProperties = { fontFamily: `${fontFamily.regular}, system-ui, sans-serif`, color: 'white', fontSize: 17 };
  const button: React.CSSProperties = { ...text, background: 'none', border: 'none', padding: '10px 6px', cursor: 'pointer' };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Move and scale the group's photo"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, touchAction: 'none' }}
    >
      <div style={{ ...text, fontFamily: `${fontFamily.semibold}, system-ui, sans-serif`, position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center', zIndex: 2, pointerEvents: 'none' }}>Move and Scale</div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
        style={{ position: 'relative', width: D, height: D, cursor: 'grab', userSelect: 'none', touchAction: 'none', zIndex: 1 }}
      >
        <img
          src={img.src}
          alt=""
          draggable={false}
          style={{ position: 'absolute', left: pos.x, top: pos.y, width: W, height: H, maxWidth: 'none', pointerEvents: 'none' }}
        />
        {/* The window's edge, and everything outside it dimmed, the way the phone's crop rings it. */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: D * CORNER, border: '1px solid rgba(255,255,255,0.55)', boxShadow: '0 0 0 100vmax rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
      </div>
      <input
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        aria-label="Zoom"
        onChange={(e) => zoomTo(Number(e.target.value))}
        style={{ position: 'relative', width: Math.min(D, 280), accentColor: 'white', zIndex: 2 }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, display: 'flex', justifyContent: 'space-between', padding: '0 24px', zIndex: 2 }}>
        <button type="button" aria-label="Cancel" onClick={onCancel} style={button}>Cancel</button>
        <button type="button" aria-label="Choose" onClick={choose} style={{ ...button, fontFamily: `${fontFamily.semibold}, system-ui, sans-serif` }}>Choose</button>
      </div>
    </div>
  );
}
