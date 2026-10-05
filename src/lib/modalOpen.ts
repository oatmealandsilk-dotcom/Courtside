import { useEffect } from 'react';
import { Platform } from 'react-native';

/*
 * How many React Native Modals are open right now, on Android (Oct 5).
 *
 * On Android each Modal is a window of its own, drawn above the app, and the
 * app's in-app message banner is part of the app: a message that arrived
 * while a confirm card, a full-screen photo or video, a post's menu or a chat
 * sheet was open was drawn under it, never seen, and the phone's own alert
 * had been held back for it. While a Modal is open the banner stands aside
 * and the phone's own alert shows instead (MessageBanner). On an iPhone the
 * banner sits above Modals, so nothing counts there.
 */
let open = 0;

export function anyModalOpen(): boolean {
  return open > 0;
}

/** Counts this Modal as open while `visible` (Android only). */
export function useModalOpenWhile(visible: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return undefined;
    open += 1;
    return () => { open = Math.max(0, open - 1); };
  }, [visible]);
}
