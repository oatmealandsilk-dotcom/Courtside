/**
 * The top of Open hits on Find Players (Oct 24, owner: "the open hits,
 * looking for a hit and the text below all need a remodeling"): which look
 * it takes. 'now' is today's (the "Looking for a hit?" field and the
 * sentence under it) and still ships; A, B and C are the three to compare
 * (OpenHitsLooks.tsx):
 *   A  "Open hits" with a quiet "Post a hit ›" on its right; nothing open, one muted line.
 *   B  "Open hits · none nearby" (or its count), then one plain row "Post a time and place ›".
 *   C  Two real times to post at in one tap ("Today 6pm", "Tomorrow 6pm") and "Other ›"
 *      (new: the hit form opens with that time already picked).
 */
export type OpenHitsLook = 'now' | 'A' | 'B' | 'C';

export const OPEN_HITS_LOOK = 'now' as OpenHitsLook;
