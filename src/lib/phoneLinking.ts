/**
 * Linking a phone number (app/link-phone) is offered only once texting
 * codes is switched on in Supabase (Twilio Verify). Off for App Review
 * (Oct 8, owner: "hide phone row"): until then the row only said "Phone
 * numbers can't be linked just yet". Turn it back on here, with an instant
 * update, once texting is set up.
 */
export const PHONE_LINKING = false;
