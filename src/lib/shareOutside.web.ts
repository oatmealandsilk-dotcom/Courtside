export async function shareOutside(title: string, url: string): Promise<string> {
  if (navigator.share) {
    try { await navigator.share({ title, text: title, url }); return ''; }
    catch (error) { if ((error as Error).name === 'AbortError') return ''; }
  }
  if (navigator.clipboard) { await navigator.clipboard.writeText(url); return 'Link copied. Paste it into any app to share.'; }
  return `Share this link: ${url}`;
}
