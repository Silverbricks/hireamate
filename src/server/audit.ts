import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Append-only audit trail for security, money and admin changes (v1.2 s15). Never throws. */
export async function audit(
  actorId: string | null | undefined,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Prisma.InputJsonValue,
) {
  try {
    await db.auditLog.create({ data: { actorId: actorId ?? null, action, entity, entityId: entityId ?? null, meta } });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
