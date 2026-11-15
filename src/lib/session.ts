import { redirect } from "next/navigation";
import { sessionUser } from "@/server/auth";
import { can, type Permission } from "./permissions";

export const currentUser = sessionUser;

export async function requireUser(role?: "CUSTOMER" | "MATE" | "ADMIN") {
  const user = await sessionUser();
  if (!user) redirect("/signin");
  if (role && user.role !== role) redirect("/signin?wrongRole=" + role);
  return user;
}

/** Staff-only, and the staff member's role must grant `perm` (SRS v1.3 s4.3). */
export async function requirePermission(perm: Permission) {
  const user = await requireUser("ADMIN");
  if (!can(user, perm)) redirect(`/admin/forbidden?need=${perm}`);
  return user;
}

/** Contact details verified and 18+ eligibility recorded: required before booking or introductions. */
export function isFullyVerified(u: { emailVerifiedAt: Date | null; mobileVerifiedAt: Date | null; ageVerifiedAt: Date | null }) {
  return !!(u.emailVerifiedAt && u.mobileVerifiedAt && u.ageVerifiedAt);
}

export async function requireVerifiedUser(role?: "CUSTOMER" | "MATE" | "ADMIN") {
  const user = await requireUser(role);
  if (!isFullyVerified(user)) redirect("/verify");
  return user;
}
