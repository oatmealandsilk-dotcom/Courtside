import { Platform } from 'react-native';

/**
 * Which look the Feed's Activities shows, one switch per platform.
 *
 * - 'gallery-rollup' (Nov 28, owner: "Gallaty+ friends played"): the gallery below, plus other people's sessions
 *   without a photo or clip kept as ONE quiet "who played" row per day in the feed's time order ("Tomás and Nadia
 *   played today"), opened in place with a tap. Only people you follow are in it. Your own sessions without a photo
 *   show to you as a thin row (no "Not in friends' feeds": friends see them in their row).
 * - 'gallery' (Nov 28, owner: "1 gallery is better"): one continuous list you flick through at any speed. Other
 *   people's sessions show only with a photo or clip (a big square picture card); your own sessions without one show
 *   to you alone as a thin row, "Not in friends' feeds". Photo posts, clips and text posts from the people you follow
 *   show as before. Only a clip opens the full-screen reel (videos only), and back lands where you were.
 * - 'now': the full-screen pages, one session per swipe, exactly as before Nov 28. The instant way back.
 *
 * The earlier examples (Strava, Hevy, classic, mixed) stay on the branch design/activities-feed.
 */
export type ActivitiesLook = 'now' | 'gallery' | 'gallery-rollup';

/** The website (scripts/smoke.mjs reads this line to know which Activities steps to run). */
export const ACTIVITIES_LOOK_WEB: ActivitiesLook = 'gallery-rollup';

/**
 * The iPhone (and Android) app: the same gallery + "friends played" (Nov 28, owner: "Switch phone activity to
 * gallery too"). The way back is this one line ('now'), shipped with an update.
 */
export const ACTIVITIES_LOOK_NATIVE: ActivitiesLook = 'gallery-rollup';

export const ACTIVITIES_LOOK: ActivitiesLook = Platform.OS === 'web' ? ACTIVITIES_LOOK_WEB : ACTIVITIES_LOOK_NATIVE;

/** The continuous list (either gallery look) rather than the pages. */
export const isGalleryLook = (look: ActivitiesLook) => look !== 'now';
