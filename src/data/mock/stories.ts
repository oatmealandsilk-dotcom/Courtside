import type { Story } from '../types';

/** Hours ago, as ISO. A story lasts 24 hours from when it was posted. */
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const dayAfter = (iso: string) => new Date(Date.parse(iso) + 24 * 3_600_000).toISOString();

const seed = (id: string, authorId: string, hours: number, rest: Partial<Story>): Story => {
  const createdAt = hoursAgo(hours);
  return { id, authorId, createdAt, expiresAt: dayAfter(createdAt), viewedBy: [], likedBy: [], commentIds: [], ...rest };
};

export const stories: Story[] = [
  seed('s1', 'u-mira', 2, { mediaLabel: 'Warm-up · 0:12', caption: 'Sunrise court. Nobody else here yet.' }),
  seed('s2', 'u-mira', 1, { mediaLabel: 'Serve practice · 0:15', caption: '40 second serves before the match.' }),
  seed('s3', 'u-dev', 5, { mediaLabel: 'Restring day', caption: 'New strings. 52 lbs, up from 50.' }),
  seed('s4', 'u-june', 9, { mediaLabel: 'Doubles night · 0:20', caption: 'We lost 6-4 in the third. Worth it.' }),
  seed('s5', 'u-tomas', 14, { mediaLabel: 'Toss drill', caption: 'Same bounce, same breath, every time.' }),
  // Yesterday's story: already off the rail and sitting in the archive.
  seed('s6', 'u-you', 30, { mediaLabel: 'Match point · 0:08', caption: 'First tiebreak win of the season.' }),
];
