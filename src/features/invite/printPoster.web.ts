/**
 * The browser's print dialog, on the poster alone: it opens in a tab of its
 * own, prints, and closes itself afterwards. "Save as PDF" is one of the
 * destinations in the same dialog.
 */
export async function printPoster(html: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Your browser blocked the poster’s tab. Allow pop-ups for CourtSide and try again.');
  tab.document.open();
  tab.document.write(html.replace('</body>', '<script>addEventListener("afterprint",function(){close()});document.fonts&&document.fonts.ready?document.fonts.ready.then(function(){setTimeout(print,150)}):addEventListener("load",function(){print()});</script></body>'));
  tab.document.close();
}

export async function savePosterPdf(html: string, _club: string): Promise<void> {
  await printPoster(html);
}

export const posterActions: ('print' | 'pdf')[] = ['print'];
