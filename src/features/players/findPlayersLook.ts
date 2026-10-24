/**
 * Find Players' Courts near you and empty Open hits, three looks to compare
 * (Oct 24, owner: "This looks a bit ai too", circling the court cards with
 * their icon tiles and the Open hits prompt with its paragraph).
 * - 'now': as shipped (icon-tile cards, the pill and its sentence).
 * - 'A' quieter: the same strip of cards, slimmer, no icon tile; an empty
 *   Open hits is one line with a plain "Post a hit" beside the title.
 * - 'B' list: the three nearest courts as slim rows with "See all";
 *   an empty Open hits is one row, "Looking for a hit? Post one".
 * Courts near you only (Oct 24, owner: "I don't like a or b ... Make more"),
 * drawn in components/place/CourtsNearLooks.tsx; Open hits stays as 'now':
 * - 'C' chips: one line of the app's choice chips, name and distance.
 * - 'D' court drawing: each court drawn from above in its surface's colour.
 * - 'E' what's on: each card leads with the latest report, players on
 *   court, an open hit or who plays there; else the court itself.
 * - 'F' type only: names in larger type, distance under, thin rules.
 * After C to F (owner: "Not aesthetic"), three drawn as pictures, in
 * components/place/CourtsNearPictures.tsx (the courts from above, AerialCourt):
 * - 'G' postcard: landscape cards, the courts from above on the page's ground.
 * - 'H' court card: portrait cards in the court's colour, lines turned and cut.
 * - 'I' big tile: the nearest court large, the next two as links under it.
 * After G to I ("Those look worse, show originals", then "Generate some
 * more"), four close variations of 'now', in components/place/CourtsNearCards.tsx:
 * - 'J' real court icon: a tiny court from above in its surface's colour in the tile.
 * - 'K' quieter tile: the tile is the court's colour alone; what's on bottom right.
 * - 'L' status first: what's on, in the accent, takes the distance's line.
 * - 'M' lighter card: no fill, a hairline border, more room, a larger name.
 */
export type FindPlayersLook = 'now' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';
export const FIND_PLAYERS_LOOK = 'now' as FindPlayersLook;
