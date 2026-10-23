import { Platform } from 'react-native';

/** Device identity stays independent of window size and portrait layout. */
export function isDesktopBrowser() {
  // The phone app is never a computer. React Native gives it a bare
  // `navigator` with no userAgent, which the browser test below read as a
  // desktop: since Sep 27 that took pull-to-refresh off Home, Profile,
  // Community, Coaching, Notifications and Messages in the iPhone app.
  if (Platform.OS !== 'web') return false;
  if (typeof navigator === 'undefined') return false;
  const browser = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(browser.userAgent);
  // iPad desktop browsing can identify itself as a Mac.
  const ipad = browser.platform === 'MacIntel' && browser.maxTouchPoints > 1;
  return !browser.userAgentData?.mobile && !mobileAgent && !ipad;
}

/** A browser on an iPhone or iPad (an iPad can call itself a Mac): where the iPhone app can actually be installed. */
export function isAppleMobileBrowser() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const browser = navigator as Navigator & { maxTouchPoints?: number };
  if (/iPhone|iPad|iPod/i.test(browser.userAgent ?? '')) return true;
  return browser.platform === 'MacIntel' && (browser.maxTouchPoints ?? 0) > 1;
}
