import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { guardianships, people, staffInvites, userRoles, type Person, type Role } from "@/db/schema";
import { hasSupabase, isDemo } from "@/lib/env";
import { signToken, verifyToken } from "@/lib/tokens";
import { daysMs } from "@/lib/time";
import { supabaseServer } from "@/lib/supabase/server";

export const DEMO_COOKIE = "rsb_demo";

export type Viewer = {
  userId: string;
  email: string | null;
  /** null until the person finishes onboarding. */
  person: Person | null;
  roles: Role[];
};

/** Who is signed in (verified with Supabase, or the demo cookie in demo mode). */
async function currentAuthUser(): Promise<{ id: string; email: string | null } | null> {
  if (hasSupabase()) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  if (isDemo()) {
    const t = verifyToken<{ uid: string; email?: string }>((await cookies()).get(DEMO_COOKIE)?.value);
    return t ? { id: t.uid, email: t.email ?? null } : null;
  }
  return null;
}

export async function setDemoSession(userId: string, email: string | null) {
  if (!isDemo() || hasSupabase()) throw new Error("Demo sign-in is switched off");
  (await cookies()).set(DEMO_COOKIE, signToken({ uid: userId, email }, daysMs(30)), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
}

export async function signOut() {
  if (hasSupabase()) await (await supabaseServer()).auth.signOut();
  (await cookies()).delete(DEMO_COOKIE);
}

/**
 * First sign-in housekeeping: attach an existing record with the same (verified)
 * email — e.g. someone imported from the spreadsheets — and hand out any staff role they were invited to.
 */
async function linkUser(user: { id: string; email: string | null }): Promise<Person | null> {
  if (!user.email) return null;
  const email = user.email.toLowerCase();
  const [match] = await db
    .select()
    .from(people)
    .where(and(sql`lower(${people.email}) = ${email}`, isNull(people.authUserId), isNull(people.mergedIntoId)))
    .limit(1);
  let person: Person | null = null;
  if (match) {
    [person] = await db.update(people).set({ authUserId: user.id, lastActivityAt: new Date(), status: "active", archivedAt: null }).where(eq(people.id, match.id)).returning();
    await db.insert(userRoles).values({ userId: user.id, role: person.isMinor ? "student" : "student" }).onConflictDoNothing();
    const kids = await db.select().from(guardianships).where(eq(guardianships.parentPersonId, person.id)).limit(1);
    if (kids.length) await db.insert(userRoles).values({ userId: user.id, role: "parent" }).onConflictDoNothing();
  }
  const invites = await db.select().from(staffInvites).where(and(sql`lower(${staffInvites.email}) = ${email}`, isNull(staffInvites.claimedAt)));
  for (const inv of invites) {
    await db.insert(userRoles).values({ userId: user.id, role: inv.role }).onConflictDoNothing();
    await db.update(staffInvites).set({ claimedAt: new Date() }).where(eq(staffInvites.id, inv.id));
    if (!person) {
      [person] = await db
        .insert(people)
        .values({ authUserId: user.id, firstName: inv.firstName || email.split("@")[0], lastName: inv.lastName, email, source: "staff_invite" })
        .returning();
    }
  }
  return person;
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await currentAuthUser();
  if (!user) return null;
  let [person] = await db.select().from(people).where(eq(people.authUserId, user.id));
  if (!person) person = (await linkUser(user)) as Person;
  const roles = (await db.select().from(userRoles).where(eq(userRoles.userId, user.id))).map((r) => r.role);
  return { userId: user.id, email: user.email, person: person ?? null, roles };
});

export async function requireViewer(next = "/account"): Promise<Viewer & { person: Person }> {
  const v = await getViewer();
  if (!v) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!v.person) redirect("/onboarding");
  return v as Viewer & { person: Person };
}

export const hasRole = (v: Viewer | null, ...roles: Role[]) => !!v && (v.roles.includes("admin") || roles.some((r) => v.roles.includes(r)));

/** Stop here unless the signed-in user holds one of these roles (admin always passes). */
export async function requireRole(...roles: Role[]) {
  const v = await requireViewer();
  if (!hasRole(v, ...roles)) redirect("/account?error=" + encodeURIComponent("You don't have access to that page."));
  return v;
}
export const requireAdmin = () => requireRole("admin");
export const requireDesk = () => requireRole("desk");
export const requireInstructor = () => requireRole("instructor");

/** The people this viewer may act for: themselves and the children they are guardian of. */
export async function familyOf(v: Viewer & { person: Person }): Promise<Person[]> {
  const kids = await db
    .select({ p: people })
    .from(guardianships)
    .innerJoin(people, eq(people.id, guardianships.childPersonId))
    .where(eq(guardianships.parentPersonId, v.person.id));
  return [v.person, ...kids.map((k) => k.p).filter((p) => !p.mergedIntoId)];
}

/** Throws unless the viewer is this person, their guardian, or staff with the right role. */
export async function assertCanActFor(v: Viewer & { person: Person }, personId: string, ...staffRoles: Role[]): Promise<void> {
  if (v.person.id === personId) return;
  if (hasRole(v, ...staffRoles)) return;
  const [g] = await db
    .select()
    .from(guardianships)
    .where(and(eq(guardianships.parentPersonId, v.person.id), eq(guardianships.childPersonId, personId)));
  if (!g) throw new Error("You can't manage that person.");
}
