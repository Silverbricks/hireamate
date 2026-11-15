// SRS v1.3 s27: production environment safety.
// Development-only features are OFF unless explicitly enabled AND not running in production.
// A missing variable can never switch a development feature on.

export const isProduction = () => process.env.NODE_ENV === "production" && process.env.HAM_ENV !== "local";

/**
 * Demo login, /dev/inbox, console message providers and simulated payments.
 * `next start` sets NODE_ENV=production, so local/E2E runs of a production build must also set HAM_ENV=local.
 * HAM_ENV=local must never be set on a deployed environment.
 */
export function devFeaturesEnabled() {
  return process.env.ALLOW_DEMO_LOGIN === "true" && !isProduction();
}

/** Problems that make the current configuration unsafe to run. Empty array = OK. */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (isProduction()) {
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET must be set (32+ characters).");
    if (process.env.ALLOW_DEMO_LOGIN === "true") problems.push("ALLOW_DEMO_LOGIN must not be enabled in production.");
    if (!process.env.APP_URL?.startsWith("https://")) problems.push("APP_URL must be an https:// URL.");
    if (!process.env.NEXT_PUBLIC_MAP_TILE_URL) problems.push("NEXT_PUBLIC_MAP_TILE_URL (licensed map tiles) is not set: maps will be disabled.");
  }
  return problems;
}

/** Fatal subset: production refuses to start. */
export function assertSafeConfig() {
  const fatal = configProblems().filter((p) => !p.includes("maps will be disabled"));
  if (fatal.length) throw new Error(`Unsafe production configuration:\n- ${fatal.join("\n- ")}`);
}

/** Providers that only exist for development. In production they refuse to send/charge. */
export const DEV_ONLY_PROVIDERS = new Set(["console", "simulated"]);
