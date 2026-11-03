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
export const CITY_BOARD_FOR_EVERYONE = true;

/** Whether this person sees city boards. */
export const cityBoardOn = (me?: { isAdmin?: boolean } | null): boolean => !!me && (CITY_BOARD_FOR_EVERYONE || !!me.isAdmin);

/**
 * The city board counts every session ever, not just this month's (owner,
 * Nov 3, on an empty board on the 3rd: "maybe we should just make it all time
 * for now. At least the city one"). Migration 211: the server works out an
 * all-time board as well, kept under the month ALL_TIME ('2000-01-01'), next to
 * the monthly ones, which it still works out exactly as before (older app
 * versions keep asking for months). On: every board screen (the board, the
 * Find Players card, a city's page, sign-up's last step) asks for ALL_TIME and
 * says "All time" where it said the month. Off: monthly again, as before 211.
 */
export const CITY_BOARD_ALL_TIME = true;

/** The all-time board's key on the server (refresh_city_board, city_board, city_page; migration 211). */
export const ALL_TIME = '2000-01-01';

/** Whether a board's month is the all-time one. */
export const isAllTime = (month: string): boolean => month === ALL_TIME;
