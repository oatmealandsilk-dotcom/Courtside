/**
 * Find Players' Courts near you and empty Open hits, three looks to compare
 * (Oct 24, owner: "This looks a bit ai too", circling the court cards with
 * their icon tiles and the Open hits prompt with its paragraph).
 * - 'now': as shipped (icon-tile cards, the pill and its sentence).
 * - 'A' quieter: the same strip of cards, slimmer, no icon tile; an empty
 *   Open hits is one line with a plain "Post a hit" beside the title.
 * - 'B' list: the three nearest courts as slim rows with "See all";
 *   an empty Open hits is one row, "Looking for a hit? Post one".
 */
export type FindPlayersLook = 'now' | 'A' | 'B';
export const FIND_PLAYERS_LOOK = 'now' as FindPlayersLook;
