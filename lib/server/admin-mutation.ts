import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/server/auth";
import {
  enforceRateLimit,
  rejectedOriginResponse,
  requestBodyTooLarge,
  requestIpKey,
  validateMutationOrigin,
} from "@/lib/server/security";

export async function authorizeAdminMutation(request: Request, maxBytes = 64 * 1024) {
  if (requestBodyTooLarge(request, maxBytes)) {
    return { response: NextResponse.json({ error: "Request is too large." }, { status: 413 }) } as const;
  }
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  if (!validateMutationOrigin(request)) {
    console.warn("CSRF_ORIGIN_REJECTED");
    return { response: NextResponse.json(rejectedOriginResponse(), { status: 403 }) } as const;
  }
  const rateLimit = await enforceRateLimit(request, {
    key: `admin-mutation:${admin.id}:${requestIpKey(request)}`,
    limit: 30,
    window: "15 m",
    event: "ADMIN_MUTATION_RATE_LIMITED",
  });
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) {
      return { response: NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 }) } as const;
    }
    console.warn("ADMIN_MUTATION_RATE_LIMITED");
    return {
      response: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      ),
    } as const;
  }
  return { admin } as const;
}
