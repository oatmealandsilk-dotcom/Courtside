import { Platform } from 'react-native';

/**
 * Design options for the guest "Join CourtSide to …" prompt on the website (Nov 27, owner on the
 * centred card: "the box looks too ai, overall i dont like this design in general for our website").
 * Nothing changes unless the address carries ?jp=a, ?jp=b or ?jp=c; without it the prompt is today's.
 *   a · Inline: a small row next to what was tapped, no box over the page.
 *   b · Bar: one calm line docked to the bottom of the feed, under a hairline.
 *   c · Sheet: a flat panel on the right, where comments open on a computer.
 * The choice is kept for the visit (sessionStorage), so moving between pages keeps the same option.
 */
export type JoinPromptLook = 'a' | 'b' | 'c';

const KEY = 'courtside.joinPromptLook';

function readLook(): JoinPromptLook | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const asked = new URLSearchParams(window.location.search).get('jp');
    if (asked === 'a' || asked === 'b' || asked === 'c') {
      try { window.sessionStorage.setItem(KEY, asked); } catch {}
      return asked;
    }
    if (asked === 'now' || asked === '') { try { window.sessionStorage.removeItem(KEY); } catch {} return null; }
    const kept = window.sessionStorage.getItem(KEY);
    return kept === 'a' || kept === 'b' || kept === 'c' ? kept : null;
  } catch {
    return null;
  }
}

const look = readLook();

export function joinPromptLook(): JoinPromptLook | null {
  return look;
}

/** Where the last press landed (window coordinates), so option A can sit beside what was tapped. */
let lastPress: { x: number; y: number; at: number } | null = null;
if (look === 'a' && typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPress = { x: e.clientX, y: e.clientY, at: Date.now() }; }, true);
}

/** The press that just opened the prompt, if it was within the last second (a keyboard press has none). */
export function recentPress(): { x: number; y: number } | null {
  if (!lastPress || Date.now() - lastPress.at > 1000) return null;
  return { x: lastPress.x, y: lastPress.y };
}
