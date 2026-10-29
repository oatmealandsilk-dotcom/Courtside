import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';

import { STYLE, applyLook, cardLook, lookFor } from '@/components/map/look';
import { CLOSE_ZOOM_NAMES, FAR_ZOOM, MAP_PIN_CSS, SHORT_ZOOM, courtPinHtml } from '@/components/map/markers';
import type { Court } from '@/features/players/courts';
import type { LatLng } from '@/features/players/positions';
import { colors } from '@/theme';
import { themes, useTheme } from '@/theme/ThemeProvider';

/** One court on the guest's map, with what is on there (its soonest open hit, "Hit Sat 9am", and how many). */
export interface GuestCourtPin { court: Court; tag?: string; hits: number }

export interface GuestCourtsCanvasProps {
  /** Where the map looks. A new place flies there (`fly`) or jumps. */
  center: LatLng;
  zoom: number;
  /** Spots the view should take in (the visitor and their nearest courts): it fits them (no closer than street level). */
  fit?: LatLng[] | null;
  fly: boolean;
  pins: GuestCourtPin[];
  /** The visitor's own spot, as a plain dot (never a face, never anyone else). */
  me: LatLng | null;
  /** Soft and out of reach (the teaser): no taps on the courts. */
  still: boolean;
  onCourt: (court: Court) => void;
  /** The map has drawn its streets once. */
  onDrawn?: () => void;
}

const CSS_ID = 'cs-guest-pin-css';
const ME_CSS = `.cs-guest-me{width:16px;height:16px;border-radius:999px;box-sizing:border-box;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.3)}
.cs-guest-me-halo{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:999px;opacity:.22;animation:cs-guest-me 2.4s ease-out infinite;pointer-events:none}
@keyframes cs-guest-me{0%{transform:scale(.4);opacity:.35}100%{transform:scale(1.25);opacity:0}}
@media (prefers-reduced-motion:reduce){.cs-guest-me-halo{animation:none}}`;

/**
 * The guest's courts map (guest mode, Oct 29): MapLibre in the page, the
 * Community card's own look (cardLook), with court pins only, each carrying
 * its open hits as the full map's courts do ("Hit Sat 9am" and the calendar
 * badge). No players, no friends, no lit courts, nobody's face. Still, as
 * the card is: only a court takes a tap, opening that court's page.
 *
 * Reached only through WebMap (the one door to the map engine), so the
 * engine stays out of the app's first download.
 */
export function GuestCourtsCanvas({ center, zoom, fit = null, fly, pins, me, still, onCourt, onDrawn }: GuestCourtsCanvasProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const { theme } = useTheme();
  const tap = useRef(onCourt);
  tap.current = onCourt;
  const drawn = useRef(onDrawn);
  drawn.current = onDrawn;
  // Where the map was last sent, so a new place (and only a new place) moves it.
  const aimed = useRef<string>('');
  const view = useRef({ center, zoom });
  view.current = { center, zoom };
  // Which map the pins are on (a new look makes a new one), so they are put on it afresh.
  const [mapGen, setMapGen] = useState(0);

  // The map: made once per look.
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    if (!document.getElementById(CSS_ID)) {
      const css = document.createElement('style');
      css.id = CSS_ID;
      css.textContent = MAP_PIN_CSS + ME_CSS;
      document.head.appendChild(css);
    }
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: el,
        style: STYLE,
        center: [view.current.center.lng, view.current.center.lat],
        zoom: view.current.zoom,
        interactive: false,
        attributionControl: false,
      });
    } catch {
      return undefined;
    }
    aimed.current = `${view.current.center.lat},${view.current.center.lng},${view.current.zoom}`;
    m.on('style.load', () => applyLook(m, cardLook(lookFor(themes[theme]))));
    // A street tile that fails is only a gap in the drawing: never an error on the page.
    m.on('error', () => undefined);
    m.once('idle', () => drawn.current?.());
    const zoomClass = () => {
      const z = m.getZoom();
      el.classList.toggle('cs-close', z >= CLOSE_ZOOM_NAMES);
      el.classList.toggle('cs-far', z < FAR_ZOOM);
      el.classList.toggle('cs-short', z < SHORT_ZOOM);
    };
    zoomClass();
    m.on('zoom', zoomClass);
    map.current = m;
    setMapGen((g) => g + 1);
    return () => { m.remove(); if (map.current === m) map.current = null; };
  }, [theme]);
  // A new place: flown to (the visitor just said where they are), or simply there.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const key = `${center.lat},${center.lng},${zoom},${fit?.map((p) => `${p.lat},${p.lng}`).join(';') ?? ''}`;
    if (key === aimed.current) return;
    aimed.current = key;
    let to: { center: [number, number]; zoom: number } = { center: [center.lng, center.lat], zoom };
    if (fit && fit.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      fit.forEach((p) => bounds.extend([p.lng, p.lat]));
      // Room round the edges for the courts' words ("Hit 4pm" sits to a court's right) and the chips along the foot.
      const cam = m.cameraForBounds(bounds, { padding: { top: 56, bottom: 76, left: 44, right: 110 }, maxZoom: Math.max(zoom, 14) });
      if (cam?.center && typeof cam.zoom === 'number') {
        const c = maplibregl.LngLat.convert(cam.center);
        to = { center: [c.lng, c.lat], zoom: Math.max(11, cam.zoom) };
      }
    }
    if (fly) m.flyTo({ ...to, duration: 2200, curve: 1.5, essential: true });
    else m.jumpTo(to);
  }, [center.lat, center.lng, zoom, fit, fly, mapGen]);

  // The courts, and the visitor's own dot.
  useEffect(() => {
    const m = map.current;
    if (!m) return undefined;
    const marks: maplibregl.Marker[] = [];
    for (const { court, tag, hits } of pins) {
      const el = document.createElement('div');
      el.innerHTML = courtPinHtml(court, false, false, tag, false, false, hits);
      if (!still) {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', [court.name || 'Tennis courts', tag, hits ? `${hits} open ${hits === 1 ? 'hit' : 'hits'}` : null].filter(Boolean).join(', '));
        el.tabIndex = 0;
        el.addEventListener('click', (e) => { e.stopPropagation(); tap.current(court); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap.current(court); } });
      }
      // Something on there stands above the quiet courts.
      el.style.zIndex = tag ? '2' : '1';
      marks.push(new maplibregl.Marker({ element: el }).setLngLat([court.lng, court.lat]).addTo(m));
    }
    if (me) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.zIndex = '3';
      el.style.pointerEvents = 'none';
      el.innerHTML = `<div style="position:relative"><div class="cs-guest-me-halo" style="background:${colors.brand}"></div><div class="cs-guest-me" style="background:${colors.brand}"></div></div>`;
      marks.push(new maplibregl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m));
    }
    return () => { marks.forEach((k) => k.remove()); };
  }, [pins, me?.lat, me?.lng, still, mapGen, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} aria-hidden={still ? true : undefined} style={{ position: 'absolute', inset: 0, background: colors.bg }} />;
}
