import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, lightColors } from './index';
import { LaunchMark, launchGround, useLaunchDark } from '@/components/LaunchMark';
import { NEW_SPLASH } from '@/lib/splashLook';
import { catchUpNow, catchUpShown, installCatchUp, noteLive, tapped } from './catchUp';
import { beginPageFade } from './ThemeFade';
import { ScreenFadeHost, fadeScreen, screenDrawn } from './screenFade';
import { PHONE_APPEARANCE, onPhoneAppearance, phoneDark } from '@/lib/phoneAppearance';
import { keysAtOpen, keysAtOpenNow, usedBefore } from '@/lib/usedBefore';
import { storedLoginId, storedLoginNow } from '@/lib/supabase';
import { claimedDepth } from '@/features/navigation/gestureClaim';
import { isPageDragging, isPageScrolling, subscribePageDragging } from '@/features/navigation/swipeLock';

type Palette = Record<keyof typeof lightColors, string>;

/**
 * Dark palette. The neutrals keep only a trace of green so they read as a dark
 * surface rather than olive, and the accents stay saturated — desaturating them
 * to match the light theme is what made the whole thing look muddy.
 */
export const darkColors: Palette = {
  bg: '#0F1412', bgElevated: '#161D19', surface: '#1A221E', surfaceAlt: '#232C27',
  border: '#2C3832', borderStrong: '#46554D', text: '#EDF1EE', textMuted: '#A6B1AB', textFaint: '#8A948F',
  brand: '#6FB483', brandInk: '#0C1710', brandDim: '#1F2E25', brandBright: '#7ED492', court: '#6FB483', clay: '#C98A6A',
  hard: '#7FA9C4', grass: '#86B393', info: '#7FA9C4', success: '#6FB483', warning: '#D2B36A', danger: '#D97F73',
  surfaceHard: '#3A77AA', surfaceClay: '#B65E36', surfaceGrass: '#3F8048', surfaceOther: '#8A948F',
  sun: '#E0BE66', rose: '#E592B4',
  open: '#4FD487',
  overlay: 'rgba(0, 0, 0, 0.65)',
  link: '#8EBEDD', onMedia: '#FFFFFF',
  bubble: '#232D28',
  bubbleMine: '#6EB382', onDanger: '#0C1710',
  // The Night shirt: its near-black green, a deeper green glowing top right, a warm clay-gold bottom
  // left, green lettering; the quiet words in the page's muted grey.
  cardFill: '#15251D', cardGlowTop: '#22412D', cardGlowBottom: '#413425',
  cardFigure: '#6FB483', cardInk: '#6FB483', cardMuted: '#A6B1AB',
  cardTouch: '#6FB483',
  launchLine: '#8A948F',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#2E3A34', avatarTint2: '#3A3530', avatarTint3: '#3B3034', avatarTint4: '#2D3640', avatarTint5: '#35313D', avatarTint6: '#363A2E',
  // The metals at night: bright inks on deep coins, warm against the green-black page.
  medalGold: '#E6C165', medalGoldFill: '#383021',
  medalSilver: '#CBD3DA', medalSilverFill: '#2A3236',
  medalBronze: '#DE9B6B', medalBronzeFill: '#3B2A20',
};

/**
 * Clean — a plain white page, the way X, Instagram and Strava are built. No
 * warmth in the neutrals at all: white ground, near-black text, grey hairlines.
 * The green is lifted a little from the default one, which was mixed for paper
 * and goes slightly flat against pure white.
 */
const cleanColors: Palette = {
  bg: '#FFFFFF', bgElevated: '#F7F8F8', surface: '#FAFAFA', surfaceAlt: '#F0F1F1',
  border: '#E6E7E8', borderStrong: '#C7CACC', text: '#0F1419', textMuted: '#536471', textFaint: '#5F6871',
  brand: '#2C7446', brandInk: '#FFFFFF', brandDim: '#E8F3EC', brandBright: '#7ED492', court: '#2C7446', clay: '#B4653A',
  hard: '#2C6885', grass: '#477F50', info: '#2C6885', success: '#2C7446', warning: '#806311', danger: '#B93129',
  surfaceHard: '#2F6B9A', surfaceClay: '#B0582F', surfaceGrass: '#3D7A44', surfaceOther: '#6B7378',
  sun: '#9A7110', rose: '#B04A7C',
  open: '#17803F',
  overlay: 'rgba(15, 20, 25, 0.5)',
  link: '#1B6699', onMedia: '#FFFFFF',
  bubble: '#EEF0F1',
  bubbleMine: '#2B7345', onDanger: '#FFFFFF',
  // No shirt for Clean: its session box stays the green box with the brand's own wash (cardLook).
  // These only fill the slots, with that box's colours.
  cardFill: '#2C7446', cardGlowTop: '#2C7446', cardGlowBottom: '#2C7446',
  cardFigure: '#FFFFFF', cardInk: '#FFFFFF', cardMuted: '#FFFFFF',
  cardTouch: '#2C7446',
  launchLine: '#5F6871',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#E3EAE4', avatarTint2: '#EDE6DA', avatarTint3: '#F0E0DA', avatarTint4: '#DDE5EC', avatarTint5: '#E6E0EA', avatarTint6: '#E8E8E0',
  // On pure white the coins are a touch fuller than on the cream page, or they wash out.
  medalGold: '#7E5C0C', medalGoldFill: '#F4E4B8',
  medalSilver: '#5A6673', medalSilverFill: '#E5E9ED',
  medalBronze: '#8C502F', medalBronzeFill: '#F2DDC6',
};

/**
 * Australian Open — the blue Plexicushion and its paler surround.
 * Ground is the surround, not the court; the court blue is the accent.
 */
const aoColors: Palette = {
  bg: '#EBF5FC', bgElevated: '#D7E9F4', surface: '#F8FCFF', surfaceAlt: '#C8DEEE',
  border: '#AECFE5', borderStrong: '#6394BC', text: '#0D2B43', textMuted: '#34566E', textFaint: '#496273',
  brand: '#2E85BF', brandInk: '#FFFFFF', brandDim: '#CFE4F2', brandBright: '#7ED492', court: '#4179A8', clay: '#B97753',
  hard: '#2E85BF', grass: '#4E8A57', info: '#3979AF', success: '#2A7F60', warning: '#9C7016', danger: '#B8463F',
  surfaceHard: '#2F6B9A', surfaceClay: '#B0582F', surfaceGrass: '#3D7A44', surfaceOther: '#6B7378',
  sun: '#A8781A', rose: '#AE4F80',
  open: '#1A8147',
  overlay: 'rgba(7, 26, 42, 0.58)',
  link: '#1F64A0', onMedia: '#FFFFFF',
  bubble: '#D9EAF6',
  bubbleMine: '#2471A6', onDanger: '#FFFFFF',
  // The Melbourne shirt as light as the shirt itself (Oct 6, owner: "AO card could be more light the
  // color of her shirt"): its light court blue, a sky sheen top right, the aqua shirt's aqua bottom left.
  // Cream can't hold on a blue this light, so the lettering is the court's deep navy: small and quiet
  // words 4.7:1 or more on the fill and both corners, the big numbers 5.7:1.
  cardFill: '#6EA8D5', cardGlowTop: '#9CCBEC', cardGlowBottom: '#8FE3DD',
  cardFigure: '#0B2A47', cardInk: '#0E2F4F', cardMuted: '#143858',
  cardTouch: '#2E85BF',
  launchLine: '#496273',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#D3E3EF', avatarTint2: '#E4DED2', avatarTint3: '#EBD8D4', avatarTint4: '#D5E5DD', avatarTint5: '#DDD9EA', avatarTint6: '#E3E6D3',
  // Silver's coin leans a little cooler here, so it still reads as metal on the blue page.
  medalGold: '#7D5B0C', medalGoldFill: '#F2E3B8',
  medalSilver: '#56636F', medalSilverFill: '#DCE4EB',
  medalBronze: '#8B5030', medalBronzeFill: '#EEDAC4',
};

/**
 * Roland Garros — crushed brick. The ground is the dust that settles on
 * everything rather than the court itself, which would be relentless at
 * full strength; the court orange carries the buttons.
 */
const rolandGarrosColors: Palette = {
  bg: '#F8F0E9', bgElevated: '#EFDFD1', surface: '#FFFAF5', surfaceAlt: '#E6D2C0',
  border: '#D6BCA2', borderStrong: '#B08A66', text: '#33201A', textMuted: '#664836', textFaint: '#6D5745',
  brand: '#AD4E2E', brandInk: '#FFF6F0', brandDim: '#ECD9CB', brandBright: '#7ED492', court: '#9E432E', clay: '#C67443',
  hard: '#3E6982', grass: '#1F5F3F', info: '#3E6982', success: '#1F5F3F', warning: '#9A6718', danger: '#9E432E',
  surfaceHard: '#2F6B9A', surfaceClay: '#B0582F', surfaceGrass: '#3D7A44', surfaceOther: '#6B7378',
  sun: '#9E7416', rose: '#A2456E',
  open: '#1A8147',
  overlay: 'rgba(46, 22, 12, 0.58)',
  link: '#2F6587', onMedia: '#FFFFFF',
  bubble: '#F0E2D5',
  bubbleMine: '#AB4D2D', onDanger: '#FFFFFF',
  // The Paris shirt, deepened so its cream lettering holds: brick clay, a brighter clay top right, the
  // shirt's gold glow bottom left.
  cardFill: '#A44627', cardGlowTop: '#B24D25', cardGlowBottom: '#A4570A',
  cardFigure: '#FAF8F0', cardInk: '#FAF8F0', cardMuted: '#F6EFE6',
  cardTouch: '#AD4E2E',
  launchLine: '#6D5745',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#EBD9CB', avatarTint2: '#E2DDCC', avatarTint3: '#D9DFD5', avatarTint4: '#DDD8E2', avatarTint5: '#EFD5CF', avatarTint6: '#D7DEE3',
  // Bronze browner than the court's brick, so 3rd never reads as just the brand colour here.
  medalGold: '#7C5A0B', medalGoldFill: '#F1E3BB',
  medalSilver: '#58636E', medalSilverFill: '#E3E3E3',
  medalBronze: '#7D4B2A', medalBronzeFill: '#EAD2BE',
};

/**
 * Wimbledon — cut grass and white lines. Light green ground with the club
 * green held back for accents, and the purple kept as the secondary.
 */
const wimbledonColors: Palette = {
  bg: '#F2F6EC', bgElevated: '#E4EDD8', surface: '#FBFDF7', surfaceAlt: '#D7E3C9',
  border: '#C4D5B3', borderStrong: '#8CA37B', text: '#18291A', textMuted: '#485943', textFaint: '#586552',
  brand: '#256B3A', brandInk: '#FFFFFF', brandDim: '#D9E6D4', brandBright: '#7ED492', court: '#4E8A4A', clay: '#A9694A',
  hard: '#4F2683', grass: '#4E8A4A', info: '#4F2683', success: '#256B3A', warning: '#8A6A19', danger: '#943634',
  surfaceHard: '#2F6B9A', surfaceClay: '#B0582F', surfaceGrass: '#3D7A44', surfaceOther: '#6B7378',
  sun: '#94701A', rose: '#A4497A',
  open: '#1A8147',
  overlay: 'rgba(14, 26, 16, 0.55)',
  link: '#245E93', onMedia: '#FFFFFF',
  bubble: '#E2EBD6',
  bubbleMine: '#246A39', onDanger: '#FFFFFF',
  // The London shirt, deepened so its cream lettering holds: grass green, a fresher green top right,
  // the club's purple bottom left. (Oct 6: lilac was tried; owner: "for the London one green looks better".)
  cardFill: '#326F37', cardGlowTop: '#377A34', cardGlowBottom: '#615782',
  cardFigure: '#FAF8F0', cardInk: '#FAF8F0', cardMuted: '#F0F1E7',
  // London's purple, deepened to an aubergine that sits with its greens (10.1:1 on the card, 10.3:1 under white words).
  cardTouch: '#5A2D6E',
  launchLine: '#586552',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#D9E6CF', avatarTint2: '#E6E0CC', avatarTint3: '#E9D8D7', avatarTint4: '#D3E0E4', avatarTint5: '#DED9E6', avatarTint6: '#E4E5D0',
  medalGold: '#7D5C0D', medalGoldFill: '#F1E3B6',
  medalSilver: '#58646E', medalSilverFill: '#DFE4E5',
  medalBronze: '#8B5131', medalBronzeFill: '#EEDAC2',
};

/**
 * US Open — blue and yellow only: the night-session blue court with the
 * ball's yellow as the accent, no green anywhere. Deepened so it stays
 * clearly apart from the Australian Open's paler blue.
 */
const usOpenColors: Palette = {
  bg: '#14283D', bgElevated: '#1B3350', surface: '#1F3A5A', surfaceAlt: '#2A4A6E',
  border: '#32557A', borderStrong: '#5C82AC', text: '#E9F0F8', textMuted: '#BDCDDE', textFaint: '#A9B9CA',
  brand: '#F5D460', brandInk: '#1B1A0A', brandDim: '#4A4A2C', brandBright: '#7ED492', court: '#4E87C4', clay: '#D08A5E',
  hard: '#4E87C4', grass: '#5C9BD8', info: '#5C9BD8', success: '#FFDF79', warning: '#E3B85A', danger: '#E07E72',
  surfaceHard: '#3A77AA', surfaceClay: '#B65E36', surfaceGrass: '#3F8048', surfaceOther: '#8A948F',
  sun: '#F0B04A', rose: '#EE97BA',
  // The one green on this court, kept for Open to hit: the ring a player wears reads as green, as promised.
  open: '#4FD487',
  overlay: 'rgba(4, 12, 22, 0.7)',
  link: '#A4CCF4', onMedia: '#FFFFFF',
  bubble: '#24425F',
  bubbleMine: '#F4D35F', onDanger: '#1B1A0A',
  // The New York shirt: night blue, a lighter blue top right, the ball's yellow glowing bottom left
  // (held low, so the yellow lettering holds on it); the quiet words a shade lighter than the page's.
  cardFill: '#22497B', cardGlowTop: '#325D91', cardGlowBottom: '#675A38',
  cardFigure: '#F5D460', cardInk: '#F5D460', cardMuted: '#CBD8E6',
  cardTouch: '#F5D460',
  launchLine: '#A9B9CA',
  checker: '#26292A', checkerAlt: '#323637',
  avatarTint1: '#2C4560', avatarTint2: '#3A3F55', avatarTint3: '#45394C', avatarTint4: '#2F4A49', avatarTint5: '#4A4433', avatarTint6: '#3D4A5E',
  // Gold a warmer amber than the ball's yellow (the brand here), so 1st never reads as "yours";
  // silver a bright steel on a grey steel coin (a blue-grey one read as the page's own navy, not as
  // metal; review, Oct 28); bronze a copper.
  medalGold: '#F0C258', medalGoldFill: '#4B4127',
  medalSilver: '#D9E0E7', medalSilverFill: '#3B444E',
  medalBronze: '#E9A676', medalBronzeFill: '#4B3934',
};

export type ThemeName = 'default' | 'clean' | 'night' | 'ao' | 'roland-garros' | 'wimbledon' | 'us-open';

export const themes: Record<ThemeName, Palette> = {
  default: { ...lightColors },
  clean: cleanColors,
  night: darkColors,
  ao: aoColors,
  'roland-garros': rolandGarrosColors,
  wimbledon: wimbledonColors,
  'us-open': usOpenColors,
};

// The four court themes are named for the cities whose courts they borrow from, never the
// tournaments: those names are trademarks (Apple's rule 5.2.1). The ids stay as they were,
// so a theme someone already picked survives the rename.
export const themeList: { name: ThemeName; label: string; blurb: string }[] = [
  // Clean first: it is what a new player gets (Oct 24, owner: "clean should be the default color, not courtside … at the top in theme setting").
  { name: 'clean', label: 'Clean', blurb: 'Plain white, black text' },
  { name: 'default', label: 'CourtSide', blurb: 'Warm neutrals, club green' },
  { name: 'night', label: 'Night', blurb: 'Dark, for late sessions' },
  { name: 'ao', label: 'Melbourne', blurb: 'Blue hard court' },
  { name: 'roland-garros', label: 'Paris', blurb: 'Crushed brick clay' },
  { name: 'wimbledon', label: 'London', blurb: 'Grass green and purple' },
  { name: 'us-open', label: 'New York', blurb: 'Flushing night session' },
];

/**
 * The court the app wears until someone picks one (Oct 24, owner: "clean should be the default
 * color, not courtside"). Someone who picked CourtSide keeps it: their pick is saved. Style
 * sheets are still written in the CourtSide palette (lightColors) and remapped by slot.
 */
export const DEFAULT_THEME: ThemeName = 'clean';

/** The court picked, saved on this phone (or in this browser). With Match phone on, still the court picked, never the Night it shows. */
const STORAGE_KEY = 'courtside-theme';
/** Match phone, saved beside it: '1' on, anything else off (Oct 25). Saved from the first open on (matchPhoneFrom). */
const AUTO_DARK_KEY = 'courtside-theme-auto-dark';
const LEGACY_NIGHT_KEY = 'courtside-night-mode';

/**
 * Match phone, as saved; or, where it was never saved, decided now and saved, so it is decided once
 * and never changes by itself after (Oct 25, owner: "Match phone. On for new users"):
 *   - a new player (nothing of CourtSide's saved on this phone, or in this browser, as this open
 *     began: a fresh install) starts with it on;
 *   - anyone who used the app here before (any of its saved things there: src/lib/usedBefore.ts)
 *     keeps what they had, off, until they switch it on.
 * Either way the Theme page's switch changes it, as before. Where what was saved could not be read,
 * it stays off and nothing is saved (the next open, finding this one's things, counts as used).
 * Where the app cannot see the phone's mode (iPhone builds up to 18, PHONE_APPEARANCE) the switch is
 * hidden: always off there, and nothing is decided or saved, so the first open of a build that can
 * see it decides, by then counting that phone as used.
 */
function matchPhoneFrom(saved: string | null | undefined, keysBefore: readonly string[] | null): boolean {
  if (!PHONE_APPEARANCE) return false;
  if (saved != null) return saved === '1';
  const before = usedBefore(keysBefore, AUTO_DARK_KEY);
  if (before === null) return false;
  save(AUTO_DARK_KEY, before ? '0' : '1');
  return !before;
}

function readStored(): { court: ThemeName; autoDark: boolean } {
  try {
    if (Platform.OS !== 'web') return { court: DEFAULT_THEME, autoDark: false };
    const saved = localStorage.getItem(STORAGE_KEY);
    const autoDark = matchPhoneFrom(localStorage.getItem(AUTO_DARK_KEY), keysAtOpenNow());
    if (saved && saved in themes) return { court: saved as ThemeName, autoDark };
    // Anyone who had night mode on before keeps it.
    return { court: localStorage.getItem(LEGACY_NIGHT_KEY) === 'true' ? 'night' : DEFAULT_THEME, autoDark };
  } catch {
    return { court: DEFAULT_THEME, autoDark: false };
  }
}

type ThemeValue = {
  theme: ThemeName;
  setTheme: (name: ThemeName) => void;
  night: boolean;
  /**
   * The page itself is dark: Night, and New York's navy (Oct 5). What the
   * status bar's icons, the glass's tint and the like follow; `night` is only
   * the Night theme itself.
   */
  dark: boolean;
  setNight: (value: boolean) => void;
  /**
   * Inside a ThemeScope (the share screen's colour dots): the court here is
   * not the app's, so a themed style drawn here must never copy it into the
   * live `colors` the rest of the app reads (ThemeScope sets and puts back
   * those itself).
   */
  scoped: boolean;
};

/** Themes whose page is dark. */
const DARK_THEMES: ReadonlySet<ThemeName> = new Set<ThemeName>(['night', 'us-open']);

/*
 * A theme change, lag-free (Oct 23, owner: "It should just be super smooth. No lag").
 *
 * Recolouring the whole app at once is ~5,800 components (every tab stays
 * mounted, the map and the feed included): a stall of a sixth of a second on
 * a phone, which the old grey veil was there to hide. Now a tap recolours only
 * what can be seen: the Theme page, the app's frame and the status bar, in one
 * small redraw (Profile, under the Theme page since Oct 24, is let go first, and
 * at once on any way back: goBack, catchUp's Back handlers, app/theme.tsx). The four tabs sit behind a ThemeGate each
 * (src/features/navigation/tabFocus.tsx) and catch up out of sight once the
 * change has played, one tab per redraw, as background work (catchUp.ts).
 *
 * `live` is the court picked: what is saved and what the live `colors` object
 * holds. A gate holding a tab back keeps its old court until it is let go.
 *
 * The court reaches each part through a source (the root's, a gate's, a
 * ThemeScope's) that the part listens to, not through a changing context
 * value: React hands a changed context to every part reading it below the
 * change, a tab held behind its own gate included, and each of those was
 * then drawn again at the tap (only to find its court unchanged), with the
 * live colours already new and its court still old. A part that keeps what
 * it read (the Feed's top row, the Follow pills) kept a mix of the two and
 * was left in the old court. A source tells only the parts reading it.
 */
let live: ThemeName = 'default';
/** Set once someone has picked a court, so a late read of the saved one never overrides their pick. */
let picked = false;

/*
 * Match phone (Oct 25, owner: "a toggle where you can do like automatic dark mode … it
 * automatically turned dark mode when your phone does … I think that's what Instagram Snapchat
 * does", then "Match phone. On for new users"). On from the start for a new player, off for
 * everyone who used the app before (matchPhoneFrom); the Theme page's switch either way. On: Night
 * while the phone is in dark mode, the court picked while it is light. A dark court picked (Night,
 * New York) stays as it is.
 *
 * `chosen` is the court picked (what is saved); `live` is what shows. They differ only while this is
 * on and the phone is dark. Picking a court while that is so (a light one: the app is on Night)
 * turns Match phone off, so the court picked is what you see; picking one while the phone
 * is light keeps it on, the court picked becoming the one for light mode.
 *
 * Only where the app can see the phone's mode (PHONE_APPEARANCE: the website, Android, iPhone builds
 * after 18); elsewhere it is never on.
 */
let chosen: ThemeName = DEFAULT_THEME;
let autoDark = false;
/** The phone (or browser) in dark mode, as last heard. */
let phoneIsDark = false;

/*
 * Signed out (Oct 29, owner: "I clicked a web link to a discussion and I was on Australian open
 * theme. I think it should always be on ckean or courtside theme or night", then "Clean or night
 * for people who open link without based off of if their phone is dark or light mode"). Anyone not
 * signed in (a link opened on the website, guest mode, the sign-in and sign-up pages) sees Clean
 * while the phone or browser is light and Night while it is dark, following it as Match phone does.
 * The court saved here and Match phone are left as they are, only not shown: once signed in, they
 * show exactly as before. Set from the saved login as the app opens (a guess, so a returning
 * player never opens on Clean first), then from the account itself (VisitorThemeGate).
 */
let signedOut = false;
/** Set once the account itself has said (VisitorThemeGate), so a late read of the saved login never overrides it. */
let accountKnown = false;

/** What shows for a court picked, with Match phone on or off and the phone dark or light. */
export function shownFor(court: ThemeName, auto: boolean, dark: boolean): ThemeName {
  return auto && dark && !DARK_THEMES.has(court) ? 'night' : court;
}
const shownNow = () => (signedOut ? (phoneIsDark ? 'night' : DEFAULT_THEME) : shownFor(chosen, autoDark && PHONE_APPEARANCE, phoneIsDark));

/** Whether this app can offer Match phone (it can see the phone's light or dark mode). */
export const AUTO_DARK_AVAILABLE = PHONE_APPEARANCE;

const autoListeners = new Set<() => void>();
const subscribeAuto = (listener: () => void) => { autoListeners.add(listener); return () => { autoListeners.delete(listener); }; };
const getAuto = () => autoDark && PHONE_APPEARANCE;
/** Match phone on or off, for the Theme page's switch. */
export function useAutoDark(): boolean {
  return useSyncExternalStore(subscribeAuto, getAuto, getAuto);
}
/** The court picked (saved), whatever shows: with Match phone on and the phone dark, Night shows over it. */
export const pickedTheme = (): ThemeName => chosen;
/** What would show with Match phone switched to `on`, now (the Theme page starts its fade only when that differs). */
export const shownWithAutoDark = (on: boolean): ThemeName => shownFor(chosen, on && PHONE_APPEARANCE, phoneIsDark);

/** The court picked, whatever any held-back tab is still showing. */
export const liveTheme = (): ThemeName => live;

/** Where a part reads its court from: the app's own, a held tab's, or a ThemeScope's. */
export interface ThemeSource {
  get: () => ThemeName;
  subscribe: (listener: () => void) => () => void;
  /** Inside a ThemeScope (see ThemeValue.scoped). */
  scoped: boolean;
}

/** A source whose court is moved with `set`; the parts reading it are told. */
export function makeThemeSource(initial: ThemeName, scoped = false): ThemeSource & { set: (name: ThemeName) => void } {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    // Tells its parts even when the court is the same: a tab let go at once while its catch-up is
    // still under way as background work holds `name` already, and its parts that have not drawn
    // it yet must redraw now, in this same go, or the tab shows half old, half new until that
    // background work lands. A part already showing the court does nothing (useTheme's check).
    set: (name: ThemeName) => {
      current = name;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    scoped,
  };
}

/** The app's own court: what everything outside a held tab reads. */
const rootSource = makeThemeSource('default');
export const ThemeSourceContext = createContext<ThemeSource>(rootSource);

function save(key: string, value: string) {
  try {
    if (Platform.OS === 'web') localStorage.setItem(key, value);
    else void AsyncStorage.setItem(key, value).catch(() => undefined);
  } catch {}
}

/**
 * Shows a court: the live colours swapped, and what is on screen redrawn in
 * one go. The tabs out of sight follow afterwards (catchUp).
 */
function show(name: ThemeName) {
  if (name === live) return;
  live = name;
  Object.assign(colors, themes[name]);
  tapped(name);
  rootSource.set(name);
}

/**
 * Picks a court: saved at once and shown (see show). With Match phone on and the phone
 * dark, a light court picked turns it off, so what you picked is what you see.
 */
function setTheme(name: ThemeName) {
  if (!(name in themes)) return;
  const autoOff = autoDark && PHONE_APPEARANCE && phoneIsDark && !DARK_THEMES.has(name);
  if (name === chosen && name === live && !autoOff) return;
  picked = true;
  if (autoOff) setAutoFlag(false);
  chosen = name;
  save(STORAGE_KEY, name);
  show(shownNow());
}

/**
 * Puts the saved court back to another one without it counting as a pick: unlike setTheme, Match
 * phone is never switched off, so with the phone dark Night stays on show and only the court saved
 * underneath changes. For the early-members gate (EarlyThemesGate), which moves a new player off a
 * court they were never offered.
 */
export function replacePicked(name: ThemeName) {
  if (!(name in themes) || name === chosen) return;
  picked = true;
  chosen = name;
  save(STORAGE_KEY, name);
  show(shownNow());
}

function setAutoFlag(on: boolean) {
  autoDark = on;
  save(AUTO_DARK_KEY, on ? '1' : '0');
  autoListeners.forEach((listener) => listener());
}

/**
 * Match phone on or off (the Theme page's switch): saved at once, and the app goes to Night
 * or back to the court picked if the phone is dark, the same way as a pick.
 */
export function setAutoDark(on: boolean) {
  if (!PHONE_APPEARANCE || on === autoDark) return;
  picked = true;
  phoneIsDark = phoneDark();
  setAutoFlag(on);
  show(shownNow());
}

/*
 * The phone turning dark or light with Match phone on. Never under a finger: a page or a
 * section being swiped, the Feed's clips scrolling, or a moment after either (the swipe settling),
 * the change waits for the page to be still. On the Theme page it plays as a pick does (the old look
 * fading off the page); anywhere else the whole screen cross-fades from the old look to the new, as
 * an iPhone does for its own apps (screenFade; Oct 25, owner: "It should fade to dark mode not
 * immediately change, what does Instagram or Strava do"): the page on show turns under a picture
 * of the old look, which then fades away, and the rest follow out of sight, as after a pick.
 */
/** How long after a swipe ends before the phone's change lands (the page settling into place). */
const AFTER_SWIPE_MS = 450;
/** A change of mode heard this soon after another is waited out, so a quick there-and-back never shows. */
const SETTLE_MS = 120;
/** Whatever a finger is doing, the change lands this long after it was heard at the latest. */
const MOST_WAIT_MS = 4000;
let followTimer: ReturnType<typeof setTimeout> | null = null;
let swipeEnded = -Infinity;
let heardAt = 0;
const stamp = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function underFinger(): boolean {
  let claimed = false;
  try { claimed = claimedDepth.value > 0; } catch { /* not readable here */ }
  return claimed || isPageDragging() || isPageScrolling() || stamp() - swipeEnded < AFTER_SWIPE_MS;
}

/** The phone's change, landed: the page on show turns in one go (under the fading picture). */
function landPhone(): boolean {
  const next = shownNow();
  if (next === live) return false;
  show(next);
  catchUpShown();
  return true;
}

const tryAgain = () => {
  if (followTimer) clearTimeout(followTimer);
  followTimer = setTimeout(followPhone, 120);
};

const phoneFade = {
  land: landPhone,
  held: underFinger,
  retry: tryAgain,
};

function followPhone() {
  followTimer = null;
  const next = shownNow();
  if (next === live) return;
  const finger = underFinger();
  if (finger && stamp() - heardAt < MOST_WAIT_MS) { tryAgain(); return; }
  const leaving = live;
  // The Theme page open: its own fade, exactly as a pick (the copies go on in this same go).
  if (beginPageFade(leaving)) { show(next); return; }
  // Waited as long as it may and a finger is still on the page: in one go, as before (a picture
  // held over the page would stop it moving under the finger).
  if (finger) { landPhone(); return; }
  fadeScreen(phoneFade);
}

function phoneChanged(dark: boolean) {
  phoneIsDark = dark;
  heardAt = stamp();
  if (followTimer) clearTimeout(followTimer);
  followTimer = setTimeout(followPhone, SETTLE_MS);
}

function installFollowPhone(): () => void {
  if (!PHONE_APPEARANCE) return () => undefined;
  const stopPhone = onPhoneAppearance(phoneChanged);
  const stopSwipe = subscribePageDragging(() => { if (!isPageDragging()) swipeEnded = stamp(); });
  // A change heard between the first draw and now.
  phoneChanged(phoneDark());
  return () => {
    stopPhone();
    stopSwipe();
    if (followTimer) { clearTimeout(followTimer); followTimer = null; }
  };
}

/**
 * Signed in or out, from the account (VisitorThemeGate): signed out shows Clean or Night by the
 * phone's mode, signed in the court saved here (see `signedOut`). Nothing saved changes.
 */
export function setSignedOut(on: boolean) {
  accountKnown = true;
  if (on === signedOut) return;
  signedOut = on;
  phoneIsDark = phoneDark();
  const next = shownNow();
  if (next === live) return;
  show(next);
  catchUpShown();
}

// Kept so existing callers of the old night-mode switch keep working.
const setNight = (value: boolean) => setTheme(value ? 'night' : DEFAULT_THEME);

/** Straight to a court with nothing held back: the saved court read at launch. */
function applyNow(name: ThemeName) {
  live = name;
  noteLive(name);
  Object.assign(colors, themes[name]);
  rootSource.set(name);
  catchUpNow('all');
}

const values = new Map<ThemeName, ThemeValue>();
const scopedValues = new Map<ThemeName, ThemeValue>();
/** The one value per court, made once, so a part handed the same court sees the same object. */
export function valueFor(name: ThemeName, scoped = false): ThemeValue {
  const cache = scoped ? scopedValues : values;
  let value = cache.get(name);
  if (!value) {
    value = Object.freeze({ theme: name, setTheme, night: name === 'night', dark: DARK_THEMES.has(name), setNight, scoped });
    cache.set(name, value);
  }
  return value;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The live colours are set as the app first draws, not as this file loads: style sheets are
  // written in the default palette, and the colour-to-slot map (slotOf) is built from it.
  useState(() => {
    const stored = readStored();
    chosen = stored.court;
    autoDark = stored.autoDark;
    // In a browser the saved login can be read now; on a phone it is read with the saved court (below).
    signedOut = Platform.OS === 'web' && !storedLoginNow();
    phoneIsDark = phoneDark();
    live = shownNow();
    noteLive(live);
    Object.assign(colors, themes[live]);
    rootSource.set(live);
    return live;
  });
  useEffect(() => installCatchUp(), []);
  useEffect(() => installFollowPhone(), []);

  // A phone has no localStorage, and its own store can only be read back
  // asynchronously — so the app opens on the default and switches to the saved
  // theme on the first frame after. Without this the choice lasted until the
  // app was closed.
  // Nothing is drawn in the default colours first: on a phone the app waits
  // (a few milliseconds, at most 0.8 s) for the saved theme, showing the launch
  // picture's cream meanwhile, so the loading screen opens in your own theme
  // instead of snapping to it (Oct 2).
  const [loaded, setLoaded] = useState(Platform.OS === 'web');
  useLaunchDark(!loaded);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let alive = true;
    const giveUp = setTimeout(() => { if (alive) setLoaded(true); }, 800);
    Promise.all([AsyncStorage.multiGet([STORAGE_KEY, AUTO_DARK_KEY]), keysAtOpen(), storedLoginId()])
      .then(([pairs, keysBefore, loginId]) => {
        if (!alive || picked) return;
        if (!accountKnown) signedOut = !loginId;
        const saved = pairs[0]?.[1];
        if (saved && saved in themes) chosen = saved as ThemeName;
        autoDark = matchPhoneFrom(pairs[1]?.[1], keysBefore);
        if (autoDark) autoListeners.forEach((listener) => listener());
        phoneIsDark = phoneDark();
        const next = shownNow();
        if (next !== live) applyNow(next);
      })
      .catch(() => {})
      .finally(() => { if (alive) { clearTimeout(giveUp); setLoaded(true); } });
    return () => { alive = false; clearTimeout(giveUp); };
  }, []);

  return (
    <ThemeSourceContext.Provider value={rootSource}>
      <View style={[{ flex: 1, backgroundColor: loaded ? undefined : lightColors.bg }, loaded ? null : launchGround()]}>
        {/* While your last theme is read (a blink), the launch picture itself, not a bare cream
            screen: the logo never drops out between the phone's picture and the app's (Oct 4).
            Splash C (Oct 24): the same drawn mark and line as the font gate and the splash before it. */}
        {loaded ? children : NEW_SPLASH
          ? <LaunchMark ink={lightColors.brand} faint={lightColors.launchLine} />
          : <Image source={require('../../assets/splash.png')} resizeMode="cover" style={StyleSheet.absoluteFill} />}
        {/* The picture of the old look while the app changes look by itself (Match phone): last, over everything. */}
        {loaded ? <><DrawnWatch /><ScreenFadeHost /></> : null}
      </View>
    </ThemeSourceContext.Provider>
  );
}

/** Tells the screen's cross-fade when the court picked has been drawn (its picture then fades: screenFade). */
function DrawnWatch() {
  const { theme } = useTheme();
  useLayoutEffect(() => { if (theme === live) screenDrawn(); }, [theme]);
  return null;
}

/**
 * The court this part is drawn in, and the switches. It listens to its
 * source (the nearest gate, ThemeScope or the app's own) and is drawn again
 * when that source moves: in the same go as the move, so a move made as
 * background work (a tab catching up) is background work here too.
 */
export function useTheme(): ThemeValue {
  const source = useContext(ThemeSourceContext);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const theme = source.get();
  // What this part last showed, as committed (a draw React threw away never counts).
  const shown = useRef(theme);
  useLayoutEffect(() => { shown.current = theme; });
  useLayoutEffect(() => {
    const check = () => { if (source.get() !== shown.current) redraw(); };
    check(); // moved between the draw and now
    return source.subscribe(check);
  }, [source]);
  return valueFor(theme, source.scoped);
}

/**
 * Draws what is inside it in another court's colours, and only that: the
 * share screen's colour dots (Oct 15, owner: "do the color changing for the
 * cards") recolour the share pictures and nothing else. The app's theme and
 * Settings are untouched.
 *
 * Inside, `useTheme()` says the chosen court, so themed styles and the
 * session box's look (cardLook) follow it; the live `colors` object is the
 * chosen court's while the inside is drawn, and is put back to the app's
 * own the moment it is done (the empty sibling after it, which React draws
 * next, and once more when the screen settles), so whatever is drawn after
 * it is in the app's colours as always.
 */
export function ThemeScope({ theme, children }: { theme: ThemeName; children: React.ReactNode }) {
  // A fixed source per court: a change of court is a new source, which the parts inside read at once.
  const source = useMemo(() => makeThemeSource(theme, true), [theme]);
  // Put back to the court picked (live), never a court the screen around it may still be holding.
  useLayoutEffect(() => { Object.assign(colors, themes[live]); });
  Object.assign(colors, themes[theme]);
  return (
    <>
      <ThemeSourceContext.Provider value={source}>{children}</ThemeSourceContext.Provider>
      <PutBack />
    </>
  );
}

/** Puts the live colours back to the court picked, right after a ThemeScope's inside is drawn. */
function PutBack() {
  Object.assign(colors, themes[live]);
  return null;
}

/**
 * Recolours style definitions written against any one palette.
 *
 * Styles are declared once with literal colours; this walks them and swaps any
 * value that matches the same slot in another theme. That is why every palette
 * must define every key — a missing slot would leave a stray colour from
 * whichever theme the style was authored in.
 */
// Every colour any palette uses, and the slot it fills — built once, so a
// theme change is a lookup per value rather than a scan of every palette.
const slotOf = new Map<string, keyof typeof lightColors>();
const slotKeys = Object.keys(lightColors) as (keyof typeof lightColors)[];
// The default palette's own colours claim their slots first: styles are written against it. Without
// this, white went to 'bg' (the Clean theme's page is white), so white over a picture (onMedia, such
// as "Change photo" on the share screen) drew in the page colour: navy on New York, near-black on Night.
for (const key of slotKeys) if (!slotOf.has(lightColors[key])) slotOf.set(lightColors[key], key);
for (const key of slotKeys) {
  for (const palette of Object.values(themes)) if (!slotOf.has(palette[key])) slotOf.set(palette[key], key);
}

/**
 * Each style sheet remapped once per theme, shared by every component that uses it: a feed of
 * PostCards walks its sheet once, not once per card, and a theme switch once per sheet.
 */
const remapCache = new Map<ThemeName, WeakMap<object, object>>();

/** A style sheet in a court's colours, made once per court and sheet (the same cache useThemedStyles reads). */
export function remapFor<T extends object>(theme: ThemeName, definitions: T): T {
  let cache = remapCache.get(theme);
  if (!cache) { cache = new WeakMap(); remapCache.set(theme, cache); }
  const hit = cache.get(definitions);
  if (hit) return hit as T;
  const target = themes[theme];
  const remap = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const key = slotOf.get(value);
      if (key) return target[key];
      // Preserve an eight-digit hex's alpha pair when swapping the colour.
      if (value.length === 9 && value.startsWith('#')) {
        const base = slotOf.get(value.slice(0, 7));
        if (base) return target[base] + value.slice(7);
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
    }
    return value;
  };
  const out = remap(definitions) as T;
  cache.set(definitions, out);
  return out;
}

export function useThemedStyles<T extends object>(definitions: T): T {
  const { theme, scoped } = useTheme();
  // The live colour object is brought in line with the court picked every time
  // a themed screen draws, so a button reading `colors.brand` can never be a
  // theme behind. Always the court picked (live), never this screen's own: a
  // tab still held on the old court (catchUp) must not put its court back into
  // the colours the rest of the app reads. Not inside a ThemeScope: a share
  // picture redrawing on its own (an avatar hearing new people) would
  // otherwise leave its court in the colours the rest of the app reads.
  if (!scoped && (colors.bg !== themes[live].bg || colors.brand !== themes[live].brand)) Object.assign(colors, themes[live]);
  return useMemo(() => remapFor(theme, definitions), [definitions, theme]);
}
