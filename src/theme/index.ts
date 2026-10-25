import { Platform } from 'react-native';

import { chipCorner, corner } from './look';

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
  // What a court is played on, as a colour (Courts near you): blue hard, terracotta clay, green grass, and the
  // court's own colour for anything else. The same on every light court (hard, clay and grass above wear the
  // court's theme: London's hard is purple, New York's grass blue), deep enough for white letters on them.
  surfaceHard: '#2F6B9A', surfaceClay: '#B0582F', surfaceGrass: '#3D7A44', surfaceOther: '#4F7A53',
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
  // The "see-through" checkerboard a share's sticker is previewed on (Oct 15, owner: "the background is
  // clear"): two dark greys, the same on every court, so the white numbers and the green mark read on it.
  checker: '#26292A', checkerAlt: '#323637',
  // A face with no photo, on the Send to sheet only (Avatar quiet): six quiet tones, one per person by their seed, so a
  // grid of initials never reads as one colour. Low in colour on purpose; the page's text reads on every one.
  avatarTint1: '#DCE3D3', avatarTint2: '#E8DFCC', avatarTint3: '#ECD9D0', avatarTint4: '#D6DFE4', avatarTint5: '#E0DAE3', avatarTint6: '#E2E0CF',
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

/** Corners follow the roundness switch in theme/look.ts (today's values at 'now'). */
export const radius = {
  sm: corner(8),
  md: corner(12),
  lg: corner(16),
  xl: corner(24),
  pill: 999,
  /** A chip: a pill today. */
  chip: chipCorner,
} as const;

/**
 * The phone's own font (Oct 22, owner: "iPhone font plus Instagram"): SF Pro
 * on an iPhone, the phone's own sans on Android, the system stack in a
 * browser. A system font takes its weight from `fontWeight`, so one family
 * name serves every weight. Only the CourtSide wordmark stays in Inter, which
 * ships inside the app (`wordmarkFont`, and `black` for the share overlays).
 */
const SYSTEM_WEB = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
// iOS: 'system-ui' goes straight to SF by its system design (React Native's
// font lookup treats 'System' as a custom family name and searches for it
// first on every uncached lookup). Android: the phone's own sans (Roboto).
const SYSTEM = Platform.OS === 'web' ? SYSTEM_WEB : Platform.OS === 'ios' ? 'system-ui' : 'sans-serif';
// Inter Regular is not loaded (Oct 22): nothing but the wordmark is in Inter, and it is never regular.
const INTER = { '500': 'Inter_500Medium', '600': 'Inter_600SemiBold', '700': 'Inter_700Bold', '900': 'Inter_800ExtraBold' } as const;

export const fontFamily = {
  regular: SYSTEM,
  medium: SYSTEM,
  semibold: SYSTEM,
  bold: SYSTEM,
  // The share overlays' wordmark only (Oct 9, owner: "too thin", then Black a tiny bit too thick).
  black: INTER['900'],
} as const;

type Weight = '400' | '500' | '600' | '700' | '900';

/** A weight as a style: `{...font('500')}` where a literal fontWeight used to be. 900 is the Inter wordmark. */
export const font = (weight: Weight) => (weight === '900'
  ? wordmarkFont('900')
  // Roboto has no semibold: Android would round 600 up to Bold, so headings and
  // button labels read heavier than SF Semibold on an iPhone. Medium matches it.
  : { fontFamily: SYSTEM, fontWeight: Platform.OS === 'android' && weight === '600' ? '500' as Weight : weight });

/**
 * The CourtSide wordmark, which stays in Inter whatever the rest of the app is
 * set in. A phone takes exactly one name and has Inter in the bundle; a
 * browser falls back to the system's own sans should Inter ever be slow.
 */
export const wordmarkFont = (weight: Exclude<Weight, '400'>) => {
  const family = INTER[weight];
  return { fontFamily: Platform.OS === 'web' ? `${family}, ${SYSTEM_WEB}` : family, fontWeight: weight };
};

/**
 * Lighter than it was: display and title at medium rather than black, with
 * tracking that tightens as size grows. SF Pro already tightens itself as it
 * grows (its own optical tracking), so it takes about 60% of the tightening
 * Inter needed.
 */
export const typography = {
  display: { ...font('500'), fontSize: 30, letterSpacing: -0.6 },
  title: { ...font('500'), fontSize: 22, letterSpacing: -0.4 },
  heading: { ...font('600'), fontSize: 17, letterSpacing: -0.2 },
  body: { ...font('400'), fontSize: 15 },
  bodyStrong: { ...font('600'), fontSize: 15, letterSpacing: -0.1 },
  small: { ...font('400'), fontSize: 13 },
  smallStrong: { ...font('600'), fontSize: 13 },
  caption: { ...font('600'), fontSize: 11, letterSpacing: 0.1 },
} as const;

/**
 * Buttons, Instagram's shape in CourtSide's colours (Oct 22): rounded
 * rectangles with Apple's smooth corner, compact, sentence case. The fills,
 * washes and shadows are the app's own and unchanged. Corners softened
 * a step the same day (owner: "minor soft"): 18 full-size, 12 compact.
 */
export const buttonShape = {
  /** A full-size button (sign-in, a sheet's Submit, a page's main action). */
  radius: corner(18),
  height: 44,
  /** A compact one in a row of actions (Follow, Edit profile, Share, a card's actions). */
  smallRadius: corner(12),
  smallHeight: 34,
  /** Your own profile's Edit profile and Share: a touch taller than other compact rows (owner, Oct 24: "just a tiny bit taller"). */
  profileHeight: 38,
  /** Added to a compact button's every side, so the finger still gets 44pt. */
  smallSlop: 5,
  label: 15,
  smallLabel: 14,
  /** Apple's continuous corner, ignored where a platform has none. */
  curve: { borderCurve: 'continuous' } as const,
} as const;

/** Muted avatar tints — deterministic per seed, none of them loud. */
export const surfaceColorFor = (seed: string): string => {
  const palette = ['#527652', '#8A846A', '#667967', '#778565', '#788475', '#9B9074'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return palette[hash % palette.length];
};
export { TextScale, oneLine, useLargeText, type TextScaleCap } from './textScale';
