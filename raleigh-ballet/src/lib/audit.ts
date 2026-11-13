import type { Tx } from "@/db/types";
import { auditLog } from "@/db/schema";

/** Write one line to the audit log. Called for every override, refund, adjustment, charge and archive. */
export async function audit(
  db: Tx,
  entry: { actor?: string | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown },
) {
  await db.insert(auditLog).values({
    actorUserId: entry.actor ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null) as object | null,
    after: (entry.after ?? null) as object | null,
  });
}
