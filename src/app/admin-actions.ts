"use server";

import { revalidatePath } from "next/cache";
import type { IntegrationKind, Prisma, StaffRole, TicketPriority, TicketStatus } from "@prisma/client";
import { ROLE_LABEL, ROLE_PERMISSIONS, can } from "@/lib/permissions";
import { normaliseAuMobile } from "@/lib/identity";
import { sendTest } from "@/server/comms/notify";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { audit } from "@/server/audit";
import { DEFAULT_SETTINGS, coerceSection, type SettingsSection } from "@/server/settings";
import { notify, retryDelivery } from "@/server/comms/notify";
import { EMAIL_PROVIDERS, PUSH_PROVIDERS, SMS_PROVIDERS } from "@/server/comms/providers";
import type { FormState } from "./actions";


// ---------- Catalogue (addendum s4/s6) ----------

export async function toggleCategory(id: string) {
  const a = await requirePermission("catalogue.manage");
  const c = await db.category.findUniqueOrThrow({ where: { id } });
  await db.category.update({ where: { id }, data: { active: !c.active } });
  await audit(a.id, "admin.category_toggled", "Category", id, { active: !c.active });
  revalidatePath("/admin/catalogue");
}

export async function moveCategory(id: string, dir: -1 | 1) {
  await requirePermission("catalogue.manage");
  const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" } });
  const i = cats.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  await db.$transaction([
    db.category.update({ where: { id: cats[i].id }, data: { sortOrder: j } }),
    db.category.update({ where: { id: cats[j].id }, data: { sortOrder: i } }),
  ]);
  revalidatePath("/admin/catalogue");
}

export async function createCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("catalogue.manage");
  const name = String(fd.get("name") ?? "").trim();
  const emoji = String(fd.get("emoji") ?? "").trim() || "•";
  const description = String(fd.get("description") ?? "").trim();
  const kind = fd.get("kind") === "HOUSEHOLD" ? "HOUSEHOLD" : "COMPANION";
  const parentId = (fd.get("parentId") as string) || null;
  if (name.length < 3) return { error: "Name is too short." };
  const slug = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const count = await db.category.count();
  try {
    const c = await db.category.create({ data: { name, slug, emoji, description, kind, parentId, sortOrder: count } });
    await audit(a.id, "admin.category_created", "Category", c.id, { name });
  } catch {
    return { error: "A category with that name already exists." };
  }
  revalidatePath("/admin/catalogue");
  return { ok: `Created ${name}.` };
}

export async function toggleService(id: string) {
  const a = await requirePermission("catalogue.manage");
  const s = await db.service.findUniqueOrThrow({ where: { id } });
  await db.service.update({ where: { id }, data: { active: !s.active } });
  await audit(a.id, "admin.service_toggled", "Service", id, { active: !s.active });
  revalidatePath("/admin/catalogue");
}

export async function toggleNeed(id: string) {
  await requirePermission("catalogue.manage");
  const n = await db.need.findUniqueOrThrow({ where: { id } });
  await db.need.update({ where: { id }, data: { active: !n.active } });
  revalidatePath("/admin/catalogue");
}

export async function addRestrictedTask(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("catalogue.manage");
  const name = String(fd.get("name") ?? "").trim();
  const reason = String(fd.get("reason") ?? "").trim();
  if (!name || !reason) return { error: "Name and reason are required." };
  await db.restrictedTask.upsert({ where: { name }, create: { name, reason }, update: { reason } });
  await audit(a.id, "admin.restricted_task_saved", "RestrictedTask", name);
  revalidatePath("/admin/catalogue");
  return { ok: "Saved." };
}

// ---------- Safety & Mate approval ----------

export async function setReportStatus(id: string, status: "INVESTIGATING" | "ACTIONED" | "DISMISSED") {
  const a = await requirePermission("safety.manage");
  await db.report.update({ where: { id }, data: { status } });
  await audit(a.id, "safety.report_status", "Report", id, { status });
  revalidatePath("/admin");
}

// SRS v1.3 s7.4: approve, reject, request more info, suspend, re-verify, with reasons recorded.
const DECISIONS = {
  APPROVE: { perm: "mates.review", status: "APPROVED", needsReason: false },
  REJECT: { perm: "mates.review", status: "REJECTED", needsReason: true },
  REQUEST_INFO: { perm: "mates.review", status: "DRAFT", needsReason: true }, // Mate edits and resubmits
  SUSPEND: { perm: "mates.suspend", status: "SUSPENDED", needsReason: true },
  REVERIFY: { perm: "mates.verify", status: "PENDING_REVIEW", needsReason: true }, // hidden until re-approved
  MARK_VERIFIED: { perm: "mates.verify", status: null, needsReason: false },
} as const;
export type MateDecision = keyof typeof DECISIONS;

export async function decideMate(_prev: FormState, fd: FormData): Promise<FormState> {
  const mateId = String(fd.get("mateId"));
  const decision = String(fd.get("decision")) as MateDecision;
  const reason = String(fd.get("reason") ?? "").trim();
  const rule = DECISIONS[decision];
  if (!rule) return { error: "Choose a decision." };
  const a = await requirePermission(rule.perm);
  if (rule.needsReason && reason.length < 5) return { error: "Record a reason for this decision (shown to the Mate)." };
  const m = await db.mateProfile.update({
    where: { id: mateId },
    data: {
      ...(rule.status ? { status: rule.status } : {}),
      ...(decision === "MARK_VERIFIED" ? { verified: true } : decision === "REVERIFY" ? { verified: false } : {}),
      statusReason: reason || null,
    },
  });
  await audit(a.id, `mate.${decision.toLowerCase()}`, "MateProfile", mateId, { reason: reason || null });
  if (decision === "APPROVE") await notify(m.userId, "MATE_APPROVED");
  else await notify(m.userId, "MATE_DECISION", { decision: decision.toLowerCase().replace("_", " "), reason: reason || "-" });
  revalidatePath("/admin/mates");
  return { ok: "Decision recorded." };
}

/** s7.4 restrict services: hides one service of a Mate from search and booking; the Mate can't re-enable it. */
export async function setServiceRestricted(mateId: string, serviceId: string, restricted: boolean) {
  const a = await requirePermission("mates.suspend");
  await db.mateService.update({ where: { mateId_serviceId: { mateId, serviceId } }, data: { restricted } });
  await audit(a.id, restricted ? "mate.service_restricted" : "mate.service_unrestricted", "MateProfile", mateId, { serviceId });
  revalidatePath("/admin/mates");
}

// ---------- Staff management (SRS v1.3 s4.3) ----------

export async function createStaff(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("staff.manage");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const displayName = String(fd.get("displayName") ?? "").trim();
  const legalName = String(fd.get("legalName") ?? "").trim();
  const mobile = normaliseAuMobile(String(fd.get("mobile") ?? ""));
  const staffRole = String(fd.get("staffRole")) as StaffRole;
  if (!email.includes("@") || displayName.length < 2 || legalName.length < 2) return { error: "Enter name, legal name and email." };
  if (!mobile) return { error: "Staff need an Australian mobile for two-step sign-in." };
  if (!(staffRole in ROLE_PERMISSIONS)) return { error: "Choose a role." };
  if (await db.user.findFirst({ where: { OR: [{ email }, { mobile }] } })) return { error: "That email or mobile is already registered." };
  // No password: the staff member sets one via "Forgot password" (OTP), then signs in with password + code.
  const u = await db.user.create({
    data: { email, mobile, displayName, legalName, dateOfBirth: new Date("1900-01-01"), role: "ADMIN", staffRole, staffRegion: (fd.get("staffRegion") as string) || null,
      emailVerifiedAt: new Date(), mobileVerifiedAt: new Date(), ageVerifiedAt: new Date(), ageVerificationMethod: "STAFF_ONBOARDING" },
  });
  await audit(a.id, "staff.created", "User", u.id, { staffRole });
  revalidatePath("/admin/staff");
  return { ok: `${displayName} added as ${ROLE_LABEL[staffRole]}. They set a password with "Forgot password".` };
}

export async function setStaffRole(userId: string, staffRole: StaffRole | "DISABLED") {
  const a = await requirePermission("staff.manage");
  if (userId === a.id) return; // can't change your own role or lock yourself out
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "ADMIN") return;
  if (target.staffRole === "SUPER_ADMIN" && staffRole !== "SUPER_ADMIN") {
    const supers = await db.user.count({ where: { role: "ADMIN", staffRole: "SUPER_ADMIN", status: "ACTIVE" } });
    if (supers <= 1) return; // always keep one Super Admin
  }
  if (staffRole === "DISABLED") {
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } }),
      db.session.deleteMany({ where: { userId } }),
    ]);
  } else {
    await db.user.update({ where: { id: userId }, data: { staffRole, status: "ACTIVE" } });
  }
  await audit(a.id, "staff.role_changed", "User", userId, { from: target.staffRole, to: staffRole });
  revalidatePath("/admin/staff");
}

// ---------- Integration test send (SRS v1.3 s17.5) ----------

export async function sendTestMessage(channel: "EMAIL" | "SMS") {
  const a = await requirePermission("integrations.manage");
  await sendTest(channel, channel === "EMAIL" ? a.email : a.mobile ?? "", a.id);
  await audit(a.id, "integration.test_sent", "IntegrationSetting", channel);
  revalidatePath("/admin/settings");
}

// ---------- Platform configuration (v1.2 s8) ----------

export async function saveSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("settings.manage");
  const section = String(fd.get("section")) as SettingsSection;
  if (!(section in DEFAULT_SETTINGS)) return { error: "Unknown section." };
  let value: Record<string, unknown>;
  try {
    value = coerceSection(section, Object.fromEntries(fd));
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (section === "pricing" && ((value.customerFeeRate as number) > 0.5 || (value.mateCommissionRate as number) > 0.6)) {
    return { error: "Rates are fractions (0.05 = 5%) and look too high." };
  }
  await db.platformSetting.upsert({
    where: { key: section },
    create: { key: section, value: value as Prisma.InputJsonValue, updatedBy: a.id },
    update: { value: value as Prisma.InputJsonValue, updatedBy: a.id },
  });
  await audit(a.id, "admin.settings_updated", "PlatformSetting", section, value as Prisma.InputJsonValue);
  revalidatePath("/admin/settings");
  return { ok: "Settings saved." };
}

const PROVIDERS_BY_KIND: Record<IntegrationKind, string[]> = {
  EMAIL: Object.keys(EMAIL_PROVIDERS),
  SMS: Object.keys(SMS_PROVIDERS),
  PUSH: Object.keys(PUSH_PROVIDERS),
  MAPS: ["builtin", "google"],
  PAYMENTS: ["simulated"],
};

export async function saveIntegration(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("integrations.manage");
  const kind = String(fd.get("kind")) as IntegrationKind;
  const provider = String(fd.get("provider"));
  if (!PROVIDERS_BY_KIND[kind]?.includes(provider)) return { error: "Unknown provider." };
  const config = { senderId: String(fd.get("senderId") ?? "").trim() };
  await db.integrationSetting.upsert({ where: { kind }, create: { kind, provider, config }, update: { provider, config } });
  await audit(a.id, "admin.integration_updated", "IntegrationSetting", kind, { provider });
  revalidatePath("/admin/settings");
  return { ok: `${kind} provider set to ${provider}.` };
}

// ---------- Communications ----------

export async function saveTemplate(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("comms.manage");
  const id = String(fd.get("id"));
  const subject = (fd.get("subject") as string) ?? null;
  const body = String(fd.get("body") ?? "").trim();
  if (body.length < 5) return { error: "Template body is too short." };
  await db.messageTemplate.update({ where: { id }, data: { subject, body, active: fd.get("active") === "on" } });
  await audit(a.id, "admin.template_updated", "MessageTemplate", id);
  revalidatePath("/admin/comms");
  return { ok: "Template saved." };
}

export async function retryFailedDelivery(id: string) {
  const a = await requirePermission("comms.manage");
  await retryDelivery(id);
  await audit(a.id, "admin.delivery_retried", "DeliveryLog", id);
  revalidatePath("/admin/comms");
}

// ---------- Membership plans ----------

export async function savePlan(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await requirePermission("membership.manage");
  const id = String(fd.get("id"));
  const monthly = Number(fd.get("monthly"));
  const annual = Number(fd.get("annual"));
  let limits: unknown;
  try {
    limits = JSON.parse(String(fd.get("limits") ?? "{}"));
  } catch {
    return { error: "Limits must be valid JSON." };
  }
  if (!(monthly >= 0 && annual >= 0)) return { error: "Prices must be zero or more." };
  await db.subscriptionPlan.update({
    where: { id },
    data: { monthlyCents: Math.round(monthly * 100), annualCents: Math.round(annual * 100), limits: limits as Prisma.InputJsonValue, active: fd.get("active") === "on", trialDays: Number(fd.get("trialDays")) || 0 },
  });
  await audit(a.id, "admin.plan_updated", "SubscriptionPlan", id);
  revalidatePath("/admin/membership");
  return { ok: "Plan saved." };
}

// ---------- Support ----------

export async function updateTicket(id: string, data: { status?: TicketStatus; priority?: TicketPriority; assignToMe?: boolean }) {
  const a = await requirePermission("support.manage");
  const existing = await db.supportTicket.findUnique({ where: { id } });
  if (!existing || (existing.restricted && !can(a, "safety.manage"))) return; // s19.2 restricted access
  const t = await db.supportTicket.update({
    where: { id },
    data: {
      status: data.status, priority: data.priority, assigneeId: data.assignToMe ? a.id : undefined,
      ...(data.assignToMe && !data.status ? { status: "ASSIGNED" } : {}),
      ...(data.status === "RESOLVED" || data.status === "CLOSED" ? { resolvedAt: existing.resolvedAt ?? new Date() } : {}),
    },
  });
  await audit(a.id, "support.ticket_updated", "SupportTicket", id, data);
  if (data.status === "RESOLVED") await notify(t.requesterId, "TICKET_UPDATED", { number: t.number, ticketId: t.id });
  revalidatePath(`/admin/support`);
  revalidatePath(`/help/tickets/${id}`);
}
