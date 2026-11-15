"use client";

import { startTransition, useActionState, useState } from "react";
import type { FormState } from "@/app/actions";
import { aud } from "@/lib/pricing";

/**
 * Payment step after acceptance. With the simulated provider no card details are collected.
 * When the Stripe provider is added, this panel hosts Stripe's Payment Element instead,
 * so card data never touches HIRE A MATE servers.
 */
export default function PaymentPanel({
  action, bookingId, lines, totalCents, partial, freeCancellationHours,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  bookingId: string;
  lines: { label: string; cents: number }[];
  totalCents: number;
  partial: boolean;
  freeCancellationHours: number;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [decline, setDecline] = useState(false);
  return (
    <section className="card border-2 border-coral p-5">
      <h2 className="h2">Pay to confirm</h2>
      <p className="mt-1 text-sm text-muted">
        {partial ? "Some Mates haven't answered yet. Paying now confirms the booking with the Mates who accepted." : "Your Mate accepted. Pay now to confirm the booking."}
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {lines.map((l) => <li key={l.label} className="flex justify-between"><span>{l.label}</span><span>{aud(l.cents)}</span></li>)}
        <li className="flex justify-between border-t border-ocean/10 pt-1 font-bold text-ocean"><span>Total</span><span>{aud(totalCents)}</span></li>
      </ul>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <div className="rounded-xl bg-ivory p-3 text-xs text-muted">
          <p className="font-semibold text-ocean">Test payment mode</p>
          <p>Payments are simulated in this build. No card details are collected.</p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="simulateDecline" value="1" checked={decline} onChange={(e) => setDecline(e.target.checked)} className="accent-ocean" /> Simulate a declined card
          </label>
        </div>
        {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Processing…" : `Pay ${aud(totalCents)}`}</button>
        <p className="text-xs text-muted">Full refund if you cancel more than {freeCancellationHours} hours before the start.</p>
      </form>
    </section>
  );
}
