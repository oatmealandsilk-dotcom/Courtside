import type { PhoneContact } from './phoneContacts';

export type { PhoneContact } from './phoneContacts';

/** A browser cannot read the phone's contacts: this lives in the phone app only. */
export function canReadContacts(): boolean {
  return false;
}

export async function readContacts(): Promise<PhoneContact[] | 'denied' | 'unavailable'> {
  return 'unavailable';
}
