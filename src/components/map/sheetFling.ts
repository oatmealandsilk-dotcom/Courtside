import { makeMutable } from 'react-native-reanimated';

/**
 * Set by a map card's own drag the moment a swipe down closes it (see
 * useDragToClose in MapChrome), and read by CardStage as the card leaves:
 * a swiped card keeps moving at the finger's pace instead of easing off
 * from rest. A shared value, so the phone reads it on the animation thread.
 */
export const sheetFling = makeMutable(0);
