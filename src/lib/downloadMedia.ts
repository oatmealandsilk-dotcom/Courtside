import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const EXT = /\.(mp4|mov|m4v|jpe?g|png|webp|heic)$/i;

/**
 * Pulls a post's original picture or video down and hands it to the share
 * sheet, where "Save Video" puts it in the camera roll — the one-tap path
 * from a clip in the app to a repost on Instagram. On a computer it saves the
 * file to the browser's downloads (or, where the file's host will not hand it
 * over, opens it in a new tab to save from there). Android's share sheet has
 * no save-to-gallery, so there the file goes to whichever app is picked (the
 * menu says "Original"). Throws with a sentence to show when it could not.
 */
export async function downloadMedia(url: string, name: string): Promise<void> {
  if (Platform.OS === 'web') { await saveInBrowser(url, name); return; }
  const dir = new Directory(Paths.cache, 'downloads');
  if (!dir.exists) dir.create();
  const ext = (url.split('?')[0].match(EXT)?.[1] ?? 'mp4').toLowerCase();
  const target = new File(dir, `courtside-${name}.${ext}`);
  if (target.exists) target.delete();
  let file: File;
  try {
    file = await File.downloadFileAsync(url, target);
  } catch {
    throw new Error('It could not be downloaded. Check your connection and try again.');
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
  await Sharing.shareAsync(file.uri);
}

/** The browser's own download, named for CourtSide; a host that refuses to hand the file to the page gets it opened instead. */
async function saveInBrowser(url: string, name: string) {
  let blob: Blob;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    blob = await response.blob();
  } catch {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const fromType = blob.type.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg');
  const ext = (url.split('?')[0].match(EXT)?.[1] ?? fromType ?? 'mp4').toLowerCase();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `courtside-${name}.${ext}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
