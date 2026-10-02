/**
 * A post's tags that its caption does not already say. A challenge entry
 * carries #longestrally both in its words and as a tag; showing the tags
 * after the caption repeated it ("#longestrally #longestrally").
 */
export function tagsNotInCaption(body: string | undefined, tags: string[]): string[] {
  const said = new Set((body ?? '').toLowerCase().match(/#[\p{L}\p{N}_-]+/gu)?.map((t) => t.slice(1)) ?? []);
  return tags.filter((t) => !said.has(t.toLowerCase()));
}
