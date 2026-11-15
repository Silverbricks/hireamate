// Pure identity helpers (no server-only imports, so they're unit-testable).

/** Normalise an Australian mobile to E.164 (+614XXXXXXXX). Returns null if invalid. */
export function normaliseAuMobile(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+?61|0)?(4\d{8})$/);
  return m ? `+61${m[1]}` : null;
}

export function ageOn(dob: Date, on = new Date()) {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export const maskEmail = (e: string) => e.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
export const maskMobile = (m: string) => m.replace(/^(\+\d{4}).*(\d{3})$/, "$1•••$2");

export function passwordProblem(pw: string, minLength: number): string | null {
  if (pw.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Password must include letters and numbers.";
  return null;
}
