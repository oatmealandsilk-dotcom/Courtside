import { eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { settings as settingsTable } from "@/db/schema";

/** Every studio rule that can be changed without a programmer, with its default. */
export const SETTING_DEFAULTS = {
  cancellation_cutoff_hours: 12,
  late_cancel_fee_cents: 0,
  /** null = charge the class's drop-in price */
  no_show_fee_cents: null as number | null,
  reminder_hours_before: 24,
  followup_delay_minutes: 60,
  followup_response_hours: 48,
  excused_no_show_flag_threshold: 3,
  excused_no_show_flag_days: 60,
  archive_after_days: 180,
  credit_expiry_reminder_days: 7,
  waitlist_claim_hours: 4,
  makeup_window_days: 30,
  parents_can_book_makeups: true,
  require_card_on_file_for_adults: true,
  allow_charge_after_class: true,
  tuition_billing_day: 1,
  auto_carry_over_enrollments: true,
  absence_notice_to_parents: false,
  waiver_version: "2026-01",
  waiver_text:
    "I understand that ballet is a physical activity that carries a risk of injury, and I take part (or enroll my child) voluntarily. I agree to follow the studio's protocol and cancellation policy.",
  studio_timezone: "America/New_York",
  closures: [] as string[],
  desk_pin: "1234",
  studio_name: "The Raleigh School of Ballet",
  studio_tagline: "Professional Training in Classical Ballet for Children and Adults",
  studio_address: "3921 Beryl Road, Raleigh, NC 27607",
  studio_phone: "919-834-9261",
  studio_email: "office@raleighballet.com",
  studio_office_hours: "Monday–Friday, 3:00–7:00pm during the academic year",
  studio_facebook: "https://www.facebook.com/raleighschoolofballet",
  studio_instagram: "https://www.instagram.com/raleighschoolofballet",
  studio_logo_url: "",
  home_hero_image_url: "",
  rdt_url: "https://www.raleighdancetheatre.org",
};
export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

export async function loadSettings(db: Tx): Promise<Settings> {
  const rows = await db.select().from(settingsTable);
  const out = { ...SETTING_DEFAULTS } as Record<string, unknown>;
  for (const r of rows) if (r.key in SETTING_DEFAULTS) out[r.key] = r.value;
  return out as Settings;
}

export async function saveSetting<K extends SettingKey>(db: Tx, key: K, value: Settings[K]) {
  await db
    .insert(settingsTable)
    .values({ key, value: value as unknown as object })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: value as unknown as object, updatedAt: new Date() } });
}
export async function getSettingRow(db: Tx, key: SettingKey) {
  const [r] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return r;
}
