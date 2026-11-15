import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

// Platform configuration (v1.2 s8). Code defaults, overridable by Admin in the DB.
export const DEFAULT_SETTINGS = {
  general: {
    platformName: "HIRE A MATE",
    supportEmail: "support@hireamate.example",
    supportPhone: "1300 000 000",
    defaultCurrency: "AUD",
    defaultTimezone: "Australia/Sydney",
    defaultLanguage: "en-AU",
  },
  pricing: {
    customerFeeRate: 0.05, // shown to the customer at checkout
    customerFixedFeeCents: 0, // optional fixed booking fee in cents (s13.4)
    mateCommissionRate: 0.15, // deducted from Mate payout
    paymentWindowHours: 24, // time to pay after a Mate accepts
  },
  booking: {
    minAge: 18,
    freeCancellationHours: 24,
    recurringOccurrences: 4,
    enforceAvailability: true,
  },
  location: {
    defaultRadiusKm: 25,
    maxRadiusKm: 100,
  },
  security: {
    otpTtlMinutes: 10,
    otpMaxAttempts: 5,
    maxFailedLogins: 5,
    lockMinutes: 15,
    sessionDays: 14,
    minPasswordLength: 10,
  },
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingsSection = keyof Settings;

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.platformSetting.findMany();
  const merged = structuredClone(DEFAULT_SETTINGS) as Record<string, Record<string, unknown>>;
  for (const r of rows) {
    if (r.key in merged && r.value && typeof r.value === "object") {
      merged[r.key] = { ...merged[r.key], ...(r.value as Record<string, unknown>) };
    }
  }
  return merged as Settings;
});

/** Coerce admin form input to the type of the default value. Unknown keys are ignored. */
export function coerceSection<S extends SettingsSection>(section: S, input: Record<string, FormDataEntryValue>) {
  const defaults = DEFAULT_SETTINGS[section] as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, d] of Object.entries(defaults)) {
    if (!(k in input)) continue;
    const raw = String(input[k]);
    if (typeof d === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a non-negative number`);
      out[k] = n;
    } else if (typeof d === "boolean") out[k] = raw === "true" || raw === "on";
    else out[k] = raw.trim();
  }
  return out;
}
