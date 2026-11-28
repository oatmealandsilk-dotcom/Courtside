/**
 * Which look the Feed's Activities shows. One switch for everyone, website and iPhone alike.
 *
 * - 'gallery' (Nov 28, owner: "1 gallery is better"): one continuous list you flick through at any speed. Other
 *   people's sessions show only with a photo or clip (a big square picture card); your own sessions without one show
 *   to you alone as a thin row, "Not in friends' feeds". Photo posts, clips and text posts from the people you follow
 *   show as before. Only a clip opens the full-screen reel (videos only), and back lands where you were.
 * - 'now': the full-screen pages, one session per swipe, exactly as before Nov 28. The instant way back: set
 *   ACTIVITIES_LOOK to 'now' and ship.
 *
 * The earlier examples (Strava, Hevy, classic, mixed, who-played) stay on the branch design/activities-feed.
 */
export type ActivitiesLook = 'now' | 'gallery';

export const ACTIVITIES_LOOK: ActivitiesLook = 'gallery';
