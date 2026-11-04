import React, { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import Animated, { Easing, Extrapolation, FadeIn, FadeOut, interpolate, interpolateColor, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { DragSheet, type SheetCloseHow } from '@/components/DragSheet';
import { OfficialCheck } from '@/components/OfficialCheck';
import { topicMeta } from '@/components/QuestionCard';
import { Avatar, Field } from '@/components/ui';
import { HeightGlide } from '@/components/ui/HeightGlide';
import { TextBox } from '@/components/ui/TextBox';
import type { Question, User } from '@/data/types';
import { clearUnsentEdit, peekUnsentEdit } from '@/features/community/unsentEdit';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { useScopedConfirm } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import * as haptics from '@/lib/haptics';
import { KeyboardScrollContext, afterKeyboard, visibleAboveKeyboard, type Measurable } from '@/lib/keyboardScroll';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { buttonShape, colors, pageIsDark, spacing, typography } from '@/theme';
import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import { TextScale, oneLine } from '@/theme/textScale';
import { useThemedStyles } from '@/theme/ThemeProvider';

/** The most a question holds (what the database keeps), and when the count of what is left starts showing. */
const TITLE_MAX = 300;
const COUNT_FROM = 250;
/** The app's own ease (DragSheet, HeightGlide): quick off the mark, soft at the end. */
const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** A pressed Save comes back on a quick, barely springy spring, as the app's buttons do (Tappable). */
const PRESS_BACK = { damping: 20, stiffness: 520, mass: 0.7 } as const;
/** How far above the keyboard the line being typed is kept. */
const CLEARANCE = 24;
const WEB = Platform.OS === 'web';

type Which = 'title' | 'details';
type Box = (TextInput & Measurable) | null;
interface Words { title: string; body: string }

/** The caret to the end of a box's words (a phone's text box, or the browser's own). */
function caretToEnd(box: Box, length: number) {
  if (!box) return;
  if (WEB) {
    (box as unknown as { setSelectionRange?: (a: number, b: number) => void }).setSelectionRange?.(length, length);
    return;
  }
  box.setSelection?.(length, length);
}

/**
 * A browser: runs `work` once the Escape key that asked for it is let go. The
 * question card is drawn in the browser's pop-up layer, which closes itself
 * when Escape comes up, so a card asked on the key going down was gone again
 * as the key came up. Asked a moment after the key is up instead (at most
 * 600 ms, should the key be held).
 */
function afterEscapeUp(work: () => void) {
  if (typeof document === 'undefined') { work(); return; }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    document.removeEventListener('keyup', up, true);
    clearTimeout(late);
    setTimeout(work, 0);
  };
  const up = (e: KeyboardEvent) => { if (e.key === 'Escape') go(); };
  document.addEventListener('keyup', up, true);
  const late = setTimeout(go, 600);
}

/** A browser's text box as tall as its words (a phone's grows by itself). */
function fitToWords(box: Box) {
  const node = box as unknown as { style?: CSSStyleDeclaration; scrollHeight?: number } | null;
  if (!node?.style || node.scrollHeight === undefined) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}

/**
 * Editing your own thread (Nov 4, owner, of the old sheet: "Should be easier
 * to go edit this, maybe make the thing open to larger box to edit when you
 * type, also this screen has to be a lot better ui, also it needs to be way
 * better animations and feeling and smooth").
 *
 * It opens all the way up in one move, the keyboard rising with it and the
 * caret already at the end of your question. Cancel · Edit thread · Save sit
 * at the top, so Save is always in reach above the keys. The question is in
 * the thread page's own title type with no box around it and wraps as you
 * type, each new line opening smoothly (never running sideways); the details
 * sit under it in the thread's body type, and the empty space below them is
 * the details box too. The line being typed stays above the keyboard.
 *
 * Save wakes (grey to the court's colour) only once something changed.
 * Saving takes the sheet and the keyboard down together, and the new words
 * land on the thread as it is uncovered, with a soft tap. Closing with
 * changes (Cancel, a drag down, a tap above, Back, Escape) asks first.
 *
 * The words live in the editor inside (ThreadEditor), so a keystroke redraws
 * only it, never the sheet, its drag or its header.
 */
export function EditThreadSheet({ id }: { id: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { questions, users, currentUserId, ready, actions } = useApp();
  const question = questions.find((q) => q.id === id);
  const mine = !!question && question.authorId === currentUserId;
  const asker = users.find((u) => u.id === question?.authorId);

  // An edit that didn't save comes back already typed (its toast's "Edit again").
  const [kept] = useState(() => peekUnsentEdit(id));
  useEffect(() => { clearUnsentEdit(id); }, [id]);
  // Opened before the thread had loaded (a reload, a link): the editor starts
  // once it arrives, and Save stays asleep until then, so saving can never
  // write a blank question over the real one.
  const [filled, setFilled] = useState(!!question);
  useEffect(() => { if (!filled && question) setFilled(true); }, [filled, question]);
  // Not here yet: asked for once the app is up; until the answer, a spinner, never "not yours".
  const [looked, setLooked] = useState(false);
  const here = !!question;
  useEffect(() => {
    if (!ready || here || looked || !id) return undefined;
    let on = true;
    void actions.loadThread(id).catch(() => undefined).finally(() => { if (on) setLooked(true); });
    return () => { on = false; };
  }, [ready, here, looked, id, actions]);
  const editing = filled && mine && !!question;

  const editor = useRef<EditorHandle>(null);
  // Whether anything anyone would see has changed, and whether the question is long enough: said by the editor as it changes.
  const status = useRef({ dirty: false, longEnough: true });
  const [awake, setAwake] = useState(false);
  const onStatus = useCallback((dirty: boolean, longEnough: boolean) => {
    status.current = { dirty, longEnough };
    setAwake(dirty && longEnough);
  }, []);
  // What went wrong with the last Save, said in one line under the header; gone at the next change.
  const [problem, setProblem] = useState<'short' | 'refused' | null>(null);
  const problemNow = useRef(problem);
  problemNow.current = problem;
  const onEdited = useCallback(() => { if (problemNow.current) setProblem(null); }, []);

  /* ---------------------------------------------------- the keyboard and the page */
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  // The hairline under the header shows only once the words scroll under it.
  const hairStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 8], [0, 1], Extrapolation.CLAMP) }));
  /**
   * Brings a box above the keyboard (Field asks on focus; the editor asks as
   * a box grows). The page scrolls just far enough, in UIKit's own animation.
   * A box whose caret is at its end shows its last line; any other keeps its
   * top in sight, where the line you tapped is.
   */
  const reveal = useCallback((node: Measurable | null) => {
    if (WEB || !node?.measureInWindow) return;
    afterKeyboard(() => {
      const view = scroller.current as unknown as Measurable | null;
      view?.measureInWindow?.((_sx, top, _sw, height) => {
        node.measureInWindow?.((_x, y, _w, h) => {
          const bottom = Math.min(top + height, visibleAboveKeyboard()) - CLEARANCE;
          const overflow = y + h - bottom;
          if (overflow <= 0) return;
          const by = editor.current?.caretAtEnd(node) ? overflow : Math.min(overflow, Math.max(0, y - (top + spacing.sm)));
          if (by > 0) scroller.current?.scrollTo({ y: scrollY.value + by, animated: true });
        });
      });
    });
  }, [scroller, scrollY]);

  /* ---------------------------------------------------- closing and saving */
  const [closeSignal, setCloseSignal] = useState(0);
  const close = useCallback(() => setCloseSignal((n) => n + 1), []);
  // The words on their way to the thread once the sheet is down.
  const pending = useRef<Words | null>(null);
  const ask = useScopedConfirm();
  const mayClose = (how?: SheetCloseHow): boolean => {
    if (!status.current.dirty || pending.current) return true;
    const askNow = () => ask({
      title: 'Discard your changes?',
      message: 'Your thread stays as it was.',
      confirmLabel: 'Discard',
      destructive: true,
      cancelLabel: 'Keep editing',
      onConfirm: close,
      // The caret goes back where it was, and the keyboard with it.
      onCancel: () => setTimeout(() => editor.current?.focusLast(), 60),
    });
    if (WEB && how === 'escape') afterEscapeUp(askNow);
    else askNow();
    return false;
  };
  // A quick second tap on Save would check twice.
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const save = () => {
    if (busy.current || pending.current || !editing) return;
    const { dirty, longEnough } = status.current;
    // Asleep because the question is too short (cleared, say): said, with the phone's "no". Nothing changed: nothing to do.
    if (!longEnough) { haptics.reject(); setProblem('short'); return; }
    const typed = editor.current?.words();
    if (!dirty || !typed) return;
    const words = { title: typed.title.trim(), body: typed.body.trim() };
    busy.current = true;
    setChecking(true);
    // Words CourtSide refuses (migration 117) are said here, and the sheet stays open with what you wrote.
    void actions.wordsRefused([words.title, words.body]).then((refused) => {
      busy.current = false;
      setChecking(false);
      if (refused) { haptics.reject(); setProblem('refused'); return; }
      pending.current = words;
      close();
    });
  };
  // Down: the new words go onto the thread now, as it is uncovered (editQuestion's soft tap with them), then the page leaves.
  const landed = () => {
    const words = pending.current;
    if (words) actions.editQuestion(id, words);
    router.back();
  };
  // The header's buttons always run the latest of these, so the header itself is drawn again only when Save wakes or sleeps.
  const latest = useRef({ save, mayClose, close });
  latest.current = { save, mayClose, close };
  const onCancel = useCallback(() => { if (latest.current.mayClose()) latest.current.close(); }, []);
  const onSave = useCallback(() => latest.current.save(), []);
  // A computer: Cmd/Ctrl+Enter in either box saves.
  useEffect(() => {
    if (!WEB || typeof document === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || !editor.current?.owns(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current.save();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const header = useMemo(() => (
    <View style={styles.head}>
      <View pointerEvents="none" style={styles.headTitle}>
        <Text accessibilityRole="header" {...oneLine(TextScale.TITLE)} style={styles.heading}>Edit thread</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={10} onPress={onCancel} style={({ pressed }) => pressed && styles.pressed}>
        <Text {...oneLine(TextScale.TITLE)} style={styles.cancel}>Cancel</Text>
      </Pressable>
      {editing ? <SavePill awake={awake} busy={checking} onPress={onSave} /> : null}
    </View>
  ), [styles, editing, awake, checking, onCancel, onSave]);

  return (
    <DragSheet
      fitContent
      slideOpen
      peekFraction={1}
      closeSignal={closeSignal}
      beforeClose={(how) => latest.current.mayClose(how)}
      onDismissed={landed}
      header={header}
    >
      <KeyboardScrollContext.Provider value={reveal}>
        <View style={styles.body}>
          <HeightGlide duration={200}>
            {problem ? (
              <Animated.Text entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} maxFontSizeMultiplier={TextScale.CARD} style={styles.problem} accessibilityLiveRegion="polite">
                {problem === 'short' ? 'Write your question first.' : 'Some words break CourtSide’s rules. Change them and save again.'}
              </Animated.Text>
            ) : null}
          </HeightGlide>
          <View style={styles.page}>
            <Animated.ScrollView
              ref={scroller}
              style={styles.scroll}
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps="handled"
              // Drag the words down to tuck the keyboard away, the way Messages does.
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
              // The sheet already ends at the keyboard (DragSheet), frame by frame.
              automaticallyAdjustKeyboardInsets={false}
              scrollEventThrottle={16}
              onScroll={onScroll}
            >
              {!filled ? (
                looked
                  ? <Text style={styles.note}>This thread isn’t available. It may have been deleted.</Text>
                  : <View style={styles.wait}><CourtSpinner size={26} /></View>
              ) : !editing || !question ? (
                <Text style={styles.note}>Only the person who posted this can change it.</Text>
              ) : (
                <ThreadEditor
                  ref={editor}
                  question={question}
                  asker={asker}
                  start={kept ?? { title: question.title, body: question.body ?? '' }}
                  onStatus={onStatus}
                  onEdited={onEdited}
                />
              )}
            </Animated.ScrollView>
            <Animated.View pointerEvents="none" style={[styles.hairline, hairStyle]} />
          </View>
        </View>
      </KeyboardScrollContext.Provider>
    </DragSheet>
  );
}

interface EditorHandle {
  /** What is typed now. */
  words: () => Words;
  /** The caret back in the box that last had it. */
  focusLast: () => void;
  /** Whether `node` is one of the boxes with its caret at the end of its words. */
  caretAtEnd: (node: unknown) => boolean;
  /** Whether a key landed in one of the boxes (a computer's Cmd+Enter). */
  owns: (target: unknown) => boolean;
}

/**
 * Who asked, the question and the details: the words themselves, held here.
 * Tells the sheet when Save should wake (onStatus) and when anything was
 * typed (onEdited, which clears a problem line).
 */
const ThreadEditor = forwardRef<EditorHandle, {
  question: Question;
  asker: User | undefined;
  start: Words;
  onStatus: (dirty: boolean, longEnough: boolean) => void;
  onEdited: () => void;
}>(function ThreadEditor({ question, asker, start, onStatus, onEdited }, ref) {
  const styles = useThemedStyles(styleDefinitions);
  const reveal = useContext(KeyboardScrollContext);
  const [title, setTitle] = useState(start.title);
  const [body, setBody] = useState(start.body);

  const dirty = title.trim() !== question.title.trim() || body.trim() !== (question.body ?? '').trim();
  const longEnough = title.trim().length >= 3;
  useEffect(() => { onStatus(dirty, longEnough); }, [dirty, longEnough, onStatus]);

  const titleRef = useRef<TextInput>(null);
  const detailsRef = useRef<TextInput>(null);
  const box = (which: Which) => (which === 'title' ? titleRef : detailsRef).current as Box;
  // Which box has the caret (null: neither), the last one that had it, and whether its caret is at the end of its words.
  const focused = useRef<Which | null>(null);
  const lastField = useRef<Which>('title');
  const atEnd = useRef({ title: true, details: true });
  const lengths = useRef({ title: title.length, details: body.length });
  lengths.current = { title: title.length, details: body.length };
  const words = useRef<Words>({ title, body });
  words.current = { title, body };

  const focusAtEnd = (which: Which) => {
    const target = box(which);
    if (!target) return;
    atEnd.current[which] = true;
    target.focus();
    requestAnimationFrame(() => caretToEnd(box(which), lengths.current[which]));
  };
  useImperativeHandle(ref, () => ({
    words: () => words.current,
    focusLast: () => box(lastField.current)?.focus(),
    caretAtEnd: (node) => (node === titleRef.current ? atEnd.current.title : node === detailsRef.current ? atEnd.current.details : false),
    owns: (target) => !!target && (target === titleRef.current || target === detailsRef.current),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grown by a line while you type at its end: that line is kept above the keys. Typing in the middle never moves the page.
  const followCaret = (which: Which) => {
    if (focused.current === which && atEnd.current[which]) reveal?.(box(which));
  };

  // The question opens with the caret at the end of it (a phone's keyboard rises with the sheet; a computer's box is just ready).
  // A browser on a phone shows no keyboard without a tap, so there it waits for one.
  const autoFocus = !WEB || isDesktopBrowser();
  // The first focus is that one: the caret goes to the end of the question.
  const placed = useRef(!autoFocus);
  const firstFocus = () => {
    if (placed.current) return;
    placed.current = true;
    requestAnimationFrame(() => caretToEnd(box('title'), lengths.current.title));
  };
  // A computer: the menu that opened this hands the focus back to the page behind as it closes; for that
  // first moment the focus is brought back to the question (only from outside the box: a click inside is yours).
  useEffect(() => {
    if (!WEB || !autoFocus || typeof document === 'undefined') return undefined;
    const put = () => box('title')?.focus();
    const outside = (target: EventTarget | null) => !(target as Element | null)?.closest?.('[role="dialog"],[role="alertdialog"]');
    const onFocusIn = (e: FocusEvent) => { if (outside(e.target)) put(); };
    document.addEventListener('focusin', onFocusIn, true);
    const first = setTimeout(() => { if (outside(document.activeElement)) put(); }, 30);
    const stop = setTimeout(() => document.removeEventListener('focusin', onFocusIn, true), 1200);
    return () => { clearTimeout(first); clearTimeout(stop); document.removeEventListener('focusin', onFocusIn, true); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A browser's boxes grow with their words, as a phone's do.
  useLayoutEffect(() => {
    if (!WEB) return undefined;
    const fit = () => { fitToWords(box('title')); fitToWords(box('details')); };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [title, body]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTitle = (text: string) => {
    // A pasted line break becomes a space: a question is one paragraph.
    setTitle(text.replace(/\s*[\r\n]+\s*/g, ' '));
    onEdited();
  };
  const onBody = useCallback((text: string) => { setBody(text); onEdited(); }, [onEdited]);
  // Ten left: said once to a screen reader (the count turns red then).
  const told = useRef(false);
  useEffect(() => {
    const left = TITLE_MAX - title.length;
    if (left > 10) { told.current = false; return; }
    if (told.current) return;
    told.current = true;
    AccessibilityInfo.announceForAccessibility(`${left} characters left`);
  }, [title.length]);

  const keyboardAppearance = pageIsDark() ? 'dark' : 'light';
  const count = title.length;
  const meta = topicMeta(question.topic);
  const details = useMemo(() => ({
    onFocus: () => { focused.current = 'details'; lastField.current = 'details'; },
    onBlur: () => { if (focused.current === 'details') focused.current = null; },
    onSelectionChange: (s: { start: number; end: number }) => { atEnd.current.details = s.end >= lengths.current.details; },
    onGrow: () => { if (focused.current === 'details' && atEnd.current.details) reveal?.(detailsRef.current as Box); },
  }), [reveal]);

  return (
    <>
      {/* Who asked, as the thread shows it: you are editing that, not a form. */}
      <View style={styles.asker} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Avatar name={asker?.name ?? '?'} seed={asker?.avatarSeed ?? question.authorId} uri={asker?.avatarUrl} size={32} />
        <View style={styles.askerWords}>
          <View style={styles.askerNameLine}>
            <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.askerName}>{asker?.name ?? 'You'}</Text>
            <OfficialCheck userId={asker?.id} size={13} />
          </View>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faint}>{asker ? `@${asker.handle} · ` : ''}{relativeTime(question.createdAt)}</Text>
        </View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.faint}>{meta.label}</Text>
      </View>
      {/* The question, in the thread's own title type: it wraps as you type, each new line opening over a moment.
          Room above and below inside the glide, so a selection's handles on the first or last line are never cut off. */}
      <HeightGlide duration={160} style={styles.glideRoom}>
        <View style={styles.titleRoom}>
          <TextBox
            ref={titleRef}
            value={title}
            onChangeText={onTitle}
            multiline
            scrollEnabled={false}
            autoFocus={autoFocus}
            {...(WEB ? ({ blurOnSubmit: true, rows: 1 } as object) : { submitBehavior: 'submit' as const })}
            returnKeyType="next"
            // Return in the question: on to the details, never a new line.
            onSubmitEditing={() => setTimeout(() => focusAtEnd('details'), 0)}
            maxLength={TITLE_MAX}
            placeholder="Your question"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.brand}
            cursorColor={colors.brand}
            keyboardAppearance={keyboardAppearance}
            autoCapitalize="sentences"
            // The thread page's own cap for its title.
            maxFontSizeMultiplier={TextScale.CARD}
            accessibilityLabel="Your question"
            onFocus={() => { focused.current = 'title'; lastField.current = 'title'; firstFocus(); reveal?.(box('title')); }}
            onBlur={() => { if (focused.current === 'title') focused.current = null; }}
            onSelectionChange={(e) => { atEnd.current.title = e.nativeEvent.selection.end >= lengths.current.title; }}
            onContentSizeChange={() => followCaret('title')}
            style={styles.titleInput}
          />
          {count >= COUNT_FROM ? (
            <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.count, count >= TITLE_MAX - 10 && styles.countLow]}>{TITLE_MAX - count} left</Text>
          ) : null}
        </View>
      </HeightGlide>
      <Details value={body} onChange={onBody} boxRef={detailsRef} keyboardAppearance={keyboardAppearance} hooks={details} />
      {/* The rest of the sheet is the details box too: a tap puts the caret at the end of them. */}
      <Pressable style={styles.canvas} onPress={() => focusAtEnd('details')} accessible={false} importantForAccessibility="no" />
    </>
  );
});

/** The details, in the thread's body type; drawn again only when they change, not as the question is typed. */
const Details = React.memo(function Details({ value, onChange, boxRef, keyboardAppearance, hooks }: {
  value: string;
  onChange: (text: string) => void;
  boxRef: React.RefObject<TextInput | null>;
  keyboardAppearance: 'light' | 'dark';
  hooks: { onFocus: () => void; onBlur: () => void; onSelectionChange: (s: { start: number; end: number }) => void; onGrow: () => void };
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View onLayout={hooks.onGrow}>
      <Field
        bare
        multiline
        mentions
        inputRef={boxRef}
        value={value}
        onChangeText={onChange}
        placeholder="Add details (optional)"
        accessibilityLabel="Details"
        minHeight={22}
        maxLength={10000}
        selectionColor={colors.brand}
        keyboardAppearance={keyboardAppearance}
        inputStyle={styles.detailsInput}
        onFocus={hooks.onFocus}
        onBlur={hooks.onBlur}
        onSelectionChange={hooks.onSelectionChange}
      />
    </View>
  );
});

/**
 * Save, at the top right: grey and quiet until something changed, then the
 * court's colour, eased over a moment (colour, never see-through). Presses in
 * a touch; while the words are checked a small spinner takes the word's
 * place, only if the check is slow enough to notice.
 */
function SavePill({ awake, busy, onPress }: { awake: boolean; busy: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduce = useReducedMotion();
  const on = useSharedValue(awake ? 1 : 0);
  useEffect(() => {
    on.value = reduce ? (awake ? 1 : 0) : withTiming(awake ? 1 : 0, { duration: 180, easing: CURVE });
  }, [awake, reduce, on]);
  // The court's colours, read as it draws (they change with the theme).
  const asleep = colors.surfaceAlt;
  const fill = colors.brand;
  const asleepInk = colors.textFaint;
  const ink = colors.brandInk;
  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [asleep, fill]),
    shadowOpacity: 0.1 * on.value,
  }));
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [asleepInk, ink]) }));
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // The spinner only after 150 ms, so a quick check never flashes it; the pill keeps its width meanwhile.
  const [spin, setSpin] = useState(false);
  useEffect(() => {
    if (!busy) { setSpin(false); return undefined; }
    const t = setTimeout(() => setSpin(true), 150);
    return () => clearTimeout(t);
  }, [busy]);
  const width = useRef(0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save"
      accessibilityState={{ disabled: !awake, busy }}
      hitSlop={buttonShape.smallSlop + 5}
      onPress={onPress}
      onPressIn={() => { if (awake && !busy) scale.value = withTiming(PRESS_SHRINK, { duration: 60, easing: CURVE }); }}
      onPressOut={() => { scale.value = withSpring(1, PRESS_BACK); }}
      style={styles.pillSpot}
    >
      <Animated.View
        onLayout={(e) => { if (!spin) width.current = e.nativeEvent.layout.width; }}
        style={[styles.pill, spin && width.current ? { width: width.current } : null, pillStyle, pressStyle]}
      >
        {spin
          ? <CourtSpinner size={15} ink={colors.brandInk} />
          : <Animated.Text {...oneLine(TextScale.TITLE, 0.8)} style={[styles.pillLabel, labelStyle]}>Save</Animated.Text>}
      </Animated.View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: 4 },
  // Centred on the whole row whatever the two sides measure, clear of them at any text size.
  headTitle: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 96 },
  heading: { ...typography.heading, color: colors.text, textAlign: 'center' },
  cancel: { ...typography.body, fontSize: 16, color: colors.textMuted },
  pressed: { opacity: PRESS_DIM },
  pillSpot: { marginLeft: 'auto' },
  pill: {
    minHeight: buttonShape.smallHeight,
    minWidth: 66,
    paddingHorizontal: spacing.lg,
    borderRadius: buttonShape.smallRadius,
    ...buttonShape.curve,
    alignItems: 'center',
    justifyContent: 'center',
    // The app's small plain shadow under its filled buttons (fillMode), only once Save is awake.
    shadowColor: '#000000',
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0,
  },
  pillLabel: { ...typography.smallStrong, fontSize: buttonShape.smallLabel },
  body: { flex: 1, minHeight: 0 },
  problem: { ...typography.small, lineHeight: 18, color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: 6 },
  page: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  form: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  asker: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  askerWords: { flex: 1 },
  askerNameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  askerName: { ...typography.smallStrong, fontSize: 14, color: colors.text, flexShrink: 1 },
  faint: { ...typography.small, color: colors.textFaint },
  glideRoom: { marginVertical: -12 },
  titleRoom: { paddingVertical: 12 },
  // The thread page's title, word for word (app/question/[id].tsx): no box, no fill.
  titleInput: {
    ...typography.title,
    lineHeight: 28,
    color: colors.text,
    padding: 0,
    margin: 0,
    minHeight: 28,
    textAlignVertical: 'top',
    ...(WEB ? ({ outlineStyle: 'none', overflow: 'hidden', resize: 'none' } as object) : {}),
  },
  count: { ...typography.small, color: colors.textFaint, textAlign: 'right', marginTop: 4 },
  countLow: { color: colors.danger },
  // The thread page's body: 15 on 22, muted.
  detailsInput: { ...typography.body, lineHeight: 22, color: colors.textMuted, paddingVertical: 0, minHeight: 22 },
  canvas: { flexGrow: 1, minHeight: isDesktopBrowser() ? 160 : 88 },
  note: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.lg },
  wait: { paddingVertical: spacing.xl, alignItems: 'center' },
});
