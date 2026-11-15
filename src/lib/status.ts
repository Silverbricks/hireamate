import type { BookingStatus, MateResponse } from "@prisma/client";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  DRAFT: "Draft",
  PENDING_PAYMENT: "Accepted: awaiting payment",
  PAYMENT_AUTHORISED: "Payment authorised",
  PENDING_MATE_ACCEPTANCE: "Waiting for Mate",
  PARTIALLY_ACCEPTED: "Partially accepted",
  CONFIRMED: "Confirmed",
  MATE_ON_WAY: "Mate on the way",
  CHECKED_IN: "Checked in",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLATION_REQUESTED: "Cancellation requested",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
  FAILED: "Failed",
  NO_SHOW: "No show",
};

/** Derive booking status from each Mate's individual response (SRS 10.4 partial acceptance). */
export function deriveStatus(responses: MateResponse[]): BookingStatus {
  const accepted = responses.filter((r) => r === "ACCEPTED").length;
  const pending = responses.filter((r) => r === "PENDING").length;
  if (accepted === 0 && pending === 0) return "CANCELLED";
  if (accepted === 0) return "PENDING_MATE_ACCEPTANCE";
  if (accepted === responses.length) return "CONFIRMED";
  return "PARTIALLY_ACCEPTED";
}

// Allowed lifecycle transitions driven by the Mate after confirmation.
// Only paid (CONFIRMED) bookings can start.
export const MATE_PROGRESS: Partial<Record<BookingStatus, BookingStatus>> = {
  CONFIRMED: "MATE_ON_WAY",
  MATE_ON_WAY: "CHECKED_IN",
  CHECKED_IN: "IN_PROGRESS",
};

export const CHAT_OPEN: BookingStatus[] = [
  "PARTIALLY_ACCEPTED",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "MATE_ON_WAY",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
];
