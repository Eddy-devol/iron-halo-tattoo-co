import { BookingIdempotencyStatus, Prisma, type BookingRequest } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { BookingRequestInput } from "@/lib/validation/booking";

const referenceAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxReferenceAttempts = 5;
const idempotencyKeyPattern = /^[A-Za-z0-9._~-]{1,128}$/;

export type BookingIdempotencyInput = {
  key: string;
  hash: string;
};

export type BookingCreationResult =
  | { kind: "created"; booking: Pick<BookingRequest, "id" | "referenceNumber"> }
  | { kind: "completed"; booking: Pick<BookingRequest, "id" | "referenceNumber"> }
  | { kind: "processing"; booking: Pick<BookingRequest, "id" | "referenceNumber"> }
  | { kind: "conflict" };

function createReferenceNumber(year = new Date().getFullYear()) {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, (byte) => referenceAlphabet[byte % referenceAlphabet.length]).join("");
  return `IH-${year}-${suffix}`;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isValidIdempotencyKey(key: string) {
  return idempotencyKeyPattern.test(key);
}

export async function createBookingRequest(input: BookingRequestInput, idempotency?: BookingIdempotencyInput): Promise<Pick<BookingRequest, "id" | "referenceNumber"> | BookingCreationResult> {
  for (let attempt = 0; attempt < maxReferenceAttempts; attempt += 1) {
    const referenceNumber = createReferenceNumber();
    try {
      return await prisma.$transaction(async (transaction) => {
        if (idempotency) {
          const existing = await transaction.bookingRequest.findUnique({
            where: { idempotencyKey: idempotency.key },
            select: { id: true, referenceNumber: true, idempotencyHash: true, idempotencyStatus: true },
          });
          if (existing) {
            if (existing.idempotencyHash !== idempotency.hash) return { kind: "conflict" as const };
            if (existing.idempotencyStatus === BookingIdempotencyStatus.COMPLETED) return { kind: "completed" as const, booking: { id: existing.id, referenceNumber: existing.referenceNumber } };
            return { kind: "processing" as const, booking: { id: existing.id, referenceNumber: existing.referenceNumber } };
          }
        }
        const created = await transaction.bookingRequest.create({
          data: {
            referenceNumber,
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            description: input.description,
            style: input.style,
            placement: input.placement,
            size: input.size,
            colorPreference: input.colorPreference,
            preferredTimeframe: input.preferredTimeframe,
            budget: input.budget,
            additionalNotes: input.additionalNotes,
            ...(idempotency ? {
              idempotencyKey: idempotency.key,
              idempotencyHash: idempotency.hash,
              idempotencyStatus: BookingIdempotencyStatus.PROCESSING,
            } : {}),
            status: "PENDING",
          },
          select: { id: true, referenceNumber: true },
        });
        await transaction.auditLog.create({
          data: { action: "BOOKING_CREATED", entityType: "BookingRequest", entityId: created.referenceNumber, metadata: { referenceNumber: created.referenceNumber } },
        });
        return idempotency ? { kind: "created" as const, booking: created } : created;
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < maxReferenceAttempts - 1) continue;
      throw error;
    }

  }
  throw new Error("Unable to generate a unique booking reference");
}

export async function completeIdempotentBooking(id: string) {
  const result = await prisma.bookingRequest.updateMany({
    where: { id, idempotencyStatus: BookingIdempotencyStatus.PROCESSING },
    data: { idempotencyStatus: BookingIdempotencyStatus.COMPLETED },
  });
  if (result.count !== 1) throw new Error("Unable to complete idempotent booking");
}
