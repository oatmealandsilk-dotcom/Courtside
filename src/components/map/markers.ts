import type { HitRequest, User } from '@/data/types';
import { hitShort } from '@/features/hits/format';
import { isClosedCourt, type Court } from '@/features/players/courts';
import { isOpenToHit } from '@/features/players/openToHit';
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

/** How long ago someone last shared where they are, as short as a map label wants: "now", "12m", "3h", "2d", "5w". */
/**
 * The same, as words for a list row beside a distance ("0.9 mi · 12m ago",
 * "just now"): "12m" alone next to miles reads as metres.
 */
export function agoLabel(iso?: string): string {
  const short = agoShort(iso);
  return !short ? '' : short === 'now' ? 'just now' : `${short} ago`;
}

export function agoShort(iso?: string): string {
  if (!iso) return '';
  const minutes = Math.max(0, (Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 5) return 'now';
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}d`;
  return `${Math.floor(minutes / (60 * 24 * 7))}w`;
}

/**
 * Styles the pins share, and what the map's zoom switches on: court names
 * once you are down at street level. The canvases put "cs-close" on the
 * map when zoomed in that far, and "cs-far" when far out.
 */
export const MAP_PIN_CSS = `
.cs-court-name{display:none}
.cs-close .cs-court-name,.cs-court.cs-on .cs-court-name{display:block}
.cs-far .cs-court{transform:scale(.72)}
.cs-pin{transition:transform .15s ease-out}
.cs-pin:active{transform:scale(.94)}
`;

/** The zoom at which court names show, and below which the court marks shrink. */
export const CLOSE_ZOOM_NAMES = 14.3;
export const FAR_ZOOM = 11.8;

/** A player: their picture in a clean white ring (green when they are open to hit today); on the full map, their first name and when they were last there. */
export function playerPinHtml(user: User, { size, on, label, seenAt }: { size: number; on: boolean; label: boolean; seenAt?: string }): string {
  const open = isOpenToHit(user);
  const ring = open ? colors.brand : colors.bg;
  const ago = agoShort(seenAt);
  const when = ago ? `<span style="color:${colors.textMuted};font-weight:500"> · ${ago}</span>` : '';
  const name = label ? `<div style="margin-top:4px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border-radius:999px;background:${colors.bg};color:${colors.text};box-shadow:0 1px 4px rgba(0,0,0,.16);${FONT}">${user.name.split(' ')[0]}${when}</div>` : '';
  const halo = open ? `0 0 0 ${on ? 6 : 4}px ${colors.brand}33,` : '';
  return `<div class="cs-pin" style="display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="width:${size + 6}px;height:${size + 6}px;border-radius:999px;background:${ring};display:flex;align-items:center;justify-content:center;box-shadow:${halo}0 3px 10px rgba(0,0,0,.24)">${face(user, size)}</div>${name}</div>`;
}

/** You: your picture in the brand's ring, always, so you find yourself at a glance; a soft halo when you are open to hit. */
export function mePinHtml(me: User, size: number): string {
  const open = isOpenToHit(me);
  return `<div class="cs-pin" style="cursor:pointer;width:${size + 22}px;height:${size + 22}px;border-radius:999px;background:${open ? `${colors.brand}26` : 'transparent'};display:flex;align-items:center;justify-content:center"><div style="width:${size + 8}px;height:${size + 8}px;border-radius:999px;background:${colors.brand};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.26)"><div style="border-radius:999px;border:2px solid ${colors.bg};display:flex">${face(me, size - 2)}</div></div></div>`;
}

/** The little court drawn on each court mark: an outline, the net, the centre line. */
const courtGlyph = (color: string, px = 12) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.6" y="1.4" width="6.8" height="9.2" rx="0.9" fill="none" stroke="${color}" stroke-width="1.3"/><line x1="2.6" y1="6" x2="9.4" y2="6" stroke="${color}" stroke-width="1.3"/><line x1="6" y1="3.5" x2="6" y2="8.5" stroke="${color}" stroke-width="1"/></svg>`;

/**
 * The story ring around a court that was played on this week (a clip, a
 * post or an open hit there): the stories rail's own green ring, a gap of
 * the page colour inside it. Only real court pins carry one.
 */
const storyRing = (gap: number, width: number) => `0 0 0 ${gap}px ${colors.bg},0 0 0 ${gap + width}px ${colors.brand},`;

/**
 * A court: a small round mark in the court colour with a tiny court on it,
 * quieter than the players; its name beside it once you zoom in (or when
 * picked). The count lives on its card, not on the pin. `ring`: played on
 * this week. A members-only or private court is greyed: there, but not a
 * place to suggest.
 */
export function courtPinHtml(court: Court, on: boolean, ring = false): string {
  const size = on ? 30 : 24;
  const closed = isClosedCourt(court);
  const nameStyle = `position:absolute;left:calc(100% + ${ring ? 9 : 5}px);top:50%;transform:translateY(-50%);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 7px;border-radius:999px;background:${colors.bg};color:${closed ? colors.textMuted : colors.text};box-shadow:0 1px 3px rgba(0,0,0,.14);${FONT}`;
  const name = court.name && court.name !== 'Tennis courts' ? `<span class="cs-court-name" style="${nameStyle}">${court.name.replace(/[<>&"]/g, '')}${closed ? ` · ${court.access === 'private' ? 'private' : 'members'}` : ''}</span>` : '';
  const fill = closed ? colors.borderStrong : colors.court;
  const glyph = closed ? colors.bg : colors.brandInk;
  return `<div class="cs-court cs-pin${on ? ' cs-on' : ''}" style="position:relative;width:${size}px;height:${size}px;border-radius:999px;background:${fill};border:2px solid ${colors.bg};box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:${ring ? storyRing(2, 2.5) : ''}0 2px 6px rgba(0,0,0,${on ? '.3' : '.2'});cursor:pointer${closed && !on ? ';opacity:.75' : ''}">${courtGlyph(glyph)}${name}</div>`;
}

/**
 * A court on the still card in Find Players: a small badge in the court
 * colour with the tiny court drawn on it and a soft halo, so the courts in
 * your city read as courts at a glance (a plain dot looked dull, Oct 2). No
 * name, and not tappable: a tap anywhere on the card opens the full map.
 * `ring`: played on this week, in the stories' green ring. A members-only
 * or private court is greyed.
 */
export function courtDotHtml(court?: Court, ring = false): string {
  const closed = !!court && isClosedCourt(court);
  const fill = closed ? colors.borderStrong : colors.court;
  const halo = ring ? storyRing(1.5, 2.5) : `0 0 0 3px ${fill}38,`;
  return `<div style="width:18px;height:18px;border-radius:999px;background:${fill};border:2px solid ${colors.bg};box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:${halo}0 2px 5px rgba(0,0,0,.22);pointer-events:none${closed ? ';opacity:.75' : ''}">${courtGlyph(closed ? colors.bg : colors.brandInk, 10)}</div>`;
}

/** A tennis ball, drawn small enough for a flag: a filled ball with its two seams. */
const ball = (fill: string, seam: string) =>
  `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="${fill}"/><path d="M2.3 2.9c1.9 1.5 1.9 4.7 0 6.2M9.7 2.9c-1.9 1.5-1.9 4.7 0 6.2" fill="none" stroke="${seam}" stroke-width="1.1" stroke-linecap="round"/></svg>`;

/**
 * An open hit: a small brand-green flag with a ball and when ("Sat 9am"),
 * its point on the spot. The canvases hang it from its bottom with a lift,
 * so it floats above a court pin at the same spot rather than covering it.
 */
export function hitPinHtml(hit: HitRequest, on: boolean): string {
  const when = hitShort(hit.startsAt).replace(/[<>&"]/g, '');
  const ring = on ? `0 0 0 2px ${colors.bg},` : '';
  return `<div class="cs-pin" style="display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="display:flex;align-items:center;gap:4px;padding:${on ? '5px 10px' : '4px 8px'};border-radius:999px;background:${colors.brand};color:${colors.brandInk};white-space:nowrap;box-shadow:${ring}0 2px 8px rgba(0,0,0,${on ? '.3' : '.2'});${FONT}">${ball(colors.brandInk, colors.brand)}<span>${when}</span></div><div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${colors.brand}"></div></div>`;
}

/** How far above its spot a hit's flag hangs: clear of a court pin there. */
export const HIT_LIFT = -10;

/** How far above the middle a picked court lands, for a map this tall: in the open strip above its card. */
export const courtLift = (mapHeight: number) => Math.round(Math.min(220, mapHeight * 0.24));
