import { eq, inArray } from "drizzle-orm";
import { marked } from "marked";
import { render } from "@react-email/render";
import { createElement } from "react";
import type { Tx } from "@/db/types";
import { guardianships, households, messageTemplates, messages, people, type Person } from "@/db/schema";
import { loadSettings } from "@/lib/settings";
import { appUrl, hasResend, hasTwilio } from "@/lib/env";
import { signToken } from "@/lib/tokens";
import { daysMs } from "@/lib/time";
import { EmailLayout } from "./layout";
import { TEMPLATES, fillTags, type TemplateKey } from "./templates";

type Vars = Record<string, string | number | null | undefined>;
export type Attachment = { filename: string; content: string; contentType?: string };

/** Turn our small markdown into email HTML; links on their own line become buttons. */
export function markdownToEmailHtml(md: string): string {
  const withButtons = md.replace(
    /^\[([^\]]+)\]\(([^)]+)\)\s*$/gm,
    (_m, label: string, url: string) =>
      `<p><a href="${url}" style="display:inline-block;background:#8f3f5c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:bold">${label}</a></p>`,
  );
  return marked.parse(withButtons, { async: false, breaks: true }) as string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export { escapeHtml };

/**
 * Who actually receives mail for a person: themselves if they have an email,
 * otherwise their guardians (children), otherwise the household's main contact.
 */
export async function contactsFor(db: Tx, person: Person): Promise<Person[]> {
  if (person.email && !person.isMinor) return [person];
  const guardians = await db
    .select({ p: people })
    .from(guardianships)
    .innerJoin(people, eq(people.id, guardianships.parentPersonId))
    .where(eq(guardianships.childPersonId, person.id));
  const withEmail = guardians.map((g) => g.p).filter((p) => p.email);
  if (withEmail.length) return withEmail;
  if (person.householdId) {
    const [h] = await db.select().from(households).where(eq(households.id, person.householdId));
    if (h?.primaryContactPersonId) {
      const [pc] = await db.select().from(people).where(eq(people.id, h.primaryContactPersonId));
      if (pc?.email) return [pc];
    }
  }
  return person.email ? [person] : [];
}

async function deliverEmail(to: string, subject: string, html: string, text: string, attachments?: Attachment[]) {
  if (!hasResend()) {
    // Demo / local: nothing leaves the building; the message is still logged on the person's profile.
    return { id: "logged-only", ok: true as const };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const res = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "The Raleigh School of Ballet <office@raleighballet.com>",
    to,
    subject,
    html,
    text,
    attachments: attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
  });
  if (res.error) return { ok: false as const, error: res.error.message };
  return { ok: true as const, id: res.data?.id ?? "" };
}

async function deliverSms(to: string, body: string) {
  if (!hasTwilio()) return { ok: true as const, id: "logged-only" };
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body }),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  return res.ok ? { ok: true as const, id: json.sid ?? "" } : { ok: false as const, error: json.message ?? `Twilio ${res.status}` };
}

export function unsubscribeUrl(personId: string) {
  return `${appUrl()}/unsubscribe?t=${signToken({ k: "unsub", p: personId }, daysMs(3650))}`;
}

export type SendOptions = {
  /** Same key twice = second send is skipped. Makes cron jobs safe to re-run. */
  dedupeKey?: string;
  attachments?: Attachment[];
  campaignId?: string;
  marketing?: boolean;
  channel?: "email" | "sms" | "both";
  templateKey?: string;
  smsBody?: string;
};

/** Send one already-worded message to one recipient and log it. */
export async function sendRaw(db: Tx, to: Person, about: Person | null, subject: string, bodyMd: string, opts: SendOptions = {}) {
  const s = await loadSettings(db);
  const channel = opts.channel ?? "email";
  const results: string[] = [];
  const logFor = about ?? to;

  if ((channel === "email" || channel === "both") && to.email) {
    if (opts.marketing && !to.emailOptIn) {
      results.push("skipped");
    } else {
      const key = opts.dedupeKey ? `${opts.dedupeKey}:email:${to.id}` : null;
      const inserted = await db
        .insert(messages)
        .values({
          campaignId: opts.campaignId,
          personId: logFor.id,
          channel: "email",
          templateKey: opts.templateKey,
          toAddress: to.email,
          subject,
          body: bodyMd,
          dedupeKey: key,
        })
        .onConflictDoNothing()
        .returning({ id: messages.id });
      if (inserted.length) {
        const html = await render(
          createElement(EmailLayout, {
            studioName: s.studio_name,
            preview: subject,
            html: markdownToEmailHtml(bodyMd),
            footer: `${s.studio_name} · ${s.studio_address} · ${s.studio_phone}`,
            unsubscribeUrl: opts.marketing ? unsubscribeUrl(to.id) : undefined,
          }),
        );
        const r = await deliverEmail(to.email, subject, html, bodyMd, opts.attachments).catch((e: Error) => ({ ok: false as const, error: e.message }));
        await db
          .update(messages)
          .set(r.ok ? { status: "sent", providerId: r.id, sentAt: new Date() } : { status: "failed", error: r.error })
          .where(eq(messages.id, inserted[0].id));
        results.push(r.ok ? "sent" : "failed");
      }
    }
  }
  if ((channel === "sms" || channel === "both") && to.phone && to.smsOptIn && opts.smsBody) {
    const key = opts.dedupeKey ? `${opts.dedupeKey}:sms:${to.id}` : null;
    const inserted = await db
      .insert(messages)
      .values({ campaignId: opts.campaignId, personId: logFor.id, channel: "sms", templateKey: opts.templateKey, toAddress: to.phone, body: opts.smsBody, dedupeKey: key })
      .onConflictDoNothing()
      .returning({ id: messages.id });
    if (inserted.length) {
      const r = await deliverSms(to.phone, opts.smsBody).catch((e: Error) => ({ ok: false as const, error: e.message }));
      await db
        .update(messages)
        .set(r.ok ? { status: "sent", providerId: r.id, sentAt: new Date() } : { status: "failed", error: r.error })
        .where(eq(messages.id, inserted[0].id));
      results.push(r.ok ? "sent" : "failed");
    }
  }
  return results;
}

/**
 * Send one of the automated messages about a person (to them, or to their
 * guardians if they are a child). Never throws: a mail problem must not undo a booking.
 */
export async function notify(db: Tx, key: TemplateKey, personOrId: Person | string, vars: Vars = {}, opts: SendOptions = {}) {
  try {
    const person = typeof personOrId === "string" ? (await db.select().from(people).where(eq(people.id, personOrId)))[0] : personOrId;
    if (!person) return;
    const def = TEMPLATES[key];
    const [override] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, key));
    if (override && !override.enabled) return;
    const s = await loadSettings(db);
    const recipients = await contactsFor(db, person);
    for (const to of recipients) {
      const all: Vars = {
        studio_name: s.studio_name,
        studio_phone: s.studio_phone,
        account_url: `${appUrl()}/account`,
        schedule_url: `${appUrl()}/schedule`,
        login_url: `${appUrl()}/login`,
        first_name: to.firstName,
        child_name: person.firstName,
        ...vars,
      };
      const smsTpl = override?.smsBody ?? ("sms" in def ? def.sms : undefined);
      await sendRaw(db, to, person, fillTags(override?.subject ?? def.subject, all), fillTags(override?.body ?? def.body, all), {
        ...opts,
        templateKey: key,
        marketing: def.kind === "marketing",
        channel: smsTpl ? "both" : "email",
        smsBody: smsTpl ? fillTags(smsTpl, all) : undefined,
      });
    }
  } catch (e) {
    console.error(`[notify:${key}]`, e);
  }
}

export async function peopleByIds(db: Tx, ids: string[]) {
  return ids.length ? db.select().from(people).where(inArray(people.id, ids)) : [];
}
