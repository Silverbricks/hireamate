import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

// Membership (v1.2 s5). Limits are enforced here, server-side. Paid plans never gate ordinary
// bookings, receiving gifts, or already-authorised messaging.

export type Limits = {
  favourites: number;
  introductionsPerMonth: number;
  galleryPhotos: number;
  introVideos: number;
  featuredEligible: boolean;
  analytics: "basic" | "advanced";
};

const FALLBACK: Limits = { favourites: 10, introductionsPerMonth: 3, galleryPhotos: 9, introVideos: 0, featuredEligible: false, analytics: "basic" };

export async function currentPlan(user: { id: string; role: Role }) {
  const sub = await db.userSubscription.findFirst({
    where: { userId: user.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, currentPeriodEnd: { gt: new Date() } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (sub) return { plan: sub.plan, subscription: sub, limits: { ...FALLBACK, ...(sub.plan.limits as Partial<Limits>) } };
  const free = await db.subscriptionPlan.findFirst({ where: { audience: user.role, monthlyCents: 0 }, orderBy: { sortOrder: "asc" } });
  return { plan: free, subscription: null, limits: { ...FALLBACK, ...((free?.limits ?? {}) as Partial<Limits>) } };
}

export class LimitError extends Error {}

/** Throws LimitError with an upgrade hint when the user is at their plan's limit. */
export async function assertWithinLimit(user: { id: string; role: Role }, key: "favourites" | "introductionsPerMonth") {
  const { limits, plan } = await currentPlan(user);
  const used =
    key === "favourites"
      ? await db.favourite.count({ where: { userId: user.id } })
      : await db.introduction.count({
          where: { customerId: user.id, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        });
  if (used >= limits[key]) {
    const what = key === "favourites" ? `${limits[key]} favourites` : `${limits[key]} introductions a month`;
    throw new LimitError(`Your ${plan?.name ?? "current"} plan includes ${what}. Upgrade your membership for more.`);
  }
}
