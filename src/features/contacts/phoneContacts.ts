import { requireOptionalNativeModule } from 'expo-modules-core';

/** One person from the phone's contacts, with only what matching needs. */
export interface PhoneContact {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
}

/**
 * Whether this build can read contacts. expo-contacts arrived in build 14;
 * an older build gets this code over the air without the phone part, and
 * loading the library there would close the app, so it is checked first.
 */
export function canReadContacts(): boolean {
  return !!requireOptionalNativeModule('ExpoContacts');
}

/** Asks once, then reads names, numbers and emails. Nothing else is read. */
export async function readContacts(): Promise<PhoneContact[] | 'denied' | 'unavailable'> {
  if (!canReadContacts()) return 'unavailable';
  // Loaded only now, on a build known to have it.
  const Contacts = require('expo-contacts/legacy') as typeof import('expo-contacts/legacy');
  const permission = await Contacts.requestPermissionsAsync();
  if (permission.status !== 'granted') return 'denied';
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails] });
  return data
    .map((c, i) => ({
      id: c.id ?? String(i),
      name: (c.name || [c.firstName, c.lastName].filter(Boolean).join(' ')).trim(),
      phones: (c.phoneNumbers ?? []).map((p) => p.number || p.digits || '').filter(Boolean),
      emails: (c.emails ?? []).map((e) => e.email || '').filter(Boolean),
    }))
    .filter((c) => c.name && (c.phones.length || c.emails.length));
}
