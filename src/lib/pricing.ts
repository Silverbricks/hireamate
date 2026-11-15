// Pricing maths. Rates come from Admin → Settings (see src/server/settings.ts); these are fallbacks.
// All fees must be disclosed before purchase (SRS 20.3).
export const CUSTOMER_BOOKING_FEE_RATE = 0.05;
export const MATE_COMMISSION_RATE = 0.15;

export const DURATION_OPTIONS_HOURS = [1, 2, 3, 4, 6, 8] as const;

export type PriceBreakdown = {
  hours: number;
  lines: { mateId: string; name: string; rateCents: number; amountCents: number }[];
  subtotalCents: number;
  travelFeeCents: number;
  customerFeeCents: number;
  totalCents: number;
};

export function priceBooking(
  hours: number,
  mates: { id: string; displayName: string; hourlyRateCents: number }[],
  feeRate = CUSTOMER_BOOKING_FEE_RATE,
  travelFeeCents = 0,
  fixedFeeCents = 0, // SRS v1.3 s13.4 fixed service fee
): PriceBreakdown {
  const lines = mates.map((m) => ({
    mateId: m.id,
    name: m.displayName,
    rateCents: m.hourlyRateCents,
    amountCents: Math.round(m.hourlyRateCents * hours),
  }));
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  // Booking fee applies to service time only, not to pass-through travel charges.
  const customerFeeCents = Math.round(subtotalCents * feeRate) + (subtotalCents > 0 ? fixedFeeCents : 0);
  return { hours, lines, subtotalCents, travelFeeCents, customerFeeCents, totalCents: subtotalCents + travelFeeCents + customerFeeCents };
}

/** Household multi-task estimate: total task minutes, rounded up to the half hour, at least minHours. */
export function estimateTaskHours(taskMins: number[], minHours = 1): number {
  const total = taskMins.reduce((a, b) => a + b, 0);
  return Math.max(minHours, Math.ceil(total / 30) / 2);
}

export function mateNetCents(grossCents: number, rate = MATE_COMMISSION_RATE) {
  const commission = Math.round(grossCents * rate);
  return { gross: grossCents, commission, net: grossCents - commission };
}

export const aud = (cents: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
