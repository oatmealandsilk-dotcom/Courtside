/**
 * An edit to a thread that did not save (no connection, say): what was typed
 * is kept here, so the toast's "Edit again" opens Edit thread with it filled
 * in rather than losing it. Held in memory only, for one thread at a time,
 * as unsentThread is for a new one.
 */
export interface UnsentEdit { id: string; title: string; body: string }

let unsent: UnsentEdit | null = null;

export function keepUnsentEdit(edit: UnsentEdit) { unsent = edit; }
/** The words kept for this thread, if any. */
export function peekUnsentEdit(id: string): UnsentEdit | null { return unsent && unsent.id === id ? unsent : null; }
export function clearUnsentEdit(id?: string) { if (!id || unsent?.id === id) unsent = null; }
