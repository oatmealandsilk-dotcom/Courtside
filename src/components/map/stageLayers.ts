import type React from 'react';
import { useReducer, useRef } from 'react';

/*
 * What the map's card stage (CardStage, and its browser twin) holds: the
 * layer that is up now, and any still on their way out. Shared by both, so
 * the phone and the browser always agree on what is up and what is leaving;
 * each only animates them its own way.
 */

/** 'tray' settles in place (the bare map with only its buttons, or the card asking where you are); 'card' rises from the bottom edge. */
export type StageKind = 'tray' | 'card';

export interface StageLayer {
  /** Unique per appearance: a card closed and opened again is a new layer. */
  id: string;
  /** What it shows ('bare', 'list', 'me', 'p:<id>'…). */
  key: string;
  kind: StageKind;
  node: React.ReactNode;
  /** Replaced by a newer layer: on its way out, and no longer taking taps. */
  out: boolean;
  /** Its place in the stack: a newer card sits over the one it replaces. */
  n: number;
  /** There when the map first appeared: it arrives with the page, no entrance. */
  first: boolean;
}

/**
 * The same card keeps its layer, with fresh content; a new key adds a layer
 * and sends the one before it out. `remove` drops a layer once its exit has
 * finished playing.
 */
export function useStageLayers(cardKey: string, kind: StageKind, node: React.ReactNode) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const count = useRef(0);
  const layers = useRef<StageLayer[] | null>(null);
  if (!layers.current) layers.current = [{ id: `${cardKey}#0`, key: cardKey, kind, node, out: false, n: 0, first: true }];
  const live = layers.current.find((l) => !l.out);
  if (live && live.key === cardKey) {
    live.node = node;
    live.kind = kind;
  } else {
    if (live) live.out = true;
    count.current += 1;
    layers.current.push({ id: `${cardKey}#${count.current}`, key: cardKey, kind, node, out: false, n: count.current, first: false });
  }
  const remove = (layer: StageLayer) => {
    if (!layers.current?.includes(layer)) return;
    layers.current = layers.current.filter((l) => l !== layer);
    redraw();
  };
  return { layers: layers.current, remove };
}

/** The newest card stacks over the one leaving; a 'tray' layer always sits under the cards. */
export const layerZ = (layer: StageLayer) => (layer.kind === 'tray' ? 1 : 2 + layer.n);
