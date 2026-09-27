import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  clientSessionCookie,
  clientSessionCookieOptions,
  clientSessionLifetimeSeconds,
  createOpaqueToken,
} from "@/lib/server/client-auth";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { enforceRateLimit, requestBodyTooLarge, requestIpKey, validateMutationOrigin } from "@/lib/server/security";

export const dynamic = "force-dynamic";

const verifySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 8 * 1024)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  if (!validateMutationOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const rateLimit = await enforceRateLimit(request, {
    key: `client-verify:${requestIpKey(request)}`,
    limit: 10,
    window: "15 m",
    event: "CLIENT_PORTAL_VERIFY_RATE_LIMITED",
  });
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Unable to sign in with that link." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Unable to sign in with that link." }, { status: 401 });
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Unable to sign in with that link." }, { status: 401 });

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const sessionToken = createOpaqueToken();
  try {
    const session = await prisma.$transaction(async (transaction) => {
      const accessToken = await transaction.clientAccessToken.findUnique({
        where: { tokenHash },
        select: { id: true, bookingRequestId: true, expiresAt: true },
      });
      const now = new Date();
      if (!accessToken || accessToken.expiresAt <= now) {
        if (accessToken) await transaction.clientAccessToken.delete({ where: { id: accessToken.id } });
        return null;
      }
      const consumed = await transaction.clientAccessToken.deleteMany({
        where: { id: accessToken.id, expiresAt: { gt: now } },
      });
      if (consumed.count !== 1) return null;
      return transaction.clientSession.create({
        data: {
          bookingRequestId: accessToken.bookingRequestId,
          tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
          expiresAt: new Date(Date.now() + clientSessionLifetimeSeconds * 1000),
        },
        select: { id: true },
      });
    });
    if (!session) return NextResponse.json({ error: "Unable to sign in with that link." }, { status: 401 });
    const response = NextResponse.json({ success: true });
    response.cookies.set(clientSessionCookie, sessionToken, clientSessionCookieOptions());
    return response;
  } catch (error) {
    console.error("CLIENT_PORTAL_VERIFY_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to sign in right now. Please try again." }, { status: 503 });
  }
}
