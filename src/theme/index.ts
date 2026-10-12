import { Platform, type TextStyle } from 'react-native';
/** CourtSide: warm neutrals and muted court-green accents. */
export const lightColors = {
  bg: '#F8F7F2', bgElevated: '#F1EFE6', surface: '#FFFEFA', surfaceAlt: '#E9E6DA',
  border: '#DCD6C8', borderStrong: '#B8AF9D',
  text: '#24251F', textMuted: '#5D584C', textFaint: '#6C665A',
  brand: '#3F7049', brandInk: '#FAF8F0', brandDim: '#E3E7D9',
  // The logo laid over a photo on a share (Oct 9, owner): a brighter brand colour that reads on any court.
  // The same green on every court (Oct 10, owner: "Green but cards can be themed"): a share is CourtSide's
  // sign to people without the app, so it is always our green, as Strava's is always its orange.
  brandBright: '#7ED492',
  court: '#527C56', clay: '#A06F53', hard: '#3E6982', grass: '#748360',
  info: '#3E6982', success: '#527C56', warning: '#957328', danger: '#A34D40',
  // Two colours only for decoration (a group's face), never for a warning or
  // an error, so a gold or rose group never reads as something gone wrong.
  sun: '#A87B1C', rose: '#A9547A',
  // Open to hit: the live green ring (and its pill) a player wears on the map for the day. A
  // fresher green than the brand, so it reads as "up for it now" on every court, New York's included.
  open: '#1A8147',
  overlay: 'rgba(24, 32, 27, 0.5)',
  // A web address in someone's message: its own slot (info shares a value with hard here, so a
  // style asking for info was handed hard on some courts), at least 4.5:1 on the bubbles of every court.
  link: '#2B6688',
  // A mark laid over a photo (the play button on a video's picture): white on every court.
  onMedia: '#FFFFFF',
  // Someone else's chat bubble: a shade deeper than the page, with no outline (iMessage's grey bubble, in the court's own tone).
  bubble: '#ECE9DE',
  // Your own chat bubble: the brand's colour, deepened a shade where its ink on it fell short of
  // 4.5:1 (Melbourne's blue). Each court's value is its own, so a style written with it is recoloured as itself.
  bubbleMine: '#3D6E47',
  // Words and icons on a danger-red button (the inbox's Delete): white, or dark on the two dark courts,
  // where white on their lighter red fell short. Read from `colors` when drawing, not from a style sheet:
  // white is also a page colour, so a style sheet would recolour it as the page.
  onDanger: '#FFFFFF',
  // The session box (a session's card, its photo strip and tile, the share stamp, the Tennis profile
  // card): each court's shirt (Oct 6, owner: "make those the darker full color card. like how we did
  // with the default"). Its fill; the shirt's two-colour fade as it shows at the very corner, top right
  // and bottom left (the box fades from these into the fill); the shirt's lettering for the big numbers
  // and the mark; the small words; and the quieter words. Every word holds 4.5:1 on the fill and on
  // both corners. Here, the Classic shirt: a clean light cream with fresh sage and peach corners (Oct 6,
  // owner: the old gold-grey cream "looks a bit damp"), the brand green lettering, the small words the
  // green a fifth of the way to the text, the quiet ones the page's muted ink.
  cardFill: '#F6F0E2', cardGlowTop: '#D6E2CA', cardGlowBottom: '#F2D9BD',
  cardFigure: '#3F7049', cardInk: '#3A6141', cardMuted: '#5D584C',
  // "Growing the game" on the app's copy of the launch screen. Here, the launch picture's own grey
  // (assets/splash.png), a shade lighter than textFaint: on this court the copy is the picture to the
  // pixel, so the line must not darken as the picture hands over (Oct 7). Every other court: its textFaint.
  launchLine: '#8B8373',
  // A picture made of initials (UI audit, Oct 11; owner, Oct 12: "4 is good"): five deeper shades, none
  // of them green, so the green Open to hit ring stands out on any face, and none beige, which read as a
  // missing photo. Clay, hard-court blue, plum, ink and sand; each one carries white initials at 4.5:1
  // or better. A person keeps one of them on every screen (avatarFillFor, by their account's id).
  avatarClay: '#9A5F40', avatarHard: '#3B6684', avatarPlum: '#73496E', avatarInk: '#3F4A5A', avatarSand: '#8A6D47',
} as const;

export const colors: Record<keyof typeof lightColors, string> = { ...lightColors };

/** A palette colour (`#RRGGBB`) at an opacity, as rgba(), which animations on the phone and in a browser both read. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Whether the current page is dark (Night, New York): shadows there are plain dark, never a coloured glow. */
export function pageIsDark(): boolean {
  const hex = colors.bg.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * Words on a coloured fill (a thread's topic chip, the initials on a default
 * picture): white where white reads at 4.5:1 or better on it, else black,
 * which then always does. Read the fill from the live theme as you draw.
 */
export function inkOn(fill: string): string {
  const luminance = luminanceOf(fill);
  if (luminance === null) return '#FFFFFF';
  return 1.05 / (luminance + 0.05) >= 4.5 ? '#FFFFFF' : '#000000';
}

/**
 * Whether words in `ink` read on `fill` (4.5:1 or better, the bar for small
 * words). Lets a label take a palette's colour where it reads and fall back
 * to the palette's own ink where it does not (Melbourne's sky blue is too
 * light for small words on its near-white card). Colours that are not
 * `#RRGGBB` count as reading, so the caller's choice stands.
 */
export function readsOn(ink: string, fill: string): boolean {
  const a = luminanceOf(ink);
  const b = luminanceOf(fill);
  if (a === null || b === null) return true;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5;
}

/** How bright a `#RRGGBB` colour is to the eye (WCAG's relative luminance, 0 to 1); null for anything else. */
function luminanceOf(color: string): number | null {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const unit = parseInt(hex.slice(i, i + 2), 16) / 255;
    return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The lift under a grouped list or card: a soft, wide shadow, so a box a
 * shade lighter than the page reads as sitting on it, not as a smudge.
 * (On a dark court it all but disappears, which is right.)
 */
export const lift = {
  // The CSS-style shadow, not shadowColor/shadowOpacity: on iPhone the old
  // props are cut off by overflow: 'hidden', which every grouped list needs
  // for its rounded corners, so the lift silently vanished there.
  // Softened Oct 2: on the cream and city themes the cards stood out too much.
  boxShadow: '0px 2px 10px rgba(42, 36, 24, 0.045)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Inter, shipped inside the app. React Native picks a face by family name, so
 * each weight is its own family; `fontWeight` rides along for the web.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  // The share overlays' wordmark only (Oct 9, owner: "too thin", then Black a tiny bit too thick).
  black: 'Inter_800ExtraBold',
  // Scores and stats only: the number face below.
  numbers: 'BarlowSemiCondensed_600SemiBold',
} as const;

/** A weight as a style: `{...font('500')}` where a literal fontWeight used to be. */
export const font = (weight: '400' | '500' | '600' | '700' | '900') => {
  const family = { '400': fontFamily.regular, '500': fontFamily.medium, '600': fontFamily.semibold, '700': fontFamily.bold, '900': fontFamily.black }[weight];
  // A browser takes a list and falls back to the system's own sans should Inter
  // ever be slow; a phone takes exactly one name and has Inter in the bundle.
  return { fontFamily: Platform.OS === 'web' ? `${family}, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` : family, fontWeight: weight };
};

/**
 * The number face (Oct 12, owner, of the audit's "scores like a scoreboard":
 * "ship 8 as well"): scores and stats only, so "7–6(5) 3–6" and "24–17" read
 * like a scoreboard rather than a caption. Barlow Semi Condensed, the
 * road-sign and scoreboard lettering of Google Fonts, with its figures all
 * one width so columns of games line up and a count never jiggles. Words
 * (labels, "on court", "days") stay in Inter. It loads with Inter when the
 * app opens (app/_layout.tsx), from the app's own files, so it reaches
 * phones with an update. The share pictures keep Inter (owner: "keep today's").
 */
export const numberFace = {
  medium: 'BarlowSemiCondensed_500Medium',
  semibold: fontFamily.numbers,
  bold: 'BarlowSemiCondensed_700Bold',
  /** Where its baseline sits in a line box: half of (ascent − descent) as a share of the size. Inter's is 0.3633. */
  centre: 0.4,
  /** Its capitals' and figures' height as a share of the size. Inter's is 0.727. */
  cap: 0.7,
  /** Tracking per point of size: already narrow, so it needs almost none of Inter's tightening. */
  tracking: -0.01,
} as const;

/** The number face at a weight, figures all one width: `{...numFont('700')}` on a score or a stat. */
export const numFont = (weight: '500' | '600' | '700' = '600') => {
  const family = { '500': numberFace.medium, '600': numberFace.semibold, '700': numberFace.bold }[weight];
  const inter = { '500': fontFamily.medium, '600': fontFamily.semibold, '700': fontFamily.bold }[weight];
  return {
    fontFamily: Platform.OS === 'web' ? `${family}, ${inter}, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` : family,
    fontWeight: weight,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  };
};

/**
 * A score on one line in the number face, its spaces doubled: the face's own
 * space is narrow (0.2 of the size, Inter's 0.28), so "7–6(5) 3–6 (10–7)" ran
 * its sets together; doubled, each set stands apart, as on a scoreboard.
 */
export const numGaps = (text: string) => text.replace(/ /g, '  ');

/**
 * Lighter than it was: display and title at medium rather than black, with
 * tracking that tightens as size grows. Weight still carries hierarchy; it
 * just does it with less shouting.
 */
export const typography = {
  display: { ...font('500'), fontSize: 30, letterSpacing: -1.05 },
  title: { ...font('500'), fontSize: 22, letterSpacing: -0.66 },
  heading: { ...font('600'), fontSize: 17, letterSpacing: -0.3 },
  body: { ...font('400'), fontSize: 15 },
  bodyStrong: { ...font('600'), fontSize: 15, letterSpacing: -0.15 },
  small: { ...font('400'), fontSize: 13 },
  smallStrong: { ...font('600'), fontSize: 13 },
  caption: { ...font('600'), fontSize: 11, letterSpacing: 0.4 },
} as const;

/** The five shades a picture made of initials can wear, in the order a person's number picks from. */
const AVATAR_SHADES = ['avatarClay', 'avatarSand', 'avatarHard', 'avatarInk', 'avatarPlum'] as const;

/**
 * The colour of someone's initials picture (Oct 12): one of the court's five
 * avatar shades, picked by their account's id, so the same person wears the
 * same colour on every screen (before, a screen that knew them by id and one
 * that knew them by their seed could pick two different colours). The pick
 * is a stable mix of every letter of the id (FNV-1a), which spreads people
 * evenly over the five; the shade itself is read from the live court.
 */
export function avatarFillFor(personId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < personId.length; i += 1) {
    hash ^= personId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return colors[AVATAR_SHADES[(hash >>> 0) % AVATAR_SHADES.length]];
}

/** Muted tints for a picture that has not loaded (a post's or a court's), deterministic per seed. People's faces use avatarFillFor. */
export const surfaceColorFor = (seed: string): string => {
  const palette = ['#527652', '#8A846A', '#667967', '#778565', '#788475', '#9B9074'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return palette[hash % palette.length];
};
