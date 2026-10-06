/**
 * The browser's share sheet where there is one, else the link copied.
 * Resolves with a note to show ('' for none), or null when the share sheet
 * was closed without sharing (the same as the phone's, shareOutside.ts).
 */
export async function shareOutside(title: string, url: string): Promise<string | null> {
  if (navigator.share) {
    try { await navigator.share({ title, text: title, url }); return ''; }
    catch (error) { if ((error as Error).name === 'AbortError') return null; }
  }
  if (navigator.clipboard) { await navigator.clipboard.writeText(url); return 'Link copied. Paste it into any app to share.'; }
  return `Share this link: ${url}`;
}
