import { mixHex } from '@/features/activity/zones';
import { colors, pageIsDark } from '@/theme';

/*
 * The ground round a clip or photo shared to an Instagram story from a
 * post's ••• menu, where the picture does not fill the screen. The overlay
 * on it is the signature alone (StoryOverlay.tsx), so nothing about a
 * session is worked out here.
 */

/**
 * The two colours round a story's picture where it does not fill the
 * screen: the court's darkest colour, faintly tinted with the court at the
 * top, as the session's Overlay design uses. Instagram fills round a clip
 * that is not 9:16 with them (mediaStory.ts), and a landscape or square
 * photo is drawn over them (StoryOverlayCanvas), so both look alike.
 */
export function storyFill(): { top: string; bottom: string } {
  const deep = (pageIsDark() ? colors.bg : colors.text).slice(0, 7);
  return { top: mixHex(deep, colors.court.slice(0, 7), 0.15), bottom: deep };
}
