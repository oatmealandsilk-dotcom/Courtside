import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBarInset, useLiveBarSpace } from './barInset';
import { barClearTop, usePhoneBar } from './phoneBar';
import { NEW_BAR, nativeBarTop, newBarFoot } from './tabBarLook';

export { setPhoneBar, usePhoneBar, type PhoneBar } from './phoneBar';

/**
 * How high the phone's bottom bar stands above the screen's bottom edge (its top), whichever bar this person has, exactly
 * where NavBar draws it (phoneBar: NavBar says which): the quiet pill's top, the new bar's, or the top of Apple's glass
 * capsule (83 points up on every iPhone). With the live session's bar on show, that bar's top. 0 where no bar floats over
 * the page (a computer's sidebar). For a page that runs under the bar (the Community map) and keeps its own things just
 * clear of it; a page's bottom room stays useBarInset's, which clears all three.
 */
export function useBarTop(): number {
  const inset = useBarInset();
  const bar = usePhoneBar();
  const live = useLiveBarSpace();
  const { bottom } = useSafeAreaInsets();
  if (!inset) return 0;
  // The live session's bar rides over the bar's place (LiveBar), its own height and gap on top.
  if (live) return barClearTop(bar, bottom) + live;
  if (bar === 'apple') return nativeBarTop(bottom);
  if (bar === 'new') return newBarFoot(Math.max(bottom, 12)) + NEW_BAR.height;
  return barClearTop(bar, bottom);
}
