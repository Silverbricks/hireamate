import { requireUser } from "@/lib/session";
import { submitReport } from "@/app/actions";
import StatefulForm from "@/components/StatefulForm";
import ReportFields from "@/components/ReportFields";
import { PageHeader } from "@/components/ui";

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ mate?: string }> }) {
  await requireUser();
  const { mate } = await searchParams;
  return (
    <>
      <PageHeader title="Report a concern" sub="Reports go to the HIRE A MATE safety team and are kept confidential. If anyone is in immediate danger, call 000." />
      <div className="mx-auto max-w-xl px-4">
        <StatefulForm action={submitReport} submitLabel="Send report" className="card space-y-3 p-5">
          <ReportFields mateId={mate} />
        </StatefulForm>
      </div>
    </>
  );
}
