import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtSpinner } from '@/components/CourtSpinner';
import { PreparingRing } from '@/components/PreparingRing';
import type { ID, SessionDetail } from '@/data/types';
import { colors, font, lift, spacing, withAlpha } from '@/theme';
import { SessionCard, type CardPerson } from './SessionCard';
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
export function LogComposerTop({ session, people, hidden, waiting, media, preparing, prepDone, onPhoto, onClip, onEdit, onRemove, error, preview }: {
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
          <SessionCard session={session} width={size.cardW} play={play} people={people} hidden={hidden} />
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
 * The two buttons pinned to the bottom of the composer: "Just log it"
 * (private: it goes in your log and your streak, nothing is posted) and
 * Share. Already logged, Share alone. A tick replaces the words once logged.
 */
export function LogDock({ canJustLog, busy, ticked, error, onJustLog, onShare, shareDisabled }: {
  canJustLog: boolean;
  busy: null | 'log' | 'share';
  ticked: boolean;
  error: string;
  onJustLog: () => void;
  onShare: () => void;
  shareDisabled?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const off = !!busy || ticked;
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: insets.bottom + 8 }]}>
      <LinearGradient pointerEvents="none" colors={[withAlpha(colors.bg, 0), colors.bg, colors.bg]} locations={[0, 0.26, 1]} style={StyleSheet.absoluteFill} />
      {error ? <Text style={styles.dockError} accessibilityLiveRegion="polite">{error}</Text> : null}
      <View style={styles.dockRow}>
        {canJustLog ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Just log it. Private, counts toward your streak"
            accessibilityState={{ disabled: off, busy: busy === 'log' }}
            disabled={off}
            onPress={onJustLog}
            style={({ pressed }) => [styles.pill, styles.quiet, pressed && styles.pressed, off && busy !== 'log' && !ticked && styles.off]}
          >
            {ticked ? (
              <DrawnTick size={22} color={colors.brand} />
            ) : busy === 'log' ? <ActivityIndicator size="small" color={colors.text} /> : (
              <>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <Text style={styles.quietText}>Just log it</Text>
              </>
            )}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share"
          accessibilityState={{ disabled: off || shareDisabled, busy: busy === 'share' }}
          disabled={off || shareDisabled}
          onPress={onShare}
          style={({ pressed }) => [styles.pill, styles.share, { flex: canJustLog ? 1.25 : 1 }, pressed && styles.pressed, (off || shareDisabled) && busy !== 'share' && styles.off]}
        >
          {busy === 'share' ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={styles.shareText}>Share</Text>}
        </Pressable>
      </View>
    </View>
  );
}

/** How much room the dock takes, so the rows above can scroll clear of it. */
export const DOCK_ROOM = 54 + 8 + 40;

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
});

