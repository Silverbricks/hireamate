import "server-only";
import type { TxKind } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { isProduction } from "./env";

// Payments (v1.2 s6). Every money movement goes through a PaymentProvider and is written to the
// PaymentTransaction ledger with an idempotency key, so retries can't double-charge.
//
// Only the "simulated" provider exists today. Stripe Connect is intentionally NOT implemented yet:
// confirm the marketplace model (destination charges vs separate charges & transfers, who is merchant
// of record, payout timing) with Stripe first, then add a `stripe` provider implementing this interface.
// Customer payments are not described as escrow.

export type ChargeResult = { ok: true; ref: string } | { ok: false; error: string };

export interface PaymentProvider {
  name: string;
  charge(p: { amountCents: number; currency: string; idempotencyKey: string; description: string; simulateDecline?: boolean }): Promise<ChargeResult>;
  refund(p: { chargeRef: string; amountCents: number; idempotencyKey: string }): Promise<ChargeResult>;
  payout(p: { amountCents: number; currency: string; idempotencyKey: string; mateId: string }): Promise<ChargeResult>;
}

const PROD_BLOCK = { ok: false as const, error: "Payments are not available yet." };

const simulated: PaymentProvider = {
  name: "simulated",
  async charge(p) {
    if (isProduction()) return PROD_BLOCK; // SRS v1.3 s27: never simulate success in production
    if (p.simulateDecline) return { ok: false, error: "Your card was declined (simulated)." };
    return { ok: true, ref: `sim_ch_${p.idempotencyKey}` };
  },
  async refund(p) { return isProduction() ? PROD_BLOCK : { ok: true, ref: `sim_re_${p.idempotencyKey}` }; },
  async payout(p) { return isProduction() ? PROD_BLOCK : { ok: true, ref: `sim_po_${p.idempotencyKey}` }; },
};

const PROVIDERS: Record<string, PaymentProvider> = { simulated };

export async function paymentProvider(): Promise<PaymentProvider> {
  const row = await db.integrationSetting.findUnique({ where: { kind: "PAYMENTS" } });
  return PROVIDERS[row?.provider ?? "simulated"] ?? simulated;
}

type LedgerInput = {
  userId: string; kind: TxKind; amountCents: number; description: string; idempotencyKey: string;
  bookingId?: string; subscriptionId?: string; mateId?: string; grossCents?: number; commissionCents?: number; feeCents?: number;
};

/** Run a provider call once per idempotency key and record the result in the ledger. */
async function recorded(input: LedgerInput, call: (p: PaymentProvider) => Promise<ChargeResult>) {
  const existing = await db.paymentTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing?.status === "SUCCEEDED") return { ok: true as const, tx: existing };
  const provider = await paymentProvider();
  const tx =
    existing ??
    (await db.paymentTransaction.create({ data: { ...input, provider: provider.name, status: "PENDING", currency: "AUD" } }));
  const r = await call(provider);
  const updated = await db.paymentTransaction.update({
    where: { id: tx.id },
    data: r.ok ? { status: "SUCCEEDED", providerRef: r.ref } : { status: "FAILED", description: `${input.description} (${r.error})` },
  });
  await audit(input.userId, `payment.${input.kind.toLowerCase()}.${r.ok ? "succeeded" : "failed"}`, "PaymentTransaction", tx.id, {
    amountCents: input.amountCents, bookingId: input.bookingId ?? null,
  });
  return r.ok ? { ok: true as const, tx: updated } : { ok: false as const, error: r.error, tx: updated };
}

export function chargeBooking(userId: string, bookingId: string, amountCents: number, attempt: number, simulateDecline = false, feeCents?: number) {
  return recorded(
    { userId, kind: "BOOKING_CAPTURE", amountCents, bookingId, feeCents, description: "Booking payment", idempotencyKey: `booking:${bookingId}:charge:${attempt}` },
    (p) => p.charge({ amountCents, currency: "AUD", idempotencyKey: `booking:${bookingId}:charge:${attempt}`, description: `Booking ${bookingId}`, simulateDecline }),
  );
}

export async function refundBooking(bookingId: string, actorId: string) {
  const charge = await db.paymentTransaction.findFirst({ where: { bookingId, kind: "BOOKING_CAPTURE", status: "SUCCEEDED" } });
  if (!charge) return null; // nothing was paid
  return recorded(
    { userId: charge.userId, kind: "REFUND", amountCents: charge.amountCents, bookingId, description: `Refund (by ${actorId === charge.userId ? "customer" : "staff/Mate"})`, idempotencyKey: `booking:${bookingId}:refund` },
    (p) => p.refund({ chargeRef: charge.providerRef!, amountCents: charge.amountCents, idempotencyKey: `booking:${bookingId}:refund` }),
  );
}

/** Mate payouts are recorded PENDING on completion and released by the payout run (not built yet). */
export async function recordMatePayout(mateUserId: string, mateId: string, bookingId: string, netCents: number, grossCents?: number, commissionCents?: number) {
  await db.paymentTransaction.upsert({
    where: { idempotencyKey: `booking:${bookingId}:payout:${mateId}` },
    create: {
      userId: mateUserId, kind: "MATE_PAYOUT", status: "PENDING", amountCents: netCents, provider: (await paymentProvider()).name,
      bookingId, mateId, grossCents, commissionCents, description: "Mate payout (pending release)", idempotencyKey: `booking:${bookingId}:payout:${mateId}`,
    },
    update: {},
  });
}

export function chargeSubscription(userId: string, subscriptionId: string, amountCents: number, period: string, planName: string) {
  return recorded(
    { userId, kind: "SUBSCRIPTION", amountCents, subscriptionId, description: `${planName} membership`, idempotencyKey: `sub:${subscriptionId}:${period}` },
    (p) => p.charge({ amountCents, currency: "AUD", idempotencyKey: `sub:${subscriptionId}:${period}`, description: `${planName} membership` }),
  );
}
