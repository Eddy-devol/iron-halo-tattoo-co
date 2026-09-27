import { ConsentStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authorizeAdminMutation } from "@/lib/server/admin-mutation";
import { getConsentText } from "@/lib/server/booking-documents";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const consentSchema = z.object({
  artistName: z.string().trim().max(160).nullable().optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  dateOfBirth: dateSchema.nullable().optional(),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  governmentIdType: z.string().trim().max(80).nullable().optional(),
  governmentIdLastFour: z.string().regex(/^\d{4}$/).nullable().optional(),
  identificationVerified: z.boolean().optional(),
  status: z.nativeEnum(ConsentStatus).optional(),
  physicalSignatureReceived: z.boolean().optional(),
}).strict();

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const authorization = await authorizeAdminMutation(request);
  if ("response" in authorization) return authorization.response;
  if (!uuidSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "Enter valid client record details." }, { status: 400 });
  }
  const { physicalSignatureReceived, identificationVerified, status, dateOfBirth, artistName, ...clientFields } = parsed.data;
  if (status === ConsentStatus.COMPLETED && physicalSignatureReceived !== true) {
    return NextResponse.json({ error: "Confirm that the physically signed form has been received before completing consent." }, { status: 400 });
  }
  if (status === ConsentStatus.COMPLETED && !getConsentText()) {
    return NextResponse.json({ error: "Consent wording must be configured and reviewed before marking a form complete." }, { status: 409 });
  }
  if (identificationVerified && !clientFields.governmentIdType) {
    return NextResponse.json({ error: "Enter the identification type before recording verification." }, { status: 400 });
  }
  if (dateOfBirth && new Date(`${dateOfBirth}T00:00:00.000Z`) > new Date()) {
    return NextResponse.json({ error: "Date of birth cannot be in the future." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const booking = await transaction.bookingRequest.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      if (!booking) return null;
      const existing = await transaction.tattooConsentRecord.findUnique({
        where: { bookingRequestId: booking.id },
        select: { status: true },
      });
      if (existing?.status === ConsentStatus.COMPLETED && status !== ConsentStatus.NOT_COMPLETED) {
        return { kind: "completed" as const };
      }
      if (artistName !== undefined) {
        await transaction.bookingRequest.update({
          where: { id: booking.id },
          data: { artistName },
        });
      }
      const consent = await transaction.tattooConsentRecord.upsert({
        where: { bookingRequestId: booking.id },
        create: {
          bookingRequestId: booking.id,
          ...clientFields,
          ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null } : {}),
          ...(identificationVerified !== undefined ? {
            identificationVerifiedAt: identificationVerified ? new Date() : null,
            verifiedById: identificationVerified ? authorization.admin.id : null,
          } : {}),
          ...(status ? {
            status,
            completedAt: status === ConsentStatus.COMPLETED ? new Date() : null,
            completedById: status === ConsentStatus.COMPLETED ? authorization.admin.id : null,
            consentTextSnapshot: status === ConsentStatus.COMPLETED ? getConsentText() : null,
          } : {}),
        },
        update: {
          ...clientFields,
          ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null } : {}),
          ...(identificationVerified !== undefined ? {
            identificationVerifiedAt: identificationVerified ? new Date() : null,
            verifiedById: identificationVerified ? authorization.admin.id : null,
          } : {}),
          ...(status ? {
            status,
            completedAt: status === ConsentStatus.COMPLETED ? new Date() : null,
            completedById: status === ConsentStatus.COMPLETED ? authorization.admin.id : null,
            consentTextSnapshot: status === ConsentStatus.COMPLETED ? getConsentText() : null,
          } : {}),
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: status === ConsentStatus.COMPLETED
            ? "TATTOO_CONSENT_COMPLETED"
            : status === ConsentStatus.NOT_COMPLETED && existing?.status === ConsentStatus.COMPLETED
              ? "TATTOO_CONSENT_REOPENED"
              : "TATTOO_CONSENT_RECORD_UPDATED",
          entityType: "BookingRequest",
          entityId: booking.id,
          metadata: {
            previousStatus: existing?.status ?? ConsentStatus.NOT_COMPLETED,
            newStatus: consent.status,
            identificationVerified: Boolean(consent.identificationVerifiedAt),
          },
        },
      });
      return { kind: "saved" as const, consent };
    });
    if (!result) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (result.kind === "completed") {
      return NextResponse.json({ error: "Reopen the completed consent record before changing its client or verification data." }, { status: 409 });
    }
    const consent = result.consent;
    return NextResponse.json({
      consentRecord: {
        ...consent,
        dateOfBirth: consent.dateOfBirth?.toISOString() ?? null,
        identificationVerifiedAt: consent.identificationVerifiedAt?.toISOString() ?? null,
        completedAt: consent.completedAt?.toISOString() ?? null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    console.error("ADMIN_TATTOO_CONSENT_UPDATE_FAILED", {
      errorCategory: safeErrorCategory(error),
      bookingId: params.id,
    });
    return NextResponse.json({ error: "Unable to save consent record." }, { status: 500 });
  }
}
