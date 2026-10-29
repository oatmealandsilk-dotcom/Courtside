/**
 * The sign-up steps redrawn (Oct 29, owner: "Every screenshots ui I attached
 * needs to be a lot better, updated to new standards. People you may know
 * screen I don't even feel a need to read I'm just tapping next because it
 * seems confusing. When's your birthday screen is not aesthetic enough").
 *
 * One frame for all six steps: a flat page, a segmented progress bar at one
 * height, a left-aligned title 24pt under it, hairline inset lists with no
 * shadows or icon tiles, one green button per screen. The birthday wheel sits
 * on the page like the iPhone's own picker; About you and Your game show
 * fewer boxes; People you may know is a plain list of people with Follow,
 * one quiet invite button, and nothing else to read.
 *
 * Off: every sign-up step is exactly as before. Only the sign-up run
 * changes: Edit profile → Game details, Edit rating, the AI coach's setup
 * and the profile's "finish setting up" look as they do today either way.
 * Turned on for everyone by setting this to true and shipping an
 * over-the-air update: no database change. ON since Oct 29 (owner: "Both
 * look good"). A teen's other teens on People you may know need migration
 * 202 (teens_to_suggest); without it a teen's list is as before.
 */
export const ONBOARDING_V2 = true;
