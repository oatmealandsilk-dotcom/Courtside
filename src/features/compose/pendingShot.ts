/**
 * The photo the camera just took, handed to the composer in memory. On the
 * web the shot is a data URL that can run to megabytes; putting that in the
 * page address made every keystroke on the caption re-read it and could
 * break the back step, so the address only carries a marker.
 */
let pending: string | null = null;

export function setPendingShot(uri: string | null) { pending = uri; }
export function takePendingShot(): string | null { return pending; }
