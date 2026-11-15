// Addendum 2.6: strict non-sexual, non-intimate policy.
// Server-side screening of free text in booking requests and messages. This is a first line
// of defence only; flagged content is blocked and humans review reports in Admin.

const PROHIBITED_PATTERNS: RegExp[] = [
  /\bsex(ual|y)?\b/i,
  /\bintima(te|cy)\b/i,
  /\bnud(e|ity|es)\b/i,
  /\bnaked\b/i,
  /\bescort\b/i,
  /\bmassage\b/i,
  /\bhook ?up\b/i,
  /\bovernight (with|in) (my|the same) (room|bed)\b/i,
  /\bshare (a|my|the) bed\b/i,
  /\bpretend (to be|you'?re) my (girlfriend|boyfriend|partner|wife|husband)\b/i,
  /\b(girlfriend|boyfriend) experience\b/i,
  /\bfavou?rs?\b.*\b(physical|special)\b/i,
];

// Off-platform contact sharing before permission (SRS 18).
const CONTACT_PATTERNS: RegExp[] = [
  /\b(\+?61|0)4\d{2}[ -]?\d{3}[ -]?\d{3}\b/, // AU mobile
  /[\w.+-]+@[\w-]+\.[\w.]+/, // email
];

export type ScreenResult = { ok: true } | { ok: false; reason: string };

export function screenText(text: string, opts: { allowContact?: boolean } = {}): ScreenResult {
  if (PROHIBITED_PATTERNS.some((p) => p.test(text))) {
    return {
      ok: false,
      reason:
        "HIRE A MATE is a platonic companionship and activity platform. Requests for sexual, intimate or romantic-relationship services are not permitted.",
    };
  }
  if (!opts.allowContact && CONTACT_PATTERNS.some((p) => p.test(text))) {
    return {
      ok: false,
      reason: "Please keep phone numbers and email addresses off the platform until both people agree to share them.",
    };
  }
  return { ok: true };
}

export const POLICY_SUMMARY = [
  "A booking covers only the agreed activity and companionship time.",
  "It does not buy affection, intimacy, exclusivity, romance or a relationship.",
  "Sexual services, nudity requests, unwanted touching, coercion and harassment are prohibited.",
  "No one is required to drink alcohol. Venue entry and age rules apply.",
  "Either person can decline, cancel or report an inappropriate request at any time.",
];
