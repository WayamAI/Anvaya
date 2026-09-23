import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The env module parses at import time, so each case re-imports it with a
 * fresh module registry rather than calling a function.
 */
const VALID = {
  DATABASE_URL: "postgresql://u:p@localhost:55432/anvaya?schema=public",
  NODE_ENV: "test",
};

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const original = { ...process.env };

  for (const [k, v] of Object.entries({ ...VALID, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  try {
    return await import("./env");
  } finally {
    process.env = original;
  }
}

describe("env configuration", () => {
  let snapshot: NodeJS.ProcessEnv;
  beforeEach(() => {
    snapshot = { ...process.env };
  });
  afterEach(() => {
    process.env = snapshot;
    vi.resetModules();
  });

  it("accepts a valid PostgreSQL configuration", async () => {
    const { env } = await loadEnv({});
    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.NODE_ENV).toBe("test");
  });

  it("applies documented defaults", async () => {
    const { env } = await loadEnv({});
    expect(env.SESSION_MAX_AGE_SECONDS).toBe(28_800);
    expect(env.APP_URL).toBe("http://localhost:8080");
    expect(env.LOG_PRETTY).toBe(false);
  });

  it("rejects a missing DATABASE_URL with a readable message", async () => {
    await expect(loadEnv({ DATABASE_URL: undefined })).rejects.toThrow(/DATABASE_URL/);
  });

  it("rejects a non-PostgreSQL DATABASE_URL", async () => {
    await expect(loadEnv({ DATABASE_URL: "mysql://u:p@localhost/anvaya" })).rejects.toThrow(
      /must be a PostgreSQL connection string/,
    );
  });

  it("rejects an AUTH_SECRET that is too short to be safe", async () => {
    await expect(loadEnv({ AUTH_SECRET: "too-short" })).rejects.toThrow(/at least 32/);
  });

  it("coerces numeric settings from their string form", async () => {
    const { env } = await loadEnv({ SESSION_MAX_AGE_SECONDS: "3600" });
    expect(env.SESSION_MAX_AGE_SECONDS).toBe(3600);
  });

  it("parses LOG_PRETTY into a boolean", async () => {
    const { env } = await loadEnv({ LOG_PRETTY: "true" });
    expect(env.LOG_PRETTY).toBe(true);
  });
});
