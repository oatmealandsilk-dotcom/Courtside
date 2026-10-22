import { Linking, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
/**
 * The phone's share sheet with a title and a link. Resolves with a note to
 * show ('' for none), or null when the sheet was closed without sharing. An
 * iPhone says so; Android never does, so there it always reads as shared.
 */
export async function shareOutside(title: string, url: string): Promise<string | null> {
  const result = await Share.share({ title, message: `${title}\n${url}`, url });
  return result.action === Share.dismissedAction ? null : '';
}

/** The link on the clipboard. Resolves true once it is there. */
export async function copyLink(url: string): Promise<boolean> {
  try { return await Clipboard.setStringAsync(url); } catch { return false; }
}

/**
 * WhatsApp with the words ready to send: its web link, which an iPhone hands
 * to the WhatsApp app when it is there (no app scheme to declare, no new
 * build), else opens WhatsApp's page in the browser.
 */
export async function shareToWhatsApp(text: string): Promise<void> {
  await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
}
