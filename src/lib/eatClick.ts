import { Platform } from 'react-native';

/**
 * A hold that opens something on top (a sheet), in a browser. When the finger
 * lifts, the browser sends a click to whatever is under it by then: the new
 * sheet's backdrop, which closed the sheet the moment it opened (the Open to
 * hit sheet, held from a ring high on the screen, Oct 5), or one of its chips.
 * This eats that one click. A new touch, or a moment after the lift with no
 * click, ends it. Nothing on a phone, where a lifted finger sends no click.
 */
export function eatClickAfterHold(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  let done = false;
  let lift: ReturnType<typeof setTimeout> | null = null;
  const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); stop(); };
  const lifted = () => { if (lift) clearTimeout(lift); lift = setTimeout(stop, 600); };
  const pressed = () => stop();
  // Never left on: a hold that somehow never ends lets go after a while.
  const safety = setTimeout(() => stop(), 15_000);
  function stop() {
    if (done) return;
    done = true;
    if (lift) clearTimeout(lift);
    clearTimeout(safety);
    window.removeEventListener('click', eat, true);
    window.removeEventListener('pointerup', lifted, true);
    window.removeEventListener('touchend', lifted, true);
    window.removeEventListener('pointerdown', pressed, true);
  }
  window.addEventListener('click', eat, true);
  window.addEventListener('pointerup', lifted, true);
  window.addEventListener('touchend', lifted, true);
  // Added a beat later, so the hold's own press (already down) never counts as a new one.
  setTimeout(() => { if (!done) window.addEventListener('pointerdown', pressed, true); }, 0);
}
