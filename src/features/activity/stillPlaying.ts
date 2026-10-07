// Browsers get no "Still playing?" alert: there is nowhere to put one (see stillPlaying.native.ts). The app's own note still asks.
export async function planStillPlaying(_at: number | null, _body?: string): Promise<void> {}
