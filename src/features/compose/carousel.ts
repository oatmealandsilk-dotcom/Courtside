import type { Post } from '@/data/types';

/**
 * Carousel posts (owner, Oct 15: "can you make post so you can do carousel.
 * So select multiple photos, just posts though"). Ten at most, as on
 * Instagram; the database holds the same limit (migration 159).
 */
export const CAROUSEL_MAX = 10;

/**
 * Every photo of a post, in order, cover first. A single-photo post is a
 * list of one, so a screen can draw either the same way.
 */
export function photosOf(post: Pick<Post, 'imageUrl' | 'imageUrls'>): string[] {
  if (post.imageUrls && post.imageUrls.length > 1) return post.imageUrls;
  return post.imageUrl ? [post.imageUrl] : [];
}

/** Two photos or more: drawn as a carousel, and a grid tile gets the stacked-photos mark. */
export function isCarousel(post: Pick<Post, 'imageUrls' | 'videoUrl' | 'kind'>): boolean {
  return !post.videoUrl && post.kind !== 'clip' && (post.imageUrls?.length ?? 0) > 1;
}

/**
 * The list a new post carries: kept only with 2 to 10 non-empty photos,
 * and always led by the cover so imageUrl and imageUrls[0] never disagree.
 */
export function carouselFor(cover: string | undefined, photos: (string | undefined)[] | undefined): string[] | undefined {
  if (!cover || !photos) return undefined;
  const rest = photos.filter((u): u is string => !!u && u !== cover);
  const list = [cover, ...rest].slice(0, CAROUSEL_MAX);
  return list.length > 1 ? list : undefined;
}
