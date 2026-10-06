import { describe, it, expect } from "vitest";
import { loginSchema, passwordSchema, changePasswordSchema, emailSchema } from "./auth";

describe("email validation", () => {
  it("normalises case and surrounding whitespace", () => {
    // Stored lowercase, so Admin@anvaya.in and admin@anvaya.in are one account.
    expect(emailSchema.parse("  Admin@Anvaya.IN  ")).toBe("admin@anvaya.in");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "not-an-email", "a@", "@b.com", "a b@c.com"]) {
      expect(emailSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("password policy", () => {
  it("accepts a sufficiently long mixed password", () => {
    expect(passwordSchema.safeParse("Anvaya!Demo2026").success).toBe(true);
  });

  it("rejects anything under 12 characters", () => {
    expect(passwordSchema.safeParse("Short1A").success).toBe(false);
  });

  it("requires both cases and a digit", () => {
    expect(passwordSchema.safeParse("alllowercase123").success).toBe(false);
    expect(passwordSchema.safeParse("ALLUPPERCASE123").success).toBe(false);
    expect(passwordSchema.safeParse("NoDigitsInHere").success).toBe(false);
  });

  it("rejects an absurdly long password", () => {
    // Unbounded input into a deliberately slow hash is a denial-of-service.
    expect(passwordSchema.safeParse("Aa1" + "x".repeat(500)).success).toBe(false);
  });
});

describe("login schema", () => {
  it("accepts valid credentials", () => {
    const r = loginSchema.safeParse({ company: "anvaya", email: "Admin@Anvaya.in", password: "anything" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("admin@anvaya.in");
  });

  it("does NOT apply the password policy to a login attempt", () => {
    /*
      Deliberate. Enforcing the policy here would lock out a user whose
      password predates a policy change, and would tell an attacker which
      candidate passwords are even worth submitting.
    */
    expect(loginSchema.safeParse({ company: "ANVAYA", email: "a@b.com", password: "old" }).success).toBe(true);
  });

  it("requires the company, normalised the way company codes are stored", () => {
    // Email is unique only within a company; the company is never guessed.
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ company: "  ", email: "a@b.com", password: "x" }).success).toBe(false);
    expect(loginSchema.parse({ company: " acme ", email: "a@b.com", password: "x" }).company).toBe("ACME");
  });

  it("still requires a non-empty password", () => {
    expect(loginSchema.safeParse({ company: "ANVAYA", email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("change password schema", () => {
  it("accepts a valid change", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "OldPass12345", newPassword: "NewPass123456" }).success,
    ).toBe(true);
  });

  it("applies the policy to the new password", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "OldPass12345", newPassword: "short" }).success,
    ).toBe(false);
  });

  it("rejects reusing the current password", () => {
    const r = changePasswordSchema.safeParse({ currentPassword: "SamePass12345", newPassword: "SamePass12345" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["newPassword"]);
  });
});
