import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeOut, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtSpinner } from '@/components/CourtSpinner';
import { PreparingRing } from '@/components/PreparingRing';
import type { ID, SessionDetail } from '@/data/types';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, font, lift, spacing, withAlpha } from '@/theme';
import { SessionCard, type CardPerson } from './SessionCard';
import { CountUp } from './CountUp';
import { DrawnTick } from './DrawnTick';
import { PostPreview, type PreviewMedia } from './PostPreview';

/** The composer's card: the feed's 358-wide card at about two thirds. */
export const CARD_W = 236;

/**
 * The card and the Photo and Clip tiles beside it, fitted to the phone: on
 * a 390-wide phone the card is 236 and the tiles 110; on a narrower one the
 * tiles give a little first (down to 88), then the card, so nothing runs
 * into the edge. The tiles always stack to the card's height.
 */
export function useLogSizes() {
  const { width } = useWindowDimensions();
  const room = Math.min(width, 600) - 32 - 10;
  const tileW = Math.max(88, Math.min(110, room - CARD_W));
  const cardW = Math.max(150, Math.min(CARD_W, room - tileW));
  const cardH = Math.round(cardW * 1.25);
  return { cardW, cardH, tileW, tileH: (cardH - 10) / 2 };
}

/**
 * The top of the composer opened from a session ("Log it"). With no photo or
 * clip yet: the session's card (what a post with only the stats looks like)
 * with Photo and Clip beside it. Once one is picked (owner, Oct 3): a
 * preview of the post as the feed will show it (PostPreview), the picture
 * large with the session's stats strip and the caption under it, changing as
 * you write. While the session is still on its way (opened cold from an
 * alert), a waiting card stands in, and the tiles wait.
 */
export function LogComposerTop({ session, people, hidden, waiting, media, preparing, prepDone, onPhoto, onClip, onEdit, onRemove, error, preview, replay = 0 }: {
  session: SessionDetail | null;
  people?: CardPerson[];
  hidden: ID[];
  waiting: boolean;
  media: PreviewMedia | null;
  preparing: null | 'video' | 'all';
  prepDone: boolean;
  onPhoto: () => void;
  onClip: () => void;
  onEdit: () => void;
  onRemove: () => void;
  error?: string;
  /** What the preview needs besides the picture and the stats. */
  preview: Omit<React.ComponentProps<typeof PostPreview>, 'media' | 'session' | 'hidden' | 'onEdit' | 'onRemove'>;
  /** Changed once saved: the card's numbers count up again, the moment it is logged (Oct 7). */
  replay?: number;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const size = useLogSizes();
  // The card counts up once, a moment after the composer opens.
  const [play, setPlay] = useState(false);
  useEffect(() => { if (session && !play) setPlay(true); }, [!!session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (media) {
    return (
      <View>
        <PostPreview media={media} session={session} hidden={hidden} onEdit={onEdit} onRemove={onRemove} {...preview} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }
  return (
    <View>
      <View style={styles.top}>
        {session ? (
          <SessionCard key={replay} session={session} width={size.cardW} play={play} people={people} hidden={hidden} />
        ) : (
          <View style={[styles.waitCard, { width: size.cardW, height: size.cardH, borderRadius: 20 * (size.cardW / 358), backgroundColor: colors.surfaceAlt }]} accessible accessibilityLabel={waiting ? 'Getting your session' : 'No session'}>
            {waiting ? <CourtSpinner size={34} /> : null}
          </View>
        )}
        <View style={[styles.tiles, { width: size.tileW }]}>
          <Tile icon="images-outline" label="Photo" height={size.tileH} busy={preparing === 'all'} done={prepDone} disabled={!session} onPress={onPhoto} />
          <Tile icon="videocam-outline" label="Clip" height={size.tileH} busy={preparing === 'video'} done={prepDone} disabled={!session} onPress={onClip} />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Tile({ icon, label, height, busy, done, disabled, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; height: number; busy: boolean; done: boolean; disabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Reanimated.View exiting={FadeOut.duration(160)} style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add a ${label.toLowerCase()}`}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, { height }, disabled && styles.off, pressed && styles.pressed]}
      >
        {busy ? <PreparingRing size={24} done={done} /> : <Ionicons name={icon} size={24} color={colors.textMuted} />}
        <Text style={styles.tileLabel}>{label}</Text>
      </Pressable>
    </Reanimated.View>
  );
}

/**
 * The two buttons pinned to the bottom of the composer: the quiet one
 * ("Save privately" on a session's "Log it": it goes in your log and your
 * streak, nothing is posted) and the green one ("Post session"). Already
 * logged, the green one alone. Every posting screen has this green button
 * (a New post or New clip too, with Share alone; an Instant's says "Post
 * Instant").
 *
 * On a session (Oct 7, owner: logging "has to feel more rewarding through
 * the buttons"), the streak it makes sits over the two, with the app's
 * flame: "Day 6 streak". Once saved, the button that did it draws a tick in
 * place of its words, and the streak line gives a small bump in a soft
 * green pill, its number rolling up when this session made it grow. With
 * Reduce Motion it simply changes.
 */
export function LogDock({ canJustLog, busy, ticked, error, onJustLog, onShare, shareDisabled, label = 'Share', quietLabel = 'Save privately', streak }: {
  canJustLog: boolean;
  busy: null | 'log' | 'share';
  /** Saved, and by which button (false: not yet). */
  ticked: false | 'log' | 'share';
  error: string;
  onJustLog: () => void;
  onShare: () => void;
  shareDisabled?: boolean;
  /** The green button's word: Share, "Post session", or "Post Instant". */
  label?: string;
  /** The quiet button's word. */
  quietLabel?: string;
  /** The streak with this session in it (`now`), and before it: the line over the buttons. */
  streak?: { now: number; before: number } | null;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const off = !!busy || !!ticked;
  // The streak line's bump, the moment it is saved.
  const bump = useSharedValue(1);
  useEffect(() => {
    if (!ticked || reduced) return;
    bump.value = withSequence(withTiming(1.12, { duration: 170 }), withSpring(1, { damping: 11, stiffness: 210 }));
  }, [ticked, reduced, bump]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const grew = !!streak && streak.now > streak.before;
  // No line when the session's day isn't part of a streak running to today (one from days ago, logged
  // late): it neither starts nor adds to one, so nothing is claimed. "Starts" only when it does start one.
  const hasStreak = !!streak && streak.now >= 1;
  const streakWords = !streak ? '' : streak.now >= 2 ? `Day ${streak.now} streak` : grew && !ticked ? 'Starts your streak' : 'Day 1 streak';
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: insets.bottom + 8 }]}>
      <LinearGradient pointerEvents="none" colors={[withAlpha(colors.bg, 0), colors.bg, colors.bg]} locations={[0, 0.26, 1]} style={StyleSheet.absoluteFill} />
      {error ? <Text style={styles.dockError} accessibilityLiveRegion="polite">{error}</Text> : null}
      {streak && hasStreak ? (
        <Reanimated.View
          style={[styles.streak, ticked ? styles.streakSaved : null, bumpStyle]}
          accessible
          accessibilityLabel={ticked ? `Saved. ${streakWords}` : grew ? `${streakWords} with this session` : streakWords}
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="flame" size={16} color={colors.clay} />
          {streak.now >= 2 ? (
            <View style={styles.streakWords}>
              <Text style={styles.streakText}>Day </Text>
              {/* Rolls up from the streak before this session, once saved. */}
              <CountUp value={streak.now} from={grew ? streak.before : streak.now} play={!!ticked && grew} duration={650} style={styles.streakText} maxFontSizeMultiplier={1.3} />
              <Text style={styles.streakText}> streak</Text>
              {grew && !ticked ? <Text style={styles.streakMore}> with this session</Text> : null}
            </View>
          ) : <Text style={styles.streakText}>{streakWords}</Text>}
        </Reanimated.View>
      ) : null}
      <View style={styles.dockRow}>
        {canJustLog ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${quietLabel}. Only you see it, and it counts toward your streak`}
            accessibilityState={{ disabled: off, busy: busy === 'log' }}
            disabled={off}
            onPress={onJustLog}
            style={({ pressed }) => [styles.pill, styles.quiet, pressed && styles.pressed, off && busy !== 'log' && ticked !== 'log' && styles.off]}
          >
            {ticked === 'log' ? (
              <DrawnTick size={22} color={colors.brand} />
            ) : busy === 'log' ? <ActivityIndicator size="small" color={colors.text} /> : (
              <>
                <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
                <Text style={styles.quietText} numberOfLines={1}>{quietLabel}</Text>
              </>
            )}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: off || shareDisabled, busy: busy === 'share' }}
          disabled={off || shareDisabled}
          onPress={onShare}
          style={({ pressed }) => [styles.pill, styles.share, { flex: canJustLog ? 1.25 : 1 }, pressed && styles.pressed, (off || shareDisabled) && busy !== 'share' && ticked !== 'share' && styles.off]}
        >
          {ticked === 'share' ? <DrawnTick size={22} color={colors.brandInk} />
            : busy === 'share' ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={styles.shareText} numberOfLines={1}>{label}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

/** How much room the dock takes, so the rows above can scroll clear of it (the streak line over the buttons included). */
export const DOCK_ROOM = 54 + 8 + 40 + 34;

const styleDefinitions = StyleSheet.create({
  top: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  waitCard: { alignItems: 'center', justifyContent: 'center' },
  tiles: { gap: 10 },
  tile: { ...lift, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8 },
  tileLabel: { ...font('600'), fontSize: 13, color: colors.text },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  error: { ...font('500'), fontSize: 13, color: colors.danger, marginTop: spacing.sm },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 26, paddingHorizontal: 16 },
  dockError: { ...font('500'), fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: 8 },
  dockRow: { flexDirection: 'row', gap: 10 },
  pill: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  quiet: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  quietText: { ...font('600'), fontSize: 16, color: colors.text },
  share: { backgroundColor: colors.brand },
  shareText: { ...font('600'), fontSize: 16, color: colors.brandInk },
  streak: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 5, marginBottom: 6, minHeight: 28, paddingHorizontal: 12, borderRadius: 14 },
  // Saved: the line sits in a soft green pill for the moment before the page goes.
  streakSaved: { backgroundColor: colors.brandDim },
  streakWords: { flexDirection: 'row', alignItems: 'baseline' },
  streakText: { ...font('600'), fontSize: 14, lineHeight: 19, color: colors.text, padding: 0, margin: 0 },
  streakMore: { ...font('500'), fontSize: 14, lineHeight: 19, color: colors.textMuted },
});

