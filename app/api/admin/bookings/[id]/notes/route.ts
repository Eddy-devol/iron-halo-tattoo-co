import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAdmin } from "@/lib/server/auth";
import { enforceRateLimit, rejectedOriginResponse, requestBodyTooLarge, requestIpKey, validateMutationOrigin } from "@/lib/server/security";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const idSchema = z.string().uuid();
const noteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
}).strict();

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (requestBodyTooLarge(request, 64 * 1024)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validateMutationOrigin(request)) {
    console.warn("CSRF_ORIGIN_REJECTED");
    return NextResponse.json(rejectedOriginResponse(), { status: 403 });
  }
  const rateLimit = await enforceRateLimit(request, {
    key: `admin-mutation:${admin.id}:${requestIpKey(request)}`,
    limit: 30,
    window: "15 m",
    event: "ADMIN_MUTATION_RATE_LIMITED",
  });
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    console.warn("ADMIN_MUTATION_RATE_LIMITED");
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } });
  }
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Note must contain between 1 and 5000 characters." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const booking = await transaction.bookingRequest.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      if (!booking) return null;

      const note = await transaction.bookingNote.create({
        data: {
          bookingRequestId: booking.id,
          authorId: admin.id,
          body: parsed.data.body,
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: admin.id,
          action: "BOOKING_NOTE_ADDED",
          entityType: "BookingRequest",
          entityId: booking.id,
          metadata: { noteId: note.id },
        },
      });
      return note;
    });

    if (!result) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    return NextResponse.json({
      note: {
        id: result.id,
        body: result.body,
        authorName: result.author.name,
        createdAt: result.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("ADMIN_BOOKING_NOTE_CREATE_FAILED", {
      errorCategory: safeErrorCategory(error),
      bookingId: params.id,
    });
    return NextResponse.json({ error: "Unable to add internal note." }, { status: 500 });
  }
}
