import type { User } from '@/data/types';
import type { CanvasMarker } from '@/components/map/pinEngine';
import { HIT_LIFT, agoShort, courtDotHtml, courtPinHtml, discSize, hitPinHtml, mePinHtml, playerPinClass, playerPinHtml } from '@/components/map/markers';
import type { MapModel, Placed } from '@/features/players/mapModel';
import { isOpenToHit } from '@/features/players/openToHit';

/** Your face on your own pin, a touch bigger than everyone else's. */
export const ME_SIZE = 34;

/**
 * About how wide a name pill under a pin is (11 px type, about 6.4 px a
 * letter, its padding, the green dot and the little court when they show),
 * at most its 130 px, so the pin engine gives short names less room than
 * long ones. With and without the "· 2h" (gone below zoom 12).
 */
const CHAR = 6.4;
function nameWidths(first: string, { ago, open, court }: { ago?: string; open?: boolean; court?: boolean }): { fw: number; fws: number } {
  const base = 16 + (open ? 11 : 0) + (court ? 14 : 0) + first.length * CHAR;
  return { fw: Math.min(130, Math.round(base + (ago ? (3 + ago.length) * CHAR : 0))), fws: Math.min(130, Math.round(base)) };
}

/**
 * Who leads a crowd of players gathered into "+N": someone up for a hit
 * first (their green ring then rings the gathered pin), then whoever was
 * there most recently; anyone who hides when they were last seen after.
 */
const playerRank = (p: Placed, now: number) =>
  (isOpenToHit(p.user) ? 0 : 1e9) + (p.seenAt ? Math.max(0, now - Date.parse(p.seenAt)) / 60_000 : 1e8);

/**
 * Everything the map draws, as one list for the pin engine (pinEngine): the
 * same on the phone (MapCanvas) and in a browser (WebMap). Courts under hit
 * flags under players under you; players, the full map's courts and hit
 * flags may gather into "+N" when they crowd. You and the picked player
 * never gather into anyone (whoever crowds you shows as "+N" beside you);
 * a picked court or hit never gathers at all.
 */
export function mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden = false }: {
  model: MapModel; expanded: boolean; me: User; shown: Placed[]; selectedId: string | null; selectedCourtId: string | null; selectedHitId: string | null;
  /** You chose "Only me": your own pin says so. */
  hidden?: boolean;
}): CanvasMarker[] {
  const now = Date.now();
  // Full court pins only on the full map (the model draws none on the card either).
  // A court played on this week wears the green story ring (courts only, never a random spot).
  const list: CanvasMarker[] = (expanded ? model.courts : []).map((c, i) => {
    const on = c.id === selectedCourtId;
    const ringed = model.ringed.has(c.id);
    return { id: `c:${c.id}`, lat: c.lat, lng: c.lng, html: courtPinHtml(c, on, ringed), z: on ? 4 : 1, k: 'c' as const, r: (ringed ? 0 : 1e6) - c.count * 1000 + i, sel: on, g: 'c' as const, role: 'button', label: c.name };
  });
  // The still card: your city's courts as quiet dots, under everything.
  if (!expanded) for (const c of model.cardCourts) list.push({ id: `d:${c.id}`, lat: c.lat, lng: c.lng, html: courtDotHtml(c, model.cardRinged.has(c.id)), z: 0 });
  // Open hits as flags, hung above any court pin at the same spot — on the
  // full map only. On the still card the flags crowded the city's name in the
  // middle, and the hits are listed just below it anyway (Oct 2).
  for (const h of expanded ? model.hits : []) {
    const on = h.hit.id === selectedHitId;
    // Crowded flags gather behind the soonest one.
    list.push({ id: `h:${h.hit.id}`, lat: h.at.lat, lng: h.at.lng, html: hitPinHtml(h.hit, on), anchor: 'bottom', offsetY: HIT_LIFT, z: on ? 5 : 2, k: 'h', r: Date.parse(h.hit.startsAt) || 0, sel: on, g: 'h', role: 'button', label: `Open hit at ${h.hit.place.name}` });
  }
  for (const p of shown) {
    const on = p.user.id === selectedId;
    const size = on ? 38 : 30;
    // Open to hit is a class on the pin (cls), so it eases on and off in place rather than redrawing;
    // an open player stands above the plain ones beside them, so a neighbour never covers their ring.
    const widths = expanded ? nameWidths(p.user.name.split(' ')[0], { ago: agoShort(p.seenAt), open: isOpenToHit(p.user), court: !!p.court }) : { fw: discSize(size), fws: discSize(size) };
    list.push({
      ...widths,
      id: `p:${p.user.id}`, lat: p.at.lat, lng: p.at.lng,
      html: playerPinHtml(p.user, { size, on, label: expanded, seenAt: p.seenAt, atCourt: !!p.court }),
      cls: playerPinClass(p.user), anchor: expanded ? 'top' : 'center', offsetY: expanded ? -discSize(size) / 2 : 0,
      z: on ? 5 : isOpenToHit(p.user) ? 4 : 3, k: 'p', r: playerRank(p, now), sel: on, ds: discSize(size), g: 'p',
      // On the still card the whole card is the one button; the pins only name who is there.
      role: expanded ? 'button' : undefined, label: p.user.name,
    });
  }
  // Your pin only where you last shared your location; location off, no pin.
  // Not on the still card: it shows your city, never your spot in it.
  const mine = expanded ? model.mePos : null;
  // Hung by its top, the face on your spot; Open to hit switches its class, so the green ring draws in behind your card.
  // Never gathered: players crowding your spot gather into a "+N" beside you (fix).
  // Your tag: "You", with "· Open to hit" or "· Hidden" when they show.
  const meWidths = nameWidths(`You${isOpenToHit(me) ? ' · Open to hit' : ''}${hidden ? ' · Hidden' : ''}`, { open: isOpenToHit(me) });
  if (mine) list.push({ ...meWidths, id: 'me', lat: mine.lat, lng: mine.lng, html: mePinHtml(me, ME_SIZE, hidden), cls: playerPinClass(me), anchor: 'top', offsetY: -discSize(ME_SIZE) / 2, z: 6, k: 'p', fix: true, r: -1, ds: discSize(ME_SIZE), g: 'p', role: 'button', label: 'You' });
  return list;
}
