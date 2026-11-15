import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { answerIntroduction } from "@/app/account-actions";
import { blockUser, sendMessage } from "@/app/actions";
import StatefulForm from "@/components/StatefulForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const LABEL = { PENDING: "Waiting for reply", ACCEPTED: "Accepted", DECLINED: "Declined", MORE_INFO: "More info requested" };

export default async function IntroductionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const intro = await db.introduction.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, displayName: true } },
      mate: { select: { id: true, userId: true, displayName: true, freeFirstMeetMins: true, offersFreeFirstMeet: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, displayName: true } } } },
    },
  });
  if (!intro || (intro.customerId !== user.id && intro.mate.userId !== user.id)) notFound();
  const isMate = intro.mate.userId === user.id;

  return (
    <>
      <PageHeader title={isMate ? `Introduction from ${intro.customer.displayName}` : `Your introduction to ${intro.mate.displayName}`} sub={`${LABEL[intro.status]} · sent ${fmtDateTime(intro.createdAt)}`} />
      <div className="mx-auto max-w-3xl space-y-4 px-4">
        <div className="card p-5 text-sm">
          <p className="font-semibold text-ocean">Suggested activity: {intro.proposedActivity}</p>
          <p className="mt-2 whitespace-pre-line">{intro.message}</p>
          {intro.wantsFreeMeet && <p className="mt-2 chip-coral">Asked about a free {intro.mate.freeFirstMeetMins}-minute first meet</p>}
          {intro.mateReply && <p className="mt-3 border-l-2 border-coral pl-3">{intro.mate.displayName}: {intro.mateReply}</p>}
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <form action={blockUser.bind(null, isMate ? intro.customer.id : intro.mate.userId, "/")}><button className="text-muted underline">Block {isMate ? intro.customer.displayName : intro.mate.displayName}</button></form>
          <Link href={isMate ? "/help" : `/report?mate=${intro.mate.id}`} className="text-muted underline">Report</Link>
        </div>

        {isMate && intro.status !== "ACCEPTED" && intro.status !== "DECLINED" && (
          <StatefulForm action={answerIntroduction} submitLabel="Send response" resetOnOk={false} className="card space-y-3 p-5">
            <input type="hidden" name="introductionId" value={intro.id} />
            <div className="flex flex-wrap gap-3 text-sm">
              {[["ACCEPTED", "Accept & open chat"], ["MORE_INFO", "Ask for more info"], ["DECLINED", "Decline"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5"><input type="radio" name="decision" value={v} required className="accent-ocean" /> {l}</label>
              ))}
            </div>
            <textarea name="reply" rows={3} className="input" placeholder="Optional reply" />
            <p className="text-xs text-muted">You never have to offer free time, and declining has no effect on your ranking.</p>
          </StatefulForm>
        )}

        {intro.status === "ACCEPTED" ? (
          <section className="card p-5">
            <h2 className="h2">Chat</h2>
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {intro.messages.length === 0 && <li className="text-sm text-muted">Say hello and agree on a plan. Bookings are made from the Mate&apos;s profile.</li>}
              {intro.messages.map((m) => (
                <li key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender.id === user.id ? "ml-auto bg-ocean text-white" : "bg-ivory"}`}>
                  <p className="text-xs opacity-70">{m.sender.displayName} · {fmtTime(m.createdAt)}</p>{m.body}
                </li>
              ))}
            </ul>
            <StatefulForm action={sendMessage} submitLabel="Send" className="mt-3 flex flex-wrap items-start gap-2">
              <input type="hidden" name="introductionId" value={intro.id} />
              <input name="body" className="input flex-1" placeholder="Write a message…" maxLength={1000} required />
            </StatefulForm>
            {!isMate && (
              <div className="mt-4 flex flex-wrap gap-2">
                {intro.mate.offersFreeFirstMeet && intro.mate.freeFirstMeetMins && (
                  <Link href={`/book/${intro.mate.id}?freeMeet=${intro.id}`} className="btn-primary">Book free first meet ({intro.mate.freeFirstMeetMins} min)</Link>
                )}
                <Link href={`/book/${intro.mate.id}`} className="btn-ghost">Book a paid activity</Link>
              </div>
            )}
          </section>
        ) : (
          <p className="text-sm text-muted">Chat opens once {isMate ? "you accept" : `${intro.mate.displayName} accepts`}. An introduction doesn&apos;t promise a meeting, friendship or a relationship.</p>
        )}
      </div>
    </>
  );
}
