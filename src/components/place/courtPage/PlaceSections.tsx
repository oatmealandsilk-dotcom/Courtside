import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

import { CourtSpinner } from '@/components/CourtSpinner';
import { TileCover } from '@/components/TileCover';
import { CourtHits } from '@/components/place/CourtHits';
import { useCourtSaid } from '@/components/place/CourtLife';
import { Avatar, Button } from '@/components/ui';
import type { Post, User } from '@/data/types';
import { isClip } from '@/features/places/court';
import { notKnownAdult } from '@/features/players/age';
import { openCourtReview, playHere } from '@/features/players/courtLink';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, surfaceColorFor, typography, withAlpha } from '@/theme';

import { ASK_ABOUT, PlayersSayRows, SectionHead } from './parts';
import type { CourtView } from './view';

/*
 * The court page's sections (see PlaceCard). Every section opens the same
 * way (SectionHead: a title, a quiet count beside it, one grey line under
 * it, at most one link on the right), so the page reads as one system; the
 * posts lead as a grid, the way a place card leads with its photos; the
 * open hits and what players say sit in the same card, so they read as one
 * family.
 */
/** Portrait tiles, three across, as a profile's grid draws them. */
const TILE = 4 / 3;
/** The first two rows show; the rest are a tap away, so the sections below are never far. */
const FIRST = 6;
const GAP = 3;

/**
 * The court's posts as a grid, newest first: two rows of three, each a
 * cover with who and when over a soft shade at its foot (or the post's own
 * words on the court's tint), and a play mark on a clip. A tile opens the
 * reel on that post; Watch all opens it on the newest clip. More than six:
 * "See all 9 posts" under the grid; then, while older ones are to come,
 * "Show older posts". Nothing yet: one card that says so, with Post a clip.
 */
export function ClipsSection({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const { posts, users, status, more, loadingOlder, name } = view;
  const [all, setAll] = useState(false);
  const [w, setW] = useState(0);
  const allClips = posts.length > 0 && posts.every(isClip);
  const title = allClips || !posts.length ? 'Clips' : 'Posts';
  const word = allClips ? 'clips' : 'posts';
  const count = posts.length ? `${posts.length}${more ? '+' : ''}` : null;
  const byId = new Map(users.map((u) => [u.id, u]));
  const tileW = w ? Math.floor((w - GAP * 2) / 3) : 0;
  const tileH = Math.round(tileW * TILE);
  const shown = all ? posts : posts.slice(0, FIRST);
  const measure = (next: number) => { const r = Math.floor(next); if (r > 0 && r !== w) setW(r); };

  if (!posts.length && status === 'loading') {
    return (
      <View style={styles.section}>
        <SectionHead title="Clips" />
        <View style={styles.grid} onLayout={(e) => measure(e.nativeEvent.layout.width)} accessibilityLabel="Loading posts from here">
          {tileW ? [0, 1, 2].map((i) => <View key={i} style={[styles.blank, { width: tileW, height: tileH }]} />) : null}
        </View>
      </View>
    );
  }

  if (!posts.length && status === 'failed') {
    return (
      <View style={styles.section}>
        <SectionHead title="Clips" />
        <View style={[styles.card, styles.failed]}>
          <Text style={styles.cardBody} accessibilityLiveRegion="polite">Couldn’t load posts from here.</Text>
          <Button size="sm" variant="secondary" label="Try again" onPress={view.onRetry} />
        </View>
      </View>
    );
  }

  if (!posts.length) {
    return (
      <View style={styles.section}>
        <SectionHead title="Clips" />
        <View style={[styles.card, styles.emptyCard]}>
          <View style={styles.emptyTile}><Ionicons name="videocam-outline" size={24} color={colors.brand} /></View>
          <View style={styles.emptyWords}>
            <Text style={styles.cardTitle}>{view.onPost ? 'Be the first to post here' : 'No clips here yet'}</Text>
            <Text style={styles.cardBody}>Clips and photos tagged at {name} show up here, for everyone who opens it.</Text>
            {view.onPost ? <Button size="sm" variant="secondary" label="Post a clip" onPress={view.onPost} style={styles.emptyButton} /> : null}
          </View>
        </View>
      </View>
    );
  }

  const hidden = posts.length - shown.length;
  return (
    <View style={styles.section}>
      <SectionHead
        title={title}
        count={count}
        sub={view.lastPost}
        link={view.lead ? { label: 'Watch all', a11y: `Watch all ${posts.length} ${word} from ${name}`, onPress: () => view.onOpenReel(view.lead!) } : null}
      />
      <View style={styles.grid} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
        {tileW ? shown.map((p) => <GridTile key={p.id} post={p} author={byId.get(p.authorId)} width={tileW} height={tileH} onPress={() => view.onOpenReel(p)} />) : null}
      </View>
      {hidden > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`See all ${posts.length} ${word}`} onPress={() => setAll(true)} style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}>
          <Text style={styles.moreText}>See all {posts.length}{more ? '+' : ''} {word}</Text>
          <Ionicons name="chevron-down" size={15} color={colors.text} />
        </Pressable>
      ) : more ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Show older ${word}`} disabled={loadingOlder} onPress={view.onOlder} style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}>
          {loadingOlder ? <CourtSpinner size={18} /> : (
            <>
              <Text style={styles.moreText}>Show older {word}</Text>
              <Ionicons name="chevron-down" size={15} color={colors.text} />
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** One post in the grid. */
function GridTile({ post, author, width, height, onPress }: { post: Post; author?: User; width: number; height: number; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const picture = post.thumbnailUrl ?? post.imageUrl;
  const clip = isClip(post);
  const who = author?.name ?? 'A player';
  const first = who.split(' ')[0];
  const when = relativeTime(post.createdAt);
  const kind = clip ? 'Clip' : picture ? 'Photo' : 'Post';
  const tint = surfaceColorFor(post.id);
  const foot = (onPicture: boolean) => (
    <View style={styles.tileFoot}>
      {author ? <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={18} style={onPicture ? styles.tileFaceOnPicture : undefined} /> : null}
      <Text style={[styles.tileName, onPicture && styles.onPicture]} numberOfLines={1}>{first}</Text>
      <Text style={[styles.tileWhen, onPicture && styles.onPictureQuiet]}>{when}</Text>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${kind} by ${who}, ${when}: ${post.body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width, height }, picture ? null : { backgroundColor: withAlpha(tint, 0.14) }, pressed && styles.tilePressed]}
    >
      {picture ? (
        <>
          <TileCover accessibilityIgnoresInvertColors uri={picture} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={post.id} transition={120} />
          {/* A shade at the foot, so who and when read on any picture. A picture, not the page, is the ground: plain black. */}
          <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={styles.tileShade} />
          {clip ? <View style={styles.playBadge}><Ionicons name="play" size={11} color={colors.onMedia} style={styles.playGlyph} /></View> : null}
          {foot(true)}
        </>
      ) : (
        <View style={styles.tileWords}>
          {/* What it is, first: a clip still on its way has no picture yet, and says so. */}
          <View style={styles.tileKind}>
            <Ionicons name={clip ? 'play' : 'chatbubble-outline'} size={10} color={colors.textMuted} />
            <Text style={styles.tileKindText}>{clip ? 'Clip' : 'Post'}</Text>
          </View>
          <Text style={styles.tileText} numberOfLines={5}>{post.body}</Text>
          {foot(false)}
        </View>
      )}
    </Pressable>
  );
}

/**
 * The open hits here, opened like every other section ("Open hits 1 …
 * New hit"), the cards themselves the same as Find Players'. None open: the
 * grey line says so and what happens when you post one (a teen's reaches
 * only the people who follow them, so it says that). A members-only or
 * private court is never suggested for a hit: no New hit, and no section
 * at all with none open.
 */
export function HitsSection({ view, count }: { view: CourtView; count: number }) {
  const { currentUser } = useApp();
  if (view.closed && !count) return null;
  const forFriends = !!currentUser && notKnownAdult(currentUser);
  const sub = count ? null : `None here yet. Post a time and ${forFriends ? 'friends who follow you' : 'players nearby'} can join.`;
  return (
    <View style={sectionGap}>
      <SectionHead
        title="Open hits"
        count={count ? String(count) : null}
        sub={sub}
        link={view.closed ? null : { label: 'New hit', a11y: `Play here. Post a hit at ${view.name}`, onPress: () => playHere(view.here) }}
      />
      {count ? <CourtHits place={view.here} /> : null}
    </View>
  );
}

/**
 * What players say, as a card of plain rows (PlayersSayRows): Has lights,
 * Usually busy weekday evenings, Cracked surface, Good nets, then the newest
 * note with its flag. Add what you know (or Update yours) is the section's
 * one link. Nobody has said anything yet: the card asks, in plain words.
 */
export function SaysSection({ courtId, name }: { courtId: string; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { said, mine } = useCourtSaid(courtId);
  const add = () => openCourtReview(courtId, { name });
  const addLabel = mine ? 'Update yours' : 'Add what you know';
  const addA11y = mine ? `Update what you said about ${name}` : `Add what you know about ${name}`;
  if (!said.players) {
    return (
      <View style={styles.section}>
        <SectionHead title="What players say" sub="Nobody has said anything yet." />
        <View style={[styles.card, styles.emptyCard]}>
          <View style={styles.emptyTile}><Ionicons name="chatbubble-ellipses-outline" size={23} color={colors.brand} /></View>
          <View style={styles.emptyWords}>
            <Text style={styles.cardTitle}>Know this court?</Text>
            <Text style={styles.cardBody}>{ASK_ABOUT}: say what you found, so the next player knows before they go.</Text>
            <Button size="sm" variant="secondary" label={addLabel} onPress={add} style={styles.emptyButton} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <SectionHead
        title="What players say"
        sub={`From ${said.players} ${said.players === 1 ? 'player' : 'players'}`}
        link={{ label: addLabel, a11y: addA11y, onPress: add }}
      />
      <View style={styles.card}><PlayersSayRows courtId={courtId} name={name} /></View>
    </View>
  );
}

const sectionGap = { gap: spacing.md } as const;

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: 0.6 },
  section: sectionGap,
  // The grid: tiles on a 3pt seam, the block's outer corners rounded as one.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, borderRadius: radius.lg, overflow: 'hidden' },
  blank: { backgroundColor: colors.surfaceAlt },
  tile: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tilePressed: { opacity: 0.86 },
  tileShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  tileWords: { flex: 1, padding: 9, paddingTop: 10 },
  tileText: { ...font('500'), fontSize: 12, lineHeight: 16, color: colors.text },
  tileFoot: { position: 'absolute', left: 7, right: 7, bottom: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileFaceOnPicture: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 10 },
  tileName: { ...typography.smallStrong, fontSize: 12, color: colors.text, flexShrink: 1 },
  tileWhen: { ...typography.small, fontSize: 12, color: colors.textMuted },
  onPicture: { color: colors.onMedia },
  onPictureQuiet: { color: colors.onMedia, opacity: 0.85 },
  playBadge: { position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },
  playGlyph: { marginLeft: 2 },
  tileKind: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  tileKindText: { ...typography.caption, letterSpacing: 0.2, color: colors.textMuted },
  // See all, Show older: one quiet full-width row under the grid.
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 42, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  moreText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  // A section's card: the same corners, fill and lift as a hit's card, so the two read as one family.
  card: { ...lift, backgroundColor: colors.surface, borderRadius: 20, overflow: 'hidden' },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  cardBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  failed: { padding: spacing.lg, gap: spacing.md, alignItems: 'flex-start' },
  emptyCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'flex-start' },
  emptyTile: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  emptyWords: { flex: 1, minWidth: 0, gap: 4 },
  emptyButton: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
