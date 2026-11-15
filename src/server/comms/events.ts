// Notification event catalogue (v1.2 s4.2). Categories drive user preferences;
// essential categories (security, safety, OTP) can't be switched off (s4.3).

export const CATEGORIES = {
  BOOKING: { label: "Bookings", essential: false },
  MESSAGE: { label: "Messages", essential: false },
  PAYMENT: { label: "Payments & refunds", essential: false },
  MEMBERSHIP: { label: "Membership", essential: false },
  INTRODUCTION: { label: "Introductions", essential: false },
  COMMUNITY: { label: "Community & groups", essential: false },
  MARKETING: { label: "News & offers", essential: false },
  SECURITY: { label: "Account security", essential: true },
  SAFETY: { label: "Safety alerts", essential: true },
} as const;
export type Category = keyof typeof CATEGORIES;

type EventDef = { category: Category; title: string; link?: string };

/** Titles/links for in-app notifications; email/SMS bodies come from editable templates. */
export const EVENTS = {
  OTP_CODE: { category: "SECURITY", title: "Your verification code" },
  WELCOME: { category: "SECURITY", title: "Welcome to HIRE A MATE", link: "/" },
  PASSWORD_CHANGED: { category: "SECURITY", title: "Your password was changed" },
  BOOKING_REQUESTED: { category: "BOOKING", title: "New booking request from {{customer}}", link: "/bookings/{{bookingId}}" },
  BOOKING_ACCEPTED: { category: "BOOKING", title: "{{mate}} accepted your booking. Please pay to confirm.", link: "/bookings/{{bookingId}}" },
  BOOKING_DECLINED: { category: "BOOKING", title: "{{mate}} can't take your booking", link: "/bookings/{{bookingId}}" },
  BOOKING_CONFIRMED: { category: "BOOKING", title: "Booking confirmed: {{service}} on {{when}}", link: "/bookings/{{bookingId}}" },
  BOOKING_CANCELLED: { category: "BOOKING", title: "Booking cancelled: {{service}}", link: "/bookings/{{bookingId}}" },
  MATE_ON_WAY: { category: "BOOKING", title: "{{mate}} is on the way", link: "/bookings/{{bookingId}}" },
  BOOKING_COMPLETED: { category: "BOOKING", title: "How was {{service}}? Leave a review", link: "/bookings/{{bookingId}}" },
  NEW_MESSAGE: { category: "MESSAGE", title: "New message from {{sender}}", link: "{{link}}" },
  PAYMENT_RECEIVED: { category: "PAYMENT", title: "Payment received: {{amount}}", link: "/bookings/{{bookingId}}" },
  REFUND_PROCESSED: { category: "PAYMENT", title: "Refund processed: {{amount}}", link: "/bookings/{{bookingId}}" },
  INTRO_RECEIVED: { category: "INTRODUCTION", title: "{{customer}} introduced themselves", link: "/mate" },
  INTRO_ANSWERED: { category: "INTRODUCTION", title: "{{mate}} replied to your introduction", link: "/introductions/{{introId}}" },
  MEMBERSHIP_ACTIVATED: { category: "MEMBERSHIP", title: "{{plan}} is now active", link: "/membership" },
  MEMBERSHIP_CANCELLED: { category: "MEMBERSHIP", title: "{{plan}} will end on {{date}}", link: "/membership" },
  MATE_APPROVED: { category: "SECURITY", title: "Your Mate profile is approved and live", link: "/mate" },
  MATE_DECISION: { category: "SECURITY", title: "Update on your Mate profile: {{decision}}", link: "/mate" },
  SOS_RAISED: { category: "SAFETY", title: "SOS raised on booking {{bookingId}}", link: "/help/tickets/{{ticketId}}" },  TICKET_UPDATED: { category: "SECURITY", title: "Support ticket #{{number}} updated", link: "/help/tickets/{{ticketId}}" },
} satisfies Record<string, EventDef>;
export type EventKey = keyof typeof EVENTS;

export function render(tpl: string, vars: Record<string, string | number>, escapeHtml = false) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    if (v == null) return "";
    const s = String(v);
    return escapeHtml ? s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) : s;
  });
}
