/**
 * Edit profile redrawn (Oct 29, owner: "This page could also use some better ui . If you need to rearrange things
 * that's fine too"), in the sign-up redraw's look (ONBOARDING_V2): the picture centred at the top with "Edit
 * picture", one inset list of label-left rows (Name, Handle ›, Bio, Town), a "Tennis" list (Rating with NTRP/UTR and
 * its level word, then Game details ›), and Save as a small green pill in the header, where neither the floating tab
 * bar nor the keyboard ever covers it. It stays faded until something has changed. The official account
 * (OFFICIAL_IDS) has no Tennis list at all.
 *
 * Off: Edit profile is exactly as before. Turned on for everyone by setting this to true and shipping an
 * over-the-air update: no database change.
 */
export const EDIT_PROFILE_V2 = false;
