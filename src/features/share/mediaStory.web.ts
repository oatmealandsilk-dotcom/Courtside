import type { View } from 'react-native';

/*
 * The browser twin of mediaStory.ts. A browser cannot hand a file to
 * Instagram's story editor, so a post's menu does not offer "Share to
 * Instagram Story" there (Download and Share as image still are).
 */

export type StoryMediaKind = 'video' | 'photo';

export function canShareMediaStory(): boolean {
  return false;
}

export async function shareMediaToStory(_input: { url: string; kind: StoryMediaKind; id: string; sticker: View | null; bake?: () => Promise<View | null>; cancelled?: () => boolean }): Promise<string | null> {
  return 'Instagram Stories opens from the CourtSide app on your phone.';
}
