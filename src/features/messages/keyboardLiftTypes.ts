import type { ScrollViewProps, ViewStyle } from 'react-native';
import type { useAnimatedStyle } from 'react-native-reanimated';

/** What keyboardLift.ts (phone) and keyboardLift.web.ts (browser) are given and give back. */
export interface KeyboardLiftOptions {
  /** The room under the bar with the keyboard down: clear of the home indicator. */
  rest: number;
  /** The chat is the page in front. A sheet over it (the court picker) brings its own keyboard up, and the bar here must stay down under it. */
  focused: boolean;
  /** The chat's own box has the keyboard: whatever keyboard is up is this one, and the bar rides on it. */
  typing: boolean;
  /**
   * How tall the app's emoji keyboard is while it is open (0 when closed).
   * Browsers only: a phone uses its own emoji keyboard, so the phone's
   * version leaves this be. It is part of the page, laid over the bottom of
   * it, so the room under the bar is at least this.
   */
  emojiRoom: number;
  /**
   * How tall the emoji keyboard would be if opened now, known from the start,
   * so the panel's very first frame already sits below the edge rather than
   * at full height over the resting bar.
   */
  emojiHeight: number;
}

export interface KeyboardLift {
  /** The room's style: an empty box under the bar this tall (worked out on the animation thread on an iPhone). */
  spacer: ViewStyle | ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  /**
   * The emoji keyboard's style (browsers only): with no keyboard up it slides up and
   * back down together with the bar (Oct 22 sweep: "the emoji panel and the
   * typing bar leap about 300 pt in one frame"), instead of appearing at full
   * height in one frame.
   */
  panel: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
}

/** A drag down the messages putting the keyboard away: props for the list, and a hook into its scrolling. */
export interface DragDismiss {
  props: Pick<ScrollViewProps, 'keyboardDismissMode' | 'onScrollBeginDrag' | 'onScrollEndDrag' | 'onTouchStart' | 'onTouchMove' | 'onTouchEnd'>;
  /** Told how far the list is scrolled, each time it scrolls. */
  onScrollY: (y: number) => void;
}
