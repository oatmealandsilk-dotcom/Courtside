import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export interface ConfirmOptions {
  /**
   * A short question, the way other apps ask it: "Delete post?" Empty for a
   * plain list of choices with nothing over them (Delete, Report, Cancel on a
   * comment held under your own post): each choice then asks its own question.
   */
  title: string;
  /** What a screen reader calls the card when it has no title ("Mira's comment"). */
  spoken?: string;
  /** One line on what happens next: "This can't be undone." */
  message?: string;
  /** The action's own word on its button ("Delete", "Block"), never "OK". */
  confirmLabel: string;
  /** Red, for something that removes, cuts someone off or cannot be taken back. */
  destructive?: boolean;
  /** Runs only on yes. Cancel, a tap outside, Escape or Android's back does nothing. */
  onConfirm: () => void | Promise<void>;
  /**
   * A second way to say yes, on its own row under the first ("Remove tag and
   * my session" under "Remove tag"). Rare: most questions have one answer.
   */
  also?: { label: string; destructive?: boolean; onPress: () => void | Promise<void> };
}

/** The card's two doors: a question to ask, and one to take back unanswered (see withdrawConfirm). */
export interface ConfirmHostApi {
  show: (request: ConfirmOptions) => void;
  withdraw: (request: ConfirmOptions) => void;
}
let host: ConfirmHostApi | null = null;
/** Questions asked before the card was drawn (the first frames of a launch), in the order they came. */
const waiting: ConfirmOptions[] = [];

/** The card registers itself here (see ConfirmHost), on a phone and in a browser alike. */
export function setConfirmHost(next: ConfirmHostApi | null) {
  host = next;
  // Anything asked before it was ready is asked now, so a question is never dropped.
  if (next) waiting.splice(0).forEach(next.show);
}

/**
 * Takes a question back unanswered, as Cancel would: the screen that asked
 * it has gone (a menu closed by the browser's Back, a viewer that closed
 * itself), and "Delete post?" must not stay up over the page beneath and
 * still delete. Nothing happens if it was already answered.
 */
export function withdrawConfirm(options: ConfirmOptions) {
  const at = waiting.indexOf(options);
  if (at >= 0) waiting.splice(at, 1);
  host?.withdraw(options);
}

/**
 * "Are you sure?" for one tap that would otherwise be final, asked the way
 * Instagram and TikTok ask it: the app's own small card over a dimmed
 * screen, with a short question, one muted line, the action's own word and
 * then Cancel. It is the same card on a phone and in a browser, in every
 * court's colours. The phone's grey system alert is left to what only the
 * phone can ask (the camera, the microphone, photos, location and so on).
 */
export function confirm(options: ConfirmOptions) {
  if (host) host.show(options);
  else waiting.push(options);
}

/**
 * `confirm` for a screen that may go away while its question is up (a menu,
 * a sheet, a viewer): whatever it asked and is still waiting for an answer
 * is taken back when it unmounts (withdrawConfirm).
 */
export function useScopedConfirm(): (options: ConfirmOptions) => void {
  const asked = useRef(new Set<ConfirmOptions>());
  useEffect(() => {
    const open = asked.current;
    return () => { open.forEach(withdrawConfirm); open.clear(); };
  }, []);
  return useCallback((options: ConfirmOptions) => {
    asked.current.add(options);
    confirm(options);
  }, []);
}

/**
 * How long a menu takes to leave the screen. Anything a menu opens that is
 * the phone's own (a new page sliding up) waits this long on a phone, so the
 * menu is gone before it arrives.
 */
const MENU_GONE_MS = 350;

/**
 * Runs something chosen in a menu that closes in the same tap (opening a
 * sheet) once the menu has gone. On a phone a new screen presented while the
 * menu is still fading out can fail to appear; a browser has nothing to wait for.
 */
export function afterMenu(run: () => void) {
  if (Platform.OS === 'web') run();
  else setTimeout(run, MENU_GONE_MS);
}

// Whether VoiceOver or TalkBack is on, kept current (see confirmAfterMenu).
let screenReader = false;
if (Platform.OS !== 'web') {
  try {
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => { screenReader = on; }).catch(() => undefined);
    AccessibilityInfo.addEventListener('screenReaderChanged', (on: boolean) => { screenReader = on; });
  } catch {
    // A phone that cannot say: questions from menus simply come straight away.
  }
}

/**
 * `confirm`, for a choice made in a menu that closes in the same tap. The
 * card is drawn above everything, a menu still fading out included, so it
 * comes at once and the two cross over, the way Instagram's do. With
 * VoiceOver or TalkBack on it waits for the menu to finish going: a closing
 * menu hands the reader back to the page beneath, which would pull it off
 * the question.
 */
export function confirmAfterMenu(options: ConfirmOptions) {
  if (screenReader) afterMenu(() => confirm(options));
  else confirm(options);
}

/**
 * Unfollowing a private account shuts its posts away again until they say
 * yes to a new request, so that one asks first. Unfollowing a public account
 * is one tap, the way Instagram does it: following again is one tap too.
 */
export function confirmUnfollow(user: { handle: string; isPrivate?: boolean }, unfollow: () => void, fromMenu = false) {
  if (!user.isPrivate) { unfollow(); return; }
  (fromMenu ? confirmAfterMenu : confirm)({
    title: `Unfollow @${user.handle}?`,
    message: "Their account is private, so you'll have to ask again to see their posts.",
    confirmLabel: 'Unfollow',
    destructive: true,
    onConfirm: unfollow,
  });
}

/** The blocking question itself, for a screen that asks it through useScopedConfirm. */
export function blockQuestion(user: { handle: string }, block: () => void): ConfirmOptions {
  return {
    title: `Block @${user.handle}?`,
    message: "They won't see your posts or be able to message you. You can unblock them any time.",
    confirmLabel: 'Block',
    destructive: true,
    onConfirm: block,
  };
}

/** Blocking, asked the same way from a post's menu and from a profile. Unblocking needs no question. */
export function confirmBlock(user: { handle: string }, block: () => void, fromMenu = false) {
  (fromMenu ? confirmAfterMenu : confirm)(blockQuestion(user, block));
}

/** Older form of `confirm` for deleting: "Delete this post?" with a red Delete. */
export function confirmDelete(onYes: () => void, what = 'this post') {
  confirm({ title: `Delete ${what}?`, message: "This can't be undone.", confirmLabel: 'Delete', destructive: true, onConfirm: onYes });
}

/** Older form of `confirm`, kept so any caller still using it gets the same dialog. */
export function confirmAction(title: string, body: string, yes: string, onYes: () => void) {
  confirm({ title, message: body, confirmLabel: yes, onConfirm: onYes });
}

/**
 * Reporting one thing (a thread, a reply, a comment, a message), asked the
 * same way everywhere: who sees it and that the author is not told. `report`
 * runs on yes; the caller says thanks (a toast) after it.
 */
export function confirmReport(what: string, report: () => void, fromMenu = false) {
  (fromMenu ? confirmAfterMenu : confirm)(reportQuestion(what, report));
}

/** The reporting question itself, for a screen that asks it through useScopedConfirm. */
export function reportQuestion(what: string, report: () => void): ConfirmOptions {
  return {
    title: `Report this ${what}?`,
    message: 'A person at CourtSide will look at it. Whoever wrote it isn’t told it was you.',
    confirmLabel: 'Report',
    destructive: true,
    onConfirm: report,
  };
}

/** What every report says once it is in: the same words after a post, an Instant or a comment. */
export const REPORT_THANKS = 'Thanks — a person will review this.';
