import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/server/auth";
import {
  enforceRateLimit,
  rejectedOriginResponse,
  requestIpKey,
  validateMutationOrigin,
} from "@/lib/server/security";

export async function authorizeArchiveMutation(request: Request, event: string) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  if (!validateMutationOrigin(request)) {
    console.warn("CSRF_ORIGIN_REJECTED");
    return {
      response: NextResponse.json(rejectedOriginResponse(), { status: 403 }),
    } as const;
  }

  const rateLimit = await enforceRateLimit(request, {
    key: `admin-mutation:${admin.id}:${requestIpKey(request)}`,
    limit: 30,
    window: "15 m",
    event,
  });
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) {
      return {
        response: NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 }),
      } as const;
    }
    console.warn(event);
    return {
      response: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      ),
    } as const;
  }

  return { admin } as const;
}

export function archiveImageUrl(slug: string) {
  return `/api/archive/${encodeURIComponent(slug)}/image`;
}

export function adminArchiveImageUrl(id: string) {
  return `/api/admin/archive/${encodeURIComponent(id)}/image`;
}
