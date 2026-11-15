import { fmtDateTime } from "@/lib/format";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { aud } from "@/lib/pricing";
import { joinGroup } from "@/app/actions";
import { Avatar, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const VIS: Record<string, string> = { PUBLIC: "Open to all", PRIVATE: "Private", INVITE_ONLY: "Invite only", APPROVAL_REQUIRED: "Host approval" };

export default async function Groups() {
  const user = await currentUser();
  const groups = await db.groupActivity.findMany({
    where: { startsAt: { gte: new Date() }, visibility: { in: ["PUBLIC", "APPROVAL_REQUIRED"] }, category: { active: true } },
    orderBy: { startsAt: "asc" },
    include: { category: true, host: { select: { displayName: true, avatarHue: true, verified: true } }, participants: { select: { userId: true } } },
  });

  return (
    <>
      <PageHeader title="Join me: group experiences" sub="Walks, game nights, gallery crawls and welcome brunches hosted by verified Mates. A relaxed way to meet people." />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-2">
        {groups.map((g) => {
          const joined = !!user && g.participants.some((p) => p.userId === user.id);
          const left = g.places - g.participants.length;
          return (
            <article key={g.id} className="card flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="chip">{g.category.emoji} {g.category.name}</span>
                <span className="text-xs text-muted">{VIS[g.visibility]}</span>
              </div>
              <h2 className="mt-3 text-lg font-bold text-ocean">{g.title}</h2>
              <p className="mt-1 flex-1 text-sm">{g.description}</p>
              <p className="mt-3 text-sm text-muted">
                {fmtDateTime(g.startsAt, "long")} · {g.durationMins / 60} hr · {g.suburb}, {g.state}
              </p>
              <p className="mt-1 text-xs text-muted">{g.conditions}</p>
              <div className="mt-4 flex items-center gap-3">
                <Avatar name={g.host.displayName} hue={g.host.avatarHue} size={32} />
                <span className="flex-1 text-sm">Hosted by {g.host.displayName}{g.host.verified && " ✓"}</span>
                <span className="font-semibold text-ocean">{g.priceCents ? aud(g.priceCents) : "Free"}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-muted">{left} of {g.places} places left</span>
                {joined ? (
                  <span className="chip-coral">You&apos;re going</span>
                ) : user?.role === "CUSTOMER" && left > 0 ? (
                  <form action={joinGroup.bind(null, g.id)}>
                    <button className="btn-primary">{g.visibility === "APPROVAL_REQUIRED" ? "Request to join" : `Join${g.priceCents ? ` · ${aud(g.priceCents)}` : ""}`}</button>
                  </form>
                ) : !user ? (
                  <a href="/signin" className="btn-ghost">Sign in to join</a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
