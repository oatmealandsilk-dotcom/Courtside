/**
 * The built-in wording for every automated message. Admin can reword or switch
 * off any of them in Admin → Messaging → Automated messages; these are the
 * fall-backs. Words in {curly_braces} are filled in when the message is sent.
 */
export type TemplateDef = {
  label: string;
  /** Transactional messages always send; marketing ones respect the email opt-out. */
  kind: "transactional" | "marketing";
  subject: string;
  body: string;
  sms?: string;
};

export const TEMPLATES = {
  welcome: {
    label: "Welcome (new account)",
    kind: "transactional",
    subject: "Welcome to {studio_name}",
    body: "Hi {first_name},\n\nYour account is ready. You can book classes, see your credits and show your check-in code at the door — all from your account.\n\n[Open my account]({account_url})",
  },
  booking_confirmation: {
    label: "Booking confirmation",
    kind: "transactional",
    subject: "You're booked: {class_name}, {class_date}",
    body: "Hi {first_name},\n\nYou're booked for **{class_name}** on **{class_date} at {class_time}**{instructor_line}.\n\n{payment_line}\n\nCan't make it? Cancel free until **{cancel_deadline}**.\n\n[View or cancel this booking]({account_url}/classes)\n\nA calendar file is attached.",
  },
  booking_cancelled: {
    label: "Booking cancelled",
    kind: "transactional",
    subject: "Cancelled: {class_name}, {class_date}",
    body: "Hi {first_name},\n\nYour booking for **{class_name}** on {class_date} at {class_time} has been cancelled.\n\n{outcome_line}",
  },
  class_reminder: {
    label: "Class reminder",
    kind: "transactional",
    subject: "Reminder: {class_name} {class_date} at {class_time}",
    body: "Hi {first_name},\n\nSee you at **{class_name}** on **{class_date} at {class_time}**.\n\n{cancel_line}\n\n[View my classes]({account_url}/classes)",
    sms: "{studio_name}: reminder — {class_name} {class_date} at {class_time}. {cancel_line}",
  },
  waitlist_spot: {
    label: "Waitlist spot available",
    kind: "transactional",
    subject: "A spot opened up: {class_name}, {class_date}",
    body: "Hi {first_name},\n\nA spot has opened in **{class_name}** on {class_date} at {class_time}. It is held for you until **{claim_deadline}**.\n\n[Claim my spot]({claim_url})",
    sms: "{studio_name}: a spot opened in {class_name} {class_date} {class_time}. Held until {claim_deadline}: {claim_url}",
  },
  waitlist_auto_booked: {
    label: "Waitlist — booked automatically",
    kind: "transactional",
    subject: "You're in: {class_name}, {class_date}",
    body: "Hi {first_name},\n\nA spot opened and you have been booked into **{class_name}** on {class_date} at {class_time}, as you asked.\n\nCan't make it? Cancel free until **{cancel_deadline}**.\n\n[View my classes]({account_url}/classes)",
  },
  session_cancelled: {
    label: "Studio cancelled a class",
    kind: "transactional",
    subject: "Class cancelled: {class_name}, {class_date}",
    body: "Hi {first_name},\n\nWe're sorry — **{class_name}** on {class_date} at {class_time} has been cancelled.{reason_line}\n\n{outcome_line}",
    sms: "{studio_name}: {class_name} on {class_date} at {class_time} is cancelled. {outcome_line}",
  },
  session_changed: {
    label: "Studio changed a class",
    kind: "transactional",
    subject: "Class change: {class_name}",
    body: "Hi {first_name},\n\n**{class_name}** has changed.\n\nWas: {old_details}\n\nNow: **{new_details}**\n\nIf the new time doesn't work, you can cancel from your account.\n\n[View my classes]({account_url}/classes)",
  },
  attendance_followup: {
    label: "Attendance follow-up",
    kind: "transactional",
    subject: "Did you attend {class_name} on {class_date}?",
    body: "Hi {first_name},\n\nWe didn't see you check in to **{class_name} on {class_date} at {class_time}**. Did you attend?\n\n[I attended]({attended_url})\n\n[I didn't attend]({not_attended_url})\n\nIf we don't hear from you by {response_deadline}, the class will be charged as usual.",
    sms: "{studio_name}: we didn't see you check in to {class_name} {class_date}. Did you attend? Yes: {attended_url}  No: {not_attended_url}",
  },
  no_show_charged: {
    label: "No-show charged",
    kind: "transactional",
    subject: "{class_name} on {class_date} was charged",
    body: "Hi {first_name},\n\nWe didn't hear back about **{class_name}** on {class_date}, so it has been charged: {charge_line}\n\nIf this is a mistake, just reply to this email and we'll sort it out.",
  },
  payment_receipt: {
    label: "Payment receipt",
    kind: "transactional",
    subject: "Receipt {receipt_number} — {amount}",
    body: "Hi {first_name},\n\nThank you. We received **{amount}** for {description}.\n\nReceipt number: {receipt_number}\nPaid by: {method}\nDate: {paid_date}\n\n{extra_line}\n\n[View my payments]({account_url}/payments)",
  },
  payment_failed: {
    label: "Payment failed",
    kind: "transactional",
    subject: "Payment didn't go through — {amount}",
    body: "Hi {first_name},\n\nWe couldn't charge your card **{amount}** for {description}.\n\n[Pay now]({pay_url})\n\nYou can also update your saved card in your account.",
  },
  tuition_upcoming: {
    label: "Tuition due soon",
    kind: "transactional",
    subject: "{period} tuition for {child_name}: {amount} due {due_date}",
    body: "Hi {first_name},\n\n{period} tuition for **{child_name}** is **{amount}**, due {due_date}.\n\n{pay_line}",
  },
  tuition_overdue: {
    label: "Tuition overdue",
    kind: "transactional",
    subject: "Overdue: {period} tuition for {child_name}",
    body: "Hi {first_name},\n\n{period} tuition for **{child_name}** ({amount}) was due {due_date} and is still open.\n\n[Pay now]({pay_url})\n\nYou can also pay at the front desk.",
  },
  credits_expiring: {
    label: "Credits expiring",
    kind: "transactional",
    subject: "{credits} class credit(s) expire {expiry_date}",
    body: "Hi {first_name},\n\nYou have **{credits} class credit(s)** that expire on **{expiry_date}**.\n\n[Book a class]({schedule_url})",
  },
  schedule_published: {
    label: "New month's schedule published",
    kind: "marketing",
    subject: "The {month} schedule is up",
    body: "Hi {first_name},\n\nThe **{month}** class schedule is now open for booking.\n\n[See the schedule]({schedule_url})",
  },
  series_reenrollment: {
    label: "Series re-enrollment notice",
    kind: "transactional",
    subject: "{child_name} is enrolled in {series_name}",
    body: "Hi {first_name},\n\n**{child_name}** has been carried over into **{series_name}**. The dates are:\n\n{dates}\n\nIf {child_name} won't be continuing, you can withdraw until **{withdraw_deadline}**.\n\n[Manage enrollment]({account_url}/family)",
  },
  absence_notice: {
    label: "Absence notice to parent (optional)",
    kind: "transactional",
    subject: "{child_name} was marked absent from {class_name}",
    body: "Hi {first_name},\n\n**{child_name}** was marked absent from {class_name} on {class_date}. If that's a mistake, let us know. A make-up class can be booked from your account.",
  },
  winback: {
    label: "Archived win-back (optional)",
    kind: "marketing",
    subject: "We'd love to see you back at the barre",
    body: "Hi {first_name},\n\nIt's been a while! The current schedule is online whenever you're ready.\n\n[See the schedule]({schedule_url})",
  },
  staff_invite: {
    label: "Staff invitation",
    kind: "transactional",
    subject: "You've been added to {studio_name}",
    body: "Hi {first_name},\n\nYou've been given **{role}** access. Sign in with this email address to get started.\n\n[Sign in]({login_url})",
  },
  contact_form: {
    label: "Contact form → office",
    kind: "transactional",
    subject: "Website message from {from_name}",
    body: "**From:** {from_name} ({from_email}, {from_phone})\n\n{message}",
  },
} satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATES;

/** Fill {merge_tags}. Unknown tags are left blank rather than shown raw. */
export function fillTags(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_m, k: string) => (vars[k] == null ? "" : String(vars[k])));
}
