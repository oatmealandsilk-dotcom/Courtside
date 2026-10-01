import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
  /** A short question, the way other apps ask it: "Delete post?" */
  title: string;
  /** One line on what happens next: "This can't be undone." */
  message?: string;
  /** The action's own word on its button ("Delete", "Block"), never "OK". */
  confirmLabel: string;
  /** Red, for something that removes, cuts someone off or cannot be taken back. */
  destructive?: boolean;
  /** Runs only on yes. Cancel, a tap outside or Escape does nothing. */
  onConfirm: () => void | Promise<void>;
}

type Show = (request: ConfirmOptions) => void;
let host: Show | null = null;

/** The in-app dialog registers itself here (see ConfirmHost); only the browser uses it. */
export function setConfirmHost(show: Show | null) {
  host = show;
}

/**
 * "Are you sure?" for one tap that would otherwise be final, asked the way
 * every other app asks it: a short question, one line on what happens, Cancel
 * and the action. On a phone it is the phone's own alert, with the action in
 * red when it deletes or cuts someone off. In a browser it is the app's own
 * small card over a dimmed page, because the browser's built-in box is grey,
 * titled with the site's address and can only say "OK".
 */
export function confirm(options: ConfirmOptions) {
  const yes = () => { void options.onConfirm(); };
  if (Platform.OS === 'web') {
    if (host) host(options);
    // Only if the root layout has not drawn the dialog (yet), so a question is never silently dropped.
    else if (window.confirm(options.message ? `${options.title}\n${options.message}` : options.title)) yes();
    return;
  }
  Alert.alert(
    options.title,
    options.message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: options.confirmLabel, style: options.destructive ? 'destructive' : 'default', onPress: yes },
    ],
    // Android: a tap outside the alert counts as Cancel, as it does everywhere else.
    { cancelable: true },
  );
}

/**
 * How long a menu takes to leave the screen. A question asked from a menu
 * waits this long on a phone, so the menu is gone before the alert arrives
 * instead of fading out underneath it, the way iPhone apps sequence the two.
 */
const MENU_GONE_MS = 350;

/**
 * Runs something chosen in a menu that closes in the same tap (opening a
 * sheet, asking a question) once the menu has gone. On a phone a new screen
 * presented while the menu is still fading out can fail to appear; a browser
 * has nothing to wait for.
 */
export function afterMenu(run: () => void) {
  if (Platform.OS === 'web') run();
  else setTimeout(run, MENU_GONE_MS);
}

/** `confirm`, for a choice made in a menu that closes in the same tap. */
export function confirmAfterMenu(options: ConfirmOptions) {
  afterMenu(() => confirm(options));
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

/** Blocking, asked the same way from a post's menu and from a profile. Unblocking needs no question. */
export function confirmBlock(user: { handle: string }, block: () => void, fromMenu = false) {
  (fromMenu ? confirmAfterMenu : confirm)({
    title: `Block @${user.handle}?`,
    message: "They won't see your posts or be able to message you. You can unblock them any time.",
    confirmLabel: 'Block',
    destructive: true,
    onConfirm: block,
  });
}

/** Older form of `confirm` for deleting: "Delete this post?" with a red Delete. */
export function confirmDelete(onYes: () => void, what = 'this post') {
  confirm({ title: `Delete ${what}?`, message: "This can't be undone.", confirmLabel: 'Delete', destructive: true, onConfirm: onYes });
}

/** Older form of `confirm`, kept so any caller still using it gets the same dialog. */
export function confirmAction(title: string, body: string, yes: string, onYes: () => void) {
  confirm({ title, message: body, confirmLabel: yes, onConfirm: onYes });
}
