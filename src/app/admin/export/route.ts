import { db } from "@/lib/db";
import { sessionUser } from "@/server/auth";
import { audit } from "@/server/audit";
import { can } from "@/lib/permissions";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Quote, escape quotes, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const toCsv = (rows: Record<string, unknown>[]) =>
  rows.length ? [Object.keys(rows[0]).map(csvCell).join(","), ...rows.map((r) => Object.values(r).map(csvCell).join(","))].join("\n") : "";

/** CSV export (v1.2 s13). Admin only; contains no contact details or legal names. */
export async function GET(req: Request) {
  const user = await sessionUser();
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  // Bookings export needs analytics access; the ledger needs finance access (SRS v1.3 s4.3).
  if (!can(user, type === "transactions" ? "finance.export" : "analytics.view")) return new Response("Forbidden", { status: 403 });
  if (!user) return new Response("Forbidden", { status: 403 });
  const days = Math.min(Number(url.searchParams.get("days")) || 30, 365);
  const since = new Date(Date.now() - days * 86400_000);

  let rows: Record<string, unknown>[] = [];
  if (type === "bookings") {
    const bookings = await db.booking.findMany({
      where: { createdAt: { gte: since } },
      include: { service: { include: { category: true } }, mates: { include: { mate: { select: { displayName: true, state: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    rows = bookings.map((b) => ({
      id: b.id, createdAt: b.createdAt, startsAt: b.startsAt, status: b.status, category: b.service.category.name, service: b.service.name,
      mates: b.mates.map((m) => `${m.mate.displayName}:${m.response}`).join("|"), state: b.mates[0]?.mate.state ?? "",
      subtotalAUD: b.subtotalCents / 100, travelAUD: b.travelFeeCents / 100, feeAUD: b.customerFeeCents / 100, totalAUD: b.totalCents / 100, paidAt: b.paidAt,
    }));
  } else if (type === "transactions") {
    const txs = await db.paymentTransaction.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" } });
    rows = txs.map((t) => ({
      id: t.id, createdAt: t.createdAt, kind: t.kind, status: t.status, amountAUD: t.amountCents / 100, currency: t.currency,
      provider: t.provider, providerRef: t.providerRef, bookingId: t.bookingId, subscriptionId: t.subscriptionId, description: t.description,
    }));
  } else return new Response("Unknown export type", { status: 400 });

  await audit(user.id, "admin.export", "Export", type, { days, rows: rows.length });
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hireamate-${type}-${days}d.csv"` },
  });
}
