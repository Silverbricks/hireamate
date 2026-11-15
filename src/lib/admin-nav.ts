import type { Permission } from "./permissions";

// Each item is shown only to staff whose role grants the permission. Pages re-check server-side.
export const ADMIN_NAV: [string, string, Permission][] = [
  ["/admin", "Overview & analytics", "analytics.view"],
  ["/admin/mates", "Mate approvals", "mates.review"],
  ["/admin/support", "Support & safety", "support.manage"],
  ["/admin/catalogue", "Services", "catalogue.manage"],
  ["/admin/membership", "Membership", "membership.manage"],
  ["/admin/comms", "Communications", "comms.manage"],
  ["/admin/settings", "Settings & integrations", "settings.manage"],
  ["/admin/staff", "Staff & roles", "staff.manage"],
  ["/admin/audit", "Audit log", "audit.view"],
];
