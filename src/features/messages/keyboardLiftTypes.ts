import type { ScrollViewProps, ViewStyle } from 'react-native';
import type Reanimated from 'react-native-reanimated';
import type { AnimatedRef, SharedValue, useAnimatedStyle } from 'react-native-reanimated';

/** What keyboardLift.ts (phone) and keyboardLift.web.ts (browser) are given and give back. */
export interface KeyboardLiftOptions {
  /** The room under the bar with the keyboard down: clear of the home indicator. */
  rest: number;
  /** The chat is the page in front. A sheet over it (the court picker) brings its own keyboard up, and the bar here must stay down under it. */
  focused: boolean;
  /** The chat's own box has the keyboard: whatever keyboard is up is this one, and the bar rides on it. */
  typing: boolean;
  /**
   * How tall the emoji keyboard is while it is open in the phone keyboard's
   * place (0 when closed). It is part of the page, laid over the bottom of
   * it, so the room under the bar is at least this.
   */
  emojiRoom: number;
  /** The list of messages, kept on its newest message as the keyboard comes up. */
  scrollRef: AnimatedRef<Reanimated.ScrollView>;
  /** Whether the list is resting on its newest message (it is kept there); scrolled up to read, it is left alone. */
  pinned: SharedValue<boolean>;
  /** How tall the messages themselves are (not stretched to fill the list), so the list is never scrolled past its end. */
  contentHeight: SharedValue<number>;
}

export interface KeyboardLift {
  /** The room's style: an empty box under the bar this tall (worked out on the animation thread on an iPhone). */
  spacer: ViewStyle | ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  /**
   * Switching from the emoji keyboard back to typing: the bar stays this high
   * until the phone keyboard has come up to it, so it does not drop and rise.
   */
  holdUntilKeyboard: (height: number) => void;
}

/** A drag down the messages putting the keyboard away: props for the list, and a hook into its scrolling. */
export interface DragDismiss {
  props: Pick<ScrollViewProps, 'keyboardDismissMode' | 'onScrollBeginDrag' | 'onScrollEndDrag' | 'onTouchStart' | 'onTouchMove' | 'onTouchEnd'>;
  /** Told how far the list is scrolled, each time it scrolls. */
  onScrollY: (y: number) => void;
}
