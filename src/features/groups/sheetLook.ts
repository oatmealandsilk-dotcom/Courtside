/*
 * Design preview (Oct 22): which look the Groups sheet (the Feed's "+") draws.
 * On a phone it is always today's. The web twin (sheetLook.web.ts) reads
 * ?gs=a|b|c|d|e once, so one demo web build can show each direction.
 */
export type SheetLook = 'now' | 'a' | 'b' | 'c' | 'd' | 'e';
export const SHEET_LOOK: SheetLook = 'now';
