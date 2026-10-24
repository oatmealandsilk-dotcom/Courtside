import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { DragSheet } from '@/components/DragSheet';
import { SheetTitle, formBody } from '@/components/sheet/SheetForm';
import { activityDay } from '@/features/activity/format';
import { isTennisActivity } from '@/features/activity/workouts';
import { localDay } from '@/features/practice/stats';
import { ByHandRow, PartHead, StartHero, WaitingRow, WeekStrip } from '@/features/sessionChooser/parts';
import { goLogByHand, goLogTracker, goStart, useSessionChoices } from '@/features/sessionChooser/useSessionChoices';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, spacing, withAlpha } from '@/theme';
import { corner } from '@/theme/look';

/**
 * The Session sheet: what + → Session opens (Oct 16, owner: "once you click
 * sessions, the ui should be better than a bar that pops up at the bottom
 * with two options, just does not feel very rewarding or inticing"; of the
 * looks side by side: "do a with week strip"). It took the place of the
 * small two-row menu (Start now / Log a past one).
 *
 * Top to bottom, an even step apart:
 *  - your week (WeekStrip): time on court this week, the streak badge, and
 *    Monday to Sunday ticked, today's ring waiting with a breathing dot;
 *  - "Start a session" as a session box of its own (the clock at rest,
 *    your usual court, a round green Start) → Start a session;
 *  - "Log one you played": every session your tracker picked up and nobody
 *    has logged, each one tap to its Log it page. When a tennis session from
 *    today is waiting and today has no tick yet, it says logging it gives
 *    today its tick. With nothing waiting the head is left out;
 *  - "Log one yourself", straight to the by-hand form.
 * One step fewer to log anything than before (no "Log a past one" first).
 *
 * While a session is running, or finished and not logged yet, the Create
 * box's Session card opens that one instead, never this sheet (compose.tsx).
 * Nothing here takes typing, so the keyboard never comes up. The sheet is
 * the app's drag-to-close sheet (DragSheet: safe areas, Android's Back, a
 * drag down or a tap above closes it), fitted to its contents; on a small
 * phone it scrolls, a soft fade at its foot saying there is more.
 */
export default function NewSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { waiting, court, streak, week, weekMinutes } = useSessionChoices();
  const [closeSignal, setCloseSignal] = useState(0);
  // How tall the contents are, so the sheet opens just that tall (as Start a session does), never with an empty half.
  const [contentH, setContentH] = useState(0);
  // On a small phone the sheet scrolls: a soft fade at its foot says there is more, until the end is reached.
  const [viewH, setViewH] = useState(0);
  const [scrolled, setScrolled] = useState(0);
  const more = viewH > 0 && contentH > viewH + scrolled + 4;
  // A tennis session from today waiting while today has no tick yet is the strip's missing tick, so the list says so.
  const today = localDay(new Date());
  const tickWaiting = !week.some((d) => d.today && d.minutes > 0) && waiting.some((x) => isTennisActivity(x) && activityDay(x) === today);
  const hint = tickWaiting ? 'Log your tennis and today gets its tick.' : 'Your tracker picked these up. One tap to log.';
  // Where to go once the sheet has gone; nothing means back where it opened.
  const next = useRef<(() => void) | null>(null);
  // A choice hands the sheet over to the next page rather than sliding it away
  // first (Oct 16, owner: "The animation when you click log a session, it should
  // be better than a flash to new screen that pops up"): this sheet stays up, its
  // contents fade, and Start a session, the by-hand form or a session's "Log it"
  // page opens in its place from right where it stands, then settles at its own
  // height (sheetHandOver). One sheet whose contents change, no dip in between.
  const [handOver, setHandOver] = useState(0);
  const go = (to: () => void) => { next.current = to; setHandOver((n) => n + 1); };
  const dismissed = () => (next.current ? next.current() : router.back());

  return (
    <DragSheet
      fitContent
      peekFraction={0.92}
      contentHeight={contentH || undefined}
      closeSignal={closeSignal}
      handOverSignal={handOver}
      onDismissed={dismissed}
      header={<SheetTitle title="Session" onClose={() => setCloseSignal((n) => n + 1)} />}
    >
      {/* The fade sits at the foot of the list itself, above the space kept clear of the home bar. */}
      <View style={styles.fill}>
      <ScrollView
        contentContainerStyle={[formBody, styles.body]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}
        onLayout={(e) => setViewH(Math.floor(e.nativeEvent.layout.height))}
        onScroll={(e) => setScrolled(Math.ceil(e.nativeEvent.contentOffset.y))}
        scrollEventThrottle={32}
      >
        <WeekStrip minutes={weekMinutes} streak={streak} days={week} />
        <StartHero court={court} onPress={() => go(goStart)} />
        {waiting.length ? (
          <View style={styles.part}>
            <PartHead title="Log one you played" count={waiting.length} hint={hint} />
            <View style={styles.group}>
              {waiting.map((x, i) => <WaitingRow key={x.id} first={i === 0} activity={x} onPress={() => go(() => goLogTracker(x.id))} />)}
            </View>
          </View>
        ) : null}
        <ByHandRow onPress={() => go(goLogByHand)} />
      </ScrollView>
      {more ? <LinearGradient pointerEvents="none" colors={[withAlpha(colors.bg, 0), colors.bg]} style={styles.moreFade} /> : null}
      </View>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  // One even step between the blocks (strip, Start, the list, Log one yourself), so all four sit on one phone screen.
  fill: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  body: { gap: spacing.lg, paddingTop: spacing.xs },
  part: { gap: 10 },
  // Short, so it never washes a Log it into looking switched off.
  moreFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24 },
  group: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, overflow: 'hidden', paddingHorizontal: spacing.lg },
});
