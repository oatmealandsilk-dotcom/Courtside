import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Reanimated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Collapse } from '@/components/ui';
import { RisingSheet } from '@/components/RisingSheet';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { inviteLink } from '@/features/invite/referral';
import { shareOutside } from '@/lib/shareOutside';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography, withAlpha } from '@/theme';
import { PRESS_DIM } from '@/theme/press';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';
import type { User } from '@/data/types';
import { MUTUAL_LINE_SHORT, sharedLine } from './mutualsMock';

/*
 * DESIGN MOCK, round 2 (Oct 28, owner: "I like everything about mutual thing,
 * but I think the cards could be better"). Three new looks for the card on
 * Find Players (b1 b2 b3) and two for "Add your friends" (a1 a2), behind the
 * demo build's `?mutuals=` switch. The app's own surfaces, type and buttons;
 * no gradients, no icon tiles. The only drawing is MeetMap: the app's map in
 * its own page tones, two pins and the court between them.
 */

const firstName = (u: User) => u.name.split(' ')[0];

async function shareLink(handle: string) {
  try {
    const said = await shareOutside('Join me on CourtSide', inviteLink(handle, null));
    if (said) showToast({ title: said, icon: 'link-outline' });
  } catch { /* closed */ }
}

/** People who follow you that you don't follow back, fixed when the card opens (a row stays, as Following, after its tap). */
function useToFollowBack() {
  const { users, currentUserId, followingIds, followEdges, blockedIds } = useApp();
  const [people] = useState(() => {
    const followsMe = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    return users.filter((u) => followsMe.has(u.id) && !followingIds.includes(u.id) && !blockedIds.includes(u.id) && u.id !== currentUserId);
  });
  return people;
}

// ---------------------------------------------------------------------------
// The drawing: a corner of the map in the page's own tones, your pin and a
// friend's, and the court between you. Dotted while one of you hasn't followed
// back; solid, with a tick at the court, once you follow each other.
// ---------------------------------------------------------------------------

function Pin({ user, size, x, y, styles }: { user: User | null; size: number; x: number; y: number; styles: typeof meetStyles }) {
  const box = size + 6;
  return (
    <View pointerEvents="none" style={[styles.pin, { left: x - box / 2, top: y - box - 5, width: box }]}>
      <View style={[styles.pinHead, { width: box, height: box, borderRadius: box / 2 }, !user && styles.pinEmpty]}>
        {user
          ? <Avatar uri={user.avatarUrl} name={user.name} seed={user.avatarSeed} size={size} />
          : <Ionicons name="person-add-outline" size={size * 0.46} color={colors.textMuted} />}
      </View>
      <View style={[styles.pinTail, !user && styles.pinTailEmpty]} />
    </View>
  );
}

export function MeetMap({ me, them, joined, height = 132, round = true }: { me: User; them: User | null; joined: boolean; height?: number; round?: boolean }) {
  useTheme();
  const styles = useThemedStyles(meetStyles);
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const h = height;
  const a = { x: w * 0.27, y: h * 0.76 };
  const b = { x: w * 0.73, y: h * 0.6 };
  const c = { x: w * 0.5, y: h * 0.18 };
  // The curve's middle (t = 0.5), where the court sits.
  const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
  const road = colors.surface;
  const pinSize = Math.min(34, Math.round(h * 0.26));
  return (
    <View onLayout={onLayout} style={[styles.map, { height }, round && styles.round]}>
      {w ? (
        <>
          <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
            <Path d={`M -20 ${h * 0.92} C ${w * 0.2} ${h * 0.8}, ${w * 0.45} ${h * 1.05}, ${w + 20} ${h * 0.86}`} stroke={withAlpha(colors.hard, 0.14)} strokeWidth={20} fill="none" />
            <Rect x={w * 0.62} y={-24} width={w * 0.3} height={h * 0.42} rx={16} fill={withAlpha(colors.grass, 0.18)} transform={`rotate(8 ${w * 0.77} 0)`} />
            <Rect x={-20} y={h * 0.12} width={w * 0.2} height={h * 0.34} rx={14} fill={withAlpha(colors.grass, 0.14)} />
            <Path d={`M -10 ${h * 0.38} L ${w + 10} ${h * 0.26}`} stroke={road} strokeWidth={9} />
            <Path d={`M -10 ${h * 0.66} L ${w + 10} ${h * 0.58}`} stroke={road} strokeWidth={6} />
            <Path d={`M ${w * 0.36} -10 L ${w * 0.42} ${h + 10}`} stroke={road} strokeWidth={9} />
            <Path d={`M ${w * 0.84} -10 L ${w * 0.88} ${h + 10}`} stroke={road} strokeWidth={5} />
            <Path d={`M ${w * 0.08} -10 L ${w * 0.16} ${h + 10}`} stroke={road} strokeWidth={4} />
            <Path d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`} stroke={joined ? colors.brand : withAlpha(colors.textMuted, 0.7)} strokeWidth={joined ? 2.5 : 2} strokeDasharray={joined ? undefined : '1 6'} strokeLinecap="round" fill="none" />
            <Circle cx={a.x} cy={a.y} r={3} fill={joined ? colors.brand : colors.textMuted} />
            <Circle cx={b.x} cy={b.y} r={3} fill={joined ? colors.brand : colors.textMuted} />
          </Svg>
          <View pointerEvents="none" style={[styles.court, { left: mid.x - 15, top: mid.y - 15 }]}>
            <CourtGlyph size={12} color={colors.court} />
          </View>
          {joined ? (
            <Reanimated.View entering={FadeIn.duration(220)} pointerEvents="none" style={[styles.tick, { left: mid.x + 7, top: mid.y - 19 }]}>
              <Ionicons name="checkmark" size={11} color={colors.brandInk} />
            </Reanimated.View>
          ) : null}
          <Pin user={me} size={pinSize} x={a.x} y={a.y} styles={styles} />
          <Pin user={them} size={pinSize} x={b.x} y={b.y} styles={styles} />
        </>
      ) : null}
    </View>
  );
}

const meetStyles = StyleSheet.create({
  map: { width: '100%', overflow: 'hidden', backgroundColor: colors.bgElevated },
  round: { borderRadius: corner(16), borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  court: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(42, 36, 24, 0.12)' },
  tick: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  pin: { position: 'absolute', alignItems: 'center' },
  pinHead: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 8px rgba(42, 36, 24, 0.16)' },
  pinEmpty: { backgroundColor: colors.bg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, boxShadow: 'none' },
  pinTail: { width: 8, height: 8, marginTop: -5, backgroundColor: colors.surface, transform: [{ rotate: '45deg' }] },
  pinTailEmpty: { backgroundColor: 'transparent' },
});

// ---------------------------------------------------------------------------
// B1: a row of person cards you swipe across, as Instagram's "Suggested for
// you": a big face, the name, "Follows you", one thing you share, Follow back.
// ---------------------------------------------------------------------------

export function FollowBackRow({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(rowStyles);
  const { followingIds, actions, currentUser } = useApp();
  const all = useToFollowBack();
  const [hidden, setHidden] = useState<string[]>([]);
  const people = all.filter((p) => !hidden.includes(p.id));
  if (!people.length || !currentUser) return null;
  return (
    <View>
      <View style={styles.head}>
        <View style={styles.headWords}>
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Follow back</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sub}>{MUTUAL_LINE_SHORT}</Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.seeAll}>Not now</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.strip}>
        {people.map((p) => {
          const on = followingIds.includes(p.id);
          return (
            <Reanimated.View key={p.id} layout={LinearTransition.duration(220)} exiting={FadeOut.duration(140)} style={styles.card}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Hide ${p.name}`} hitSlop={8} onPress={() => setHidden((h) => [...h, p.id])} style={({ pressed }) => [styles.hide, pressed && { opacity: PRESS_DIM }]}>
                <Ionicons name="close" size={16} color={colors.textFaint} />
              </Pressable>
              <Pressable accessibilityRole="link" accessibilityLabel={p.name} onPress={() => router.push(`/user/${p.id}`)} style={styles.who}>
                <Avatar uri={p.avatarUrl} name={p.name} seed={p.avatarSeed} size={68} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{on ? 'You follow each other' : 'Follows you'}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.shared} numberOfLines={1}>{sharedLine(p, currentUser)}</Text>
              </Pressable>
              <Button label={on ? 'Following' : 'Follow back'} variant={on ? 'secondary' : 'primary'} size="sm" onPress={() => actions.toggleFollow(p.id)} full />
            </Reanimated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md },
  headWords: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.heading, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  seeAll: { ...typography.smallStrong, color: colors.textMuted, paddingBottom: 1 },
  scroller: { marginHorizontal: -spacing.lg, overflow: 'visible' },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 6 },
  card: { ...lift, width: 158, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md, alignItems: 'stretch', gap: spacing.md },
  hide: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  who: { alignItems: 'center', gap: 2 },
  name: { ...typography.smallStrong, fontSize: 15, color: colors.text, marginTop: spacing.sm, maxWidth: '100%' },
  meta: { ...typography.small, color: colors.textMuted },
  shared: { ...typography.small, fontSize: 12, color: colors.textFaint, maxWidth: '100%' },
});

// ---------------------------------------------------------------------------
// B2: one quiet line with the faces ("Rosa, Kai and 3 others follow you")
// that opens into the list, with Follow back all at the foot.
// ---------------------------------------------------------------------------

function Faces({ people, size = 32 }: { people: User[]; size?: number }) {
  const styles = useThemedStyles(bannerStyles);
  return (
    <View style={[styles.faces, { width: size + (Math.min(people.length, 3) - 1) * (size * 0.72) + 4, height: size + 4 }]}>
      {people.slice(0, 3).map((p, i) => (
        <View key={p.id} style={[styles.face, { left: i * size * 0.72, zIndex: 3 - i, borderRadius: (size + 4) / 2 }]}>
          <Avatar uri={p.avatarUrl} name={p.name} seed={p.avatarSeed} size={size} />
        </View>
      ))}
    </View>
  );
}

function namesLine(people: User[]): string {
  const n = people.map(firstName);
  if (n.length === 1) return `${n[0]} follows you`;
  if (n.length === 2) return `${n[0]} and ${n[1]} follow you`;
  const rest = n.length - 2;
  return `${n[0]}, ${n[1]} and ${rest} ${rest === 1 ? 'other' : 'others'} follow you`;
}

export function FollowBackBanner({ onClose, startOpen = false }: { onClose: () => void; startOpen?: boolean }) {
  const styles = useThemedStyles(bannerStyles);
  const { followingIds, actions, currentUser } = useApp();
  const people = useToFollowBack();
  const [open, setOpen] = useState(startOpen);
  const left = people.filter((p) => !followingIds.includes(p.id));
  if (!people.length || !currentUser) return null;
  const allDone = !left.length;
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={({ pressed }) => [styles.top, pressed && { opacity: PRESS_DIM }]}>
        <Faces people={people} size={26} />
        <View style={styles.words}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title} numberOfLines={2}>{allDone ? 'You follow each other now' : namesLine(people)}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.line} numberOfLines={1}>{allDone ? 'You’ll see each other on the map' : 'See each other on the map'}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
      </Pressable>
      <Collapse open={open}>
        <View style={styles.list}>
          {people.map((p) => {
            const on = followingIds.includes(p.id);
            return (
              <View key={p.id} style={styles.person}>
                <Pressable accessibilityRole="link" accessibilityLabel={p.name} onPress={() => router.push(`/user/${p.id}`)} style={styles.who}>
                  <Avatar uri={p.avatarUrl} name={p.name} seed={p.avatarSeed} size={40} />
                  <View style={styles.whoWords}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{p.name}</Text>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{on ? 'You follow each other' : sharedLine(p, currentUser)}</Text>
                  </View>
                </Pressable>
                <View style={styles.pill}>
                  <Button label={on ? 'Following' : 'Follow back'} variant={on ? 'secondary' : 'primary'} size="sm" onPress={() => actions.toggleFollow(p.id)} full />
                </View>
              </View>
            );
          })}
          <View style={styles.foot}>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.later, pressed && { opacity: PRESS_DIM }]}>
              <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.laterText}>Not now</Text>
            </Pressable>
            {left.length > 1 ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => left.forEach((p) => actions.toggleFollow(p.id))} style={({ pressed }) => [styles.later, pressed && { opacity: PRESS_DIM }]}>
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.allText}>Follow back all {left.length}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Collapse>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  faces: { position: 'relative' },
  face: { position: 'absolute', top: 0, padding: 2, backgroundColor: colors.surface },
  words: { flex: 1, minWidth: 0, gap: 1 },
  title: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  line: { ...typography.small, color: colors.textMuted },
  list: { paddingTop: spacing.md, marginTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: spacing.md },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  whoWords: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.smallStrong, fontSize: 15, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  pill: { width: 112 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  later: { minHeight: 36, justifyContent: 'center' },
  laterText: { ...typography.smallStrong, color: colors.textMuted },
  allText: { ...typography.smallStrong, color: colors.brand },
});

// ---------------------------------------------------------------------------
// B3: one person at a time, with the picture of what following back does:
// your pin and theirs, dotted until you follow back, then joined at the court.
// ---------------------------------------------------------------------------

export function FollowBackMeet({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(meetCardStyles);
  const { followingIds, actions, currentUser } = useApp();
  const people = useToFollowBack();
  const [at, setAt] = useState(0);
  if (!people.length || !currentUser) return null;
  const p = people[Math.min(at, people.length - 1)];
  const on = followingIds.includes(p.id);
  const last = at >= people.length - 1;
  const next = () => (last ? onClose() : setAt((i) => i + 1));
  return (
    <View style={styles.card}>
      <MeetMap me={currentUser} them={p} joined={on} height={128} round={false} />
      <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && { opacity: PRESS_DIM }]}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title} numberOfLines={1}>{on ? `You and ${firstName(p)} follow each other` : `${p.name} follows you`}</Text>
          {people.length > 1 ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.count}>{at + 1} of {people.length}</Text> : null}
        </View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.line}>{on ? 'You’ll see each other on the map now.' : 'Follow back to see each other on the map.'}</Text>
        <View style={styles.buttons}>
          {on
            ? <View style={styles.grow}><Button label={last ? 'Done' : 'Next'} size="sm" onPress={next} full /></View>
            : (
              <>
                <View style={styles.grow}><Button label="Follow back" size="sm" onPress={() => actions.toggleFollow(p.id)} full /></View>
                <View style={styles.skip}><Button label={last ? 'Not now' : 'Skip'} variant="ghost" size="sm" onPress={next} full /></View>
              </>
            )}
        </View>
      </View>
    </View>
  );
}

const meetCardStyles = StyleSheet.create({
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, overflow: 'hidden' },
  close: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 4px rgba(42, 36, 24, 0.12)' },
  body: { padding: spacing.lg, paddingTop: spacing.md, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { ...typography.heading, color: colors.text, flex: 1, minWidth: 0 },
  count: { ...typography.small, fontSize: 12, color: colors.textFaint },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  grow: { flex: 1 },
  skip: { width: 92 },
});

// ---------------------------------------------------------------------------
// A1: the calmer "Add your friends" sheet: the drawing, one headline, three
// short lines, Find friends.
// ---------------------------------------------------------------------------

const BENEFITS = [
  'Each other’s pin while you’re up to hit',
  'Who plays at your courts',
  'Each other on your city’s leaderboard',
];

export function MutualsSheetCalm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(calmStyles);
  const insets = useSafeAreaInsets();
  const { currentUser, users, followingIds, followEdges, currentUserId } = useApp();
  // A friend you already follow each other with, for the drawing (Sam in the demo).
  const friend = useMemo(() => {
    const followsMe = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    return users.find((u) => followingIds.includes(u.id) && followsMe.has(u.id)) ?? null;
  }, [users, followingIds, followEdges, currentUserId]);
  if (!currentUser) return null;
  return (
    <RisingSheet visible={visible} onClose={onClose} closeLabel="Not now" sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xs }]}>
      <View style={styles.grabber} />
      <MeetMap me={currentUser} them={friend} joined height={148} />
      <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>See your friends on the map</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>When you follow each other, you both get:</Text>
      <View style={styles.list}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.item}>
            <Ionicons name="checkmark" size={17} color={colors.brand} />
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.itemText}>{b}</Text>
          </View>
        ))}
      </View>
      <View style={styles.buttons}>
        <Button label="Find friends" onPress={() => { onClose(); router.push('/find-contacts'); }} full />
      </View>
      <View style={styles.quiet}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { void shareLink(currentUser.handle); }} style={({ pressed }) => [styles.quietButton, pressed && { opacity: PRESS_DIM }]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.share}>Share my link</Text>
        </Pressable>
        <View style={styles.dot} />
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.quietButton, pressed && { opacity: PRESS_DIM }]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.later}>Not now</Text>
        </Pressable>
      </View>
    </RisingSheet>
  );
}

const calmStyles = StyleSheet.create({
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm, paddingHorizontal: spacing.xl },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  title: { ...typography.title, color: colors.text, marginTop: spacing.lg },
  lead: { ...typography.small, fontSize: 14, color: colors.textMuted, marginTop: 4 },
  list: { marginTop: spacing.md, gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemText: { ...typography.body, color: colors.text, flex: 1 },
  buttons: { marginTop: spacing.xl },
  quiet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xs },
  quietButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  share: { ...typography.smallStrong, fontSize: 14, color: colors.brand },
  later: { ...typography.smallStrong, fontSize: 14, color: colors.textMuted },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.borderStrong },
});

// ---------------------------------------------------------------------------
// A2: the same ask as a card in Find Players, for when your map has no
// friends on it yet: your pin, an empty one beside it, two buttons.
// ---------------------------------------------------------------------------

export function MutualsEmptyCard({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(emptyStyles);
  const { currentUser } = useApp();
  if (!currentUser) return null;
  return (
    <View style={styles.card}>
      <MeetMap me={currentUser} them={null} joined={false} height={116} round={false} />
      <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && { opacity: PRESS_DIM }]}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
      <View style={styles.body}>
        <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>No friends on your map yet</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.line}>Follow each other to see each other’s pins, who plays at your courts and the leaderboard.</Text>
        <View style={styles.buttons}>
          <View style={styles.grow}><Button label="Find friends" size="sm" onPress={() => router.push('/find-contacts')} full /></View>
          <View style={styles.grow}><Button label="Share my link" variant="secondary" size="sm" onPress={() => { void shareLink(currentUser.handle); }} full /></View>
        </View>
      </View>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, overflow: 'hidden' },
  close: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 4px rgba(42, 36, 24, 0.12)' },
  body: { padding: spacing.lg, paddingTop: spacing.md, gap: 4 },
  title: { ...typography.heading, color: colors.text },
  line: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  grow: { flex: 1 },
});
