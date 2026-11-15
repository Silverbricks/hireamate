import Link from "next/link";
import { PageHeader } from "@/components/ui";

const CUSTOMER = [
  ["Tell us what you need", "Pick a feeling or activity on the homepage, or search by category, suburb, day and budget."],
  ["Choose your Mate", "Compare verified profiles, skills, reviews, boundaries and hourly rates."],
  ["Send a request", "Describe the activity or tasks. See the full price, fees and expenses before you send. Your payment is held, not charged."],
  ["Your Mate accepts", "Once accepted, the booking is confirmed and in-app messaging opens."],
  ["Enjoy it", "Your Mate checks in on the day. Confirm completion when you're done."],
  ["Leave a review", "Only customers with a completed booking can review, one review per booking."],
];

const MATE = [
  ["Create your profile", "Share your interests, languages, qualities and the activities or household tasks you accept."],
  ["Set your terms", "Your rate, availability, service radius, min/max booking length and personal boundaries."],
  ["Accept what suits you", "Accept or decline each request, including each session in a recurring series. Declining never affects your ranking."],
  ["Get paid", "Payouts follow customer confirmation, minus a clearly shown platform commission."],
];

export default function HowItWorks() {
  return (
    <>
      <PageHeader title="How it works" sub="Simple, transparent and safe, for customers and Mates." />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-2">
        <Steps title="Booking a Mate" steps={CUSTOMER} />
        <div className="space-y-6">
          <Steps title="Becoming a Mate" steps={MATE} />
          <div className="card p-6">
            <h2 className="h2">Recurring help</h2>
            <p className="mt-2 text-sm">Weekly coffee, fortnightly cleaning or monthly meal prep: choose a repeat schedule. Each session is a separate request so nobody is locked in, and either side can stop future sessions.</p>
            <Link href="/find" className="btn-primary mt-4">Find a Mate</Link>
          </div>
        </div>
      </div>
    </>
  );
}

function Steps({ title, steps }: { title: string; steps: string[][] }) {
  return (
    <section className="card p-6">
      <h2 className="h2">{title}</h2>
      <ol className="mt-4 space-y-4">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-coral font-bold text-ocean-700">{i + 1}</span>
            <div><p className="font-semibold text-ocean">{t}</p><p className="text-sm text-muted">{d}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
