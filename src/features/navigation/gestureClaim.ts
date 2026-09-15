import { makeMutable } from 'react-native-reanimated';

/**
 * Which swipe layer owns the finger right now, read on the animation thread.
 *
 * Swipe surfaces nest: the tab pager holds the section swipes, which on the
 * profile hold the grid's own swipe. Only one may move for a given drag. The
 * deepest layer gets first refusal by needing the least movement to start;
 * once it has claimed the drag, the layers above it stand down.
 *
 * 0 means nobody; otherwise it is the claimant's depth plus one.
 */
export const claimedDepth = makeMutable(0);

/** How far a finger must travel sideways before a layer at this depth takes the drag. */
export function activationDistance(depth: number) {
  'worklet';
  return 8 + Math.max(0, 2 - depth) * 3;
}

/**
 * Whether a layer at this depth should let one more touch event pass before
 * taking the drag. The innermost layer claims at once; the layers above it
 * wait a beat so a fast flick cannot slip past the layer that should own it.
 */
export function waitsForDeeper(depth: number) {
  'worklet';
  return depth < 2;
}
