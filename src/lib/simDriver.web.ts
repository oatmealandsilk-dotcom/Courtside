/* The simulator proof harness (simDriver.ts) is the iPhone Simulator's only: the website has none of it. */
export const SIM_DRIVER = false;
export const SIM_ZOOM = false;
export function simAction(_name: string, _fn: (args: Record<string, string>) => void): () => void { return () => undefined; }
export function startSimPolling() { /* never on the website */ }
export function simLog(_line: string) { /* never on the website */ }
