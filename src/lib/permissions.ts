import type { StaffRole } from "@prisma/client";

// SRS v1.3 s4.3: role-based access for staff. One place to read and change who can do what.
// Every privileged action is also written to the audit log by the action itself.

export const PERMISSIONS = {
  "analytics.view": "View analytics and dashboards",
  "finance.export": "Export financial data and view the payments ledger",
  "bookings.view": "View any booking",
  "mates.review": "Review Mate applications (approve, reject, request info)",
  "mates.verify": "Mark identity verification and trigger re-verification",
  "mates.suspend": "Suspend Mates and restrict services",
  "support.manage": "Handle support tickets",
  "safety.manage": "Handle safety reports and escalations",
  "catalogue.manage": "Manage categories, services and homepage choices",
  "membership.manage": "Manage membership plans",
  "comms.manage": "Edit templates and retry deliveries",
  "settings.manage": "Change platform settings",
  "integrations.manage": "Change integration providers",
  "audit.view": "View the audit log",
  "staff.manage": "Add staff and assign roles",
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];
const SUPPORT: Permission[] = ["support.manage", "bookings.view"];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  SUPER_ADMIN: ALL,
  GENERAL_MANAGER: ALL.filter((p) => p !== "staff.manage" && p !== "integrations.manage"),
  OPERATIONS_MANAGER: ["analytics.view", "bookings.view", "mates.review", "mates.suspend", "support.manage", "safety.manage", "catalogue.manage", "comms.manage", "audit.view"],
  MATE_RECRUITMENT_OFFICER: ["mates.review"],
  VERIFICATION_OFFICER: ["mates.review", "mates.verify"],
  CUSTOMER_SUPPORT: SUPPORT,
  MATE_SUPPORT: SUPPORT,
  BOOKING_COORDINATOR: SUPPORT,
  SAFETY_OFFICER: ["safety.manage", "support.manage", "bookings.view", "mates.suspend", "audit.view"],
  COMPLAINTS_OFFICER: ["support.manage", "safety.manage", "bookings.view"],
  FINANCE_OFFICER: ["analytics.view", "finance.export", "bookings.view", "membership.manage"],
  MARKETING_MANAGER: ["analytics.view", "catalogue.manage", "comms.manage"],
  QUALITY_OFFICER: ["analytics.view", "bookings.view", "mates.review", "audit.view"],
  REGIONAL_MANAGER: ["analytics.view", "bookings.view", "mates.review", "support.manage"], // TODO: scope to staffRegion
  TEAM_LEADER: ["analytics.view", "support.manage", "bookings.view"],
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Admin", GENERAL_MANAGER: "General Manager", OPERATIONS_MANAGER: "Operations Manager",
  MATE_RECRUITMENT_OFFICER: "Mate Recruitment Officer", VERIFICATION_OFFICER: "Verification Officer",
  CUSTOMER_SUPPORT: "Customer Support", MATE_SUPPORT: "Mate Support", BOOKING_COORDINATOR: "Booking Coordinator",
  SAFETY_OFFICER: "Safety Officer", COMPLAINTS_OFFICER: "Complaints Officer", FINANCE_OFFICER: "Finance Officer",
  MARKETING_MANAGER: "Marketing Manager", QUALITY_OFFICER: "Quality Officer", REGIONAL_MANAGER: "Regional Manager", TEAM_LEADER: "Team Leader",
};

type StaffLike = { role: string; staffRole: StaffRole | null } | null | undefined;

export function can(user: StaffLike, perm: Permission) {
  return !!user && user.role === "ADMIN" && !!user.staffRole && ROLE_PERMISSIONS[user.staffRole].includes(perm);
}
