import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import Reanimated, { Easing, FadeInDown, FadeOutDown, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveDot } from '@/components/LiveDot';
import { BrandWash } from '@/components/ui';
import { KIND_LABEL } from '@/features/activity/format';
import { clockText, elapsedMs, livePlace, liveState, spokenClock, useLiveNow } from '@/features/activity/liveSession';
import { TAB_BAR_H, setLiveBarSpace } from '@/features/navigation/barInset';
import { BAR_TUCK, barCompact } from '@/features/navigation/barShrink';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark } from '@/theme';

/** The bar's own height, and the gap between it and the tab bar under it. */
const BAR_H = 56;
const GAP = 8;

/**
 * The live session's mini bar (Oct 6), Strava's and Apple Music's: while a
 * session you started is going, a slim green bar rides just above the tab
 * bar on every page that has one, with the clock ticking, what and where,
 * and Finish. Pause sits beside it; a tap anywhere else opens the full live
 * page. Stopped at Finish and not logged yet, it says so, with "Log it".
 * On a computer it floats at the foot of the page instead. It tells the
 * pages how much room it takes (setLiveBarSpace), so nothing hides under it.
 */
export function LiveBar({ phone }: { phone: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { liveSession: s, actions } = useApp();
  const insets = useSafeAreaInsets();
  const state = s ? liveState(s) : 'finished';
  const now = useLiveNow(!!s && state === 'running');
  useEffect(() => {
    if (!phone || !s) return undefined;
    setLiveBarSpace(BAR_H + GAP);
    return () => setLiveBarSpace(0);
  }, [phone, !!s]); // eslint-disable-line react-hooks/exhaustive-deps
  // It follows the tab bar down as the bar tucks in on a scroll, so the gap between them never changes.
  const tuck = useAnimatedStyle(() => ({ transform: [{ translateY: phone ? interpolate(barCompact.value, [0, 1], [0, BAR_TUCK]) : 0 }] }));
  if (!s) return null;

  const ms = elapsedMs(s, now);
  const where = livePlace(s);
  const what = state === 'finished' ? 'Finished' : state === 'paused' ? 'Paused' : KIND_LABEL[s.kind];
  const line = where ? `${what} · ${where}` : what;
  const finish = () => { actions.finishLiveSession(); router.push({ pathname: '/log-session', params: { live: '1' } }); };
  const log = () => router.push({ pathname: '/log-session', params: { live: '1' } });

  return (
    <Reanimated.View
      pointerEvents="box-none"
      entering={FadeInDown.duration(280).easing(Easing.out(Easing.cubic))}
      exiting={FadeOutDown.duration(200)}
      style={[phone ? [styles.phone, { bottom: Math.max(insets.bottom, 12) + TAB_BAR_H + GAP }] : styles.desk, tuck]}
    >
      <View style={[styles.bar, pageIsDark() ? styles.liftDark : styles.lift]}>
        <BrandWash radius={BAR_H / 2} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${state === 'finished' ? 'Session finished' : state === 'paused' ? 'Session paused' : 'Live session'}, ${spokenClock(ms)}, ${line}. Open it`}
          onPress={() => router.push('/live-session')}
          style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        >
          <View style={styles.dot}>
            {state === 'running' ? <LiveDot size={9} color={colors.brandInk} />
              : <Ionicons name={state === 'paused' ? 'pause' : 'checkmark'} size={13} color={colors.brandInk} />}
          </View>
          <View style={styles.words}>
            <Text style={styles.clock} numberOfLines={1}>{clockText(ms)}</Text>
            <Text style={styles.line} numberOfLines={1}>{line}</Text>
          </View>
        </Pressable>
        {state === 'finished' ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={state === 'paused' ? 'Resume session' : 'Pause session'}
            hitSlop={6}
            onPress={() => (state === 'paused' ? actions.resumeLiveSession() : actions.pauseLiveSession())}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          >
            <Ionicons name={state === 'paused' ? 'play' : 'pause'} size={17} color={colors.brandInk} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state === 'finished' ? 'Log this session' : 'Finish session'}
          onPress={state === 'finished' ? log : finish}
          style={({ pressed }) => [styles.finish, pressed && styles.pressed]}
        >
          <Text style={styles.finishText}>{state === 'finished' ? 'Log it' : 'Finish'}</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  phone: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 14, zIndex: 29 },
  desk: { position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center', paddingHorizontal: 16, zIndex: 29 },
  bar: { width: '100%', maxWidth: 440, height: BAR_H, borderRadius: BAR_H / 2, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', paddingRight: 8, overflow: 'hidden' },
  // The tab bar's own soft shadow, so the two read as one dock.
  lift: { boxShadow: '0px 8px 22px rgba(0, 0, 0, 0.16)' },
  liftDark: { boxShadow: '0px 8px 22px rgba(0, 0, 0, 0.4)' },
  body: { flex: 1, minWidth: 0, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18 },
  dot: { width: 14, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 1 },
  clock: { ...font('700'), fontSize: 17, lineHeight: 21, letterSpacing: -0.3, color: colors.brandInk, fontVariant: ['tabular-nums'] },
  line: { ...font('500'), fontSize: 12, lineHeight: 15, color: `${colors.brandInk}D1` },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.brandInk}29`, marginRight: 8 },
  finish: { height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandInk },
  finishText: { ...font('700'), fontSize: 14, color: colors.brand },
  pressed: { opacity: 0.75 },
});
