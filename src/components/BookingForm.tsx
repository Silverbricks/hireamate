"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { createBooking } from "@/app/actions";
import { aud, DURATION_OPTIONS_HOURS, estimateTaskHours } from "@/lib/pricing";
import { haversineKm, travelFeeCents } from "@/lib/geo";

type Svc = {
  id: string; name: string; category: string; household: boolean; estMins: number; minHours: number;
  inclusions: string[]; exclusions: string[];
};

const RECURRENCE = [
  ["ONE_TIME", "One-time"],
  ["DAILY", "Daily"],
  ["WEEKLY", "Weekly"],
  ["FORTNIGHTLY", "Fortnightly"],
  ["MONTHLY", "Monthly"],
  ["WEEKENDS", "Weekends"],
] as const;

type SuburbOpt = { name: string; state: string; postcode: string; lat: number; lng: number };
const suburbLabel = (s: SuburbOpt) => `${s.name} ${s.state} ${s.postcode}`;

export default function BookingForm({
  mate, services, suburbs, feeRate, freeCancellationHours, recurringOccurrences, policy, freeMeet, fixedFeeCents,
}: {
  mate: {
    id: string; name: string; rateCents: number; minHours: number; maxHours: number; equipment: string | null;
    centre: { lat: number; lng: number } | null; radiusKm: number; acceptOutsideArea: boolean; perKmCents: number; minTravelCents: number;
    fixedTravelCents: number;
  };
  freeMeet: { introId: string; mins: number } | null;
  fixedFeeCents: number;
  services: Svc[];
  suburbs: SuburbOpt[];
  feeRate: number;
  freeCancellationHours: number;
  recurringOccurrences: number;
  policy: string[];
}) {
  const [state, action, pending] = useActionState(createBooking, undefined);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [tasks, setTasks] = useState<string[]>([]);
  const [hours, setHours] = useState<number>(0);
  const [recurrence, setRecurrence] = useState("ONE_TIME");
  const [suburb, setSuburb] = useState("");
  const place = suburbs.find((s) => suburbLabel(s).toLowerCase() === suburb.trim().toLowerCase());
  const distanceKm = place && mate.centre ? Math.round(haversineKm(place, mate.centre) * 10) / 10 : null;
  const outsideArea = distanceKm != null && distanceKm > mate.radiusKm && !mate.acceptOutsideArea;
  // SRS v1.3 s9.4: fixed + distance-based travel charge. None on a free first meet.
  const travel = freeMeet ? 0 : mate.fixedTravelCents + travelFeeCents(distanceKm, mate.perKmCents, mate.minTravelCents);

  const primary = services.find((s) => s.id === serviceId);
  const household = services.filter((s) => s.household);
  const isHousehold = !!primary?.household;
  const shopping = isHousehold && [primary, ...household.filter((s) => tasks.includes(s.id))].some((s) => /grocer|shopping/i.test(s?.name ?? ""));

  const quote = useMemo(() => {
    if (!primary) return null;
    const selected = isHousehold ? household.filter((s) => s.id === primary.id || tasks.includes(s.id)) : [];
    const est = isHousehold ? estimateTaskHours(selected.map((s) => s.estMins), primary.minHours) : 0;
    const h = freeMeet ? freeMeet.mins / 60 : Math.max(hours || 0, est, primary.minHours, isHousehold ? 0 : 1);
    const sub = freeMeet ? 0 : Math.round(mate.rateCents * h);
    const fee = sub > 0 ? Math.round(sub * feeRate) + fixedFeeCents : 0;
    return { est, h, sub, fee, total: sub + fee + travel, mins: selected.reduce((a, s) => a + s.estMins, 0), outOfRange: !freeMeet && (h < mate.minHours || h > mate.maxHours) };
  }, [primary, isHousehold, household, tasks, hours, mate, feeRate, travel, freeMeet, fixedFeeCents]);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <form
      className="card space-y-5 p-6"
      // Submit manually so React doesn't reset the form when the server returns an error.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <input type="hidden" name="mateId" value={mate.id} />
      {freeMeet && (
        <>
          <input type="hidden" name="freeMeetIntroId" value={freeMeet.introId} />
          <input type="hidden" name="recurrence" value="ONE_TIME" />
          <div className="rounded-2xl bg-coral-100 p-4 text-sm text-coral-600">
            <p className="font-semibold">Free first meet: {freeMeet.mins} minutes, $0 service time</p>
            <p>Meet somewhere public. Any costs (e.g. your own coffee or tickets) must be agreed below. There&apos;s no automatic paid extension, and a free meet doesn&apos;t promise friendship, a relationship or a future booking.</p>
          </div>
        </>
      )}

      <div>
        <label className="label" htmlFor="serviceId">Service or activity</label>
        <select id="serviceId" name="serviceId" className="input" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setTasks([]); }}>
          {Object.entries(Object.groupBy(services, (s) => s.category)).map(([cat, list]) => (
            <optgroup key={cat} label={cat}>
              {list!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
        {primary && (
          <div className="mt-2 grid gap-2 rounded-xl bg-ivory p-3 text-xs sm:grid-cols-2">
            <div><p className="font-semibold text-ocean">Included</p><ul className="list-disc pl-4">{primary.inclusions.map((i) => <li key={i}>{i}</li>)}</ul></div>
            <div><p className="font-semibold text-ocean">Not included</p><ul className="list-disc pl-4">{primary.exclusions.map((i) => <li key={i}>{i}</li>)}</ul></div>
          </div>
        )}
      </div>

      {isHousehold && household.length > 1 && (
        <fieldset>
          <legend className="label">Add more tasks to this visit</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {household.filter((s) => s.id !== serviceId).map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-xl border border-ocean/10 p-2 text-sm">
                <input type="checkbox" name="taskIds" value={s.id} className="accent-ocean" checked={tasks.includes(s.id)}
                  onChange={(e) => setTasks((t) => (e.target.checked ? [...t, s.id] : t.filter((x) => x !== s.id)))} />
                <span className="flex-1">{s.name}</span>
                <span className="text-xs text-muted">~{s.estMins} min</span>
              </label>
            ))}
          </div>
          {mate.equipment && <p className="mt-2 text-xs text-muted">Equipment: {mate.equipment}</p>}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input id="date" name="date" type="date" min={tomorrow} defaultValue={tomorrow} className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="time">Start time</label>
          <input id="time" name="time" type="time" defaultValue="18:00" className="input" required />
        </div>
        <div className={freeMeet ? "hidden" : ""}>
          <label className="label" htmlFor="hours">Duration</label>
          <select id="hours" name="hours" className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={0}>{isHousehold ? "Use task estimate" : "Minimum"}</option>
            {DURATION_OPTIONS_HOURS.map((h) => <option key={h} value={h}>{h} hours</option>)}
            <option value={10}>Full day (10 hours)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="suburb">Suburb</label>
          <input id="suburb" name="suburb" list="booking-suburbs" className="input" required value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Start typing a suburb" />
          <datalist id="booking-suburbs">{suburbs.map((s) => <option key={suburbLabel(s)} value={suburbLabel(s)} />)}</datalist>
          {distanceKm != null && (
            <p className={`mt-1 text-xs ${outsideArea ? "text-coral-600" : "text-muted"}`}>
              {distanceKm} km from {mate.name}&apos;s service area{outsideArea ? `: outside their ${mate.radiusKm} km radius` : ""}
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="meetingPoint">{isHousehold ? "Street address" : "Meeting point"}</label>
          <input id="meetingPoint" name="meetingPoint" className="input" required
            placeholder={isHousehold ? "Shared with your Mate only after they accept" : "e.g. Outside the State Library"} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="participants">People attending</label>
          <input id="participants" name="participants" type="number" min={1} max={20} defaultValue={1} className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="description">{isHousehold ? "Describe the work" : "Describe the activity"}</label>
        <textarea id="description" name="description" rows={4} className="input" required
          placeholder={isHousehold
            ? "e.g. Two-bedroom unit. Kitchen and bathroom clean, then cook a vegetarian dinner for 2. Ingredients in the fridge."
            : "e.g. Dinner at a Thai restaurant in Newtown, then a comedy show. I'll book the tickets."} />
        <p className="mt-1 text-xs text-muted">Please don&apos;t include phone numbers or emails. Use in-app messages once accepted.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="expensesNote">Tickets, transport &amp; other expenses</label>
          <input id="expensesNote" name="expensesNote" className="input" placeholder="Who pays for what?" />
        </div>
        {shopping ? (
          <div>
            <label className="label" htmlFor="expenseLimit">Authorised shopping spend (AUD)</label>
            <input id="expenseLimit" name="expenseLimit" type="number" min={0} max={1000} step={5} className="input" placeholder="e.g. 120" />
            <p className="mt-1 text-xs text-muted">Reimbursed against receipts, separate from the booking price.</p>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="accessibility">Accessibility needs (optional, private)</label>
            <input id="accessibility" name="accessibility" className="input" placeholder="e.g. step-free venue, slower walking pace" />
          </div>
        )}
      </div>

      <div className={freeMeet ? "hidden" : ""}>
        <label className="label">Repeat</label>
        <div className="flex flex-wrap gap-2">
          {RECURRENCE.map(([v, l]) => (
            <label key={v} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${recurrence === v ? "border-ocean bg-ocean text-white" : "border-ocean/15 bg-white text-ocean"}`}>
              <input type="radio" name={freeMeet ? undefined : "recurrence"} value={v} className="sr-only" checked={recurrence === v} onChange={() => setRecurrence(v)} /> {l}
            </label>
          ))}
        </div>
        {recurrence !== "ONE_TIME" && (
          <p className="mt-1 text-xs text-muted">We&apos;ll send the next {recurringOccurrences} sessions as separate requests. {mate.name} can accept or decline each one, and either of you can stop future sessions.</p>
        )}
      </div>

      {quote && (
        <div className="rounded-2xl bg-ocean p-4 text-white">
          <div className="flex justify-between text-sm"><span>{aud(mate.rateCents)}/hr × {quote.h} hr{isHousehold && quote.est ? ` (tasks ≈ ${quote.mins} min)` : ""}</span><span>{aud(quote.sub)}</span></div>
          {travel > 0 && <div className="flex justify-between text-sm"><span>Travel charge ({distanceKm} km)</span><span>{aud(travel)}</span></div>}
          <div className="flex justify-between text-sm text-ocean-100"><span>Booking fee{quote.fee ? ` (${Math.round(feeRate * 100)}%${fixedFeeCents ? ` + ${aud(fixedFeeCents)}` : ""})` : ""}</span><span>{aud(quote.fee)}</span></div>
          <div className="mt-2 flex justify-between border-t border-white/20 pt-2 font-bold"><span>Total{recurrence !== "ONE_TIME" ? " per session" : ""}</span><span>{aud(quote.total)}</span></div>
          <p className="mt-1 text-xs text-ocean-100">You pay after {mate.name} accepts. Extensions need both people to agree and are charged separately. Free cancellation more than {freeCancellationHours} hours before the start.</p>
          {quote.outOfRange && <p className="mt-2 rounded-lg bg-coral px-2 py-1 text-xs text-ocean-700">{mate.name} accepts {mate.minHours}–{mate.maxHours} hour bookings. Adjust tasks or duration.</p>}
        </div>
      )}

      <div className="rounded-2xl border border-coral/40 bg-coral-100/50 p-4 text-sm">
        <p className="font-semibold text-ocean">Community policy</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">{policy.map((p) => <li key={p}>{p}</li>)}</ul>
        <label className="mt-3 flex items-start gap-2 font-medium">
          <input type="checkbox" name="policy" className="mt-1 accent-ocean" required /> I understand and agree. This is a platonic booking for the activity and time described.
        </label>
      </div>

      {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending || quote?.outOfRange || outsideArea}>{pending ? "Sending request…" : freeMeet ? "Request free first meet" : "Send booking request"}</button>
    </form>
  );
}
