/**
 * City boards, admins first (migration 196; owner, Oct 28: "New rank city
 * sessions is good"). Two halves, like King of the Court:
 *
 *   - here, the app's: off, Find Players is exactly as before ("You're early
 *     in …", a plain Open to hit), nothing links to the board or a city's
 *     page, the Privacy center has no "Show me on city boards", and the app
 *     never asks the server for a board;
 *   - the server's: flag:city-board = 'admins' (server_settings), so an older
 *     or changed app still gets {"off": true} until it is opened.
 *
 * Admins (@oatmealandsilk, @mrdinosaur62) get it first; in the web demo,
 * ?admin=1 makes the demo's player an admin. To open it to everyone: set this
 * to true and ship an over-the-air update (production channel only, never
 * "store"), and on the server:
 *   update public.server_settings set value = 'on' where key = 'flag:city-board';
 * The same pattern as BAR_LENS_FOR_EVERYONE and COURTS_GLOW_FOR_EVERYONE.
 */
export const CITY_BOARD_FOR_EVERYONE = false;

/** Whether this person sees city boards. */
export const cityBoardOn = (me?: { isAdmin?: boolean } | null): boolean => !!me && (CITY_BOARD_FOR_EVERYONE || !!me.isAdmin);
