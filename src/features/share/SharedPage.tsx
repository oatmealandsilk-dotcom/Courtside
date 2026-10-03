import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandMark } from '@/components/BrandMark';
import { CourtSpinner } from '@/components/CourtSpinner';
import { HitGlyph } from '@/components/HitGlyph';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Avatar, Button } from '@/components/ui';
import { fetchSharePreview, fetchShareReferrer } from '@/data/api';
import type { ShareKind, SharePerson, SharePreview, ShareTile } from '@/data/types';
import { FORMAT_LABEL, hitWhen, levelText } from '@/features/hits/format';
import { rememberReferrer, rememberShareTarget } from '@/features/invite/referral';
import { useGateSpace } from '@/lib/useGateSpace';
import { colors, font, lift, radius, spacing, typography } from '@/theme';

/**
 * What a link shared outside the app shows someone with no account: the
 * thing itself, read-only (only what a stranger may see: share_preview,
 * migration 68), and one strong way in. Whatever they tap is remembered
 * (rememberShareTarget) through sign-up and setup, and the app opens on that
 * same thing afterwards; tapping "I'm in" on an open hit joins it too. The
 * sharer's handle on the link (?ref=) is kept, so the join counts as theirs.
 *
 * A private account, a teen, or anything taken down shows one calm card,
 * "Join CourtSide to see this", which says nothing about whose it was.
 */
export function SharedPage({ kind, id }: { kind: ShareKind; id: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const space = useGateSpace();
  const params = useLocalSearchParams<{ ref?: string; name?: string; lat?: string; lng?: string }>();
  const [preview, setPreview] = useState<SharePreview | null | undefined>(undefined);

  // The "shared this with you" line only names someone the server vouches for.
  const [sharer, setSharer] = useState<SharePerson | null>(null);
  useEffect(() => {
    if (!params.ref) return;
    let live = true;
    void rememberReferrer(String(params.ref));
    fetchShareReferrer(String(params.ref)).then((who) => { if (live) setSharer(who); }).catch(() => undefined);
    return () => { live = false; };
  }, [params.ref]);
  useEffect(() => {
    let live = true;
    setPreview(undefined);
    fetchSharePreview(kind, id).then((got) => { if (live) setPreview(got); }).catch(() => { if (live) setPreview(null); });
    return () => { live = false; };
  }, [kind, id]);

  // The page inside the app this link is about: where they land once they are in.
  const courtName = String(params.name ?? '').trim() || preview?.court?.name || 'This court';
  const inside = kind === 'post' ? `/post/${id}`
    : kind === 'profile' ? `/user/${id}`
    : kind === 'hit-request' ? `/hit-request/${id}`
    : kind === 'question' ? `/question/${id}`
    : kind === 'group' ? `/g/${id}`
    : `/court/${id}?name=${encodeURIComponent(courtName)}&lat=${encodeURIComponent(String(params.lat ?? ''))}&lng=${encodeURIComponent(String(params.lng ?? ''))}`;

  const open = !!preview?.open;
  const author = preview?.author;
  const city = cityOf(author?.location);
  const hitOpen = open && kind === 'hit-request' && !preview?.gone && (preview?.hit?.spotsLeft ?? 0) > 0;
  const cta = !open ? 'Join CourtSide'
    : kind === 'hit-request' ? (hitOpen ? "I'm in" : 'Find a hit near you')
    : kind === 'profile' ? `Play with @${author?.handle ?? 'them'}`
    : kind === 'question' ? 'Join the conversation'
    : kind === 'court' ? 'See who plays here'
    : city ? `See more from ${city} players` : 'See more on CourtSide';
  const pitch = !open ? 'Players near you are already on it. Free to join.'
    : kind === 'hit-request' && hitOpen ? `Make an account and you're in. ${first(author)} sees it straight away.`
    : kind === 'profile' ? `Hit with ${first(author)}, find courts and open hits near you.`
    : 'Find players, courts and open hits near you. Free to join.';

  const go = async (create: boolean) => {
    await rememberShareTarget(inside, hitOpen && create ? id : undefined);
    router.push({ pathname: '/sign-in', params: { mode: create ? 'create' : 'sign-in' } });
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: space.top, paddingBottom: spacing.xxxl }]}>
        <View style={styles.column}>
          <View style={styles.bar}>
            <View style={styles.brand}>
              <BrandMark size={26} />
              <Text style={styles.wordmark}>CourtSide</Text>
            </View>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { void go(false); }}>
              <Text style={styles.signIn}>Sign in</Text>
            </Pressable>
          </View>

          {sharer ? (
            <View style={styles.invited}>
              <Ionicons name="paper-plane-outline" size={13} color={colors.brand} />
              <Text style={styles.invitedText} numberOfLines={1}>@{sharer.handle} shared this with you</Text>
            </View>
          ) : null}

          {preview === undefined ? (
            <View style={styles.loading}><CourtSpinner size={32} /></View>
          ) : !open || !preview ? (
            <Locked group={kind === 'group'} />
          ) : kind === 'post' && preview.post ? (
            <PostCard preview={preview} />
          ) : kind === 'hit-request' && preview.hit ? (
            <HitCardPublic preview={preview} />
          ) : kind === 'profile' && preview.profile ? (
            <ProfileCard preview={preview} />
          ) : kind === 'question' && preview.question ? (
            <QuestionCard preview={preview} />
          ) : kind === 'court' && preview.court ? (
            <CourtCard name={courtName} preview={preview} />
          ) : <Locked />}

          {preview === undefined ? null : (
            <View style={styles.join}>
              <Text style={styles.pitch}>{pitch}</Text>
              <Button label={cta} full onPress={() => { void go(true); }} />
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { void go(false); }} style={styles.already}>
                <Text style={styles.alreadyText}>Already on CourtSide? <Text style={styles.alreadyLink}>Sign in</Text></Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** "Raleigh" from "Raleigh, NC". */
const cityOf = (location?: string) => location?.split(',')[0]?.trim() || '';
const first = (p?: SharePerson) => p?.name.trim().split(/\s+/)[0] || 'They';
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Person({ person, line }: { person: SharePerson; line?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.person}>
      <Avatar uri={person.avatarUrl} name={person.name} seed={person.id} size={40} ring={person.isCoach} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
        <Text style={styles.personLine} numberOfLines={1}>@{person.handle}{line ? ` · ${line}` : person.location ? ` · ${person.location}` : ''}</Text>
      </View>
    </View>
  );
}

function Locked({ group = false }: { group?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.card, styles.lockedCard]}>
      <View style={styles.lockedIcon}><Ionicons name="lock-closed-outline" size={24} color={colors.brand} /></View>
      <Text style={styles.lockedTitle}>{group ? 'Join CourtSide to join this group' : 'Join CourtSide to see this'}</Text>
      <Text style={styles.lockedBody}>It's shared with players on CourtSide. Make a free account and it opens right here.</Text>
    </View>
  );
}

function PostCard({ preview }: { preview: SharePreview }) {
  const styles = useThemedStyles(styleDefinitions);
  const post = preview.post!;
  const picture = post.thumbnailUrl || post.imageUrl;
  const moving = !!post.videoUrl || post.kind === 'clip';
  const where = post.courtName || post.location;
  const session = post.session?.minutes ? [`${post.session.minutes} min`, post.session.kind === 'match' ? 'Match' : post.session.kind === 'practice' ? 'Practice' : post.session.focus].filter(Boolean).join(' · ') : '';
  return (
    <View style={styles.card}>
      {preview.author ? <Person person={preview.author} line={where ? `at ${where}` : undefined} /> : null}
      {picture ? (
        <View style={[styles.media, { aspectRatio: post.orientation === 'landscape' ? 16 / 9 : 4 / 5 }]}>
          <ExpoImage source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={moving ? 'The clip' : 'The photo'} />
          {moving ? <View style={styles.play}><Ionicons name="play" size={26} color={colors.brandInk} /></View> : null}
        </View>
      ) : post.mediaLabel ? (
        <View style={styles.mediaPlain}><MediaPlaceholder label={post.mediaLabel} seed={post.id} /></View>
      ) : null}
      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      <View style={styles.meta}>
        {session ? <View style={styles.chip}><CourtGlyph size={12} color={colors.brand} /><Text style={styles.chipText}>{session}</Text></View> : null}
        <Text style={styles.metaText}>{count(post.likes, 'like')} · {count(post.comments, 'comment')}</Text>
      </View>
    </View>
  );
}

function HitCardPublic({ preview }: { preview: SharePreview }) {
  const styles = useThemedStyles(styleDefinitions);
  const hit = preview.hit!;
  const over = !!preview.gone;
  const full = !over && hit.spotsLeft === 0;
  return (
    <View style={styles.card}>
      <View style={styles.eyebrowRow}>
        <HitGlyph size={16} color={over ? colors.textFaint : colors.brand} />
        <Text style={[styles.eyebrow, over && { color: colors.textFaint }]}>{over ? 'This hit is over' : full ? 'This hit is full' : 'Open hit · looking for players'}</Text>
      </View>
      <Text style={styles.hitWhen}>{hitWhen(hit.startsAt)}</Text>
      <View style={styles.placeRow}>
        <Ionicons name="location-outline" size={16} color={colors.textMuted} />
        <Text style={styles.place} numberOfLines={2}>{hit.place.name}</Text>
      </View>
      <View style={styles.chips}>
        <View style={styles.chip}><Text style={styles.chipText}>{FORMAT_LABEL[hit.format]}</Text></View>
        <View style={styles.chip}><Text style={styles.chipText}>{levelText(hit)}</Text></View>
        {!over && !full ? <View style={[styles.chip, styles.chipStrong]}><Text style={[styles.chipText, styles.chipStrongText]}>{hit.spotsLeft === 1 ? '1 spot left' : `${hit.spotsLeft} spots left`}</Text></View> : null}
      </View>
      {hit.note ? <Text style={styles.note}>“{hit.note}”</Text> : null}
      {preview.author ? <View style={styles.divider} /> : null}
      {preview.author ? <Person person={preview.author} line="posted this hit" /> : null}
    </View>
  );
}

function Tiles({ tiles }: { tiles: ShareTile[] }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!tiles.length) return null;
  return (
    <View style={styles.tiles}>
      {tiles.slice(0, 6).map((t) => (
        <View key={t.id} style={styles.tile}>
          {t.thumbnailUrl || t.imageUrl
            ? <ExpoImage source={{ uri: t.thumbnailUrl || t.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={t.body || 'A post'} />
            : <View style={[StyleSheet.absoluteFill, styles.tileText]}><Text style={styles.tileWords} numberOfLines={4}>{t.body || 'A post'}</Text></View>}
        </View>
      ))}
    </View>
  );
}

function ProfileCard({ preview }: { preview: SharePreview }) {
  const styles = useThemedStyles(styleDefinitions);
  const who = preview.author!;
  const p = preview.profile!;
  return (
    <View style={[styles.card, { alignItems: 'center' }]}>
      <Avatar uri={who.avatarUrl} name={who.name} seed={who.id} size={84} ring={who.isCoach} />
      <Text style={styles.profileName}>{who.name}</Text>
      <Text style={styles.personLine}>@{who.handle}{who.location ? ` · ${who.location}` : ''}</Text>
      {p.rating ? <View style={[styles.chip, styles.chipStrong, { marginTop: spacing.sm }]}><Text style={[styles.chipText, styles.chipStrongText]}>{p.skillSystem ?? 'NTRP'} {p.rating.toFixed(1)}</Text></View> : null}
      {p.bio ? <Text style={[styles.body, { textAlign: 'center' }]}>{p.bio}</Text> : null}
      <View style={styles.stats}>
        <Stat n={p.posts} label={p.posts === 1 ? 'post' : 'posts'} />
        <Stat n={p.followers} label={p.followers === 1 ? 'follower' : 'followers'} />
        <Stat n={p.openHits} label={p.openHits === 1 ? 'open hit' : 'open hits'} />
      </View>
      <View style={{ alignSelf: 'stretch' }}><Tiles tiles={p.recent} /></View>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={styles.stat}><Text style={styles.statN}>{n}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function QuestionCard({ preview }: { preview: SharePreview }) {
  const styles = useThemedStyles(styleDefinitions);
  const q = preview.question!;
  return (
    <View style={styles.card}>
      <View style={styles.eyebrowRow}>
        <Ionicons name="chatbubbles-outline" size={16} color={colors.brand} />
        <Text style={styles.eyebrow}>Community question</Text>
      </View>
      <Text style={styles.title}>{q.title}</Text>
      {q.body ? <Text style={styles.body} numberOfLines={6}>{q.body}</Text> : null}
      <Text style={styles.metaText}>{q.answers ? `${count(q.answers, 'answer')} from players` : 'Be the first to answer'}</Text>
      {preview.author ? <View style={styles.divider} /> : null}
      {preview.author ? <Person person={preview.author} line="asked" /> : null}
    </View>
  );
}

function CourtCard({ name, preview }: { name: string; preview: SharePreview }) {
  const styles = useThemedStyles(styleDefinitions);
  const c = preview.court!;
  const lines = [c.players ? `${count(c.players, 'player')} posting here` : '', c.openHits ? `${count(c.openHits, 'open hit')} coming up` : ''].filter(Boolean);
  return (
    <View style={styles.card}>
      <View style={styles.eyebrowRow}>
        <CourtGlyph size={14} color={colors.brand} />
        <Text style={styles.eyebrow}>Tennis court</Text>
      </View>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.metaText}>{lines.length ? lines.join(' · ') : 'See who plays here and post the first hit.'}</Text>
      <Tiles tiles={c.recent} />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg },
  column: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.lg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmark: { fontSize: 20, ...font('700'), color: colors.brand, letterSpacing: -0.6 },
  signIn: { ...typography.bodyStrong, color: colors.brand },
  invited: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  invitedText: { ...typography.smallStrong, color: colors.brand, flexShrink: 1 },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...lift },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personName: { ...typography.bodyStrong, color: colors.text },
  personLine: { ...typography.small, color: colors.textMuted },
  media: { width: '100%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  mediaPlain: { borderRadius: radius.md, overflow: 'hidden' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  body: { ...typography.body, color: colors.text, lineHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  metaText: { ...typography.small, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipText: { ...typography.smallStrong, color: colors.textMuted },
  chipStrong: { backgroundColor: colors.brandDim, borderColor: colors.brandDim },
  chipStrongText: { color: colors.brand },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { ...typography.caption, color: colors.brand, textTransform: 'uppercase' },
  hitWhen: { ...typography.display, color: colors.text },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing.xs },
  place: { ...typography.heading, color: colors.text, flexShrink: 1 },
  note: { ...typography.body, color: colors.textMuted, fontStyle: 'italic' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  title: { ...typography.title, color: colors.text },
  profileName: { ...typography.title, color: colors.text, marginTop: spacing.sm },
  stats: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-around', paddingVertical: spacing.sm },
  stat: { alignItems: 'center' },
  statN: { ...typography.heading, color: colors.text },
  statLabel: { ...typography.small, color: colors.textMuted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tile: { width: '32%', aspectRatio: 1, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tileText: { padding: spacing.sm, justifyContent: 'center', backgroundColor: colors.brandDim },
  tileWords: { ...typography.small, color: colors.brand },
  lockedCard: { alignItems: 'center', paddingVertical: spacing.xxl },
  lockedIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  lockedBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  join: { gap: spacing.md, paddingTop: spacing.sm },
  pitch: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  already: { alignSelf: 'center', paddingVertical: spacing.xs },
  alreadyText: { ...typography.small, color: colors.textMuted },
  alreadyLink: { ...typography.smallStrong, color: colors.brand },
});
