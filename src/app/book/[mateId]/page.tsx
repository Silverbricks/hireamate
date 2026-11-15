import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { currentUser, isFullyVerified } from "@/lib/session";
import { getSettings } from "@/server/settings";
import { suburbList } from "@/server/location";
import { POLICY_SUMMARY } from "@/lib/policy";
import BookingForm from "@/components/BookingForm";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: { params: Promise<{ mateId: string }>; searchParams: Promise<{ freeMeet?: string }> }) {
  const { mateId } = await params;
  const { freeMeet } = await searchParams;
  const [user, mate, restricted, settings, suburbs] = await Promise.all([
    currentUser(),
    db.mateProfile.findUnique({
      where: { id: mateId },
      select: {
        id: true, displayName: true, avatarHue: true, hourlyRateCents: true, minBookingHours: true, maxBookingHours: true,
        equipmentNote: true, boundaries: true, status: true, lat: true, lng: true, serviceRadiusKm: true,
        acceptOutsideArea: true, travelFeePerKmCents: true, minTravelFeeCents: true, fixedTravelFeeCents: true,
        offersFreeFirstMeet: true, freeFirstMeetMins: true,
        services: { where: { restricted: false, service: { active: true, category: { active: true } } }, include: { service: { include: { category: true } } } },
      },
    }),
    db.restrictedTask.findMany({ orderBy: { name: "asc" } }),
    getSettings(),
    suburbList(),
  ]);
  if (!mate || mate.status !== "APPROVED") notFound();
  if (user && user.role === "CUSTOMER" && !isFullyVerified(user)) redirect("/verify");

  if (!user || user.role !== "CUSTOMER") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="h1">Sign in to book</h1>
        <p className="mt-2 text-muted">You need a customer account to request a booking with {mate.displayName}.</p>
        <Link href="/signin" className="btn-ocean mt-6">Sign in</Link>
      </div>
    );
  }

  const services = mate.services.filter((s) => !freeMeet || s.service.category.kind !== "HOUSEHOLD").map((s) => ({
    id: s.service.id,
    name: s.service.name,
    category: s.service.category.name,
    household: s.service.category.kind === "HOUSEHOLD",
    estMins: s.service.estMins,
    minHours: s.service.minHours,
    inclusions: s.service.inclusions,
    exclusions: s.service.exclusions,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center gap-3">
        <Avatar name={mate.displayName} hue={mate.avatarHue} size={48} />
        <div>
          <h1 className="h1">{freeMeet ? `Free first meet with ${mate.displayName}` : `Request a booking with ${mate.displayName}`}</h1>
          <p className="text-sm text-muted">{mate.displayName} will accept or decline. You pay only after they accept.</p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <BookingForm
          mate={{
            id: mate.id, name: mate.displayName, rateCents: mate.hourlyRateCents, minHours: mate.minBookingHours, maxHours: mate.maxBookingHours, equipment: mate.equipmentNote,
            centre: mate.lat != null && mate.lng != null ? { lat: mate.lat, lng: mate.lng } : null, radiusKm: mate.serviceRadiusKm,
            acceptOutsideArea: mate.acceptOutsideArea, perKmCents: mate.travelFeePerKmCents, minTravelCents: mate.minTravelFeeCents,
            fixedTravelCents: mate.fixedTravelFeeCents,
          }}
          freeMeet={freeMeet && mate.offersFreeFirstMeet && mate.freeFirstMeetMins ? { introId: freeMeet, mins: mate.freeFirstMeetMins } : null}
          fixedFeeCents={settings.pricing.customerFixedFeeCents}
          suburbs={suburbs}
          services={services}
          feeRate={settings.pricing.customerFeeRate}
          freeCancellationHours={settings.booking.freeCancellationHours}
          recurringOccurrences={settings.booking.recurringOccurrences}
          policy={POLICY_SUMMARY}
        />
        <aside className="space-y-4">
          <div className="card p-5 text-sm">
            <p className="font-semibold text-ocean">{mate.displayName}&apos;s boundaries</p>
            <p className="mt-1">{mate.boundaries}</p>
          </div>
          <div className="card p-5 text-sm">
            <p className="font-semibold text-ocean">Not available on HIRE A MATE</p>
            <ul className="mt-2 space-y-1.5">
              {restricted.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-muted">{r.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
