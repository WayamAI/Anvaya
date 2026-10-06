import { describe, it, expect } from "vitest";
import { SEED_OVERRIDE, seedRefusal } from "./guard";

const local = "postgresql://anvaya:pw@localhost:55432/anvaya?schema=public";
const remote = "postgresql://app:pw@prod-db.acme.example:5432/anvaya?sslmode=require";

describe("seedRefusal", () => {
  it("allows a local development or CI database", () => {
    expect(seedRefusal({ NODE_ENV: "development", DATABASE_URL: local })).toBeNull();
    expect(seedRefusal({ NODE_ENV: "test", DATABASE_URL: "postgresql://ci:ci@127.0.0.1:5432/ci" })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: "postgresql://a:b@[::1]:5432/x" })).toBeNull();
  });

  it("refuses production, even against a local database", () => {
    expect(seedRefusal({ NODE_ENV: "production", DATABASE_URL: local })).toMatch(/NODE_ENV=production/);
  });

  it("refuses a remote database whatever NODE_ENV says", () => {
    // A laptop pointed at the production URL usually has NODE_ENV unset.
    expect(seedRefusal({ DATABASE_URL: remote })).toMatch(/prod-db\.acme\.example/);
  });

  it("refuses a missing or unreadable DATABASE_URL", () => {
    expect(seedRefusal({})).toMatch(/DATABASE_URL/);
    expect(seedRefusal({ DATABASE_URL: "not a url" })).toMatch(/DATABASE_URL/);
  });

  it("proceeds only with the exact deliberate override", () => {
    expect(seedRefusal({ NODE_ENV: "production", DATABASE_URL: remote, [SEED_OVERRIDE]: "yes" })).not.toBeNull();
    expect(seedRefusal({ NODE_ENV: "production", DATABASE_URL: remote, [SEED_OVERRIDE]: "I_UNDERSTAND_THIS_WRITES_DEMO_USERS_AND_PASSWORDS" })).toBeNull();
  });
});
