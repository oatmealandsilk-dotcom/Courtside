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
 *
 * Open to hit is a class on a pin's own marker element (OPEN_CLASS), not a
 * redraw, so switching it on or off animates: the green ring draws itself
 * round the face, a soft halo starts to breathe out from it (slowly, each
 * pin on its own beat), and a green dot slides in before the name (on your
 * own pin, "You · Open to hit"). Only a real change from off to on also
 * gives the face one small pop (JUST_OPEN_CLASS, put on for a moment by
 * setOpen): a pin that appears already open, or is redrawn, never pops.
 * Off, it all eases back; the ring's ends go square as it unwinds, so it
 * never leaves a round dot behind. With Reduce Motion on (the system's
 * setting, or "cs-still" on the map, which the phone sets from its own),
 * only fades: the ring appears whole, the halo stays still.
 */
export const MAP_PIN_CSS = `
.cs-court-name{display:none}
.cs-close .cs-court-name,.cs-court.cs-on .cs-court-name{display:block}
.cs-far .cs-court{transform:scale(.72)}
.cs-pin{transition:transform .15s ease-out}
.cs-pin:active{transform:scale(.94)}
.cs-disc{position:relative;flex:none}
.cs-halo-wrap{position:absolute;inset:0;opacity:0;transition:opacity .5s ease;pointer-events:none}
.cs-open .cs-halo-wrap{opacity:1}
.cs-halo{position:absolute;border-radius:999px;opacity:0;animation:cs-pulse 2.8s cubic-bezier(.22,.61,.36,1) infinite;animation-play-state:paused}
.cs-open .cs-halo{animation-play-state:running}
@keyframes cs-pulse{0%{transform:scale(1);opacity:.5}70%{opacity:0}100%{transform:scale(1.9);opacity:0}}
.cs-ring{position:absolute;left:0;top:0;transform:rotate(-90deg);overflow:visible;pointer-events:none}
.cs-ring circle{opacity:0;stroke-linecap:butt;transition:stroke-dashoffset .42s cubic-bezier(.4,0,.2,1),opacity .2s ease .22s}
.cs-open .cs-ring circle{stroke-dashoffset:0;opacity:1;stroke-linecap:round;transition:stroke-dashoffset .75s cubic-bezier(.65,0,.35,1),opacity .1s ease}
.cs-just-open .cs-disc{animation:cs-pop .55s ease-out}
@keyframes cs-pop{0%{transform:scale(1)}30%{transform:scale(1.08)}62%{transform:scale(.99)}100%{transform:scale(1)}}
.cs-dot{display:inline-block;width:0;height:7px;margin-right:0;border-radius:4px;vertical-align:1px;transition:width .3s ease,margin-right .3s ease}
.cs-open .cs-dot{width:7px;margin-right:4px}
.cs-tag-open{display:inline-block;overflow:hidden;white-space:nowrap;vertical-align:top;max-width:0;opacity:0;transition:max-width .45s cubic-bezier(.2,.8,.2,1),opacity .12s ease}
.cs-open .cs-tag-open{max-width:90px;opacity:1;transition:max-width .45s cubic-bezier(.2,.8,.2,1),opacity .25s ease .14s}
@media (prefers-reduced-motion:reduce){.cs-halo{animation:none;transform:scale(1.35);opacity:.2}.cs-just-open .cs-disc{animation:none}.cs-ring circle,.cs-open .cs-ring circle{stroke-dashoffset:0;transition:opacity .3s ease}}
.cs-still .cs-halo{animation:none;transform:scale(1.35);opacity:.2}
.cs-still .cs-just-open .cs-disc{animation:none}
.cs-still .cs-ring circle,.cs-still .cs-open .cs-ring circle{stroke-dashoffset:0;transition:opacity .3s ease}
`;

/** The zoom at which court names show, and below which the court marks shrink. */
export const CLOSE_ZOOM_NAMES = 14.3;
export const FAR_ZOOM = 11.8;

/** The class a player's marker element wears while they are open to hit (see MAP_PIN_CSS). */
export const OPEN_CLASS = 'cs-open';
/** Worn for a moment as a pin switches from off to on: its one pop. */
export const JUST_OPEN_CLASS = 'cs-just-open';
/** How long the pop lasts, with a little to spare. */
export const POP_MS = 650;

/**
 * Switches a pin already on the map to open or not, so it animates in
 * place; a real change from off to on also pops it once. For a pin being
 * made, set OPEN_CLASS directly instead: it appears as it is, no pop. The
 * phone's map does the same inside its web view (MapCanvas).
 */
export function setOpen(el: HTMLElement, open: boolean) {
  const was = el.classList.contains(OPEN_CLASS);
  el.classList.toggle(OPEN_CLASS, open);
  if (open && !was) {
    el.classList.add(JUST_OPEN_CLASS);
    clearTimeout(pops.get(el));
    pops.set(el, setTimeout(() => el.classList.remove(JUST_OPEN_CLASS), POP_MS));
  } else if (!open) el.classList.remove(JUST_OPEN_CLASS);
}
const pops = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
/** The classes a player's pin wears: "cs-open" while they are open to hit today. */
export const playerPinClass = (user: User) => (isOpenToHit(user) ? OPEN_CLASS : '');

/** The green ring's width, and the page-coloured ring between it and the face. */
const RING = 2.5;
const GAP = 3;
/** A pin's round part, for a face this size: the face, its white ring, and room for the green one round that. */
export const discSize = (size: number) => size + GAP * 2 + RING * 2 + 3;

const esc = (text: string) => text.replace(/[<>&"]/g, '');

/** Where a pin's pulse starts in its beat, from its id, so a town of open players never throbs in step. */
function beat(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 2800;
  return h;
}

/**
 * The round part of a player's pin: their face on a page-coloured disc with
 * a soft shadow, and, drawn but hidden until they are open to hit, the
 * green ring round it and the halo that breathes out from it.
 */
function disc(user: User, size: number): string {
  const box = discSize(size);
  const inner = size + GAP * 2;
  const at = (box - inner) / 2;
  // The ring's middle line, hugging the white disc's edge.
  const r = inner / 2 - 0.5 + RING / 2;
  const round = (2 * Math.PI * r).toFixed(2);
  const c = box / 2;
  return `<div class="cs-disc" style="width:${box}px;height:${box}px">`
    + `<div class="cs-halo-wrap"><div class="cs-halo" style="left:${at}px;top:${at}px;width:${inner}px;height:${inner}px;background:${colors.open};animation-delay:-${beat(user.id)}ms"></div></div>`
    + `<div style="position:absolute;left:${at}px;top:${at}px;width:${inner}px;height:${inner}px;border-radius:999px;background:${colors.bg};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.24)">${face(user, size)}</div>`
    + `<svg class="cs-ring" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="${colors.open}" stroke-width="${RING}" stroke-linecap="round" stroke-dasharray="${round}" stroke-dashoffset="${round}"/></svg>`
    + `</div>`;
}

/**
 * A player: their face in a clean white ring; on the full map, their first
 * name and when they were last there. Open to hit today (their marker wears
 * playerPinClass), a green ring draws round them with a slow soft pulse, and
 * a green dot leads their name. The canvases hang it by its top, `discSize(size) / 2` up, so the face sits on the spot.
 */
export function playerPinHtml(user: User, { size, label, seenAt }: { size: number; on?: boolean; label: boolean; seenAt?: string }): string {
  const ago = agoShort(seenAt);
  const when = ago ? `<span style="color:${colors.textMuted};font-weight:500"> · ${ago}</span>` : '';
  const name = label ? `<div style="margin-top:2px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border-radius:999px;background:${colors.bg};color:${colors.text};box-shadow:0 1px 4px rgba(0,0,0,.16);${FONT}"><i class="cs-dot" style="background:${colors.open}"></i>${esc(user.name.split(' ')[0])}${when}</div>` : '';
  return `<div class="cs-pin" style="display:flex;flex-direction:column;align-items:center;cursor:pointer">${disc(user, size)}${name}</div>`;
}

/**
 * You: calm when you are not open to hit — your face in the same white ring
 * as everyone, with a small "You" under it to find yourself by. Open to hit
 * (the marker wears playerPinClass(you)), the green ring draws round you,
 * the halo starts to breathe, and your tag says so the way everyone else's
 * does: a green dot slides in before "You", and "· Open to hit" after it,
 * on the same page-coloured pill (never a solid green one, which is a
 * posted hit's flag). Hung by its top like the players' pins.
 */
export function mePinHtml(me: User, size: number): string {
  const open = `<span class="cs-tag-open"><span style="color:${colors.textMuted};font-weight:500">&nbsp;· </span>Open to hit</span>`;
  const tag = `<div style="margin-top:2px;display:flex;align-items:center;white-space:nowrap;padding:3px 8px;border-radius:999px;background:${colors.bg};color:${colors.text};box-shadow:0 1px 4px rgba(0,0,0,.16);${FONT}"><i class="cs-dot" style="background:${colors.open}"></i>You${open}</div>`;
  return `<div class="cs-pin" style="display:flex;flex-direction:column;align-items:center;cursor:pointer">${disc(me, size)}${tag}</div>`;
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

/**
 * The mark on a hit's flag: HitGlyph's drawing at flag size, a court from
 * above with a player on each side (it was a cartoon ball, Oct 2). `ink`
 * draws it; each player is cut out of the court's line by a rim of `flag`,
 * the flag's own colour, so the two never blur together this small.
 */
const ball = (ink: string, flag: string) =>
  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.2" y="2.2" width="13.6" height="19.6" rx="1.8" stroke="${ink}" stroke-width="2.2"/><line x1="3" y1="12" x2="21" y2="12" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><circle cx="9.4" cy="5.2" r="2.6" fill="${ink}" stroke="${flag}" stroke-width="1.4"/><circle cx="14.6" cy="18.8" r="2.6" fill="${ink}" stroke="${flag}" stroke-width="1.4"/></svg>`;

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
/** The same for your own pin under your (shorter) card: in clear view, so switching Open to hit shows on it. */
export const youLift = (mapHeight: number) => Math.round(Math.min(150, mapHeight * 0.14));
