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
 */
export type FindPlayersLook = 'now' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const FIND_PLAYERS_LOOK = 'now' as FindPlayersLook;
