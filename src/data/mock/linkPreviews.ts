/**
 * The demo's link previews: what the link-preview function would send back
 * for the few links in the demo's chats (and one to try sending), so the
 * web demo shows the cards without a server. Their pictures are the demo's
 * own drawings ("demo:" addresses, see src/features/messages/DemoPhoto.tsx),
 * since the demo ships no picture files. Any other link shows the plain
 * card with the site's name, exactly as it would before the function is
 * there.
 */
export const DEMO_LINK_PREVIEWS: Record<string, { title: string; site: string; image?: string; kind: 'tiktok' | 'youtube' | 'instagram' | 'image' | 'link' }> = {
  'https://www.tiktok.com/@clayseason/video/7421503318874521902': {
    title: 'Sliding on clay without losing the point: three drills 🎾',
    site: 'TikTok · @clayseason',
    image: 'demo:clay-sunset',
    kind: 'tiktok',
  },
  'https://www.youtube.com/watch?v=kickserve101': {
    title: 'The kick serve in slow motion: five cues that fix it',
    site: 'YouTube · Baseline Lab',
    image: 'demo:court-night',
    kind: 'youtube',
  },
  'https://youtube.com/watch?v=kickserve101': {
    title: 'The kick serve in slow motion: five cues that fix it',
    site: 'YouTube · Baseline Lab',
    image: 'demo:court-night',
    kind: 'youtube',
  },
  'https://youtu.be/kickserve101': {
    title: 'The kick serve in slow motion: five cues that fix it',
    site: 'YouTube · Baseline Lab',
    image: 'demo:court-night',
    kind: 'youtube',
  },
};
