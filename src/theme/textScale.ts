/**
 * How far each kind of text may grow with the phone's Text Size setting
 * (Settings → Display & Brightness → Text Size, or Accessibility → Larger
 * Text). 1 means "never grows"; 1.8 means "up to 1.8× the normal size".
 *
 * At the normal text size every cap is the same as no cap, so nothing here
 * changes how the app looks for most people. It only decides what happens
 * when someone turns the text up: the words people read (posts, comments,
 * messages) grow the most, the app's frame (tab bar, badges) stays put so
 * it never wraps or overlaps.
 *
 * Use these on a Text or TextInput as `maxFontSizeMultiplier={TextScale.CARD}`.
 * Text that names none gets DEFAULT (set once for the whole app in
 * src/lib/textScale.native.ts). The web ignores all of this: there, text size
 * is the browser's zoom.
 */
export const TextScale = {
  /** Tab bar labels, badges, counts on icons, tiny pills: fixed-size frame. */
  CHROME: 1,
  /** Large screen titles, section switches, buttons, chips, text boxes and their placeholders. */
  TITLE: 1.25,
  /** Card titles and subtitles, list rows, settings rows. */
  CARD: 1.4,
  /** What people read: posts, captions under posts, comments, threads, messages. */
  BODY: 1.8,
  /** Any text that names no cap (between TITLE and CARD). */
  DEFAULT: 1.3,
} as const;

export type TextScaleCap = (typeof TextScale)[keyof typeof TextScale];

/**
 * Props for one line of text that must never wrap mid-word: it stays on one
 * line and shrinks a little (down to `min`) instead. At the normal text size
 * the text already fits, so it is drawn exactly as before.
 */
export function oneLine(cap: number = TextScale.TITLE, min = 0.7) {
  return {
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: min,
    maxFontSizeMultiplier: cap,
  } as const;
}
