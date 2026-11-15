import "server-only";
import { db } from "@/lib/db";

/** True if either user has blocked the other (SRS v1.3 s11.2, s12.1, s16.2). */
export async function isBlockedBetween(a: string, b: string) {
  const n = await db.block.count({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } });
  return n > 0;
}
