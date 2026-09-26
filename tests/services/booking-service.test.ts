import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, prismaMock } = vi.hoisted(() => {
  const transaction = {
    bookingRequest: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  const prismaMock = {
    $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
  };
  return { transaction, prismaMock };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { createBookingRequest, isValidIdempotencyKey } from "@/lib/server/services/booking-service";

const bookingInput = {
  fullName: "Synthetic Tester",
  email: "synthetic@example.test",
  phone: undefined,
  description: "A synthetic booking request for integration-boundary tests.",
  style: undefined,
  placement: "Forearm",
  size: "4 inches",
  colorPreference: undefined,
  preferredTimeframe: undefined,
  budget: undefined,
  additionalNotes: undefined,
  consent: "on",
};

describe("booking idempotency keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.bookingRequest.findUnique.mockResolvedValue(null);
    transaction.bookingRequest.create.mockResolvedValue({ id: "booking-1", referenceNumber: "IH-2026-ABC234" });
    transaction.auditLog.create.mockResolvedValue({});
  });

  it("accepts safe bounded keys", () => {
    expect(isValidIdempotencyKey("synthetic-key-123")).toBe(true);
    expect(isValidIdempotencyKey("a".repeat(128))).toBe(true);
  });

  it("rejects invalid or oversized keys", () => {
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("a".repeat(129))).toBe(false);
    expect(isValidIdempotencyKey("key with spaces")).toBe(false);
    expect(isValidIdempotencyKey("key/with/path")).toBe(false);
  });

  it("retries a concurrent idempotency unique-key collision", async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    transaction.bookingRequest.create
      .mockRejectedValueOnce(uniqueError)
      .mockResolvedValueOnce({ id: "booking-1", referenceNumber: "IH-2026-ABC234" });

    const result = await createBookingRequest(bookingInput, { key: "concurrent-key", hash: "hash-1" });

    expect(result).toEqual({
      kind: "created",
      booking: { id: "booking-1", referenceNumber: "IH-2026-ABC234" },
    });
    expect(transaction.bookingRequest.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });
});
