import { describe, it, expect } from "vitest";
import { AppError, ErrorCode } from "./app-error";

describe("AppError", () => {
  it("maps each code to the correct HTTP status", () => {
    expect(AppError.validation("x").status).toBe(422);
    expect(AppError.unauthenticated().status).toBe(401);
    expect(AppError.forbidden().status).toBe(403);
    expect(AppError.notFound("Material").status).toBe(404);
    expect(AppError.conflict("x").status).toBe(409);
    expect(AppError.unprocessable("x").status).toBe(422);
    expect(AppError.rateLimited().status).toBe(429);
    expect(AppError.internal().status).toBe(500);
  });

  it("names the resource and identifier in not-found messages", () => {
    expect(AppError.notFound("Material", "RM-4023").message).toBe(
      "Material 'RM-4023' was not found",
    );
    expect(AppError.notFound("Material").message).toBe("Material was not found");
  });

  it("carries field details for validation failures", () => {
    const err = AppError.validation("Invalid", [
      { path: "quantity", message: "must be greater than 0" },
    ]);

    expect(err.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(err.details).toEqual([{ path: "quantity", message: "must be greater than 0" }]);
  });

  it("keeps context off the wire but available to the logger", () => {
    const err = AppError.conflict("Duplicate code", { code: "RM-1" });
    expect(err.context).toEqual({ code: "RM-1" });
  });

  it("chains the underlying cause", () => {
    const cause = new Error("connection refused");
    expect(AppError.internal("db down", cause).cause).toBe(cause);
  });

  it("identifies its own instances and rejects plain errors", () => {
    expect(AppError.is(AppError.forbidden())).toBe(true);
    expect(AppError.is(new Error("nope"))).toBe(false);
    expect(AppError.is(null)).toBe(false);
  });

  it("is a real Error, so it survives throw/catch and instanceof", () => {
    try {
      throw AppError.notFound("Vendor", "SUP-001");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(AppError.is(e)).toBe(true);
      expect((e as AppError).status).toBe(404);
    }
  });
});
