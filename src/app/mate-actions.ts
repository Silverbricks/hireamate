"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { screenText } from "@/lib/policy";
import { geocode } from "@/server/location";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";
import type { FormState } from "./actions";

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15);

const ProfileInput = z.object({
  displayName: z.string().trim().min(2).max(40),
  intro: z.string().trim().min(10, "Add a one-line introduction (10+ characters)").max(160),
  about: z.string().trim().min(40, "Tell customers a little more about you (40+ characters)").max(2000),
  suburb: z.string().trim().min(2, "Choose your service suburb"),
  serviceRadiusKm: z.coerce.number().int().min(1).max(100),
  hourlyRate: z.coerce.number().min(25, "Minimum rate is $25/hour").max(500),
  minBookingHours: z.coerce.number().min(1).max(12),
  maxBookingHours: z.coerce.number().min(1).max(12),
  boundaries: z.string().trim().min(10, "Describe your boundaries and conditions").max(1000),
  experience: z.string().trim().max(500).optional(),
  equipmentNote: z.string().trim().max(300).optional(),
  travelFeePerKm: z.coerce.number().min(0).max(5).default(0),
  minTravelFee: z.coerce.number().min(0).max(100).default(0),
  freeFirstMeetMins: z.coerce.number().int().refine((n) => [0, 30, 60, 120].includes(n), "Free first meet must be off, 30 min, 1 hour or 2 hours").default(0),
  fixedTravelFee: z.coerce.number().min(0).max(100).default(0),
  introWeeklyLimit: z.coerce.number().int().min(0).max(100).optional(),
});

/** Mate profile create/edit (roadmap #3). Saving a draft or rejected profile submits it for admin review. */
export async function saveMateProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("MATE");
  const profile = user.mateProfile;
  if (!profile) return { error: "No Mate profile found." };

  const parsed = ProfileInput.safeParse({
    ...Object.fromEntries(fd),
    experience: fd.get("experience") || undefined,
    equipmentNote: fd.get("equipmentNote") || undefined,
    introWeeklyLimit: fd.get("introWeeklyLimit") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  if (p.minBookingHours > p.maxBookingHours) return { error: "Minimum booking length can't be more than the maximum." };
  for (const t of [p.intro, p.about, p.boundaries, p.experience ?? ""]) {
    const s = screenText(t);
    if (!s.ok) return { error: s.reason };
  }
  const { location } = await getSettings();
  if (p.serviceRadiusKm > location.maxRadiusKm) return { error: `Service radius can be up to ${location.maxRadiusKm} km.` };

  const place = await geocode(p.suburb);
  if (!place || !place.suburb) return { error: "Choose your service suburb from the list (no street address needed)." };

  const serviceIds = fd.getAll("services").map(String);
  if (!serviceIds.length) return { error: "Choose at least one service or household skill." };
  const valid = await db.service.findMany({ where: { id: { in: serviceIds }, active: true } });

  const data = {
    displayName: p.displayName, intro: p.intro, about: p.about,
    serviceSuburb: place.suburb, state: place.state!, lat: place.lat, lng: place.lng, // suburb centroid, never a home address
    serviceRadiusKm: p.serviceRadiusKm, hourlyRateCents: Math.round(p.hourlyRate * 100),
    minBookingHours: p.minBookingHours, maxBookingHours: p.maxBookingHours,
    boundaries: p.boundaries, experience: p.experience ?? null, equipmentNote: p.equipmentNote ?? null,
    languages: list(fd.get("languages")), interests: list(fd.get("interests")), qualities: fd.getAll("qualities").map(String).slice(0, 10),
    travelFeePerKmCents: Math.round(p.travelFeePerKm * 100), minTravelFeeCents: Math.round(p.minTravelFee * 100),
    fixedTravelFeeCents: Math.round(p.fixedTravelFee * 100), introWeeklyLimit: p.introWeeklyLimit ?? null,
    acceptOutsideArea: fd.get("acceptOutsideArea") === "on", groupAvailable: fd.get("groupAvailable") === "on",
    accessibilityAware: fd.get("accessibilityAware") === "on",
    offersFreeFirstMeet: p.freeFirstMeetMins > 0, freeFirstMeetMins: p.freeFirstMeetMins || null,
    status: profile.status === "DRAFT" || profile.status === "REJECTED" ? ("PENDING_REVIEW" as const) : profile.status,
  };
  await db.$transaction([
    db.mateProfile.update({ where: { id: profile.id }, data }),
    db.mateService.deleteMany({ where: { mateId: profile.id, restricted: false } }),
    db.mateService.createMany({ data: valid.map((s) => ({ mateId: profile.id, serviceId: s.id })), skipDuplicates: true }),
    db.user.update({ where: { id: user.id }, data: { displayName: p.displayName } }),
  ]);
  await audit(user.id, "mate.profile_saved", "MateProfile", profile.id, { status: data.status });
  revalidatePath("/mate/profile");
  revalidatePath(`/mates/${profile.id}`);
  return { ok: data.status === "PENDING_REVIEW" ? "Saved and submitted for review. We'll notify you when it's approved." : "Profile saved." };
}

// ---------- Availability (v1.2 s10) ----------

const toMin = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : NaN);

export async function addAvailability(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("MATE");
  const mateId = user.mateProfile!.id;
  const weekday = Number(fd.get("weekday"));
  const startMin = toMin(String(fd.get("start")));
  const endMin = toMin(String(fd.get("end")));
  if (!(weekday >= 0 && weekday <= 6) || !(startMin < endMin)) return { error: "Choose a day and an end time after the start time." };
  const overlap = await db.availability.findFirst({ where: { mateId, weekday, startMin: { lt: endMin }, endMin: { gt: startMin } } });
  if (overlap) return { error: "That overlaps an existing slot. Remove it first." };
  await db.availability.create({ data: { mateId, weekday, startMin, endMin } });
  revalidatePath("/mate/calendar");
  return { ok: "Added." };
}

export async function removeAvailability(id: string) {
  const user = await requireUser("MATE");
  await db.availability.deleteMany({ where: { id, mateId: user.mateProfile!.id } });
  revalidatePath("/mate/calendar");
}
