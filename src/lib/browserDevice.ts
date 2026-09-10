/** Device identity stays independent of window size and portrait layout. */
export function isDesktopBrowser() {
  if (typeof navigator === 'undefined') return false;
  const browser = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(browser.userAgent);
  // iPad desktop browsing can identify itself as a Mac.
  const ipad = browser.platform === 'MacIntel' && browser.maxTouchPoints > 1;
  return !browser.userAgentData?.mobile && !mobileAgent && !ipad;
}
