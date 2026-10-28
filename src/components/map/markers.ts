import type { HitRequest, User } from '@/data/types';
import { hitShort } from '@/features/hits/format';
import { isClosedCourt, type Court } from '@/features/players/courts';
import { isOpenToHit } from '@/features/players/openToHit';
import { initials } from '@/lib/format';
import { colors, surfaceColorFor, withAlpha } from '@/theme';
import { LESS_AI } from '@/theme/look';
import { surfaceKind } from '@/features/places/courtSurface';

/**
 * A court pin's colour by what it is played on (Oct 24, owner: "the courts near me hard grass
 * clay"): hard blue, clay orange, grass green, turf, carpet and synthetic a neutral grey. A court
 * the map says nothing about keeps the court colour. Read on each draw, so it follows the theme.
 */
export function courtTone(court: Court): string {
  if (!LESS_AI) return colors.court;
  const kind = surfaceKind(court.surface);
  return kind === 'hard' ? colors.surfaceHard : kind === 'clay' ? colors.surfaceClay : kind === 'grass' ? colors.surfaceGrass : kind ? colors.surfaceOther : colors.court;
}

/*
 * The pins, as HTML: MapLibre draws markers as DOM, in the browser and
 * inside the phone's web view alike, so one builder serves both.
 */
const FONT = "font:600 11px -apple-system,BlinkMacSystemFont,system-ui,sans-serif";

/**
 * A picture address made safe to sit inside url('…') in a style attribute
 * (security review, Oct 5): https only, and nothing in it can end the
 * string, the url( ) or the attribute. A player writes their own avatar
 * address, and these pins are HTML, so a crafted one could otherwise run
 * script on everyone who sees their pin. Anything else: no picture.
 */
const safePicture = (url?: string): string => {
  if (!url || url.length > 2000 || !/^https:\/\/[^\s]+$/i.test(url)) return '';
  const encoded = url.replace(/['"()\\<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  // Last, so the parser reads "&amp;" back as the address's own "&" and never meets an entity of the sender's.
  return encoded.replace(/&/g, '&amp;');
};

const face = (user: User, size: number) => {
  const picture = safePicture(user.avatarUrl);
  const fill = picture ? `background-image:url('${picture}');background-size:cover;` : `background:${surfaceColorFor(user.avatarSeed)};`;
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;${fill}color:#fff;${FONT};display:flex;align-items:center;justify-content:center">${picture ? '' : esc(initials(user.name))}</div>`;
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
 * How a lit court moves (litCourtPinHtml), only while it is one of the liveliest (cs-lit-run): the
 * tile's gradient flows (warm 8 s, lit 5 s, hot 3.2 s a loop), the ring's light goes round (7 s, 4.5 s,
 * 2.6 s a turn), a sheen flashes across the tile (lit and hot: once every 4.2 s, 2.8 s), the glow breathes
 * (3.2 s, 2.6 s, 1.8 s a breath) and a hot court sends a soft pulse out (2.2 s). Transform and opacity
 * only, each on its own layer. Still with Reduce Motion, and for the rest.
 */
export const LIT_CSS = `
.cs-lit-glow{transform:scale(1);opacity:.92}
.cs-lit-sheen{transform:translateX(-140%);opacity:0}
.cs-lit-wave{opacity:0}
.cs-far .cs-lit{scale:.84}
.cs-lit-run .cs-lit-spin{animation:cs-lit-spin 4.5s linear infinite}
.cs-lit-run.cs-lit-1 .cs-lit-spin{animation-duration:7s}
.cs-lit-run.cs-lit-3 .cs-lit-spin{animation-duration:2.6s}
@keyframes cs-lit-spin{to{transform:rotate(360deg)}}
.cs-lit-run .cs-lit-flow{animation:cs-lit-flow 5s linear infinite}
.cs-lit-run.cs-lit-1 .cs-lit-flow{animation-duration:8s}
.cs-lit-run.cs-lit-3 .cs-lit-flow{animation-duration:3.2s}
@keyframes cs-lit-flow{to{transform:translateX(-50%)}}
.cs-lit-run .cs-lit-glow{animation:cs-lit-breathe 2.6s ease-in-out infinite alternate}
.cs-lit-run.cs-lit-1 .cs-lit-glow{animation-duration:3.2s}
.cs-lit-run.cs-lit-3 .cs-lit-glow{animation-duration:1.8s}
@keyframes cs-lit-breathe{0%{transform:scale(.84);opacity:.6}100%{transform:scale(1.12);opacity:1}}
.cs-lit-run.cs-lit-2 .cs-lit-sheen{animation:cs-lit-sheen 4.2s cubic-bezier(.45,0,.25,1) infinite}
.cs-lit-run.cs-lit-3 .cs-lit-sheen{animation:cs-lit-sheen 2.8s cubic-bezier(.45,0,.25,1) infinite}
@keyframes cs-lit-sheen{0%{transform:translateX(-140%);opacity:0}6%{opacity:1}38%{transform:translateX(230%);opacity:1}42%,100%{transform:translateX(230%);opacity:0}}
.cs-lit-run.cs-lit-3 .cs-lit-wave{animation:cs-lit-wave 2.2s cubic-bezier(.2,.7,.3,1) infinite}
@keyframes cs-lit-wave{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.7);opacity:0}}
.cs-still .cs-lit-run .cs-lit-spin,.cs-still .cs-lit-run .cs-lit-flow,.cs-still .cs-lit-run .cs-lit-glow,.cs-still .cs-lit-run .cs-lit-sheen,.cs-still .cs-lit-run .cs-lit-wave{animation:none}
@media (prefers-reduced-motion:reduce){.cs-lit-run .cs-lit-spin,.cs-lit-run .cs-lit-flow,.cs-lit-run .cs-lit-glow,.cs-lit-run .cs-lit-sheen,.cs-lit-run .cs-lit-wave{animation:none}}
`;

/**
 * Styles the pins share, and what the map's zoom switches on: court names
 * once you are down at street level. The canvases put "cs-close" on the
 * map when zoomed in that far, "cs-far" when far out, and "cs-short" below
 * zoom 12, where players' names drop their "· 2h" (SHORT_ZOOM: the pin
 * engine leaves them less room there). "cs-hit" on a pin: an open hit
 * folded into it, zoomed out (a small dot, pinEngine). "cs-quiet" on the
 * still card: no pin takes a tap (the card does), and its pins settle in
 * with a 4 px drop as they fade (cs-drop), as the map fades in under them.
 *
 * Open to hit is a class on a pin's own marker element (OPEN_CLASS), not a
 * redraw, so switching it on or off animates: the green ring draws itself
 * round the face, a soft halo starts to breathe out from it (slowly, each
 * pin on its own beat), and a green dot slides in before the name (on your
 * own pin, "You · Open to hit"). Only a real change from off to on also
 * gives the face one small pop (JUST_OPEN_CLASS, put on for a moment by
 * the pin engine): a pin that appears already open, or is redrawn, never pops.
 * Off, it all eases back; the ring's ends go square as it unwinds, so it
 * never leaves a round dot behind. With Reduce Motion on (the system's
 * setting, or "cs-still" on the map, which the phone sets from its own),
 * only fades: the ring appears whole, the halo stays still.
 *
 * "cs-nn" on a player's pin: their name makes way for a face or a name
 * beside it (pinEngine's names()), fading out, and back as you zoom in.
 * "cs-spot": the small court mark in the middle of a ring of players at a
 * court whose own pin is not on the map, never in the way of a tap.
 * "cs-anchor" on a court: a ring of players fans round it, so its name and
 * its "3 playing" make way (the ring says it).
 *
 * A face-stack (pinEngine, a group a step or two from splitting): faces
 * peek out behind the leader's ("cs-pf"), fanned out by the marker's
 * --cs-pv, so as you zoom in they spring a little further apart in place.
 * A face leaving a gathered pin springs out ("cs-spring": a little past its
 * spot and back, growing to full size). Reduce Motion: no spring, no glide.
 */
export const MAP_PIN_CSS = `
.cs-court-name{display:none}
.cs-close .cs-court-name,.cs-court.cs-on .cs-court-name{display:block}
.cs-court-nm{display:none}
.cs-close .cs-court-nm,.cs-court.cs-on .cs-court-nm{display:inline}
.cs-far .cs-court.cs-live{transform:none}
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
.cs-playing .cs-halo-wrap{opacity:1}
.cs-playing .cs-halo{animation-play-state:running}
.cs-playing .cs-ring circle{stroke-dashoffset:0;opacity:1;stroke-linecap:round}
.cs-still .cs-halo{animation:none;transform:scale(1.35);opacity:.2}
.cs-still .cs-just-open .cs-disc{animation:none}
.cs-still .cs-ring circle,.cs-still .cs-open .cs-ring circle{stroke-dashoffset:0;transition:opacity .3s ease}
.cs-move{transition:translate .4s cubic-bezier(.2,.8,.2,1),transform .15s ease-out}
.cs-pop{animation:cs-pop-in .34s cubic-bezier(.22,.9,.32,1.18) both}
@keyframes cs-pop-in{0%{opacity:0;scale:.6}100%{opacity:1;scale:1}}
.cs-in{animation:cs-fade-in .22s ease-out both}
@keyframes cs-fade-in{from{opacity:0}to{opacity:1}}
.cs-out{animation:cs-fade-out .24s ease-in forwards}
@keyframes cs-fade-out{to{opacity:0;scale:.7}}
.cs-still .cs-pop{animation-name:cs-fade-in}
.cs-still .cs-out{animation-name:cs-fade-in;animation-direction:reverse}
.cs-quiet .cs-in{animation:cs-drop .26s cubic-bezier(.2,.8,.2,1) both}
@keyframes cs-drop{0%{opacity:0;translate:0 -4px}100%{opacity:1;translate:0 0}}
.cs-still .cs-quiet .cs-in{animation-name:cs-fade-in}
@media (prefers-reduced-motion:reduce){.cs-quiet .cs-in{animation-name:cs-fade-in}}
.cs-short .cs-ago{display:none}
.cs-hitdot{display:none;position:absolute;left:-1px;top:-1px;width:11px;height:11px;border-radius:999px;border:2px solid;box-sizing:border-box;z-index:2;pointer-events:none}
.cs-hit .cs-hitdot{display:block}
.cs-quiet .maplibregl-marker{pointer-events:none}
.cs-name{transition:opacity .2s ease}
.cs-nn .cs-name{opacity:0;pointer-events:none}
.cs-spot{pointer-events:none}
.cs-anchor .cs-court-name,.cs-anchor .cs-court-tag{display:none}
.cs-pf{position:absolute;translate:calc(var(--cs-pv,17px) * var(--cs-sx,1)) calc(var(--cs-pv,17px) * var(--cs-sy,0));transition:translate .42s cubic-bezier(.3,1.45,.5,1);animation:cs-pf-in .3s cubic-bezier(.3,1.45,.5,1) both}
@keyframes cs-pf-in{0%{opacity:0;scale:.6}100%{opacity:1;scale:1}}
.cs-move.cs-spring{transition:translate .5s cubic-bezier(.3,1.42,.5,1),transform .15s ease-out;animation:cs-grow .42s cubic-bezier(.3,1.42,.5,1) both}
@keyframes cs-grow{0%{opacity:.4;scale:.74}100%{opacity:1;scale:1}}
.cs-still .cs-pf{transition:none;animation-name:cs-fade-in}
.cs-still .cs-spring{animation:none}
@media (prefers-reduced-motion:reduce){.cs-pf{transition:none;animation-name:cs-fade-in}.cs-move.cs-spring{animation:none;transition:translate .4s cubic-bezier(.2,.8,.2,1),transform .15s ease-out}}
${LIT_CSS}`;

/**
 * The check-in zoom (mapGrow): as the Community card grows into the full map, its pins step aside with its words, a quick
 * fade on the marker itself (MapLibre may set its opacity inline, hence !important), so the push-in is into the map alone.
 * Kept out of MAP_PIN_CSS, which keys the card's saved pictures (cardShot).
 */
export const GROW_CLEAR_CSS = '.cs-clear .maplibregl-marker{opacity:0!important;transition:opacity .14s cubic-bezier(.25,.46,.45,.94)!important;pointer-events:none!important}';

/** The zoom at which court names show, and below which the court marks shrink. */
export const CLOSE_ZOOM_NAMES = 14.3;
export const FAR_ZOOM = 11.8;
/** Below this, players' names drop their "· 2h" (the pin engine gathers them closer there). */
export const SHORT_ZOOM = 12;

/** The class a player's marker element wears while they are open to hit (see MAP_PIN_CSS). */
export const OPEN_CLASS = 'cs-open';
/** Worn for a moment as a pin already on the map switches from off to on: its one pop (the pin engine puts it on). */
export const JUST_OPEN_CLASS = 'cs-just-open';
/** How long the pop lasts, with a little to spare. */
export const POP_MS = 650;
/** The classes a player's pin wears: "cs-open" while they are open to hit today. */
export const playerPinClass = (user: User) => (isOpenToHit(user) ? OPEN_CLASS : '');
/**
 * Worn by your own pin while you are playing a live session checked in at a
 * court (Oct 6): the same green ring and breathing halo as the courts with
 * something on, without Open to hit's "· Open to hit" (see MAP_PIN_CSS).
 */
export const PLAYING_CLASS = 'cs-playing';

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
  return `<div class="cs-disc" style="width:${box}px;height:${box}px"><!--cs-stack-->`
    + `<div class="cs-halo-wrap"><div class="cs-halo" style="left:${at}px;top:${at}px;width:${inner}px;height:${inner}px;background:${colors.open};animation-delay:-${beat(user.id)}ms"></div></div>`
    + `<div style="position:absolute;left:${at}px;top:${at}px;width:${inner}px;height:${inner}px;border-radius:999px;background:${colors.bg};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.24)">${face(user, size)}</div>`
    + `<svg class="cs-ring" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="${colors.open}" stroke-width="${RING}" stroke-linecap="round" stroke-dasharray="${round}" stroke-dashoffset="${round}"/></svg>`
    + `<i class="cs-hitdot" style="background:${colors.brand};border-color:${colors.bg}"></i><!--cs-badge--></div>`;
}

/**
 * A player: their face in a clean white ring; on the full map, their first
 * name and when they were last there. Open to hit today (their marker wears
 * playerPinClass), a green ring draws round them with a slow soft pulse, and
 * a green dot leads their name. The canvases hang it by its top, `discSize(size) / 2` up, so the face sits on the spot.
 */
export function playerPinHtml(user: User, { size, label, seenAt, atCourt = false }: { size: number; on?: boolean; label: boolean; seenAt?: string; /** On a court right now (migration 63): a small court before the name. */ atCourt?: boolean }): string {
  const ago = agoShort(seenAt);
  const when = ago ? `<span class="cs-ago" style="color:${colors.textMuted};font-weight:500"> · ${ago}</span>` : '';
  const court = atCourt ? `<span style="display:inline-block;vertical-align:-2px;margin-right:3px">${courtGlyph(colors.court, 11)}</span>` : '';
  const name = label ? `<div class="cs-name" style="margin-top:2px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border-radius:999px;background:${colors.bg};color:${colors.text};box-shadow:0 1px 4px rgba(0,0,0,.16);${FONT}"><i class="cs-dot" style="background:${colors.open}"></i>${court}${esc(user.name.split(' ')[0])}${when}</div>` : '';
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
export function mePinHtml(me: User, size: number, hidden = false, playing?: string): string {
  const open = `<span class="cs-tag-open"><span style="color:${colors.textMuted};font-weight:500">&nbsp;· </span>Open to hit</span>`;
  // "Only me" (migration 63): nobody else sees this pin, and the tag says so.
  const alone = hidden ? `<span style="color:${colors.textMuted};font-weight:500">&nbsp;· Hidden</span>` : '';
  // Playing a live session, checked in at a court (Oct 6): a steady green dot, "Playing now" and the court.
  const now = playing === undefined ? ''
    : `<span style="color:${colors.textMuted};font-weight:500">&nbsp;·&nbsp;</span>Playing now${playing ? `<span style="display:inline-block;max-width:118px;overflow:hidden;text-overflow:ellipsis;vertical-align:top;color:${colors.textMuted};font-weight:500">&nbsp;·&nbsp;${esc(playing)}</span>` : ''}`;
  const dot = playing === undefined ? `<i class="cs-dot" style="background:${colors.open}"></i>`
    : `<i style="display:inline-block;flex:none;width:7px;height:7px;margin-right:4px;border-radius:4px;background:${colors.open}"></i>`;
  const tag = `<div class="cs-name" style="margin-top:2px;display:flex;align-items:center;white-space:nowrap;padding:3px 8px;border-radius:999px;background:${colors.bg};color:${colors.text};box-shadow:0 1px 4px rgba(0,0,0,.16);${FONT}">${dot}You${now}${open}${alone}</div>`;
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
 * place to suggest. `live`: something on there now, in a few words ("3
 * playing", "Hit 6pm"; Oct 6, owner): the court glows, a green ring and a
 * soft halo, and the words sit beside it at every zoom (with its name
 * before them, close in); it never shrinks when zoomed out. `glowOnly`: the
 * same glow with no words, under your own pin when you are playing there
 * (your pin's tag says it, Oct 6). `plain` (while courts light up, which draw
 * their lit courts with litCourtPinHtml): the words beside it with no glow at
 * all (an open hit on another day).
 */
export function courtPinHtml(court: Court, on: boolean, ring = false, live?: string, glowOnly = false, plain = false): string {
  // A light rounded square with the court drawn in its colour: a place, not a person (Oct 5, owner: courts and
  // players looked too alike). Picked, it fills in. People stay round, bigger, with their faces.
  const size = on ? 28 : 22;
  const closed = isClosedCourt(court);
  const nameText = court.name && court.name !== 'Tennis courts' ? `${esc(court.name)}${closed ? ` · ${court.access === 'private' ? 'private' : 'members'}` : ''}` : '';
  const pill = `position:absolute;left:calc(100% + ${live ? 10 : ring ? 9 : 5}px);top:50%;transform:translateY(-50%);max-width:${live ? 190 : 150}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 7px;border-radius:999px;background:${colors.bg};box-shadow:0 1px 3px rgba(0,0,0,.14);${FONT}`;
  const glowing = (!!live || glowOnly) && !plain;
  const dot = plain ? colors.brand : colors.open;
  const name = live
    ? `<span class="cs-court-tag" style="${pill};color:${colors.text}"><i style="display:inline-block;width:6px;height:6px;margin-right:4px;border-radius:3px;vertical-align:1px;background:${dot}"></i>${nameText ? `<span class="cs-court-nm" style="color:${colors.textMuted};font-weight:500">${nameText} · </span>` : ''}${esc(live)}</span>`
    : nameText && !glowOnly ? `<span class="cs-court-name" style="${pill};color:${closed ? colors.textMuted : colors.text}">${nameText}</span>` : '';
  const glow = glowing ? `0 0 0 2px ${colors.bg},0 0 0 4px ${colors.open},0 0 12px 4px ${colors.open}66,` : ring ? storyRing(2, 2.5) : '';
  const tint = courtTone(court);
  const tone = closed ? colors.borderStrong : tint;
  const fill = on ? tone : colors.bg;
  const glyph = on ? (closed ? colors.bg : tint === colors.court ? colors.brandInk : colors.bg) : closed ? colors.textMuted : tint;
  const edge = on ? `2px solid ${colors.bg}` : `1.5px solid ${tone}`;
  return `<div class="cs-court cs-pin${on ? ' cs-on' : ''}${glowing ? ' cs-live' : ''}" style="position:relative;width:${size}px;height:${size}px;border-radius:${on ? 8 : 6}px;background:${fill};border:${edge};box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:${glow}0 2px 6px rgba(0,0,0,${on ? '.3' : '.2'});cursor:pointer${closed && !on ? ';opacity:.75' : ''}">${courtGlyph(glyph)}${name}${hitDot()}</div>`;
}

/* --------------------------------------------------------------- lit courts */

/** Two `#RRGGBB` colours mixed, `t` of the way from `a` to `b` (anything else: `a` as it is). */
function mix(a: string, b: string, t: number): string {
  const ha = a.replace('#', '');
  const hb = b.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(ha) || !/^[0-9a-f]{6}$/i.test(hb)) return a;
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[0, 2, 4].map((i) => Math.round(ch(ha, i) + (ch(hb, i) - ch(ha, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** How bright a `#RRGGBB` colour is to the eye (WCAG's relative luminance, 0 to 1); 0 for anything else. */
function brightness(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const u = parseInt(h.slice(i, i + 2), 16) / 255;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A lit court's tile across, by level (1 warm, 2 lit, 3 hot): two to three times a quiet court's 22. */
export const LIT_SIZE = [22, 44, 54, 64] as const;
/** The same, picked: a touch bigger again. */
export const litSize = (level: 1 | 2 | 3, on: boolean) => LIT_SIZE[level] + (on ? 6 : 0);
/** The page-coloured gap between the travelling ring and the tile, so the ring reads on a tile of the same colour. */
const GAP_LIT = 2;
/** The travelling ring's width, by level. */
const LIT_RING = [0, 3.5, 4, 4.5];
/** A corner face across, by level: bigger on a bigger court. */
const CORNER_FACE = [0, 22, 24, 26];

/** A friend's face for a court's corner: their picture, or their initials on their colour, in a ring of the page. */
const cornerFace = (px: number) => (user: User, i: number) => {
  const picture = safePicture(user.avatarUrl);
  const fill = picture ? `background-image:url('${picture}');background-size:cover;background-position:center;` : `background:${surfaceColorFor(user.avatarSeed)};`;
  return `<div style="position:relative;z-index:${5 - i};width:${px}px;height:${px}px;margin-left:${i ? -Math.round(px * 0.3) : 0}px;border-radius:999px;box-sizing:border-box;border:2px solid ${colors.bg};${fill}color:#fff;font:700 ${px >= 24 ? 9.5 : 8.5}px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:.2px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.28)">${picture ? '' : esc(initials(user.name))}</div>`;
};

/** A small person, for a count with no faces (strangers: only how many). */
const personGlyph = (color: string) =>
  `<svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true" style="flex:none;margin-right:2px"><circle cx="4.5" cy="2.6" r="2.2" fill="${color}"/><path d="M0.6 9.6c0-2.3 1.7-3.9 3.9-3.9s3.9 1.6 3.9 3.9z" fill="${color}"/></svg>`;

/**
 * Who is at a lit court, tucked into its corner (Oct 27, owner: "tuck the icons of people in the corner
 * of the court ... a couple icons and then +5 more"): up to three faces (only friends who follow each
 * other with you, and you), overlapping, then "+5" for everyone else; never more than three things, so a
 * crowd shows two faces and the rest as "+N". Strangers are only ever in the number. With no face to
 * show, the number alone with a small person ("4"), so it never reads as "4 more" of no one.
 */
function cornerWho(faces: User[], others: number, level: 1 | 2 | 3): string {
  if (!faces.length && !others) return '';
  const px = CORNER_FACE[level];
  const room = others > 0 ? 2 : 3;
  const shown = faces.slice(0, room);
  const more = others + (faces.length - shown.length);
  const pill = more > 0
    ? `<div style="position:relative;z-index:1;height:${px}px;min-width:${px}px;margin-left:${shown.length ? -Math.round(px * 0.3) : 0}px;padding:0 ${shown.length ? 6 : 7}px 0 ${shown.length ? 8 : 6}px;box-sizing:border-box;border-radius:999px;border:2px solid ${colors.bg};background:${colors.text};color:${colors.bg};font:700 ${px >= 24 ? 12 : 11}px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.28)">${shown.length ? '' : personGlyph(colors.bg)}${shown.length ? '+' : ''}${more}</div>`
    : '';
  return `<div class="cs-lit-who" style="position:absolute;z-index:4;left:calc(100% - ${Math.round(px * 0.85)}px);top:-${Math.round(px * 0.48)}px;display:flex;align-items:center;pointer-events:none">${shown.map(cornerFace(px)).join('')}${pill}</div>`;
}

/** A tennis court from above, in white lines, for a lit tile `px` across: the outline, the service boxes, the net. */
const courtLines = (px: number, ink: string) => {
  const w = px * 0.5;
  const h = px * 0.68;
  return `<svg width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 20 28" aria-hidden="true" style="position:relative;z-index:2;flex:none"><g fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="1" width="18" height="26" rx="1.4"/><line x1="1" y1="14" x2="19" y2="14" stroke-width="2"/><line x1="1" y1="7.5" x2="19" y2="7.5" stroke-width="1.1"/><line x1="1" y1="20.5" x2="19" y2="20.5" stroke-width="1.1"/><line x1="10" y1="7.5" x2="10" y2="20.5" stroke-width="1.1"/></g></svg>`;
};

/**
 * A colour "switched on": the same hue, brighter and a touch richer (`up`: how much lighter, 0 to 1 of
 * the way), the way a lamp brightens a colour rather than washing it out to pastel as white would.
 */
function lightUp(hex: string, up: number): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const l2 = Math.min(0.72, l + (1 - l) * up);
  const s2 = Math.min(0.85, s + 0.12);
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r1, g1, b1] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A lit court's colours, from the theme, by level: the tile's two (the brand flowing into B), the ring's
 * light, and the glow. B is the brand switched on (lightUp), brighter each level; on a hot court, where
 * the theme's warm second colour (sun) is a bright one (New York's orange, Night's gold), that instead:
 * the heat. A dark sun (Clean's and Paris's deep gold) would turn the brand muddy halfway across, so
 * there the brand's own light stays.
 */
function litColours(level: 1 | 2 | 3) {
  const brand = colors.brand;
  const light = mix(brand, '#ffffff', 0.62);
  const warm = level === 3 && brightness(colors.sun) > 0.35;
  const b = warm ? colors.sun : lightUp(brand, [0, 0.2, 0.3, 0.4][level]);
  return { brand, light, a: brand, b, glow: b, ink: colors.brandInk };
}

/**
 * A court lit up (Oct 27 review, owner: "the lighting up courts should be way more noticble, maybe the
 * courts can be bigger, and the light up should have maybe even a graident, maybe even a live gradient
 * that flahes and animates. it needs to be really like eye catching"; features/places/lightUp).
 *
 * A big rounded tile, LIT_SIZE across by level (44 warm, 54 lit, 64 hot; a quiet court is 22), filled
 * with a gradient of the theme's own colours (the brand into a light of it; a hot court's brand into the
 * theme's warm second colour, sun) with the court drawn on it in the brand's ink. Round it, past a gap of
 * the page, a ring in the same colours with a bright light in it (a story ring: something on, tap it).
 * `live` (the liveliest few, lightUp's LIVE_MAX), it comes alive: the tile's gradient flows across it,
 * the ring's light travels round, a sheen flashes over the tile now and then, and a soft glow breathes
 * behind it; a hot court does all of it faster and sends a soft pulse out. Every moving part is a small
 * layer of its own moved only by transform and opacity (no blur filter, no gradient redrawn each frame),
 * so the page's compositor runs it off the main thread, in the browser and the phone's web view alike;
 * each court starts at its own point in the beat. Reduce Motion (cs-still, or the system's setting):
 * the same gradient, ring and glow, still.
 *
 * Who is there sits on its top right corner (cornerWho): faces of friends, then "+5". Its words ("7 here",
 * with the court's name before them close in) hang under it, centred.
 */
export function litCourtPinHtml(court: Court, { level, on, label, faces, others, live }: {
  level: 1 | 2 | 3; on: boolean; label?: string; faces: User[]; others: number; live: boolean;
}): string {
  const size = litSize(level, on);
  const ring = LIT_RING[level];
  const r = Math.round(size * 0.28);
  const closed = isClosedCourt(court);
  const k = litColours(level);
  // The ring: the brand all round, a bright light of it (and on a hot court a second light, warm) going round.
  const conic = level === 3
    ? `conic-gradient(from 0deg,${k.brand} 0deg,${k.light} 45deg,${k.brand} 100deg,${k.b} 160deg,${mix(k.b, '#ffffff', 0.5)} 205deg,${k.b} 250deg,${k.brand} 320deg,${k.brand} 360deg)`
    : `conic-gradient(from 0deg,${k.brand} 0deg,${k.light} 55deg,${k.brand} 120deg,${k.b} 240deg,${k.brand} 360deg)`;
  // The tile's gradient, twice over on a strip twice as wide, so sliding it by half loops without a seam.
  const flow = `linear-gradient(90deg,${k.a} 0%,${k.b} 25%,${k.a} 50%,${k.b} 75%,${k.a} 100%)`;
  const glow = `radial-gradient(closest-side,${withAlpha(k.glow, level === 1 ? 0.5 : 0.7)} 0%,${withAlpha(k.glow, level === 1 ? 0.3 : 0.42)} 48%,${withAlpha(k.brand, 0.14)} 74%,${withAlpha(k.brand, 0)} 100%)`;
  const reach = Math.round(size * (0.32 + level * 0.1));
  const delay = `animation-delay:-${beat(court.id)}ms`;
  const spin = Math.ceil(size * 1.5);
  const inner = ring + GAP_LIT;
  const nameText = court.name && court.name !== 'Tennis courts' ? esc(court.name) : '';
  const words = label
    ? `<span class="cs-court-tag cs-lit-tag" style="position:absolute;left:50%;top:calc(100% + ${level === 3 ? 9 : 7}px);transform:translateX(-50%);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 9px 3px 7px;border-radius:999px;background:${colors.bg};color:${colors.text};box-shadow:0 2px 6px rgba(0,0,0,.18);${FONT};font-weight:700"><i style="display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:4px;vertical-align:0;background:linear-gradient(135deg,${k.a},${k.b})"></i>${nameText ? `<span class="cs-court-nm" style="color:${colors.textMuted};font-weight:500">${nameText} · </span>` : ''}${esc(label)}</span>`
    : '';
  const picked = on ? `0 0 0 2px ${colors.bg},0 0 0 4px ${colors.text},` : '';
  return `<div class="cs-court cs-pin cs-live cs-lit cs-lit-${level}${live ? ' cs-lit-run' : ''}${on ? ' cs-on' : ''}" style="position:relative;width:${size}px;height:${size}px;cursor:pointer${closed ? ';opacity:.8' : ''}">`
    // The glow breathing behind.
    + `<i class="cs-lit-glow" style="position:absolute;left:-${reach}px;top:-${reach}px;right:-${reach}px;bottom:-${reach}px;border-radius:999px;background:${glow};pointer-events:none;${delay}"></i>`
    // A hot court's pulse, going out.
    + (level === 3 ? `<i class="cs-lit-wave" style="position:absolute;inset:0;border-radius:${r}px;background:${withAlpha(k.glow, 0.32)};pointer-events:none;${delay}"></i>` : '')
    // The ring: a frame of the travelling gradient, the tile laid inside it past a gap of the page.
    + `<div class="cs-lit-frame" style="position:absolute;inset:0;border-radius:${r}px;overflow:hidden;isolation:isolate;-webkit-mask-image:-webkit-radial-gradient(white,black);box-shadow:${picked}0 4px 14px rgba(0,0,0,.3)">`
    + `<i class="cs-lit-spin" style="position:absolute;left:50%;top:50%;width:${spin}px;height:${spin}px;margin:-${spin / 2}px 0 0 -${spin / 2}px;background:${conic};${delay}"></i>`
    + `<div style="position:absolute;inset:${inner}px;border-radius:${Math.max(2, r - inner)}px;background:${k.a};overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 ${GAP_LIT}px ${colors.bg}">`
    // The tile's gradient, on a wide strip laid across it at an angle (it flows along the strip).
    + `<div style="position:absolute;left:-60%;top:-60%;width:220%;height:220%;transform:rotate(-32deg);pointer-events:none"><i class="cs-lit-flow" style="position:absolute;left:0;top:0;width:200%;height:100%;background:${flow};${delay}"></i></div>`
    + courtLines(size - inner * 2, withAlpha(k.ink, closed ? 0.7 : 0.95))
    + `<i class="cs-lit-sheen" style="position:absolute;top:-20%;bottom:-20%;left:-10%;width:55%;z-index:3;background:linear-gradient(100deg,${withAlpha('#ffffff', 0)} 0%,${withAlpha('#ffffff', 0.55)} 50%,${withAlpha('#ffffff', 0)} 100%);pointer-events:none;${delay}"></i>`
    + `</div></div>`
    + cornerWho(faces, others, level)
    + words
    + hitDot()
    + `</div>`;
}


/** The dot an open hit folds into on a pin when zoomed out (pinEngine puts "cs-hit" on the pin). */
const hitDot = () => `<i class="cs-hitdot" style="background:${colors.brand};border-color:${colors.bg}"></i>`;

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
  const tone = closed ? colors.borderStrong : colors.court;
  const halo = ring ? storyRing(1.5, 2.5) : '';
  return `<div style="width:18px;height:18px;border-radius:5px;background:${colors.bg};border:1.5px solid ${tone};box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:${halo}0 1px 4px rgba(0,0,0,.18);pointer-events:none${closed ? ';opacity:.75' : ''}">${courtGlyph(closed ? colors.textMuted : tone, 10)}</div>`;
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
  return `<div class="cs-pin" style="display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="position:relative;display:flex;align-items:center;gap:4px;padding:${on ? '5px 10px' : '4px 8px'};border-radius:999px;background:${colors.brand};color:${colors.brandInk};white-space:nowrap;box-shadow:${ring}0 2px 8px rgba(0,0,0,${on ? '.3' : '.2'});${FONT}">${ball(colors.brandInk, colors.brand)}<span>${when}</span><!--cs-badge--></div><div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${colors.brand}"></div></div>`;
}

/** How far above its spot a hit's flag hangs: clear of a court pin there. */
export const HIT_LIFT = -10;

/** How far above the middle a picked court lands, for a map this tall: in the open strip above its card. */
export const courtLift = (mapHeight: number) => Math.round(Math.min(220, mapHeight * 0.24));
/** The same for your own pin under your (shorter) card: in clear view, so switching Open to hit shows on it. */
export const youLift = (mapHeight: number) => Math.round(Math.min(150, mapHeight * 0.14));

/** A face in a face-stack: a little smaller than a pin's own, in a ring of the page colour (PILE_DISC across). */
const PILE_FACE = 28;
const PILE_DISC = PILE_FACE + 6;
/** A player's face alone, for a face-stack (pinEngine's pile): put in the `pile` template's {face}. */
export const pileFaceHtml = (user: User) => face(user, PILE_FACE);

/**
 * What gathered pins look like (pinEngine), in the theme's colours. A
 * crowd of players is the leading player's own pin with a second disc
 * peeking out behind it and a small ink badge, "+4"; so when it splits the
 * leader's pin is left exactly where it was. A crowd of courts is a court
 * square stretched to hold its number, the little court and "11" (every
 * court at those places), quiet like a single court's square: outlined, not
 * filled, so the faces stay the loudest thing (Oct 6, owner: "Numbers +
 * fewer"; players always show a face, so a number reads as courts). Never
 * mistaken for players. Players crowding your own pin (or
 * whoever is picked) gather into a small "+3" beside it instead (`chip`).
 * Players checked in at one court, zoomed in, fan round the court's own
 * pin in a ring (pinEngine), with no lines (Oct 7, owner: a ring round a
 * court says they are at it); `spot`, a small court mark, stands in the
 * middle only when that court's pin is not on the map. Just before a group
 * splits it shows as a face-stack: the leader's pin with the next faces
 * peeking out behind it, each in a ring of the page colour (`pile`, round
 * a pileFaceHtml face), the way a likes row stacks faces.
 */
export function clusterTemplates(): { badge: string; stack: string; court: string; chip: string; spot: string; pile: string } {
  const box = discSize(30);
  const inner = 30 + GAP * 2;
  const at = (box - inner) / 2;
  return {
    badge: `<div style="position:absolute;right:-7px;top:-3px;min-width:22px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:${colors.text};color:${colors.bg};border:2px solid ${colors.bg};display:flex;align-items:center;justify-content:center;${FONT};font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,.2)">{n}</div>`,
    stack: `<div style="position:absolute;left:${at - 9}px;top:${at - 2}px;width:${inner}px;height:${inner}px;border-radius:999px;background:${colors.surfaceAlt};border:1.5px solid ${colors.bg};box-sizing:border-box;box-shadow:0 2px 7px rgba(0,0,0,.2)"></div>`,
    court: `<div class="cs-pin" style="position:relative;display:flex;align-items:center;gap:3px;height:24px;padding:0 7px 0 5px;border-radius:6px;background:${colors.bg};border:1.5px solid ${colors.court};box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,.2);color:${colors.court};white-space:nowrap;${FONT};font-size:12px;cursor:pointer">${courtGlyph(colors.court, 11)}{n}${hitDot()}</div>`,
    // Beside you (or whoever is picked): the others crowding your spot, as a small ink "+3" with a disc peeking behind it.
    chip: `<div class="cs-pin" style="position:relative;width:40px;height:30px;cursor:pointer"><div style="position:absolute;left:12px;top:2px;width:26px;height:26px;border-radius:999px;background:${colors.surfaceAlt};border:1.5px solid ${colors.bg};box-sizing:border-box;box-shadow:0 2px 6px rgba(0,0,0,.18)"></div><div style="position:absolute;left:0;top:2px;min-width:28px;height:26px;padding:0 7px;box-sizing:border-box;border-radius:999px;background:${colors.text};color:${colors.bg};border:2px solid ${colors.bg};display:flex;align-items:center;justify-content:center;${FONT};box-shadow:0 2px 6px rgba(0,0,0,.22)">{n}</div></div>`,
    // In the middle of a ring of players at a court whose own pin is not on the map: a court mark, the way a court pin looks.
    spot: `<div style="width:22px;height:22px;border-radius:6px;background:${colors.bg};border:1.5px solid ${colors.court};box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2);pointer-events:none">${courtGlyph(colors.court)}</div>`,
    // A face peeking out of a face-stack, from the leader's disc's middle ({x},{y}) out {sx},{sy} times the pin's --cs-pv.
    pile: `<div class="cs-pf" style="left:{x}px;top:{y}px;width:${PILE_DISC}px;height:${PILE_DISC}px;margin:-${PILE_DISC / 2}px 0 0 -${PILE_DISC / 2}px;--cs-sx:{sx};--cs-sy:{sy};border-radius:999px;background:${colors.bg};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 7px rgba(0,0,0,.22)">{face}</div>`,
  };
}
