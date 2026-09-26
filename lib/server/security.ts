import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type RateLimitResult = { allowed: true; retryAfter?: number } | { allowed: false; retryAfter: number } | { allowed: false; unavailable: true };

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return Redis.fromEnv();
}

function getRequestIp(request: Request) {
  const requestWithIp = request as Request & { ip?: string };
  if (requestWithIp.ip) return requestWithIp.ip;
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  }
  return "unknown";
}

export async function enforceRateLimit(request: Request, options: {
  key: string;
  limit: number;
  window: `${number} ${"s" | "m" | "h"}`;
  event: string;
}): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      console.error("RATE_LIMIT_UNAVAILABLE", { event: options.event });
      return { allowed: false, unavailable: true };
    }
    return { allowed: true };
  }

  try {
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(options.limit, options.window),
      analytics: true,
      prefix: "iron-halo",
    });
    const result = await limiter.limit(options.key);
    if (result.success) return { allowed: true };
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
  } catch (error) {
    console.error("RATE_LIMIT_FAILED", { event: options.event, errorCategory: error instanceof Error ? error.name : "unknown" });
    return process.env.NODE_ENV === "production" ? { allowed: false, unavailable: true } : { allowed: true };
  }
}

export function requestIpKey(request: Request) {
  return getRequestIp(request);
}

export function requestBodyTooLarge(request: Request, maxBytes: number) {
  const contentLength = request.headers.get("content-length");
  return contentLength !== null && Number.isFinite(Number(contentLength)) && Number(contentLength) > maxBytes;
}

export function validateMutationOrigin(request: Request) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredSiteUrl) return process.env.NODE_ENV !== "production";

  let trustedOrigin: string;
  try {
    trustedOrigin = new URL(configuredSiteUrl).origin;
  } catch {
    return false;
  }

  const origin = request.headers.get("origin")?.trim();
  if (!origin) return false;
  return origin === trustedOrigin;
}

export function rejectedOriginResponse() {
  return { error: "Request origin is not allowed." };
}
