/**
 * The court sheet ("What do you know?") redrawn (Oct 29, owner: "Really gotta fix this page"), in the sign-up and
 * Edit profile redraw's look: "Tell players about this court" with the court's name under it; one inset list of
 * label-left rows with small switches (Lights Yes|No, Nets Good|Bad, Surface Good|Cracked|Puddles); "When is it
 * busy?" as a card of six real cells (a hairline and a fill, ticked in green) with "Never seen it busy" under them;
 * "Who can play here?" (adults only, as before) as four even choices; the note in its own card; one line about
 * privacy; and one green "Share" button, faded until something is picked (tapped then, it says "Pick at least one").
 * Every answer, how it saves, and what players see are exactly as before.
 *
 * Off: the sheet is exactly as before. Turned on for everyone by setting this to true and shipping an
 * over-the-air update: no database change.
 */
export const COURT_REPORT_V2 = false;
