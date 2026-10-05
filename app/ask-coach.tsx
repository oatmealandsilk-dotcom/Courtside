import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MediaPicker, type PickedMedia } from '@/components/MediaPicker';
import { Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import type { CoachSpecialty } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const SPECIALTIES: { value: CoachSpecialty; label: string }[] = [
  { value: 'serve', label: 'Serve' },
  { value: 'forehand', label: 'Forehand' },
  { value: 'backhand', label: 'Backhand' },
  { value: 'volleys', label: 'Volleys' },
  { value: 'footwork', label: 'Footwork' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'mental', label: 'Mental' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'juniors', label: 'Juniors' },
];

/**
 * Around the page's header: with the keyboard up, a tap on the title or the
 * space around it closes it. The back arrow inside still takes its own tap
 * first. Not a button, so a screen reader passes it by. A browser closes the
 * keyboard by itself on a tap off the box, so there it is left out.
 */
function closesKeys(header: React.ReactNode) {
  if (Platform.OS === 'web') return header;
  return <View accessible={false} onStartShouldSetResponder={() => Keyboard.isVisible()} onResponderRelease={() => Keyboard.dismiss()}>{header}</View>;
}

/**
 * A free, public question to every coach on CourtSide. Written like a
 * message, not filled in like a form: one line for what is wrong, room
 * beneath for the detail, a clip if you have one, and Post.
 */
export default function AskCoach() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, coaches } = useApp();
  // Opened from the box on the Coaching tab, the page grows out of that box:
  // it starts at the box's size and place, rounded like it, and expands to
  // the whole page while the form fades in; then the cursor is waiting.
  // On a phone this runs on the animation thread; in a browser the browser's
  // own compositor runs it (a scale, not a resize), so it never waits for the
  // page to finish drawing.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const origin = typeof from === 'string' ? from.split(',').map(Number) : null;
  const hero = !!origin && origin.length === 4 && origin.every((n) => Number.isFinite(n) && n >= 0) && origin[2] > 0 && origin[3] > 0;
  const web = Platform.OS === 'web';
  const [title, setTitle] = useState('');
  const titleBox = useRef<TextInput>(null);
  const [body, setBody] = useState('');
  const [specialty, setSpecialty] = useState<CoachSpecialty>('serve');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [footage, setFootage] = useState(false);
  const bodyBox = useRef<TextInput>(null);
  const grow = useSharedValue(hero ? 0 : 1);
  const home = useSharedValue({ x: 0, y: 0, w: 1, h: 1 });
  const start = useSharedValue({ x: 0, y: 0, w: 1, h: 1 });
  const [startRect, setStartRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [placed, setPlaced] = useState(!hero);
  const root = useRef<View>(null);
  const cardRef = useRef<View>(null);
  const contentRef = useRef<View>(null);
  const ghostRef = useRef<View>(null);
  const veilRef = useRef<View>(null);
  const el = (r: React.RefObject<View | null>) => r.current as unknown as HTMLElement | null;
  const focusTitle = () => titleBox.current?.focus();
  /** The browser's version: keyframes on the compositor, forwards or backwards. */
  const playWeb = (a: { x: number; y: number; w: number; h: number }, rw: number, rh: number, backwards: boolean, done: () => void) => {
    const sx = a.w / rw, sy = a.h / rh;
    // Only transform and opacity: the two things a browser animates on its
    // graphics layer, smooth even while the page underneath is still drawing.
    // (The rounded start comes from the box itself, fading on top.)
    const small = { transform: `translate(${a.x}px, ${a.y}px) scale(${sx}, ${sy})` };
    const big = { transform: 'translate(0px, 0px) scale(1, 1)' };
    const card = el(cardRef);
    if (card) card.style.transformOrigin = '0 0';
    const opts = (ms: number, delay = 0) => ({ duration: ms, delay, easing: backwards ? 'cubic-bezier(.4,0,.6,1)' : 'cubic-bezier(.2,.8,.2,1)', fill: 'both' as const });
    const run = card?.animate(backwards ? [big, small] : [small, big], opts(backwards ? 300 : 420));
    el(contentRef)?.animate(backwards ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], opts(backwards ? 140 : 240, backwards ? 0 : 190));
    el(ghostRef)?.animate(backwards ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], opts(140, backwards ? 160 : 0));
    el(veilRef)?.animate(backwards ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], opts(backwards ? 300 : 420));
    if (run) run.onfinish = done; else done();
  };
  const onRootLayout = () => {
    if (!hero || placed) return;
    root.current?.measureInWindow((rx, ry, rw, rh) => {
      const a = { x: origin![0] - rx, y: origin![1] - ry, w: origin![2], h: origin![3] };
      home.value = { x: 0, y: 0, w: rw, h: rh };
      start.value = a;
      setStartRect(a);
      setPlaced(true);
      // Two frames' grace, so the form finishes drawing before the growth starts.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (web) playWeb(a, rw, rh, false, focusTitle);
        else grow.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }, (done) => { if (done) runOnJS(focusTitle)(); });
      }));
    });
  };
  useEffect(() => { if (!hero) { const t = setTimeout(focusTitle, 350); return () => clearTimeout(t); } }, [hero]);
  const card = useAnimatedStyle(() => {
    if (!hero || web) return {};
    const p = grow.value;
    const a = start.value, b = home.value;
    return {
      position: 'absolute',
      left: a.x + (b.x - a.x) * p,
      top: a.y + (b.y - a.y) * p,
      width: a.w + (b.w - a.w) * p,
      height: a.h + (b.h - a.h) * p,
      borderRadius: 26 * (1 - p),
      overflow: 'hidden',
    };
  });
  const content = useAnimatedStyle(() => ({ opacity: hero && !web ? Math.max(0, (grow.value - 0.45) / 0.55) : 1 }));
  const ghost = useAnimatedStyle(() => ({ opacity: hero && !web ? Math.max(0, 1 - grow.value * 2.5) : web ? 1 : 0 }));
  const veil = useAnimatedStyle(() => ({ opacity: hero && !web ? grow.value : 1 }));
  const close = () => {
    if (!hero) { goBack(); return; }
    // Whichever box has the cursor, the keys go down as the page shrinks away.
    Keyboard.dismiss();
    if (web && startRect) {
      root.current?.measureInWindow((_rx, _ry, rw, rh) => playWeb(startRect, rw, rh, true, () => goBack()));
      return;
    }
    grow.value = withTiming(0, { duration: 300, easing: Easing.bezier(0.4, 0, 0.6, 1) }, (done) => { if (done) runOnJS(goBack)(); });
  };
  const canSubmit = title.trim().length > 10 && body.trim().length > 25;
  const submit = () => {
    if (!canSubmit) return;
    // Only a video goes with the question (coaches see clips, not photos), and its name only with it.
    const clip = media?.kind === 'video' ? media : null;
    const id = actions.askCoach({ title: title.trim(), body: body.trim(), specialty, videoUrl: clip?.uri, mediaLabel: clip?.label });
    router.replace(`/coach-question/${id}`);
  };
  const watching = coaches.length;

  return (
    <View ref={root} onLayout={onRootLayout} style={StyleSheet.absoluteFill}>
    {/* Behind the growing card, the page dims into the new one. */}
    <Reanimated.View ref={veilRef} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, veil, hero && !placed && { opacity: 0 }]} />
    <Reanimated.View ref={cardRef} style={[hero && !web ? null : StyleSheet.absoluteFill, { backgroundColor: colors.bg, overflow: 'hidden' }, card, !placed && { opacity: 0 }]}>
    <Reanimated.View ref={contentRef} style={[{ flex: 1 }, content]}>
    <Screen title="Ask a coach" compactTitle scroll={false} padded={false} bar={false} onBack={close} headerWrapper={closesKeys}>
      {/* A tap on anything here that is not a box or a button closes the
          keyboard, so the whole page shows again (the scroller does that for
          taps it does not hand on); on a phone, dragging the page down closes
          it too. Not in a browser, which scrolls a box into view by itself
          as you type, and that scroll would close the keyboard at once. */}
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'android' ? 'on-drag' : 'none'} contentContainerStyle={styles.page}>
        {/* The two things worth knowing; no count of coaches, which said little. */}
        <Text style={styles.lead}>{watching ? 'Free and public. Coaches usually answer within a day.' : 'Free and public. Your question stays up until a coach answers.'}</Text>

        {/* What it is about: one scrolling row, no heading — the words say it.
            It hands taps on to the topics, so one tap picks one even with the keyboard up. */}
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics} style={styles.topicsWrap}>
          {SPECIALTIES.map((item) => (
            <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: specialty === item.value }} onPress={() => setSpecialty(item.value)} style={[styles.topic, specialty === item.value && styles.topicOn]}>
              <Text style={[styles.topicText, specialty === item.value && styles.topicTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* The question, large, then the detail beneath a hairline: written, not filled in. */}
        <View style={styles.sheet}>
          <TextInput
            ref={titleBox}
            value={title}
            onChangeText={setTitle}
            // The same words as the Coaching tab's box this page grows out of, so the hand-off reads as one box.
            placeholder="Your question"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={140}
            returnKeyType="next"
            blurOnSubmit
            onSubmitEditing={() => bodyBox.current?.focus()}
            accessibilityLabel="Your question"
            style={styles.question}
          />
          <View style={styles.rule} />
          <TextInput
            ref={bodyBox}
            value={body}
            onChangeText={setBody}
            placeholder="Details"
            placeholderTextColor={colors.textFaint}
            multiline
            textAlignVertical="top"
            accessibilityLabel="The detail"
            style={styles.detail}
          />
          <View style={styles.rule} />
          {footage || media ? (
            <View style={styles.footage}>
              <MediaPicker value={media} onChange={setMedia} noCover selection="video" label="Choose a clip" />
            </View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Add a clip" onPress={() => setFootage(true)} style={styles.addRow}>
              <Ionicons name="videocam-outline" size={20} color={colors.text} />
              <Text style={styles.addText}>Add a clip</Text>
              <Text style={styles.addNote}>Optional</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.foot}>
          <Text style={styles.footNote}>{canSubmit ? 'Coaches see your level with it.' : title.trim().length <= 10 ? 'A few more words on what is wrong.' : 'A little more detail, so the answer can be specific.'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Post to coaches" accessibilityState={{ disabled: !canSubmit }} disabled={!canSubmit} onPress={submit} style={({ pressed }) => [styles.post, !canSubmit && styles.postOff, pressed && canSubmit && { opacity: 0.85 }]}>
            <Text style={[styles.postText, !canSubmit && styles.postTextOff]}>Post</Text>
            <Ionicons name="arrow-forward" size={16} color={canSubmit ? colors.brandInk : colors.textFaint} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
    </Reanimated.View>
    </Reanimated.View>
    {/* The box it grew from, fading as the page opens out of it. */}
    {hero && startRect ? (
      <Reanimated.View ref={ghostRef} pointerEvents="none" style={[styles.ghost, { left: startRect.x, top: startRect.y, width: startRect.w, height: startRect.h }, ghost]}>
        <Text style={styles.ghostText}>Your question</Text>
      </Reanimated.View>
    ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { paddingBottom: spacing.xxl },
  ghost: { position: 'absolute', justifyContent: 'center', paddingLeft: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  ghostText: { ...typography.body, fontSize: 16, color: colors.textFaint },
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  topicsWrap: { flexGrow: 0 },
  topics: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  topic: { height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  topicOn: { backgroundColor: colors.text, borderColor: colors.text },
  topicText: { ...typography.smallStrong, color: colors.text },
  topicTextOn: { color: colors.bg },
  // One sheet of paper: the question in large type, hairlines between the parts.
  sheet: { marginHorizontal: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  question: { ...typography.title, color: colors.text, paddingVertical: spacing.md, lineHeight: 30 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  detail: { ...typography.body, color: colors.text, lineHeight: 23, minHeight: 150, paddingVertical: spacing.md },
  footage: { paddingVertical: spacing.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 14 },
  addText: { ...typography.bodyStrong, color: colors.text },
  addNote: { ...typography.small, color: colors.textFaint, marginLeft: 'auto' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  footNote: { ...typography.small, color: colors.textFaint, flex: 1, lineHeight: 18 },
  post: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.brand },
  postOff: { backgroundColor: colors.surfaceAlt },
  postText: { ...typography.bodyStrong, color: colors.brandInk },
  postTextOff: { color: colors.textFaint },
});
