/**
 * gv4's grid, as plain logic (no React) so it can be checked on its own: a run of picture posts becomes pairs of
 * tiles; anything else sits full width between blocks. A full-width item that arrives while a pair is half full
 * waits for the next tile (at most `maxHeld` of them), so the grid never leaves a lone tile mid-feed; the order
 * shifts by one picture at most. When a later page arrives, the pair that was half full only gains its second tile
 * (its key, the first tile's id, stays), so nothing already drawn moves.
 */
export function pairTiles<R, P>(rows: R[], tileOf: (r: R) => P | null, pair: (posts: P[], first: boolean) => R, maxHeld = 4): R[] {
  const out: R[] = [];
  let run: P[] = [];
  let held: R[] = [];
  const flush = () => {
    for (let i = 0; i < run.length; i += 2) out.push(pair(run.slice(i, i + 2), i === 0));
    run = [];
  };
  const release = () => { flush(); out.push(...held); held = []; };
  for (const r of rows) {
    const tile = tileOf(r);
    if (tile !== null) {
      run.push(tile);
      if (held.length && run.length % 2 === 0) release();
      continue;
    }
    if (run.length % 2 === 1 && held.length < maxHeld) { held.push(r); continue; }
    release();
    out.push(r);
  }
  release();
  return out;
}

/**
 * Where the head of the list (Follow more players…) goes in the grid: under the second row of tiles, or after the
 * fourth item, whichever comes first, so the feed opens as a grid. Decided by the rows above it only, so a later
 * page never moves it; a list too short for either ends with it.
 */
export function startIndex<R>(rows: R[], isPair: (r: R) => boolean): number {
  let pairs = 0;
  for (let i = 0; i < rows.length; i++) {
    if (isPair(rows[i])) pairs += 1;
    if (pairs >= 2 || i + 1 >= 4) return i + 1;
  }
  return rows.length;
}
