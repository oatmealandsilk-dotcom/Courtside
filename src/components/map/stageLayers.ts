import type React from 'react';
import { createContext, useReducer, useRef } from 'react';

/*
 * What the map's card stage (CardStage, and its browser twin) holds: the
 * layer that is up now, and any still on their way out. Shared by both, so
 * the phone and the browser always agree on what is up and what is leaving;
 * each only animates them its own way.
 */

/** 'tray' settles in place (the bare map with only its buttons, or the card asking where you are); 'card' rises from the bottom edge. */
export type StageKind = 'tray' | 'card';

/** The map's buttons riding on each layer: the same on every one, or made for each from its key (the players list fades its own). */
export type Crown = React.ReactNode | ((key: string) => React.ReactNode);

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
  /** The layer it took the place of, if any: the bare map after a card closed takes over that card's buttons (CardStage). */
  replaces: { id: string; kind: StageKind } | null;
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
  if (!layers.current) layers.current = [{ id: `${cardKey}#0`, key: cardKey, kind, node, out: false, n: 0, first: true, replaces: null }];
  const live = layers.current.find((l) => !l.out);
  if (live && live.key === cardKey) {
    live.node = node;
    live.kind = kind;
  } else {
    if (live) live.out = true;
    count.current += 1;
    layers.current.push({ id: `${cardKey}#${count.current}`, key: cardKey, kind, node, out: false, n: count.current, first: false, replaces: live ? { id: live.id, kind: live.kind } : null });
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

/**
 * A card closing back to the bare map (Oct 10, owner: "the drop down is
 * good but there's like another weird thing"): the map's buttons ride down
 * with it, from where they sat on the card to their own spot, rather than
 * fading off the card while a second set faded in at the bottom. The bare
 * map's layer takes over the card's buttons: it starts with its own in
 * exactly their place and glides down on the card's own curve, the card's
 * set put away the same moment (CardStage, and its browser twin).
 */
export const takesOver = (layer: StageLayer) => layer.kind === 'tray' && !layer.first && layer.replaces?.kind === 'card';

/**
 * True on the buttons taking over from a closing card (above): what only
 * the bare map has (the players pill, and the credits over it) fades in as
 * they ride down; Back to me and the zoom were there all along.
 */
export const CrownTakeover = createContext(false);
