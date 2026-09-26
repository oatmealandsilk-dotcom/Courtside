import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Pulls a post's original picture or video down and hands it to the share
 * sheet, where "Save Video" puts it in the camera roll — the one-tap path
 * from a clip in the app to a repost on Instagram. On a computer it just
 * opens the file.
 */
export async function downloadMedia(url: string, name: string): Promise<void> {
  if (Platform.OS === 'web') { window.open(url, '_blank', 'noopener'); return; }
  const dir = new Directory(Paths.cache, 'downloads');
  if (!dir.exists) dir.create();
  const ext = (url.split('?')[0].match(/\.(mp4|mov|m4v|jpe?g|png|webp|heic)$/i)?.[1] ?? 'mp4').toLowerCase();
  const target = new File(dir, `courtside-${name}.${ext}`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  await Sharing.shareAsync(file.uri);
}
