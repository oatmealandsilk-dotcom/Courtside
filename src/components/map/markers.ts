import type { User } from '@/data/types';
import type { Court } from '@/features/players/courts';
import { levelBadge } from '@/lib/badges';
import { initials } from '@/lib/format';
import { colors, surfaceColorFor } from '@/theme';

/*
 * The pins, as HTML: MapLibre draws markers as DOM, in the browser and
 * inside the phone's web view alike, so one builder serves both.
 */
const FONT = "font:600 11px Inter,system-ui,sans-serif";

const face = (user: User, size: number) => {
  const fill = user.avatarUrl ? `background-image:url('${user.avatarUrl}');background-size:cover;` : `background:${surfaceColorFor(user.avatarSeed)};`;
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;${fill}color:#fff;${FONT};display:flex;align-items:center;justify-content:center">${user.avatarUrl ? '' : initials(user.name)}</div>`;
};

/** A player: their picture in a ring of their level's colour, their first name beneath on the full map. */
export function playerPinHtml(user: User, { size, on, label }: { size: number; on: boolean; label: boolean }): string {
  const ring = levelBadge(user.profile).tint;
  const name = label ? `<div style="margin-top:2px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 6px;border-radius:999px;background:${colors.bg};color:${colors.text};${FONT}">${user.name.split(' ')[0]}</div>` : '';
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="width:${size + 8}px;height:${size + 8}px;border-radius:999px;background:${colors.bg};border:${on ? 3 : 2}px solid ${ring};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.22)">${face(user, size)}</div>${name}</div>`;
}

/** You: your picture in a brand ring, on a soft halo. */
export function mePinHtml(me: User, size: number): string {
  return `<div style="width:64px;height:64px;border-radius:999px;background:${colors.brandDim};display:flex;align-items:center;justify-content:center;opacity:.96"><div style="width:${size + 9}px;height:${size + 9}px;border-radius:999px;background:${colors.bg};border:2.5px solid ${colors.brand};display:flex;align-items:center;justify-content:center">${face(me, size)}</div></div>`;
}

/** A court: a small green lozenge, with a count when several stand together. */
export function courtPinHtml(court: Court, on: boolean): string {
  return `<div style="display:flex;align-items:center;gap:3px;height:24px;padding:0 7px;border-radius:12px;background:${colors.court};border:2px solid ${colors.bg};box-shadow:0 2px 6px rgba(0,0,0,.18);cursor:pointer;transform:scale(${on ? 1.2 : 1})"><span style="width:10px;height:10px;border-radius:999px;background:${colors.brandInk};display:inline-block"></span>${court.count > 1 ? `<span style="color:${colors.brandInk};${FONT}">${court.count}</span>` : ''}</div>`;
}
