/**
 * A browser takes no stills of the feed (a page's video cannot be drawn, and drawing the page
 * would stall it): every card in the Feed windows uses the page's poster or its words instead.
 */
export async function takeFeedShot(_node: unknown): Promise<string | null> {
  return null;
}

export function dropFeedShot(_uri: string) {}
