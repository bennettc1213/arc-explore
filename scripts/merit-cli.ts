/** Shared CLI mechanics only. No verification entrypoint is imported or invoked here. */
export function assertMeritWriteTarget(args: string[], env: Record<string, string | undefined> = process.env) {
  const target = env.MERIT_DATABASE_URL ?? env.DATABASE_URL;
  if (!target) throw new Error("Set MERIT_DATABASE_URL or DATABASE_URL for the intended database");
  const parsed = new URL(target);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  // Matches the repository's existing guarded staging configuration.
  const staging = parsed.username.includes("dgkjfmohtphrmispucwf");
  if (!local && !staging && !args.includes("--allow-production")) throw new Error("Remote database writes require --allow-production; the repository's known staging database is exempt");
  env.DATABASE_URL = target;
}

export async function withMeritDatabase<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  finally { const { closeDb } = await import("../src/db/client"); await closeDb(); }
}
