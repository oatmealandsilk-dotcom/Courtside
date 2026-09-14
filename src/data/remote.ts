import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
/**
 * The Supabase side of the API seam.
 *
 * Reads return app types (src/data/types.ts) built from table rows; writes
 * take app types and store rows. src/store/AppContext.tsx updates its own
 * state first and calls these afterwards, so the UI never waits on the
 * network and a failed write only logs. Anything not covered here — the
 * discussions board, coaching, health — still comes from the fixtures.
 */

import { supabase } from '@/lib/supabase';
import type { Comment, ID, PlayerProfile, PlayerStats, Post, Story, User } from './types';

const need = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

/* ------------------------------------------------------------- mappings */

export const emptyProfile: PlayerProfile = {
  skillSystem: 'NTRP',
  rating: 3,
  playStyle: 'all-court',
  handedness: 'right',
  backhand: 'two-handed',
  fitnessLevel: 'recreational',
  preferredSurface: 'hard',
  sessionsPerWeek: 2,
  yearsPlaying: 1,
  goals: [],
  constraints: [],
  tournaments: [],
};

const emptyStats: PlayerStats = {
  sessionsLogged: 0,
  matchesPlayed: 0,
  matchesWon: 0,
  hoursOnCourt: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
};

interface ProfileRow {
  id: string; handle: string; name: string; bio: string; location: string;
  avatar_url: string | null; is_coach: boolean; profile: Partial<PlayerProfile> | null; created_at: string;
}
interface PostRow {
  id: string; author_id: string; kind: Post['kind']; body: string; media_label: string | null;
  image_url: string | null; video_url: string | null; thumbnail_url: string | null;
  match: Post['match'] | null; session: Post['session'] | null; tags: string[]; tagged_user_ids: string[];
  archived: boolean; views: number; shares: number; created_at: string;
  post_likes?: { user_id: string }[]; post_saves?: { user_id: string }[]; comments?: { id: string }[];
}
interface CommentRow {
  id: string; post_id: string; author_id: string; body: string; created_at: string;
  comment_likes?: { user_id: string }[];
}
interface StoryRow {
  id: string; author_id: string; image_url: string | null; video_url: string | null; thumbnail_url: string | null;
  media_label: string | null; caption: string | null; archived: boolean; created_at: string; expires_at: string;
  story_views?: { user_id: string }[];
}

const toUser = (row: ProfileRow, followers: number, following: number): User => ({
  id: row.id,
  handle: row.handle,
  name: row.name,
  bio: row.bio ?? '',
  location: row.location ?? '',
  joinedAt: row.created_at,
  avatarSeed: row.id,
  avatarUrl: row.avatar_url ?? undefined,
  isCoach: row.is_coach,
  followers,
  following,
  profile: { ...emptyProfile, ...(row.profile ?? {}) },
  achievementIds: [],
  stats: emptyStats,
});

const toPost = (row: PostRow): Post => ({
  id: row.id,
  authorId: row.author_id,
  kind: row.kind,
  createdAt: row.created_at,
  body: row.body,
  mediaLabel: row.media_label ?? undefined,
  imageUrl: row.image_url ?? undefined,
  videoUrl: row.video_url ?? undefined,
  thumbnailUrl: row.thumbnail_url ?? undefined,
  taggedUserIds: row.tagged_user_ids?.length ? row.tagged_user_ids : undefined,
  match: row.match ?? undefined,
  session: row.session ?? undefined,
  likedBy: (row.post_likes ?? []).map((l) => l.user_id),
  commentIds: (row.comments ?? []).map((c) => c.id),
  tags: row.tags ?? [],
  views: row.views,
  shares: row.shares,
  savedBy: (row.post_saves ?? []).map((s) => s.user_id),
  archived: row.archived || undefined,
});

const toComment = (row: CommentRow): Comment => ({
  id: row.id,
  postId: row.post_id,
  authorId: row.author_id,
  body: row.body,
  createdAt: row.created_at,
  likedBy: (row.comment_likes ?? []).map((l) => l.user_id),
});

const toStory = (row: StoryRow): Story => ({
  id: row.id,
  authorId: row.author_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  imageUrl: row.image_url ?? undefined,
  videoUrl: row.video_url ?? undefined,
  thumbnailUrl: row.thumbnail_url ?? undefined,
  mediaLabel: row.media_label ?? undefined,
  caption: row.caption ?? undefined,
  viewedBy: (row.story_views ?? []).map((v) => v.user_id),
  archived: row.archived || undefined,
});

/* ---------------------------------------------------------------- reads */

export interface RemoteData {
  users: User[];
  posts: Post[];
  comments: Comment[];
  stories: Story[];
  followingIds: ID[];
  /** Every follow between profiles, so any player's lists can be shown. */
  followEdges: { followerId: ID; followingId: ID }[];
  savedPostIds: ID[];
}

/** Everything the signed-in player needs on open, in four queries. */
export async function fetchRemote(me: ID): Promise<RemoteData> {
  const db = need();
  const [profiles, posts, stories, follows] = await Promise.all([
    db.from('profiles').select('*'),
    db.from('posts').select('*, post_likes(user_id), post_saves(user_id), comments(id, post_id, author_id, body, created_at, comment_likes(user_id))').order('created_at', { ascending: false }).limit(200),
    db.from('stories').select('*, story_views(user_id)').order('created_at', { ascending: false }).limit(200),
    db.from('follows').select('follower_id, following_id'),
  ]);
  for (const result of [profiles, posts, stories, follows]) if (result.error) throw result.error;

  const edges = (follows.data ?? []) as { follower_id: string; following_id: string }[];
  const followers = new Map<string, number>();
  const following = new Map<string, number>();
  for (const edge of edges) {
    followers.set(edge.following_id, (followers.get(edge.following_id) ?? 0) + 1);
    following.set(edge.follower_id, (following.get(edge.follower_id) ?? 0) + 1);
  }

  const postRows = (posts.data ?? []) as (PostRow & { comments?: CommentRow[] })[];
  return {
    users: ((profiles.data ?? []) as ProfileRow[]).map((row) => toUser(row, followers.get(row.id) ?? 0, following.get(row.id) ?? 0)),
    posts: postRows.map(toPost),
    comments: postRows.flatMap((row) => (row.comments ?? []).map(toComment)),
    stories: ((stories.data ?? []) as StoryRow[]).map(toStory),
    followingIds: edges.filter((e) => e.follower_id === me).map((e) => e.following_id),
    followEdges: edges.map((e) => ({ followerId: e.follower_id, followingId: e.following_id })),
    savedPostIds: postRows.filter((row) => (row.post_saves ?? []).some((s) => s.user_id === me)).map((row) => row.id),
  };
}

/* --------------------------------------------------------------- writes */

const fail = (what: string) => (error: unknown) => {
  console.warn(`[remote] ${what} failed`, error);
};

export const remote = {
  async updateProfile(me: ID, patch: { name?: string; bio?: string; location?: string; avatarUrl?: string; profile?: PlayerProfile }) {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.bio !== undefined) row.bio = patch.bio;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.profile !== undefined) row.profile = patch.profile;
    const { error } = await need().from('profiles').update(row).eq('id', me);
    if (error) fail('profile update')(error);
  },

  async insertPost(post: Post) {
    const { error } = await need().from('posts').insert({
      id: post.id,
      author_id: post.authorId,
      kind: post.kind,
      body: post.body,
      media_label: post.mediaLabel ?? null,
      image_url: post.imageUrl ?? null,
      video_url: post.videoUrl ?? null,
      thumbnail_url: post.thumbnailUrl ?? null,
      match: post.match ?? null,
      session: post.session ?? null,
      tags: post.tags,
      tagged_user_ids: post.taggedUserIds ?? [],
      created_at: post.createdAt,
    });
    if (error) fail('post insert')(error);
  },

  async setPostArchived(postId: ID, archived: boolean) {
    const { error } = await need().from('posts').update({ archived }).eq('id', postId);
    if (error) fail('post archive')(error);
  },

  async setLike(postId: ID, me: ID, liked: boolean) {
    const db = need();
    const { error } = liked
      ? await db.from('post_likes').upsert({ post_id: postId, user_id: me })
      : await db.from('post_likes').delete().match({ post_id: postId, user_id: me });
    if (error) fail('like')(error);
  },

  async setSaved(postId: ID, me: ID, saved: boolean) {
    const db = need();
    const { error } = saved
      ? await db.from('post_saves').upsert({ post_id: postId, user_id: me })
      : await db.from('post_saves').delete().match({ post_id: postId, user_id: me });
    if (error) fail('save')(error);
  },

  async insertComment(comment: Comment) {
    const { error } = await need().from('comments').insert({
      id: comment.id, post_id: comment.postId, author_id: comment.authorId, body: comment.body, created_at: comment.createdAt,
    });
    if (error) fail('comment insert')(error);
  },

  async insertStory(story: Story) {
    const { error } = await need().from('stories').insert({
      id: story.id,
      author_id: story.authorId,
      image_url: story.imageUrl ?? null,
      video_url: story.videoUrl ?? null,
      thumbnail_url: story.thumbnailUrl ?? null,
      media_label: story.mediaLabel ?? null,
      caption: story.caption ?? null,
      created_at: story.createdAt,
      expires_at: story.expiresAt,
    });
    if (error) fail('story insert')(error);
  },

  async setStoryArchived(storyId: ID, archived: boolean) {
    const { error } = await need().from('stories').update({ archived }).eq('id', storyId);
    if (error) fail('story archive')(error);
  },

  async recordStoryView(storyId: ID, me: ID) {
    const { error } = await need().from('story_views').upsert({ story_id: storyId, user_id: me });
    if (error) fail('story view')(error);
  },

  async setFollow(me: ID, userId: ID, following: boolean) {
    const db = need();
    const { error } = following
      ? await db.from('follows').upsert({ follower_id: me, following_id: userId })
      : await db.from('follows').delete().match({ follower_id: me, following_id: userId });
    if (error) fail('follow')(error);
  },

  async bumpViews(postId: ID) {
    const { error } = await need().rpc('bump_post_views', { post: postId });
    if (error) fail('view count')(error);
  },
};

/* --------------------------------------------------------------- media */

/** A picker result still on the device, as opposed to something already hosted. */
export const isLocalMedia = (uri?: string) =>
  !!uri && /^(file:|content:|blob:|data:|ph:|assets-library:)/.test(uri);

/**
 * Copies a picked photo or video into the media bucket under the player's
 * folder and returns its public URL. Falls back to the original URI on
 * failure so the local post still shows.
 */
const ALLOWED_MEDIA = /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime|webm))$/;

export async function uploadMedia(me: ID, uri: string, kind: 'photo' | 'video'): Promise<string> {
  try {
    const db = need();
    const response = await fetch(uri);
    const bytes = await response.arrayBuffer();
    const contentType = (response.headers.get('content-type') || (kind === 'video' ? 'video/mp4' : 'image/jpeg')).split(';')[0].trim();
    // The bucket enforces the same list; checking here gives a readable message.
    if (!ALLOWED_MEDIA.test(contentType)) throw new Error('Only photos and videos can be posted.');
    const ext = contentType.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg');
    const path = `${me}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from('media').upload(path, bytes, { contentType, upsert: false });
    if (error) throw error;
    return db.storage.from('media').getPublicUrl(path).data.publicUrl;
  } catch (error) {
    fail('media upload')(error);
    return uri;
  }
}

/* ---------------------------------------------------------------- auth */

export const auth = {
  async signIn(email: string, password: string) {
    const { data, error } = await need().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    return data.session;
  },
  async signUp(email: string, password: string, name: string, handle: string) {
    const { data, error } = await need().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim(), handle: handle.trim().toLowerCase() } },
    });
    if (error) throw new Error(error.message);
    // With email confirmation on, there is no session yet; the screen says so.
    return data.session;
  },
  async signOut() {
    const { error } = await need().auth.signOut();
    if (error) fail('sign out')(error);
  },
  /**
   * Google, through Supabase. On the web the whole page goes to Google and
   * comes back to the app, where the client picks the session out of the URL
   * on its own. On a phone the page cannot leave, so an in-app browser opens
   * instead and the session is read out of the URL it hands back.
   */
  async signInWithGoogle() {
    const client = need();
    if (Platform.OS === 'web') {
      const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${base}/` },
      });
      if (error) throw new Error(error.message);
      return null;
    }
    const redirectTo = Linking.createURL('/');
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw new Error(error.message);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null;
    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.search.slice(1));
    const code = url.searchParams.get('code');
    if (code) {
      const exchanged = await client.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw new Error(exchanged.error.message);
      return exchanged.data.session;
    }
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) throw new Error(params.get('error_description') ?? 'Google did not return a session.');
    const set = await client.auth.setSession({ access_token, refresh_token });
    if (set.error) throw new Error(set.error.message);
    return set.data.session;
  },

  /* ------------------------------------------------------- account centre */

  /** Who is signed in, as the auth system sees them: email, sign-in methods, since when. */
  async account() {
    const { data, error } = await need().auth.getUser();
    if (error || !data.user) throw new Error(error?.message ?? 'Not signed in');
    const providers = (data.user.identities ?? []).map((i) => i.provider);
    return {
      email: data.user.email ?? '',
      providers,
      createdAt: data.user.created_at,
      lastSignInAt: data.user.last_sign_in_at ?? null,
      emailConfirmed: Boolean(data.user.email_confirmed_at),
    };
  },
  async updatePassword(password: string) {
    const { error } = await need().auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },
  /** Supabase emails both addresses; the change lands when the new one is confirmed. */
  async updateEmail(email: string) {
    const { error } = await need().auth.updateUser({ email: email.trim() });
    if (error) throw new Error(error.message);
  },
  async signOutEverywhere() {
    const { error } = await need().auth.signOut({ scope: 'global' });
    if (error) throw new Error(error.message);
  },
  /** Adds Google as a second way into an email account. Needs "manual linking" on in Supabase. */
  async linkGoogle() {
    const client = need();
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const redirectTo = Platform.OS === 'web' ? `${window.location.origin}${base}/account` : Linking.createURL('/account');
    const { data, error } = await client.auth.linkIdentity({ provider: 'google', options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' } });
    if (error) throw new Error(error.message);
    if (Platform.OS !== 'web' && data.url) await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  },
  async deleteAccount() {
    const { data, error } = await need().functions.invoke<{ ok?: boolean; error?: string }>('delete-account', { body: {} });
    if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Could not delete the account.');
    await need().auth.signOut();
  },
};
