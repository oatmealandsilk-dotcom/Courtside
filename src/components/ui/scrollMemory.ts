/**
 * How far down each tab (or each section of a tab) was left, kept outside
 * React so it survives the screen being unmounted and rebuilt — which is
 * exactly what happens when you swipe to another tab and back. Only a page
 * that names itself (memoryKey: the tabs, and Community's two sections)
 * keeps its place here. Any other page (Settings, a thread, a player) opens
 * at its top each time it is opened (Oct 8, owner: Settings opened at the
 * bottom, wherever it was last left); back on it from a page opened over
 * it, it is still where you left it, as it stays drawn underneath.
 */
export const scrollMemory = new Map<string, number>();
