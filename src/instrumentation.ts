// Runs once when the server starts (Next.js instrumentation hook). SRS v1.3 s27: fail fast on unsafe config.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSafeConfig, configProblems } = await import("./server/env");
  assertSafeConfig();
  for (const p of configProblems()) console.warn(`[config] ${p}`);
}
