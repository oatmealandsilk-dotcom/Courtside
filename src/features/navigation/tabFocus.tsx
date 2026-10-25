import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useIsFocused as useRouteFocused } from 'expo-router';
import { AppStateLater } from '@/store/AppContext';
import { TabOnShowContext, useIsFocused } from '@/lib/useIsFocused';
import { ThemeSourceContext, liveTheme, makeThemeSource, type ThemeName } from '@/theme/ThemeProvider';
import { landed, registerGate, unregisterGate, type GateEntry } from '@/theme/catchUp';

/**
 * Whether the tab a component sits in is the one on screen.
 *
 * The four main tabs all stay mounted side by side so a swipe can slide
 * between them; this is how a tab that has slid off screen knows to pause its
 * video and stop counting views. Outside the pager it is undefined, which
 * reads as "focused".
 */
const TabFocusContext = createContext<boolean | undefined>(undefined);
/** The same, as a box read on demand, for the theme's gate (reading the context would redraw it on every swipe). */
const TabActiveBox = createContext<{ active: boolean } | undefined>(undefined);
/**
 * Only whether a tab sits in the tab row at all, which never changes. The route reads this, not
 * TabFocusContext: reading that one redrew the leaving tab and the arriving tab whole, from the
 * top, on every bar tap, before the row could start to glide (Oct 24, owner: "Buttons need to be
 * way more responsive"). The parts that follow focus still hear it (useTabActive, useIsFocused).
 */
const InTabRowContext = createContext(false);

export function TabFocus({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Whether this tab is on show (its slot on screen, and no page opened over the tabs), worked out
  // here once for the whole tab: see useIsFocused. A page opening over the tabs then redraws only
  // the tab on show, not all four, before it can slide in (Oct 10, owner: "the buttons like the
  // settings. msg notifications, etc respond too slow").
  const routeFocused = useRouteFocused();
  const box = useRef({ active }).current;
  useLayoutEffect(() => { box.active = active; }, [box, active]);
  return (
    <InTabRowContext.Provider value>
      <TabFocusContext.Provider value={active}>
        <TabActiveBox.Provider value={box}>
          <TabOnShowContext.Provider value={routeFocused && active}>{children}</TabOnShowContext.Provider>
        </TabActiveBox.Provider>
      </TabFocusContext.Provider>
    </InTabRowContext.Provider>
  );
}

export function useTabActive(): boolean {
  return useContext(TabFocusContext) ?? true;
}

/**
 * Wraps a tab's screen so the route itself draws nothing on the phone. The
 * router still owns the four addresses (so links and the bottom bar work),
 * but the pager is what renders the screens; without this the router would
 * quietly mount a second, hidden copy of whichever tab is current. A preview
 * (rendered with props) and the web build render as normal.
 *
 * `pane` is the tab's address, for the theme's catch-up (ThemeGate). Kept from
 * redrawing when only the screen around it does (React.memo): a browser's tab
 * layout redraws on a theme change, and that must never reach a tab still
 * held on the old court.
 */
export function asTabRoute<P extends object>(Screen: React.ComponentType<P>, pane: string) {
  function TabRoute(props: P) {
    const inPager = useContext(InTabRowContext);
    // The router hands every screen a `segment` prop of its own, so "no
    // props" never held and the hidden copy was fully alive: a second Home
    // feed, with its own player on the first clip, fighting the visible one.
    // Only props a caller passed (a preview, one person's feed) count.
    const own = Object.keys(props).filter((key) => key !== 'segment');
    if (Platform.OS !== 'web' && !inPager && own.length === 0) return null;
    return <ThemeGate pane={pane}>{() => <OffScreenLater><Screen {...props} /></OffScreenLater>}</ThemeGate>;
  }
  return React.memo(TabRoute);
}

/**
 * A tab keeps the court it is drawn in until the theme's catch-up lets it go
 * (src/theme/catchUp.ts): a theme picked in Settings redraws only what is on
 * screen at the tap, and each tab follows out of sight afterwards, one per
 * redraw. A new tab starts on the court picked.
 *
 * The parts inside read their court from this gate's own source, so a pick
 * reaches none of them until the gate moves it. Anything above the tabs that
 * passes theme-dependent props into a tab would bring the whole cost back to
 * the tap: keep theme reads inside the tabs (the timing harness's tap-commit
 * check guards it).
 */
export function ThemeGate({ pane, children }: { pane: string; children: () => React.ReactNode }) {
  const [look, setLook] = useState<ThemeName>(liveTheme);
  const [source] = useState(() => makeThemeSource(look));
  const box = useContext(TabActiveBox);
  const entry = useRef<GateEntry | null>(null);
  if (!entry.current) {
    entry.current = {
      pane,
      look,
      // The parts inside are told, and the screen is drawn again from the top, in the same go.
      set: (name: ThemeName) => { source.set(name); setLook(name); },
      active: () => box?.active,
    };
  }
  useLayoutEffect(() => {
    const gate = entry.current!;
    registerGate(gate);
    return () => unregisterGate(gate);
  }, []);
  useLayoutEffect(() => {
    entry.current!.look = look;
    landed(entry.current!);
  }, [look]);
  // Drawn afresh here (a render function, not ready-made children): when the gate lets go, the whole
  // screen is redrawn from the top in the new court, as it was before the gates, so a part that reads
  // the live colours without following the theme itself is never left in the old court.
  return <ThemeSourceContext.Provider value={source}>{children()}</ThemeSourceContext.Provider>;
}

/**
 * A tab that is off screen (slid to the side, or under a page opened on top)
 * keeps up with the app as background work, so sending a message or turning
 * a page in the Feed does not wait for the other tabs to redraw first. On
 * screen again, it reads the live state at once (AppStateLater).
 */
function OffScreenLater({ children }: { children: React.ReactNode }) {
  // On show: the route on top and, in the tab row, this tab on screen (see useIsFocused).
  const onShow = useIsFocused();
  return <AppStateLater hidden={!onShow}>{children}</AppStateLater>;
}
