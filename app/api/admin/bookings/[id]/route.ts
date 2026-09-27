import { BookingStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAdmin } from "@/lib/server/auth";
import { createSignedReadUrl } from "@/lib/server/storage/s3";
import { sendBookingStatusNotification } from "@/lib/server/email/resend";
import { enforceRateLimit, rejectedOriginResponse, requestBodyTooLarge, requestIpKey, validateMutationOrigin } from "@/lib/server/security";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const idSchema = z.string().uuid();
const statusSchema = z.object({ status: z.nativeEnum(BookingStatus) }).strict();
const statusHistoryMetadataSchema = z.object({
  previousStatus: z.nativeEnum(BookingStatus),
  newStatus: z.nativeEnum(BookingStatus),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  }

  try {
    const booking = await prisma.bookingRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        referenceNumber: true,
        fullName: true,
        email: true,
        phone: true,
        description: true,
        style: true,
        placement: true,
        size: true,
        colorPreference: true,
        preferredTimeframe: true,
        artistName: true,
        budget: true,
        additionalNotes: true,
        status: true,
        consentRecord: {
          select: {
            legalName: true,
            dateOfBirth: true,
            addressLine1: true,
            city: true,
            state: true,
            postalCode: true,
            governmentIdType: true,
            governmentIdLastFour: true,
            identificationVerifiedAt: true,
            verifiedBy: { select: { name: true } },
            status: true,
            completedAt: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        referenceImages: {
          select: {
            id: true,
            storageKey: true,
            originalFilename: true,
            mimeType: true,
            fileSize: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        notes: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { name: true } },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    const [referenceImages, auditLogs] = await Promise.all([
      Promise.all(
        booking.referenceImages.map(async ({ storageKey, ...image }) => ({
          ...image,
          createdAt: image.createdAt.toISOString(),
          url: await createSignedReadUrl(storageKey, 300),
        })),
      ),
      prisma.auditLog.findMany({
        where: {
          entityType: "BookingRequest",
          entityId: booking.id,
          action: "BOOKING_STATUS_UPDATED",
        },
        select: {
          id: true,
          metadata: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ]);

    return NextResponse.json({
      booking: {
        id: booking.id,
        referenceNumber: booking.referenceNumber,
        fullName: booking.fullName,
        email: booking.email,
        phone: booking.phone,
        description: booking.description,
        style: booking.style,
        placement: booking.placement,
        size: booking.size,
        colorPreference: booking.colorPreference,
        preferredTimeframe: booking.preferredTimeframe,
        artistName: booking.artistName,
        budget: booking.budget,
        additionalNotes: booking.additionalNotes,
        status: booking.status,
        consentRecord: booking.consentRecord ? {
          ...booking.consentRecord,
          dateOfBirth: booking.consentRecord.dateOfBirth?.toISOString() ?? null,
          identificationVerifiedAt: booking.consentRecord.identificationVerifiedAt?.toISOString() ?? null,
          verifiedByName: booking.consentRecord.verifiedBy?.name ?? null,
          completedAt: booking.consentRecord.completedAt?.toISOString() ?? null,
        } : null,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString(),
        referenceImages,
        notes: booking.notes.map((note) => ({
          id: note.id,
          body: note.body,
          authorName: note.author.name,
          createdAt: note.createdAt.toISOString(),
        })),
        statusHistory: auditLogs.flatMap((log) => {
          const metadata = statusHistoryMetadataSchema.safeParse(log.metadata);
          return metadata.success
            ? [{
                id: log.id,
                ...metadata.data,
                actorName: log.user?.name ?? "Admin",
                createdAt: log.createdAt.toISOString(),
              }]
            : [];
        }),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("ADMIN_BOOKING_DETAIL_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load booking details." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid booking status is required." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const booking = await transaction.bookingRequest.findUnique({
        where: { id: params.id },
        select: { status: true },
      });
      if (!booking) return { kind: "not_found" as const };
      if (booking.status === parsed.data.status) return { kind: "no_change" as const };

      const updated = await transaction.bookingRequest.updateMany({
        where: { id: params.id, status: booking.status },
        data: { status: parsed.data.status },
      });
      if (updated.count !== 1) return { kind: "conflict" as const };

      const updatedBooking = await transaction.bookingRequest.findUniqueOrThrow({
        where: { id: params.id },
        select: { status: true, updatedAt: true, email: true, referenceNumber: true },
      });
      const statusChange = {
        previousStatus: booking.status,
        newStatus: updatedBooking.status,
      };
      const auditLog = await transaction.auditLog.create({
        data: {
          userId: admin.id,
          action: "BOOKING_STATUS_UPDATED",
          entityType: "BookingRequest",
          entityId: params.id,
          metadata: statusChange,
        },
        select: { id: true, createdAt: true },
      });
      return {
        kind: "updated" as const,
        statusChange: {
          id: auditLog.id,
          ...statusChange,
          actorName: admin.name ?? "Admin",
          createdAt: auditLog.createdAt.toISOString(),
        },
        updatedAt: updatedBooking.updatedAt.toISOString(),
        email: updatedBooking.email,
        referenceNumber: updatedBooking.referenceNumber,
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (result.kind === "no_change") {
      return NextResponse.json({ error: "Booking already has that status." }, { status: 409 });
    }
    if (result.kind === "conflict") {
      return NextResponse.json({ error: "Booking status changed concurrently. Reload and try again." }, { status: 409 });
    }
    await sendBookingStatusNotification({
      email: result.email,
      referenceNumber: result.referenceNumber,
    }, result.statusChange.newStatus);
    return NextResponse.json({ statusChange: result.statusChange, updatedAt: result.updatedAt });
  } catch (error) {
    console.error("ADMIN_BOOKING_STATUS_UPDATE_FAILED", {
      errorCategory: safeErrorCategory(error),
      bookingId: params.id,
    });
    return NextResponse.json({ error: "Unable to update booking status." }, { status: 500 });
  }
}
