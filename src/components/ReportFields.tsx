export const REPORT_REASONS = [
  "Sexual or intimate request",
  "Harassment, pressure or coercion",
  "Unwanted physical contact",
  "Safety concern",
  "Asked to do a restricted task",
  "Sharing contact details / off-platform payment",
  "No show or misrepresentation",
  "Other",
];

export default function ReportFields({ bookingId, mateId }: { bookingId?: string; mateId?: string }) {
  return (
    <>
      {bookingId && <input type="hidden" name="bookingId" value={bookingId} />}
      {mateId && <input type="hidden" name="mateId" value={mateId} />}
      <select name="reason" className="input" defaultValue="" required>
        <option value="" disabled>Choose a reason</option>
        {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
      </select>
      <textarea name="details" rows={3} className="input" placeholder="What happened? This goes to the safety team only." required />
    </>
  );
}
