import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet } from '@/components/DragSheet';
import { LiveDot } from '@/components/LiveDot';
import { CardWash, CourtLines, cardLook } from '@/components/session/SessionCard';
import { Submit, formBody } from '@/components/sheet/SheetForm';
import { BrandWash } from '@/components/ui';
import { KIND_LABEL } from '@/features/activity/format';
import { checkInPlan, clockText, elapsedMs, livePlace, liveState, seenLine, spokenClock, startClock, useLiveNow } from '@/features/activity/liveSession';
import { seenByOnMap } from '@/features/players/mapPrivacy';
import { confirm } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, pageIsDark, radius, spacing, typography } from '@/theme';

/**
 * The live session's own page (Oct 6), opened from the bar over the tabs or
 * straight after Start: the clock big, in the session box's own colours (the
 * court's shirt, as a logged session's card is), what and where, who can
 * see you playing, then Pause or Resume, and Finish. Finish stops the clock,
 * checks you out and opens the log sheet filled in from it
 * (log-session?live=1), where the score, who you played and a photo go on.
 * Discard throws it away, asked first. The chevron (or a pull down) only
 * tucks the page away: the clock keeps running in the bar.
 */
export default function LiveSessionPage() {
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  const { liveSession: s, liveSessionRead, actions, currentUser, courtNow, courtFacts, locationEnabled, mapLive, mapVisibility, teenMap } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const close = () => setCloseSignal((n) => n + 1);
  // Once the page is gone: the log sheet (Finish, Log it), Start (none going), or back where it was opened.
  const next = useRef<'log' | 'start' | null>(null);
  const [contentH, setContentH] = useState(0);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState('');
  const state = s ? liveState(s) : 'finished';
  const now = useLiveNow(!!s && state === 'running');
  // Whether you are checked in at its court right now, as the court's own card knows it.
  useEffect(() => { if (s?.court) void actions.loadCourtInfo([s.court.id]); }, [s?.court?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = cardLook(theme);

  const dismissed = () => {
    if (next.current === 'log') router.replace({ pathname: '/log-session', params: { live: '1' } });
    else if (next.current === 'start') router.replace('/start-session');
    else router.back();
  };

  // Opened cold (a reload on this page) before the phone's copy is read: a moment's wait.
  if (!s) {
    return (
      <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={0.5}
        header={<Header title="Your session" eyebrow="" onClose={close} />}>
        <ScrollView contentContainerStyle={formBody}>
          {!liveSessionRead ? <View style={styles.wait}><CourtSpinner size={34} /></View> : (
            <>
              <Text style={styles.none}>No session going. Start one when you get on court.</Text>
              <Submit label="Start a session" onPress={() => { next.current = 'start'; close(); }} />
            </>
          )}
        </ScrollView>
      </DragSheet>
    );
  }

  const ms = elapsedMs(s, now);
  const where = livePlace(s);
  // Who can see you: you are checked in at the court (and Location is on), or only you, and why.
  const here = !!s.court && !!courtNow[s.court.id]?.youHere && locationEnabled && state !== 'finished';
  const seenBy = seenByOnMap(mapLive, currentUser, teenMap, mapVisibility);
  const plan = checkInPlan({ me: currentUser, court: s.court, access: s.court ? courtFacts[s.court.id]?.access : undefined, locationOn: locationEnabled, seenBy });
  const seen = state === 'finished'
    ? { line: 'Finished. You’re checked out of the court.', shared: false, note: undefined as string | undefined }
    : seenLine({ here, seenBy, why: plan.why, problem: problem || s.checkInProblem });
  // Not seen, but could be by the court sheet's rules (a check-in that did not go through, Location just turned on): one tap to try.
  const canTry = state !== 'finished' && !here && (plan.checkIn || plan.why === 'location-off');
  const tryCheckIn = async () => {
    if (asking) return;
    setAsking(true);
    setProblem('');
    if (!locationEnabled) {
      const off = await actions.setLocationEnabled(true);
      if (off) { setProblem(off); setAsking(false); return; }
    }
    const refused = await actions.checkInLiveSession();
    if (refused) setProblem(refused);
    setAsking(false);
  };

  const finish = () => { actions.finishLiveSession(); next.current = 'log'; close(); };
  const logIt = () => { next.current = 'log'; close(); };
  const discard = () => confirm({
    title: 'Discard this session?',
    message: 'The time won’t be logged, and friends stop seeing you here.',
    confirmLabel: 'Discard',
    destructive: true,
    onConfirm: () => { actions.discardLiveSession(); close(); },
  });

  const status = state === 'finished' ? 'FINISHED' : state === 'paused' ? 'PAUSED' : 'LIVE';
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={0.86} contentHeight={contentH || undefined}
      header={<Header title={where || 'Your session'} eyebrow={status} running={state === 'running'} onClose={close} />}>
      <ScrollView contentContainerStyle={[formBody, styles.body]} onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        {/* The clock, in the session box's colours: the card a logged session gets, still running. */}
        <View
          style={[styles.box, { backgroundColor: look.fill, borderColor: look.border, borderWidth: look.dark ? 1 : 0 }]}
          accessible
          accessibilityRole="timer"
          accessibilityLabel={`${KIND_LABEL[s.kind]}, started ${startClock(s)}. ${spokenClock(ms)}${state === 'paused' ? ', paused' : state === 'finished' ? ', finished' : ''}`}
        >
          <CardWash look={look} radius={28} />
          <CourtLines color={look.lines} />
          <View style={styles.boxTop}>
            <Text style={[styles.boxEyebrow, { color: look.eyebrow }]} numberOfLines={1}>{`${KIND_LABEL[s.kind]} · started ${startClock(s)}`.toUpperCase()}</Text>
            {state === 'running' ? null : <View style={[styles.boxPill, { backgroundColor: look.pillFill }]}><Text style={[styles.boxPillText, { color: look.pillInk }]}>{state === 'paused' ? 'Paused' : 'Finished'}</Text></View>}
          </View>
          <View>
            <Text style={[styles.clock, { color: look.figure }, state === 'paused' && styles.clockPaused]} numberOfLines={1} maxFontSizeMultiplier={1.1}>{clockText(ms)}</Text>
            <Text style={[styles.boxUnder, { color: look.muted }]}>{state === 'finished' ? 'on court' : state === 'paused' ? 'on court so far' : 'on court, and counting'}</Text>
          </View>
        </View>

        {/* Who can see you playing, the check-in's own words. */}
        <View style={styles.seen}>
          <View style={[styles.seenIcon, seen.shared && styles.seenIconOn]}>
            {seen.shared ? <LiveDot size={8} color={colors.open} /> : <Ionicons name={state === 'finished' ? 'checkmark' : 'lock-closed'} size={14} color={colors.textMuted} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.seenLine, seen.shared && styles.seenShared]}>{seen.line}</Text>
            {seen.note ? <Text style={styles.seenNote}>{seen.note}</Text> : null}
          </View>
          {canTry ? (
            <Pressable accessibilityRole="button" accessibilityLabel={plan.why === 'location-off' ? 'Turn on Location and let friends see you’re here' : 'Let friends see you’re here'} disabled={asking} onPress={() => { void tryCheckIn(); }} style={({ pressed }) => [styles.tryPill, pressed && styles.pressed]}>
              {asking ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={styles.tryText}>{plan.why === 'location-off' ? 'Turn on' : 'Show friends'}</Text>}
            </Pressable>
          ) : null}
        </View>

        {/* Pause or Resume, and Finish (Log it once finished): the two big buttons, Finish the green one. */}
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={state === 'running' ? 'Pause session' : 'Resume session'}
            onPress={() => (state === 'running' ? actions.pauseLiveSession() : actions.resumeLiveSession())}
            style={({ pressed }) => [styles.second, pressed && styles.pressedScale]}
          >
            <Ionicons name={state === 'running' ? 'pause' : 'play'} size={20} color={colors.text} />
            <Text style={styles.secondText}>{state === 'running' ? 'Pause' : 'Resume'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={state === 'finished' ? 'Log this session' : 'Finish session'}
            onPress={state === 'finished' ? logIt : finish}
            style={({ pressed }) => [styles.primary, pageIsDark() ? styles.primaryDark : null, pressed && styles.pressedScale]}
          >
            <BrandWash />
            <Ionicons name={state === 'finished' ? 'create-outline' : 'stop'} size={18} color={colors.brandInk} />
            <Text style={styles.primaryText}>{state === 'finished' ? 'Log it' : 'Finish'}</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Discard session" hitSlop={8} onPress={discard} style={({ pressed }) => [styles.discard, pressed && styles.pressed]}>
          <Text style={styles.discardText}>Discard session</Text>
        </Pressable>
      </ScrollView>
    </DragSheet>
  );
}

/** The page's top: LIVE (or PAUSED, FINISHED) with its pulse, where, and a chevron that tucks the page away. */
function Header({ title, eyebrow, running = false, onClose }: { title: string; eyebrow: string; running?: boolean; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {eyebrow ? (
          <View style={styles.eyebrowRow}>
            {running ? <LiveDot size={7} color={colors.open} /> : null}
            <Text style={[styles.eyebrow, running && styles.eyebrowLive]}>{eyebrow}</Text>
          </View>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Hide. The session keeps going" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { ...font('700'), fontSize: 11, letterSpacing: 1.1, color: colors.textMuted },
  eyebrowLive: { color: colors.open },
  title: { ...typography.title, fontSize: 24, letterSpacing: -0.8, color: colors.text },
  close: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  body: { gap: spacing.lg },
  wait: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  none: { ...typography.body, color: colors.textMuted },
  // The session box: the logged session card's colours and court, 28 round, the clock its headline.
  box: { borderRadius: 28, overflow: 'hidden', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 22, gap: 6, minHeight: 210, justifyContent: 'space-between' },
  boxTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 22 },
  boxEyebrow: { ...font('600'), fontSize: 11.5, letterSpacing: 1.1, flex: 1 },
  // A fixed size that fits the box up to '10:00:00' (sessions stop at 10 hours). Shrink-to-fit drew it as a dot on iPhone (Oct 7, owner).
  clock: { ...font('600'), fontSize: 60, lineHeight: 68, letterSpacing: -2.5, fontVariant: ['tabular-nums'], marginTop: spacing.sm, alignSelf: 'stretch' },
  clockPaused: { opacity: 0.55 },
  // Clear of the faint court along the foot of the box.
  boxUnder: { ...font('500'), fontSize: 14, marginTop: -2, marginBottom: 34 },
  boxPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  boxPillText: { ...font('700'), fontSize: 11, letterSpacing: 0.3 },
  seen: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  seenIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  seenIconOn: { backgroundColor: colors.brandDim },
  seenLine: { ...typography.bodyStrong, color: colors.textMuted },
  seenShared: { color: colors.text },
  seenNote: { ...typography.small, color: colors.textFaint },
  tryPill: { minWidth: 64, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  tryText: { ...typography.smallStrong, color: colors.text },
  controls: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  second: { ...lift, flex: 1, height: 58, borderRadius: radius.pill, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondText: { ...typography.bodyStrong, fontSize: 16, color: colors.text },
  primary: { flex: 1, height: 58, borderRadius: radius.pill, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden', boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.16)' },
  primaryDark: { boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.4)' },
  primaryText: { ...typography.bodyStrong, fontSize: 16, color: colors.brandInk },
  pressed: { opacity: 0.7 },
  pressedScale: { transform: [{ scale: 0.98 }] },
  discard: { alignSelf: 'center', paddingVertical: spacing.xs },
  discardText: { ...typography.smallStrong, color: colors.textMuted },
});
