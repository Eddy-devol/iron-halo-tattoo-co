import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { clientAccessTokenLifetimeMs, createOpaqueToken } from "@/lib/server/client-auth";
import { sendClientPortalAccessLink } from "@/lib/server/email/client-portal";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { enforceRateLimit, requestBodyTooLarge, requestIpKey, validateMutationOrigin } from "@/lib/server/security";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
  bookingReference: z.string().trim().min(6).max(40),
}).strict();
const genericResponse = {
  message: "If those details match a booking, a sign-in link will be sent to its email address.",
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, 8 * 1024)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  if (!validateMutationOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const ipLimit = await enforceRateLimit(request, {
    key: `client-link-ip:${requestIpKey(request)}`,
    limit: 10,
    window: "15 m",
    event: "CLIENT_PORTAL_LINK_RATE_LIMITED",
  });
  if (!ipLimit.allowed) {
    if ("unavailable" in ipLimit) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    return NextResponse.json(genericResponse);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: genericResponse.message });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: genericResponse.message });

  const normalizedEmail = parsed.data.email.toLowerCase();
  const normalizedReference = parsed.data.bookingReference.toUpperCase();
  const emailKey = createHash("sha256").update(normalizedEmail).digest("hex");
  const emailLimit = await enforceRateLimit(request, {
    key: `client-link-email:${emailKey}`,
    limit: 3,
    window: "15 m",
    event: "CLIENT_PORTAL_LINK_RATE_LIMITED",
  });
  if (!emailLimit.allowed) {
    if ("unavailable" in emailLimit) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    return NextResponse.json(genericResponse);
  }

  try {
    const booking = await prisma.bookingRequest.findFirst({
      where: {
        referenceNumber: normalizedReference,
        email: { equals: normalizedEmail, mode: "insensitive" },
      },
      select: { id: true, email: true },
    });
    if (booking) {
      const token = createOpaqueToken();
      const digest = tokenHash(token);
      await prisma.$transaction(async (transaction) => {
        await transaction.clientAccessToken.deleteMany({ where: { bookingRequestId: booking.id } });
        await transaction.clientAccessToken.create({
          data: {
            bookingRequestId: booking.id,
            tokenHash: digest,
            expiresAt: new Date(Date.now() + clientAccessTokenLifetimeMs),
          },
        });
      });
      const sent = await sendClientPortalAccessLink(booking.email, token);
      if (!sent) await prisma.clientAccessToken.deleteMany({ where: { tokenHash: digest } });
    }
    return NextResponse.json(genericResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("CLIENT_PORTAL_LINK_REQUEST_FAILED", {
      errorCategory: safeErrorCategory(error),
    });
    return NextResponse.json(genericResponse, { headers: { "Cache-Control": "no-store" } });
  }
}
