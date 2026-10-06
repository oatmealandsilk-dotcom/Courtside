/**
 * The database's own limits on what can be written (posts_body_len,
 * comments_body_check and story_comments_body_check, stories_caption_len).
 * The boxes stop there, so nothing typed is refused after it looks sent.
 */
export const POST_MAX = 2200;
export const COMMENT_MAX = 2000;
export const INSTANT_MAX = 200;
