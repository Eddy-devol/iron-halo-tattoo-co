import { describe, expect, it } from "vitest";

const { getDevelopmentSeedPassword } = require("../../scripts/seed-safety") as {
  getDevelopmentSeedPassword: (env: NodeJS.ProcessEnv) => string;
};

describe("development seed safety", () => {
  it("refuses to run in production even with an explicit password", () => {
    expect(() => getDevelopmentSeedPassword({
      NODE_ENV: "production",
      DEV_ADMIN_PASSWORD: "synthetic-long-password",
    })).toThrow("disabled in production");
  });

  it("refuses a missing or short development password", () => {
    expect(() => getDevelopmentSeedPassword({ NODE_ENV: "development" })).toThrow("at least 12 characters");
    expect(() => getDevelopmentSeedPassword({
      NODE_ENV: "development",
      DEV_ADMIN_PASSWORD: "too-short",
    })).toThrow("at least 12 characters");
  });

  it("accepts an explicit development password without replacing it", () => {
    const password = "local-synthetic-password";
    expect(getDevelopmentSeedPassword({
      NODE_ENV: "development",
      DEV_ADMIN_PASSWORD: password,
    })).toBe(password);
  });
});
