import { z } from "zod";

/**
 * Validated environment configuration.
 *
 * Parsed once, at module load. A missing or malformed variable fails the
 * process immediately with a message naming the variable, rather than
 * surfacing hours later as `undefined` somewhere in a query string.
 *
 * Import `env` from here rather than reading `process.env` directly, so every
 * consumer gets the parsed and typed value.
 */
const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — copy .env.example to .env")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * Connections per server instance. On serverless hosts every instance has
   * its own pool, so keep this small (2–5) and point DATABASE_URL at a pooled
   * endpoint (PgBouncer / Neon / Supabase pooler).
   */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  APP_URL: z.string().url().default("http://localhost:8080"),

  // Optional until Phase 3 wires authentication, but validated when present so
  // a too-short secret is caught at boot rather than at first login.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional(),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(28_800),
  /** Hard ceiling on a session however active it is; activity cannot extend past it. */
  SESSION_ABSOLUTE_MAX_SECONDS: z.coerce.number().int().positive().default(86_400),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  LOG_PRETTY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  SEED_USER_PASSWORD: z.string().min(8).optional(),

  /**
   * Pin the date read screens treat as "today" (YYYY-MM-DD). For the seeded
   * demo only; leave unset in production so the real clock is used.
   */
  PLANNING_AS_OF_DATE: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "PLANNING_AS_OF_DATE must be YYYY-MM-DD")])
    .optional()
    .transform((v) => (v ? v : undefined)),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV === "production") {
    // The cross-site request check trusts APP_URL's host, so a deployment must
    // name itself rather than inherit the localhost default; and session
    // cookies are Secure in production, so anything but a local host needs https.
    if (!process.env.APP_URL) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must be set in production to the public URL of the app" });
    } else {
      const { protocol, hostname } = new URL(e.APP_URL);
      const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
      if (protocol !== "https:" && !local) {
        ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in production" });
      }
    }
  }
  // Every production MRP run would silently plan from the pinned date.
  if (e.NODE_ENV === "production" && e.PLANNING_AS_OF_DATE) {
    ctx.addIssue({
      code: "custom",
      path: ["PLANNING_AS_OF_DATE"],
      message: "must not be set in production; it pins the planning date for demo data only",
    });
  }
});

function load() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        `Copy .env.example to .env and fill in the missing values.`,
    );
  }

  return parsed.data;
}

export const env = load();

export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
