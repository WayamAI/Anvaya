import pino from "pino";
import { env, isTest } from "@/server/config/env";

/**
 * Structured application logger.
 *
 * JSON by default so a log aggregator can parse it; pretty-printed in local
 * development when LOG_PRETTY=true. Silent under test, so a suite asserting on
 * error paths does not bury its own output in expected log noise.
 *
 * Use `logger.child({ ... })` to attach context (request id, user id, run id)
 * rather than interpolating it into the message — it stays queryable that way.
 */
export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,

  // Values that must never reach a log sink, whatever an object carries.
  redact: {
    paths: [
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "req.headers.authorization",
      "req.headers.cookie",
      "authorization",
      "cookie",
      "AUTH_SECRET",
      "DATABASE_URL",
    ],
    censor: "[redacted]",
  },

  ...(env.LOG_PRETTY
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});

export type Logger = typeof logger;
