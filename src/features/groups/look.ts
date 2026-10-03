import type { GroupColor, GroupLook } from '@/data/types';
import { colors, withAlpha, type lightColors } from '@/theme';

/*
 * A group's face (migration 73), in one place: the colours a group can
 * have, the emoji offered for it, and how a look turns into the colours a
 * tile is drawn in on the theme of the moment.
 *
 * A colour is stored by name, never as a hex value, and each name is one of
 * the theme's own slots, so every palette (light, Night and the four city
 * courts) draws it in its own shade: Paris's clay is its own clay, New
 * York's accent is its yellow. The server keeps the same list
 * (feed_group_color_ok).
 */

type Slot = keyof typeof lightColors;

export const GROUP_COLORS: { id: GroupColor; slot: Slot; label: string }[] = [
  { id: 'accent', slot: 'brand', label: 'Court green' },
  { id: 'grass', slot: 'grass', label: 'Grass' },
  { id: 'hard', slot: 'hard', label: 'Hard court blue' },
  { id: 'clay', slot: 'clay', label: 'Clay' },
  { id: 'gold', slot: 'warning', label: 'Gold' },
  { id: 'red', slot: 'danger', label: 'Red' },
  { id: 'ink', slot: 'text', label: 'Ink' },
];

const slotOf = (c?: GroupColor): Slot => GROUP_COLORS.find((x) => x.id === c)?.slot ?? 'brand';

/** The colour of a look on the theme of the moment. */
export const lookTint = (look?: GroupLook | null) => colors[slotOf(look?.color)];

/**
 * A tile's ground and the letters on it: a soft wash of the colour (the
 * accent's is the theme's own brandDim, as the tile always was) with the
 * letters in the full colour. Soft rather than solid, so a row of tiles
 * stays calm and an emoji reads on it in every theme, Night included.
 */
export function tileColors(look?: GroupLook | null): { ground: string; ink: string } {
  const slot = slotOf(look?.color);
  if (slot === 'brand') return { ground: colors.brandDim, ink: colors.brand };
  return { ground: withAlpha(colors[slot], slot === 'text' ? 0.1 : 0.18), ink: colors[slot] };
}

/** The colours offered on the theme of the moment, leaving out any that is the same shade as one before it there (Melbourne's accent is its hard-court blue). */
export function colorChoices(): { id: GroupColor; label: string; hex: string }[] {
  const seen = new Set<string>();
  return GROUP_COLORS.flatMap((c) => {
    const hex = colors[c.slot].toLowerCase();
    if (seen.has(hex)) return [];
    seen.add(hex);
    return [{ id: c.id, label: c.label, hex: colors[c.slot] }];
  });
}

/** Offered for a group's face: tennis first, then the moods a crew names itself by. */
export const GROUP_EMOJI = ['🎾', '🏆', '🔥', '⚡️', '☀️', '🌙', '☕️', '🍻', '🎯', '💪', '🌴', '🏙️', '🦁', '🐐', '⭐️', '🥇', '🌮'] as const;

/** An emoji the server will take (feed_group_emoji_ok): no letters, digits, spaces or markup, 16 characters at most. */
export const emojiOk = (e?: string) => !e || (Array.from(e).length <= 16 && !/[A-Za-z0-9\s<>&"'\\/]/.test(e));

/** Two looks the same, for "has anything changed". */
export const sameLook = (a?: GroupLook | null, b?: GroupLook | null) =>
  (a?.color ?? 'accent') === (b?.color ?? 'accent') && (a?.emoji ?? '') === (b?.emoji ?? '') && (a?.photoUrl ?? '') === (b?.photoUrl ?? '');

/** The look as the server stores it: nothing for the default parts. */
export const plainLook = (look?: GroupLook | null): GroupLook => ({
  ...(look?.color && look.color !== 'accent' ? { color: look.color } : {}),
  ...(look?.emoji ? { emoji: look.emoji } : {}),
  ...(look?.photoUrl ? { photoUrl: look.photoUrl } : {}),
});

/** What a screen reader says about a group's face. */
export function lookWords(look?: GroupLook | null): string {
  if (look?.photoUrl) return 'its photo';
  const color = GROUP_COLORS.find((c) => c.id === (look?.color ?? 'accent'))?.label ?? 'Court green';
  return look?.emoji ? `${look.emoji} on ${color.toLowerCase()}` : `initials on ${color.toLowerCase()}`;
}

/** A look read from the server's row (migration 73), or nothing before it runs. */
export function lookFrom(row: { color?: string | null; emoji?: string | null; photo?: string | null }): GroupLook | undefined {
  const color = GROUP_COLORS.some((c) => c.id === row.color) ? (row.color as GroupColor) : undefined;
  const look = plainLook({ color, emoji: row.emoji ?? undefined, photoUrl: row.photo ?? undefined });
  return Object.keys(look).length ? look : undefined;
}
