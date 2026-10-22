import type { User } from '@/data/types';
import type { CanvasMarker } from '@/components/map/pinEngine';
import { HIT_LIFT, PLAYING_CLASS, agoShort, courtPinHtml, discSize, hitPinHtml, mePinHtml, pileFaceHtml, playerPinClass, playerPinHtml } from '@/components/map/markers';
import { milesBetween } from '@/features/players/geo';
import { hitShort } from '@/features/hits/format';
import { COURTS_MIN_ZOOM, type MapModel, type Placed } from '@/features/players/mapModel';
import { isOpenToHit } from '@/features/players/openToHit';

/** Your face on your own pin, a touch bigger than everyone else's. */
export const ME_SIZE = 38;
/** Standing on a court: within about 20 m of its pin (pinList's courtUnder). */
const ON_COURT_MILES = 0.0125;

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
 * first (their green ring then rings the gathered pin), then a friend who
 * follows each other with you (Snapchat style: zoomed out, your town's pin
 * wears a friend's face), then whoever was there most recently; anyone who
 * hides when they were last seen after.
 */
const playerRank = (p: Placed, now: number) =>
  (isOpenToHit(p.user) ? 0 : 2e9) + (p.mutual ? 0 : 1e9) + (p.seenAt ? Math.max(0, now - Date.parse(p.seenAt)) / 60_000 : 1e8);

/**
 * Everything the map draws, as one list for the pin engine (pinEngine): the
 * same on the phone (MapCanvas) and in a browser (WebMap). Courts under hit
 * flags under players under you; players, the full map's courts and hit
 * flags may gather into "+N" when they crowd. You and the picked player
 * never gather into anyone (whoever crowds you shows as "+N" beside you);
 * a picked court or hit never gathers at all.
 */
export function mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden = false, playing = null }: {
  model: MapModel; expanded: boolean; me: User; shown: Placed[]; selectedId: string | null; selectedCourtId: string | null; selectedHitId: string | null;
  /** You chose "Only me": your own pin says so. */
  hidden?: boolean;
  /**
   * You are playing a live session, checked in at this court (Oct 6; see
   * livePin): your pin wears the green ring and "Playing now · <court>", and
   * the court glows the way a court with players on it does, counting you.
   */
  playing?: { courtId: string; courtName: string } | null;
}): CanvasMarker[] {
  const now = Date.now();
  // Full court pins only on the full map (the model draws none on the card either).
  // A court played on this week wears the green story ring (courts only, never a random spot).
  // Courts show only from about a city in (COURTS_MIN_ZOOM, the same zoom they load from):
  // zoomed out on a country they fade away (the map says "Zoom in to see courts"), and
  // none of them is drawn there. The picked court stays with its card.
  // What is on at each court right now, its glow and its label (Oct 6, owner): players standing
  // on it ("3 playing"), else its soonest open hit ("Hit 6pm"), whose flag then folds into it.
  const playingAt = new Map<string, number>();
  const hitAt = new Map<string, string>();
  if (expanded) {
    for (const p of shown) if (p.court) playingAt.set(p.court.id, (playingAt.get(p.court.id) ?? 0) + 1);
    for (const h of model.hits) {
      const id = h.hit.place.id;
      if (id && (!hitAt.has(id) || h.hit.startsAt < hitAt.get(id)!)) hitAt.set(id, h.hit.startsAt);
    }
  }
  const drawn = new Set<string>();
  // The court someone exactly placed is standing on (within about 20 m of its pin), if any: the nearest. Only exact spots (you,
  // friends who follow each other with you): a rough spot is nudged about, so it never puts anyone at a court.
  const courtUnder = (spot: { lat: number; lng: number }, prefer?: string): string | undefined => {
    let best: string | undefined;
    let bestMiles = ON_COURT_MILES;
    for (const c of expanded ? model.courts : []) {
      const miles = milesBetween(spot, c);
      if (miles < ON_COURT_MILES && c.id === prefer) return `c:${c.id}`;
      if (miles < bestMiles) { bestMiles = miles; best = `c:${c.id}`; }
    }
    return best;
  };
  // Your own spot, on the full map only (see "Your pin" below): where your pin stands, for the court you play at.
  const meAt = expanded ? model.mePos : null;
  const list: CanvasMarker[] = (expanded ? model.courts : []).map((c, i) => {
    const on = c.id === selectedCourtId;
    const ringed = model.ringed.has(c.id);
    drawn.add(c.id);
    const n = playingAt.get(c.id) ?? 0;
    const hit = hitAt.get(c.id);
    // Your live session's court counts you: "You're playing", "You + 2 playing".
    const yours = playing?.courtId === c.id;
    const tag = yours ? (n ? `You + ${n} playing` : 'You’re playing') : n ? `${n} playing` : hit ? `Hit ${hitShort(hit).replace(/^Today /, '')}` : undefined;
    // Your pin standing on it already says so: the court only glows under it, no words beside.
    const underYou = yours && !on && !!meAt && milesBetween(meAt, c) < 0.05;
    // Something on: never gathered into a court crowd, above the others, and shown at every zoom (as its hit's flag was).
    // `n`: how many courts it is, for the count on a crowd.
    return { id: `c:${c.id}`, lat: c.lat, lng: c.lng, html: courtPinHtml(c, on, ringed, underYou ? undefined : tag, underYou), z: on ? 4 : tag ? 2 : 1, k: 'c' as const, r: (ringed ? 0 : 1e6) - c.count * 1000 + i, sel: on, solo: !!tag, n: c.count, g: 'c' as const, role: 'button', label: tag ? `${c.name}, ${tag}` : c.name, mz: on || tag ? undefined : COURTS_MIN_ZOOM };
  });
  // The still card: your city's courts as quiet dots, under everything.
  // The still card shows people and hits only; courts live on the full map (Oct 3, owner).
  // Open hits as flags, hung above any court pin at the same spot — on the
  // full map only. On the still card the flags crowded the city's name in the
  // middle, and the hits are listed just below it anyway (Oct 2).
  for (const h of expanded ? model.hits : []) {
    const on = h.hit.id === selectedHitId;
    // A hit at a court on the map is that court's "Hit 6pm" (its card lists it); picked, its flag shows.
    if (!on && h.hit.place.id && drawn.has(h.hit.place.id)) continue;
    // Crowded flags gather behind the soonest one.
    list.push({ id: `h:${h.hit.id}`, lat: h.at.lat, lng: h.at.lng, html: hitPinHtml(h.hit, on), anchor: 'bottom', offsetY: HIT_LIFT, z: on ? 5 : 2, k: 'h', r: Date.parse(h.hit.startsAt) || 0, sel: on, g: 'h', role: 'button', label: `Open hit at ${h.hit.place.name}` });
  }
  for (const p of shown) {
    const on = p.user.id === selectedId;
    const size = on ? 42 : 34;
    // Open to hit is a class on the pin (cls), so it eases on and off in place rather than redrawing;
    // an open player stands above the plain ones beside them, so a neighbour never covers their ring.
    const widths = expanded ? nameWidths(p.user.name.split(' ')[0], { ago: agoShort(p.seenAt), open: isOpenToHit(p.user), court: !!p.court }) : { fw: discSize(size), fws: discSize(size) };
    list.push({
      ...widths,
      id: `p:${p.user.id}`, lat: p.at.lat, lng: p.at.lng,
      html: playerPinHtml(p.user, { size, on, label: expanded, seenAt: p.seenAt, atCourt: !!p.court }),
      cls: playerPinClass(p.user), anchor: expanded ? 'top' : 'center', offsetY: expanded ? -discSize(size) / 2 : 0,
      z: on ? 5 : isOpenToHit(p.user) ? 4 : 3, k: 'p', r: playerRank(p, now), sel: on, ds: discSize(size), g: 'p',
      // Checked in at a court: only players at one court ring round it (pinEngine). Their face alone, for a face-stack.
      at: !expanded ? undefined : p.court ? `c:${p.court.id}` : p.rough ? undefined : courtUnder(p.at), fh: expanded ? pileFaceHtml(p.user) : undefined,
      // On the still card the whole card is the one button; the pins only name who is there.
      role: expanded ? 'button' : undefined, label: p.user.name,
    });
  }
  // Your pin only where you last shared your location; location off, no pin.
  // Not on the still card: it shows your city, never your spot in it.
  const mine = meAt;
  // Hung by its top, the face on your spot; Open to hit switches its class, so the green ring draws in behind your card.
  // Never gathered: players crowding your spot gather into a "+N" beside you (fix).
  // Your tag: "You", with "· Playing now · <court>", "· Open to hit" or "· Hidden" when they show.
  const nowWords = playing ? ` · Playing now · ${playing.courtName.slice(0, 18)}` : '';
  const meWidths = nameWidths(`You${nowWords}${isOpenToHit(me) ? ' · Open to hit' : ''}${hidden ? ' · Hidden' : ''}`, { open: isOpenToHit(me) || !!playing });
  const meClass = [playerPinClass(me), playing ? PLAYING_CLASS : ''].filter(Boolean).join(' ');
  // Standing on a court (the one you are playing at first): players checked in at it ring round you.
  if (mine) list.push({ ...meWidths, at: courtUnder(mine, playing?.courtId), id: 'me', lat: mine.lat, lng: mine.lng, html: mePinHtml(me, ME_SIZE, hidden, playing ? playing.courtName : undefined), cls: meClass, anchor: 'top', offsetY: -discSize(ME_SIZE) / 2, z: 6, k: 'p', fix: true, r: -1, ds: discSize(ME_SIZE), g: 'p', role: 'button', label: 'You' });
  return list;
}
