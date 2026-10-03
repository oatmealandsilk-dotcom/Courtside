import { isoDaysAgo } from '@/lib/format';
import type { Comment, Post } from '../types';
import { CURRENT_USER_ID } from './users';
import { DEMO_PARK } from './courts';

/** A demo park as a post's court tag. */
const courtTag = (n: number) => { const c = DEMO_PARK(n); return { id: c.id, name: c.name ?? 'Public courts', lat: c.lat, lng: c.lng }; };

/** Day `n` days ago as 'YYYY-MM-DD' on this phone's clock. */
const dayAgo = (n: number) => { const d = new Date(Date.now() - n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * A court at dusk, drawn rather than shipped (the demo ships no pictures):
 * for a photo post with a session on it, so the strip under a photo shows.
 */
const DUSK_COURT = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9A27A"/><stop offset="0.55" stop-color="#F3D2A6"/><stop offset="1" stop-color="#F6E3C4"/></linearGradient>
<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D6E8F"/><stop offset="1" stop-color="#2B5876"/></linearGradient></defs>
<rect width="800" height="1000" fill="url(#s)"/>
<path d="M0 360 L120 300 L230 340 L360 270 L470 330 L590 280 L700 320 L800 290 L800 430 L0 430 Z" fill="#9C8B6E" opacity="0.55"/>
<rect x="0" y="420" width="800" height="70" fill="#4E6E52"/>
<rect x="0" y="470" width="800" height="530" fill="#5D8A62"/>
<path d="M210 500 L590 500 L760 1000 L40 1000 Z" fill="url(#c)"/>
<g stroke="#FFFFFF" stroke-width="5" fill="none" opacity="0.92">
<path d="M210 500 L590 500 L760 1000 L40 1000 Z"/><path d="M250 500 L120 1000"/><path d="M550 500 L680 1000"/>
<path d="M196 620 L604 620"/><path d="M80 880 L720 880"/><path d="M400 620 L400 880"/></g>
<rect x="150" y="700" width="500" height="10" fill="#1F2A2F"/>
<g stroke="#1F2A2F" stroke-width="2" opacity="0.5">${Array.from({ length: 24 }, (_, i) => `<line x1="${160 + i * 20}" y1="660" x2="${160 + i * 20}" y2="705"/>`).join('')}</g>
<rect x="150" y="656" width="500" height="6" fill="#F4F4F0"/>
<circle cx="520" cy="820" r="10" fill="#E3EF5A"/>
</svg>`)}`;

export const posts: Post[] = [
  {
    // Dev's clip from WHOOP, heart rate and zones shared: the glass "See stats" pill over it, the stats over the playing clip.
    id: 'p-dev-clip',
    authorId: 'u-dev',
    kind: 'clip',
    createdAt: isoDaysAgo(0, 1),
    body: 'Two points from the third set. The second is the best backhand I have hit all year.',
    mediaLabel: 'Third set · 0:24',
    session: {
      focus: 'Match · Won', minutes: 72, drills: [], activityId: 'act-dev-2', source: 'whoop', kind: 'match', won: true, day: dayAgo(0),
      maxHr: 176, avgHr: 150, zones: [8, 12, 22, 20, 10],
      with: [{ id: 'u-mira', handle: 'miraplays', name: 'Mira Okafor', role: 'opponent' }],
    },
    likedBy: ['u-mira', 'u-june'],
    commentIds: [],
    // A demo clip is kept only with a court tag (api.ts drops the old demo reels).
    court: courtTag(1),
    location: courtTag(1).name,
    tags: [],
  },
  {
    // Sam's clip from WHOOP without heart rate: the pill says who it was against instead ("vs Mira").
    id: 'p-sam-clip',
    authorId: 'u-sam',
    kind: 'clip',
    createdAt: isoDaysAgo(0, 6),
    body: 'Lost this one, but look at that lob.',
    mediaLabel: 'Match point · 0:18',
    session: {
      focus: 'Match · Lost', minutes: 65, drills: [], activityId: 'act-sam-1', source: 'whoop', kind: 'match', won: false, day: dayAgo(0),
      with: [{ id: 'u-mira', handle: 'miraplays', name: 'Mira Okafor', role: 'opponent' }],
    },
    likedBy: ['u-dev'],
    commentIds: [],
    // A demo clip is kept only with a court tag (api.ts drops the old demo reels).
    court: courtTag(1),
    location: courtTag(1).name,
    tags: [],
  },
  {
    // Dev's evening match from WHOOP, with a photo: the stats strip under it, and the zone foot along its bottom edge.
    id: 'p-dev-photo',
    authorId: 'u-dev',
    kind: 'note',
    createdAt: isoDaysAgo(0, 2),
    body: 'Sunset tiebreak at Alder Park. Took the forehand early all match and it finally paid off.',
    imageUrl: DUSK_COURT,
    thumbnailUrl: DUSK_COURT,
    mediaLabel: 'Court at dusk',
    session: {
      focus: 'Match · Won', minutes: 84, drills: [], activityId: 'act-dev-1', source: 'whoop', kind: 'match', won: true, day: dayAgo(0),
      maxHr: 171, avgHr: 141, zones: [14, 18, 25, 21, 6],
      with: [{ id: 'u-mira', handle: 'miraplays', name: 'Mira Okafor', role: 'opponent' }],
    },
    court: courtTag(1),
    location: courtTag(1).name,
    likedBy: ['u-mira', 'u-june', CURRENT_USER_ID],
    commentIds: [],
    tags: [],
  },
  {
    // Mira's match from WHOOP, no photo: the session's card is the post. Heart rate and zones shared.
    id: 'p-mira-whoop',
    authorId: 'u-mira',
    kind: 'note',
    createdAt: isoDaysAgo(0, 5),
    body: 'Clay finally feels like home. Serve was there all night and Dev made me earn every point.',
    session: {
      focus: 'Match · Won', minutes: 84, drills: [], activityId: 'act-mira-1', source: 'whoop', kind: 'match', won: true, day: dayAgo(0),
      maxHr: 171, avgHr: 141, zones: [14, 18, 25, 21, 6],
      with: [{ id: 'u-dev', handle: 'devbackhand', name: 'Dev Sharma', role: 'opponent' }],
    },
    likedBy: ['u-dev', 'u-june', 'u-tomas'],
    commentIds: [],
    tags: [],
  },
  {
    // June's practice from an Apple Watch: heart rate shared, and no zones (Apple gives none).
    id: 'p-june-watch',
    authorId: 'u-june',
    kind: 'note',
    createdAt: isoDaysAgo(1, 3),
    body: 'An hour of serve and volley patterns. Legs are done.',
    session: { focus: 'Practice', minutes: 62, drills: [], activityId: 'act-june-1', source: 'apple-watch', kind: 'practice', day: dayAgo(1), maxHr: 158, avgHr: 132 },
    likedBy: ['u-mira'],
    commentIds: [],
    tags: [],
  },
  {
    // Your match a week ago from WHOOP (act-demo-3, logged as ses-demo-13), heart rate and zones shared:
    // your stats sheet adds Strain, calories and the start time, for you only.
    id: 'p-demo-whoop',
    authorId: CURRENT_USER_ID,
    kind: 'note',
    createdAt: isoDaysAgo(7, -3),
    body: 'Finally closed one out against Mira. Third set, no tiebreak.',
    session: {
      focus: 'Match · Won', minutes: 96, drills: [], activityId: 'act-demo-3', source: 'whoop', kind: 'match', won: true, day: dayAgo(7), sessionId: 'ses-demo-13',
      maxHr: 174, avgHr: 146, zones: [10, 16, 28, 30, 12],
      with: [{ id: 'u-mira', handle: 'miraplays', name: 'Mira Okafor', role: 'opponent' }],
    },
    court: courtTag(1),
    location: courtTag(1).name,
    likedBy: ['u-mira', 'u-dev'],
    commentIds: [],
    tags: [],
  },
  {
    id: 'p1',
    authorId: 'u-mira',
    kind: 'clip',
    createdAt: isoDaysAgo(0, 3),
    body: 'Third set tiebreak against a lefty who would not miss. Finally started taking the forehand early instead of backing up five feet. That was the whole match.',
    mediaLabel: 'Match highlights · 0:42',
    match: { opponentName: 'K. Oyelaran', sets: ['6-4', '4-6', '7-6(5)'], won: true, surface: 'hard' },
    likedBy: ['u-dev', 'u-june', CURRENT_USER_ID],
    commentIds: ['c1', 'c2'],
    tags: ['singles', 'league'],
  },
  {
    id: 'p2',
    authorId: CURRENT_USER_ID,
    kind: 'session',
    createdAt: isoDaysAgo(0, 9),
    body: 'Serve day. Kept the toss further in front and the second serve stopped sitting up. Shoulder felt fine at 80 balls, stopped there on purpose.',
    session: {
      focus: 'Second serve consistency',
      minutes: 75,
      drills: ['Kick serve to the backhand, 4 x 20', 'Target cones, deuce side', 'Serve +1 forehand patterns'],
      intensity: 3,
    },
    likedBy: ['u-dev', 'u-june'],
    commentIds: ['c3', 'c7', 'c8'],
    tags: ['serve', 'practice'],
    // A place typed rather than picked from the courts list: its menu offers "Add the court".
    location: 'Alder Park',
  },
  {
    id: 'p3',
    authorId: 'u-june',
    isFirst: true,
    kind: 'gear',
    createdAt: isoDaysAgo(1, 2),
    body: 'Switched to a 16x19 pattern after four years on 18x20. More spin, obviously, but the real difference is how much easier the low volley is. Two weeks in and not going back.',
    mediaLabel: 'Racquet photo',
    likedBy: ['u-mira', 'u-dev', 'u-tomas', CURRENT_USER_ID],
    commentIds: ['c4', 'c9'],
    tags: ['gear', 'racquets'],
  },
  {
    id: 'p4',
    authorId: 'u-dev',
    kind: 'note',
    createdAt: isoDaysAgo(2),
    body: 'Unpopular opinion: drilling for an hour with someone at your level beats a lesson you are not ready to absorb. Fix the obvious thing first.',
    likedBy: ['u-june'],
    commentIds: [],
    tags: ['practice'],
  },
  {
    id: 'p5',
    authorId: 'u-tomas',
    kind: 'clip',
    createdAt: isoDaysAgo(2, 6),
    body: 'Watching club players all week: nearly every double fault starts with a rushed ritual, not a bad motion. Same bounce count, same breath, every single time. That is the fix.',
    mediaLabel: 'Coaching clip · 1:10',
    likedBy: ['u-mira', 'u-dev', 'u-june', CURRENT_USER_ID],
    commentIds: ['c5', 'c6'],
    tags: ['serve', 'coaching'],
  },
  {
    id: 'p6',
    authorId: CURRENT_USER_ID,
    kind: 'milestone',
    createdAt: isoDaysAgo(4),
    body: 'Hit 100 hours on court since I started tracking. A year ago I could not have told you how many times a week I played.',
    likedBy: ['u-mira', 'u-june', 'u-nadia'],
    commentIds: [],
    tags: ['milestone'],
  },
  {
    id: 'p7',
    authorId: 'u-nadia',
    kind: 'session',
    createdAt: isoDaysAgo(5),
    body: 'Off-court day for the tennis crowd: everything here is rotational or single leg. If your split step is soft, this is why.',
    session: {
      focus: 'Rotational power + single leg stability',
      minutes: 50,
      drills: ['Med ball rotational throws 4 x 6', 'Split squats 3 x 8/side', 'Lateral bounds 4 x 6', 'Copenhagen plank 3 x 30s'],
      intensity: 4,
    },
    likedBy: ['u-mira', CURRENT_USER_ID],
    commentIds: [],
    tags: ['fitness'],
  },
  {
    id: 'p8',
    authorId: 'u-mira',
    kind: 'match',
    createdAt: isoDaysAgo(6),
    body: 'Lost the plot in the second after going up a break. Wrote down what I was doing at 4-2 and what I was doing at 4-5. Completely different players.',
    match: { opponentName: 'R. Deveraux', sets: ['6-3', '5-7', '4-6'], won: false, surface: 'clay' },
    likedBy: ['u-dev'],
    commentIds: [],
    tags: ['singles', 'mental'],
  },
  // Posts tagged at the demo parks, so their pages, the map's court cards and
  // Courts near you have something to show.
  {
    id: 'p-court-1',
    authorId: 'u-sam',
    kind: 'clip',
    createdAt: isoDaysAgo(0, 5),
    body: 'Inside-out forehand drill on court 2. The lights here stay on till 10.',
    mediaLabel: 'Clip · 0:24',
    likedBy: ['u-marcus', CURRENT_USER_ID],
    commentIds: [],
    tags: ['forehand'],
    location: 'Alder Park',
    court: courtTag(1),
  },
  {
    id: 'p-court-2',
    authorId: 'u-sam',
    kind: 'note',
    createdAt: isoDaysAgo(1, 3),
    body: 'Alder Park got new nets on courts 3 and 4. Quiet before 8am on weekdays.',
    likedBy: ['u-priya'],
    commentIds: [],
    tags: ['courts'],
    location: 'Alder Park',
    court: courtTag(1),
  },
  {
    id: 'p-court-3',
    authorId: 'u-marcus',
    kind: 'session',
    createdAt: isoDaysAgo(2, 1),
    body: 'First full hour of rallying in years. Cypress Hollow was busy but a court opened up by 7.',
    session: { focus: 'Rally consistency', minutes: 60, drills: ['Crosscourt rallies', 'Down the line on call'], intensity: 2 },
    likedBy: ['u-sam'],
    commentIds: [],
    tags: ['practice'],
    location: 'Cypress Hollow Park',
    court: courtTag(3),
  },
  {
    id: 'p-court-4',
    authorId: 'u-priya',
    kind: 'note',
    createdAt: isoDaysAgo(3),
    body: 'Footwork clinic at Cypress Hollow went well. Split step on the opponent’s contact, not after it.',
    likedBy: ['u-marcus', 'u-sam'],
    commentIds: [],
    tags: ['footwork', 'coaching'],
    location: 'Cypress Hollow Park',
    court: courtTag(3),
  },
  // Two of yours put away, so the archive's Posts has something in it.
  {
    id: 'p-archived-1',
    authorId: CURRENT_USER_ID,
    kind: 'note',
    createdAt: isoDaysAgo(12),
    body: 'Trying a two-handed backhand for a month. Writing it down so I actually stick with it.',
    likedBy: ['u-june'],
    commentIds: [],
    tags: ['backhand'],
    archived: true,
  },
  {
    id: 'p-archived-2',
    authorId: CURRENT_USER_ID,
    kind: 'session',
    createdAt: isoDaysAgo(20),
    body: 'Rain cut it short. Twenty minutes of serves before the lines got slick.',
    session: { focus: 'First serve rhythm', minutes: 20, drills: ['Flat serves, deuce side'], intensity: 2 },
    likedBy: [],
    commentIds: [],
    tags: ['serve'],
    archived: true,
  },
  {
    // A post with a session from your own log on it (ses-demo-3): "Posted" in Your sessions, "Already posted" in the picker.
    id: 'p-demo-drills',
    authorId: CURRENT_USER_ID,
    kind: 'note',
    createdAt: isoDaysAgo(4, -1),
    body: 'Forty-five minutes of crosscourt backhands before work. Ugly start, clean finish.',
    session: { focus: 'Drills', minutes: 45, drills: [], sessionId: 'ses-demo-3', kind: 'drills', day: dayAgo(4) },
    likedBy: ['u-mira'],
    commentIds: [],
    tags: [],
  },
  {
    // Yesterday's match from your log (ses-demo-1). Mira accepted her tag, so the stats name her (migration 62).
    id: 'p-demo-match',
    authorId: CURRENT_USER_ID,
    kind: 'note',
    createdAt: isoDaysAgo(0, 14),
    body: 'Two tiebreaks and a lot of running. The first serve finally showed up in the second set.',
    session: {
      focus: 'Match · Won', minutes: 90, drills: [], sessionId: 'ses-demo-1', kind: 'match', won: true, day: dayAgo(1),
      with: [{ id: 'u-mira', handle: 'miraplays', name: 'Mira Okafor', role: 'opponent' }],
    },
    likedBy: ['u-mira', 'u-dev'],
    commentIds: [],
    tags: [],
  },
  {
    // Sam's match two days ago (ses-sam-1). Sam tagged you; until you accept, the post keeps your name off.
    id: 'p-sam-match',
    authorId: 'u-sam',
    kind: 'note',
    createdAt: isoDaysAgo(1, 20),
    body: 'Lost a close one. Their backhand down the line was on all night.',
    session: { focus: 'Match · Lost', minutes: 75, drills: [], sessionId: 'ses-sam-1', kind: 'match', won: false, day: dayAgo(2) },
    likedBy: ['u-dev'],
    commentIds: [],
    tags: [],
  },
  {
    // Mira's practice (ses-mira-1), with you as her accepted partner: it is on your Tagged tab.
    id: 'p-mira-practice',
    authorId: 'u-mira',
    kind: 'note',
    createdAt: isoDaysAgo(4, 3),
    body: 'An hour of crosscourt patterns. Good legs today.',
    session: {
      focus: 'Practice', minutes: 60, drills: [], sessionId: 'ses-mira-1', kind: 'practice', day: dayAgo(5),
      with: [{ id: CURRENT_USER_ID, handle: 'you', name: 'Alex Rivera', role: 'partner' }],
    },
    likedBy: [CURRENT_USER_ID, 'u-june'],
    commentIds: [],
    tags: [],
  },
];

export const comments: Comment[] = [
  {
    id: 'c1',
    postId: 'p1',
    authorId: 'u-dev',
    body: 'Taking it early against a lefty is so uncomfortable. Nice hold.',
    createdAt: isoDaysAgo(0, 2),
    likedBy: ['u-mira'],
  },
  {
    id: 'c2',
    postId: 'p1',
    authorId: CURRENT_USER_ID,
    body: 'What were you doing with the return? I get pushed way behind the baseline against lefty slice serves.',
    createdAt: isoDaysAgo(0, 1),
    likedBy: [],
  },
  {
    id: 'c3',
    postId: 'p2',
    authorId: 'u-tomas',
    body: 'Stopping at 80 when the shoulder is the limiter is the whole discipline. Most players find that out the hard way.',
    createdAt: isoDaysAgo(0, 7),
    likedBy: [CURRENT_USER_ID, 'u-june'],
  },
  // Replies sit under the comment they answer (parentId), Instagram-style.
  {
    id: 'c7',
    postId: 'p2',
    authorId: 'u-june',
    body: '@tomascoach Learned that one the hard way. Six weeks off last spring.',
    createdAt: isoDaysAgo(0, 6),
    likedBy: ['u-tomas'],
    parentId: 'c3',
    replyToId: 'c3',
  },
  {
    id: 'c8',
    postId: 'p2',
    authorId: CURRENT_USER_ID,
    body: '@tomascoach That was the plan. 80 good ones beats 150 tired ones.',
    createdAt: isoDaysAgo(0, 5),
    likedBy: [],
    parentId: 'c3',
    replyToId: 'c3',
  },
  {
    id: 'c4',
    postId: 'p3',
    authorId: 'u-mira',
    body: 'The low volley thing is real and nobody mentions it in reviews.',
    createdAt: isoDaysAgo(1),
    likedBy: ['u-june'],
  },
  {
    id: 'c9',
    postId: 'p3',
    authorId: 'u-june',
    body: '@miraplays Right? Every review is about spin. The volley is the part I actually feel.',
    createdAt: isoDaysAgo(0, 20),
    likedBy: ['u-mira'],
    parentId: 'c4',
    replyToId: 'c4',
  },
  {
    id: 'c5',
    postId: 'p5',
    authorId: CURRENT_USER_ID,
    body: 'Guilty. I speed up my whole routine when I am tight, which is exactly when I need it most.',
    createdAt: isoDaysAgo(2, 4),
    likedBy: ['u-tomas'],
  },
  {
    id: 'c6',
    postId: 'p5',
    authorId: 'u-june',
    body: 'Two bounces, breathe out, hit. Been doing it for a decade and it still works.',
    createdAt: isoDaysAgo(2, 3),
    likedBy: [],
  },
];
