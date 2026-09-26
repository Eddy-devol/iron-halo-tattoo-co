import { afterEach, describe, expect, it } from "vitest";
import { enforceRateLimit, requestBodyTooLarge, requestIpKey, validateMutationOrigin } from "@/lib/server/security";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NODE_ENV;
  delete process.env.TRUST_PROXY_HEADERS;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin", { headers });
}

describe("security helpers", () => {
  it("checks declared request sizes without trusting malformed values", () => {
    expect(requestBodyTooLarge(request({ "content-length": "100" }), 100)).toBe(false);
    expect(requestBodyTooLarge(request({ "content-length": "101" }), 100)).toBe(true);
    expect(requestBodyTooLarge(request(), 100)).toBe(false);
    expect(requestBodyTooLarge(request({ "content-length": "invalid" }), 100)).toBe(false);
  });

  it("requires an exact configured origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://studio.example";
    process.env.NODE_ENV = "production";
    expect(validateMutationOrigin(request({ origin: "https://studio.example" }))).toBe(true);
    expect(validateMutationOrigin(request({ origin: "https://studio.example.attacker.invalid" }))).toBe(false);
    expect(validateMutationOrigin(request({ origin: "https://studio.example:444" }))).toBe(false);
    expect(validateMutationOrigin(request({ origin: "null" }))).toBe(false);
    expect(validateMutationOrigin(request())).toBe(false);
  });

  it("fails closed for malformed configuration", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a URL";
    process.env.NODE_ENV = "production";
    expect(validateMutationOrigin(request({ origin: "https://studio.example" }))).toBe(false);
  });

  it("classifies errors without exposing provider or database messages", () => {
    expect(safeErrorCategory(new Error("database URL contains sensitive details"))).toBe("Error");
    expect(safeErrorCategory({ name: "Error", message: "sensitive details" })).toBe("unknown");
    expect(safeErrorCategory(new Error("sensitive details"))).not.toContain("sensitive");
  });

  it("uses framework IP and ignores proxy headers unless explicitly trusted", () => {
    const frameworkRequest = request({
      "x-real-ip": "198.51.100.12",
      "x-forwarded-for": "198.51.100.13, 10.0.0.1",
    });
    Object.defineProperty(frameworkRequest, "ip", { value: "203.0.113.8" });
    expect(requestIpKey(frameworkRequest)).toBe("203.0.113.8");

    const proxyOnlyRequest = request({
      "x-real-ip": "198.51.100.12",
      "x-forwarded-for": "198.51.100.13, 10.0.0.1",
    });
    process.env.TRUST_PROXY_HEADERS = "false";
    expect(requestIpKey(proxyOnlyRequest)).toBe("unknown");
    process.env.TRUST_PROXY_HEADERS = "true";
    expect(requestIpKey(proxyOnlyRequest)).toBe("198.51.100.12");
  });

  it("fails closed in production without Upstash and bypasses only outside production", async () => {
    process.env.NODE_ENV = "production";
    await expect(enforceRateLimit(request(), {
      key: "synthetic",
      limit: 1,
      window: "15 m",
      event: "TEST",
    })).resolves.toEqual({ allowed: false, unavailable: true });

    process.env.NODE_ENV = "development";
    await expect(enforceRateLimit(request(), {
      key: "synthetic",
      limit: 1,
      window: "15 m",
      event: "TEST",
    })).resolves.toEqual({ allowed: true });
  });
});
