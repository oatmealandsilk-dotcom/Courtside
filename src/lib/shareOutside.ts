import { Share } from 'react-native';
/**
 * The phone's share sheet with a title and a link. Resolves with a note to
 * show ('' for none), or null when the sheet was closed without sharing. An
 * iPhone says so; Android never does, so there it always reads as shared.
 */
export async function shareOutside(title: string, url: string): Promise<string | null> {
  const result = await Share.share({ title, message: `${title}\n${url}`, url });
  return result.action === Share.dismissedAction ? null : '';
}
