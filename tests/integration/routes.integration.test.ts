import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieState, sendNewNotifications, sendStatusNotification, uploadObject, deleteObject } = vi.hoisted(() => ({
  cookieState: { token: undefined as string | undefined },
  sendNewNotifications: vi.fn(async () => undefined),
  sendStatusNotification: vi.fn(async () => undefined),
  uploadObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async (_key: string) => undefined),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => cookieState.token ? { value: cookieState.token } : undefined,
  }),
}));

vi.mock("@/lib/server/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/security")>();
  return {
    ...actual,
    enforceRateLimit: vi.fn(async () => ({ allowed: true as const })),
  };
});

vi.mock("@/lib/server/storage/s3", () => ({
  uploadPrivateObject: uploadObject,
  deletePrivateObject: deleteObject,
  createSignedReadUrl: vi.fn(async (key: string) => `https://signed.invalid/${encodeURIComponent(key)}`),
}));

vi.mock("@/lib/server/email/resend", () => ({
  sendNewBookingNotifications: sendNewNotifications,
  sendBookingStatusNotification: sendStatusNotification,
}));

import { POST as publicBooking } from "@/app/api/bookings/route";
import { POST as login } from "@/app/api/admin/login/route";
import { POST as logout } from "@/app/api/admin/logout/route";
import { GET as bookingList } from "@/app/api/admin/bookings/route";
import { DELETE as deleteBooking, GET as bookingDetail, PATCH as updateBooking } from "@/app/api/admin/bookings/[id]/route";
import { POST as createNote } from "@/app/api/admin/bookings/[id]/notes/route";
import { enforceRateLimit } from "@/lib/server/security";

const prisma = new PrismaClient();
const origin = "http://localhost:3000";
const syntheticPrefix = `phase2j4-${randomUUID()}`;
const syntheticAuditReferences: string[] = [];
let adminId: string;
let adminEmail: string;

function bookingForm(email: string, options: { fullName?: string; website?: string; extras?: Array<[string, string]>; images?: File[] } = {}) {
  const form = new FormData();
  form.set("fullName", options.fullName ?? "Synthetic Integration Tester");
  form.set("email", email);
  form.set("phone", "+15555550100");
  form.set("description", "Synthetic request used for isolated route integration testing.");
  form.set("placement", "Forearm");
  form.set("size", "4 inches");
  form.set("consent", "on");
  if (options.website) form.set("website", options.website);
  for (const [key, value] of options.extras ?? []) form.set(key, value);
  for (const image of options.images ?? []) form.append("referenceImages", image);
  return form;
}

function bookingRequest(email: string, key?: string, options: Parameters<typeof bookingForm>[1] = {}) {
  const headers = new Headers();
  if (key !== undefined) headers.set("Idempotency-Key", key);
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    headers,
    body: bookingForm(email, options),
  });
}

function mutationRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: url.endsWith("/logout") ? "POST" : url.endsWith("/notes") ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function deleteRequest(url: string, headers: Record<string, string> = {}, body?: unknown) {
  return new Request(url, {
    method: "DELETE",
    headers: { Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function authenticateTestAdmin() {
  const form = new FormData();
  form.set("email", adminEmail);
  form.set("password", "synthetic-test-password");
  const response = await login(new Request("http://localhost/api/admin/login", { method: "POST", body: form }));
  expect(response.status).toBe(200);
  cookieState.token = decodeURIComponent(sessionCookie(response)!);
}

function sessionCookie(response: Response) {
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
  expect(cookie).toMatch(/Path=\//i);
  return cookie!.match(/iron_halo_admin_session=([^;]+)/)?.[1];
}

async function submitBooking(email: string, key: string, options: Parameters<typeof bookingForm>[1] = {}) {
  return publicBooking(bookingRequest(email, key, options));
}

beforeAll(async () => {
  const databaseRows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  expect(databaseRows[0].current_database).toBe("iron_halo_test");
  process.env.NEXT_PUBLIC_SITE_URL = origin;
  adminEmail = `${syntheticPrefix}-admin@example.test`;
  const passwordHash = await bcrypt.hash("synthetic-test-password", 4);
  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "Synthetic Test Admin", passwordHash, role: "ADMIN" },
    select: { id: true },
  });
  adminId = admin.id;
});

beforeEach(() => {
  cookieState.token = undefined;
  syntheticAuditReferences.length = 0;
  vi.clearAllMocks();
});

afterEach(async () => {
  const bookings = await prisma.bookingRequest.findMany({
    where: { email: { startsWith: syntheticPrefix } },
    select: { id: true, referenceNumber: true },
  });
  if (bookings.length) {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: bookings.map(({ id }) => id) } },
          { entityId: { in: bookings.map(({ referenceNumber }) => referenceNumber) } },
        ],
      },
    });
    await prisma.bookingRequest.deleteMany({ where: { id: { in: bookings.map(({ id }) => id) } } });
  }
  await prisma.auditLog.deleteMany({
    where: { entityType: "BookingRequest", entityId: { in: syntheticAuditReferences } },
  });
  await prisma.artist.deleteMany({ where: { slug: { startsWith: syntheticPrefix } } });
  await prisma.archiveArtwork.deleteMany({ where: { slug: { startsWith: syntheticPrefix } } });
  await prisma.session.deleteMany({ where: { userId: adminId } });
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: adminId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe("real PostgreSQL route integration", () => {
  it("creates a public booking with a safe response and ignores mass-assignment fields", async () => {
    const email = `${syntheticPrefix}-create@example.test`;
    const key = `${syntheticPrefix}-create`;
    const response = await submitBooking(email, key, {
      extras: [["status", "COMPLETED"], ["userId", adminId], ["id", randomUUID()], ["internalNotes", "forged"]],
    });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({ success: true, referenceNumber: expect.any(String) });
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("storageKey");
    const record = await prisma.bookingRequest.findUnique({ where: { idempotencyKey: key } });
    expect(record).toMatchObject({ email, status: "PENDING", idempotencyStatus: "COMPLETED" });
    expect(record?.id).not.toBe(adminId);
  });

  it("rejects missing/invalid keys and invalid payloads without creating bookings", async () => {
    const email = `${syntheticPrefix}-invalid@example.test`;
    expect((await submitBooking(email)).status).toBe(400);
    expect((await submitBooking(email, "bad key")).status).toBe(400);
    expect((await submitBooking(email, "x".repeat(129))).status).toBe(400);
    expect((await publicBooking(new Request("http://localhost/api/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": `${syntheticPrefix}-invalid-payload` },
      body: bookingForm(email, { extras: [["consent", "yes"]] }),
    }))).status).toBe(400);
    expect(await prisma.bookingRequest.count({ where: { email } })).toBe(0);
  });

  it("rejects body-size violations before parsing the request", async () => {
    const response = await publicBooking(new Request("http://localhost/api/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": `${syntheticPrefix}-oversized`, "Content-Length": String(55 * 1024 * 1024 + 1) },
      body: new FormData(),
    }));
    expect(response.status).toBe(413);
  });

  it("preserves the honeypot response and rejects invalid images", async () => {
    const email = `${syntheticPrefix}-honeypot@example.test`;
    const honeypot = await submitBooking(email, `${syntheticPrefix}-honeypot`, { website: "filled" });
    expect(honeypot.status).toBe(201);
    expect(await honeypot.json()).toEqual({ success: true, referenceNumber: "IH-SPAM" });
    expect(await prisma.bookingRequest.count({ where: { email } })).toBe(0);

    const invalidImage = new File(["not an image"], "bad.png", { type: "image/png" });
    const invalid = await submitBooking(`${syntheticPrefix}-image@example.test`, `${syntheticPrefix}-image`, { images: [invalidImage] });
    expect(invalid.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();

    const zeroByte = await submitBooking(`${syntheticPrefix}-zero@example.test`, `${syntheticPrefix}-zero`, {
      images: [new File([], "empty.png", { type: "image/png" })],
    });
    expect(zeroByte.status).toBe(400);

    const tooMany = await submitBooking(`${syntheticPrefix}-many@example.test`, `${syntheticPrefix}-many`, {
      images: Array.from({ length: 6 }, (_, index) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], `${index}.png`, { type: "image/png" })),
    });
    expect(tooMany.status).toBe(400);
  });

  it("persists image metadata with mocked storage and does not duplicate uploads on retry", async () => {
    const email = `${syntheticPrefix}-image-ok@example.test`;
    const key = `${syntheticPrefix}-image-ok`;
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const image = new File([pngBytes], "synthetic.png", { type: "image/png" });
    const response = await submitBooking(email, key, { images: [image] });
    const payload = await response.json();
    const retry = await submitBooking(email, key, { images: [image] });
    const booking = await prisma.bookingRequest.findUnique({
      where: { idempotencyKey: key },
      include: { referenceImages: true },
    });

    expect(response.status).toBe(201);
    expect(retry.status).toBe(201);
    expect((await retry.json()).referenceNumber).toBe(payload.referenceNumber);
    expect(payload).not.toHaveProperty("storageKey");
    expect(uploadObject).toHaveBeenCalledOnce();
    expect(sendNewNotifications).toHaveBeenCalledOnce();
    expect(booking?.referenceImages).toHaveLength(1);
    expect(booking?.referenceImages[0].storageKey).toContain("booking-reference-images/");
  });

  it("returns the original result on retry and conflicts for changed payload", async () => {
    const email = `${syntheticPrefix}-retry@example.test`;
    const key = `${syntheticPrefix}-retry`;
    const first = await submitBooking(email, key);
    const firstPayload = await first.json();
    const sendsAfterFirst = sendNewNotifications.mock.calls.length;
    const retry = await submitBooking(email, key);
    const retryPayload = await retry.json();
    const conflict = await submitBooking(email, key, { fullName: "Changed Synthetic Tester" });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retryPayload.referenceNumber).toBe(firstPayload.referenceNumber);
    expect(conflict.status).toBe(409);
    expect(await prisma.bookingRequest.count({ where: { email } })).toBe(1);
    expect(sendNewNotifications).toHaveBeenCalledTimes(sendsAfterFirst);
  });

  it("returns 409 for a duplicate while the first request is in PROCESSING", async () => {
    const email = `${syntheticPrefix}-processing@example.test`;
    const key = `${syntheticPrefix}-processing`;
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const image = new File([pngBytes], "processing.png", { type: "image/png" });
    let signalStarted!: () => void;
    let releaseUpload!: () => void;
    const uploadStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
    const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve; });
    uploadObject.mockImplementationOnce(async () => {
      signalStarted();
      await uploadGate;
    });

    const firstRequest = submitBooking(email, key, { images: [image] });
    await uploadStarted;
    const duplicateResponse = await submitBooking(email, key, { images: [image] });
    const inProgress = await prisma.bookingRequest.findUnique({ where: { idempotencyKey: key } });
    releaseUpload();
    const firstResponse = await firstRequest;

    expect(duplicateResponse.status).toBe(409);
    expect(await duplicateResponse.json()).toMatchObject({ error: expect.stringContaining("already being processed") });
    expect(firstResponse.status).toBe(201);
    expect(inProgress?.idempotencyStatus).toBe("PROCESSING");
    expect(await prisma.bookingRequest.count({ where: { email } })).toBe(1);
  });

  it("handles ten simultaneous same-key requests without duplicate bookings or uncaught errors", async () => {
    const email = `${syntheticPrefix}-same-race@example.test`;
    const key = `${syntheticPrefix}-same-race`;
    const responses = await Promise.all(Array.from({ length: 10 }, () => submitBooking(email, key)));
    const statuses = responses.map(({ status }) => status);
    const records = await prisma.bookingRequest.findMany({ where: { email } });
    const successfulPayloads = await Promise.all(
      responses.filter(({ status }) => status === 201).map(async (response) => response.json()),
    );

    expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].idempotencyStatus).toBe("COMPLETED");
    expect(new Set(successfulPayloads.map(({ referenceNumber }) => referenceNumber))).toEqual(new Set([records[0].referenceNumber]));
    expect(sendNewNotifications).toHaveBeenCalledOnce();
  });

  it("handles ten simultaneous distinct keys as separate bookings", async () => {
    const email = `${syntheticPrefix}-different-race@example.test`;
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) => submitBooking(email, `${syntheticPrefix}-different-${index}`)),
    );
    const records = await prisma.bookingRequest.findMany({ where: { email } });
    expect(responses.every(({ status }) => status === 201)).toBe(true);
    expect(records).toHaveLength(10);
    expect(new Set(records.map(({ referenceNumber }) => referenceNumber)).size).toBe(10);
    expect(records.every(({ idempotencyStatus }) => idempotencyStatus === "COMPLETED")).toBe(true);
    expect(sendNewNotifications).toHaveBeenCalledTimes(10);
  });

  it("rejects conflicting simultaneous payloads for one key", async () => {
    const email = `${syntheticPrefix}-conflicting-race@example.test`;
    const key = `${syntheticPrefix}-conflicting-race`;
    const responses = await Promise.all([
      submitBooking(email, key),
      submitBooking(email, key, { fullName: "Different Synthetic Tester" }),
    ]);
    const records = await prisma.bookingRequest.findMany({ where: { email } });
    expect(records).toHaveLength(1);
    expect(responses.some(({ status }) => status === 201)).toBe(true);
    expect(responses.some(({ status }) => status === 409)).toBe(true);
  });

  it("rejects unauthenticated, malformed, and nonexistent admin route requests", async () => {
    const id = randomUUID();
    expect((await bookingDetail(new Request(`http://localhost/api/admin/bookings/${id}`), { params: { id } })).status).toBe(401);
    expect((await updateBooking(mutationRequest(`http://localhost/api/admin/bookings/${id}`, { status: "REVIEWING" }), { params: { id } })).status).toBe(401);
    expect((await createNote(mutationRequest(`http://localhost/api/admin/bookings/${id}/notes`, { body: "Synthetic" }), { params: { id } })).status).toBe(401);
    expect((await deleteBooking(deleteRequest(`http://localhost/api/admin/bookings/${id}`), { params: { id } })).status).toBe(401);

    await authenticateTestAdmin();

    expect((await bookingDetail(new Request("http://localhost/api/admin/bookings/not-a-uuid"), { params: { id: "not-a-uuid" } })).status).toBe(400);
    expect((await bookingDetail(new Request(`http://localhost/api/admin/bookings/${id}`), { params: { id } })).status).toBe(404);
    expect((await updateBooking(mutationRequest(`http://localhost/api/admin/bookings/${id}`, { status: "REVIEWING" }), { params: { id } })).status).toBe(404);
    expect((await createNote(mutationRequest(`http://localhost/api/admin/bookings/${id}/notes`, { body: "Synthetic" }), { params: { id } })).status).toBe(404);
    expect((await deleteBooking(deleteRequest(`http://localhost/api/admin/bookings/${id}`), { params: { id } })).status).toBe(404);
  });

  it("enforces origin and rate limits for booking deletion", async () => {
    const id = randomUUID();
    await authenticateTestAdmin();

    const rejectedOrigin = await deleteBooking(
      deleteRequest(`http://localhost/api/admin/bookings/${id}`, { Origin: "https://attacker.example.test" }),
      { params: { id } },
    );
    expect(rejectedOrigin.status).toBe(403);

    vi.mocked(enforceRateLimit).mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const rateLimited = await deleteBooking(deleteRequest(`http://localhost/api/admin/bookings/${id}`), { params: { id } });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get("Retry-After")).toBe("60");
  });

  it("permanently deletes only the selected booking graph and cleans its trusted reference images", async () => {
    const targetEmail = `${syntheticPrefix}-delete-target@example.test`;
    const otherEmail = `${syntheticPrefix}-delete-other@example.test`;
    const targetResponse = await submitBooking(targetEmail, `${syntheticPrefix}-delete-target`);
    const otherResponse = await submitBooking(otherEmail, `${syntheticPrefix}-delete-other`);
    const targetReference = (await targetResponse.json()).referenceNumber as string;
    const otherReference = (await otherResponse.json()).referenceNumber as string;
    syntheticAuditReferences.push(targetReference, otherReference);
    const [target, other] = await Promise.all([
      prisma.bookingRequest.findUniqueOrThrow({ where: { referenceNumber: targetReference } }),
      prisma.bookingRequest.findUniqueOrThrow({ where: { referenceNumber: otherReference } }),
    ]);
    const targetStorageKey = `booking-reference-images/${target.id}/${randomUUID()}.png`;
    const otherStorageKey = `booking-reference-images/${other.id}/${randomUUID()}.png`;

    await prisma.bookingReferenceImage.createMany({
      data: [
        { bookingRequestId: target.id, storageKey: targetStorageKey, originalFilename: "target.png", mimeType: "image/png", fileSize: 8 },
        { bookingRequestId: other.id, storageKey: otherStorageKey, originalFilename: "other.png", mimeType: "image/png", fileSize: 8 },
      ],
    });
    await prisma.bookingNote.create({ data: { bookingRequestId: target.id, authorId: adminId, body: "Synthetic note" } });
    await prisma.appointment.create({
      data: { bookingRequestId: target.id, startAt: new Date("2030-01-01T10:00:00Z"), endAt: new Date("2030-01-01T11:00:00Z") },
    });
    await prisma.tattooConsentRecord.create({
      data: { bookingRequestId: target.id, legalName: "Synthetic Client", status: "COMPLETED", consentTextSnapshot: "Synthetic consent" },
    });
    await prisma.clientAccessToken.create({
      data: { bookingRequestId: target.id, tokenHash: randomUUID(), expiresAt: new Date("2030-01-01T00:00:00Z") },
    });
    await prisma.clientSession.create({
      data: { bookingRequestId: target.id, tokenHash: randomUUID(), expiresAt: new Date("2030-01-01T00:00:00Z") },
    });
    const targetPlan = await prisma.paymentPlan.create({
      data: { bookingRequestId: target.id, totalAmount: "100.00", currency: "USD", installmentCount: 1, status: "ACTIVE" },
    });
    const targetInstallment = await prisma.paymentInstallment.create({
      data: {
        paymentPlanId: targetPlan.id,
        installmentNumber: 1,
        dueDate: new Date("2030-01-01T00:00:00Z"),
        amount: "100.00",
        status: "PAID",
      },
    });
    await prisma.payment.create({
      data: {
        paymentPlanId: targetPlan.id,
        installmentId: targetInstallment.id,
        recordedById: adminId,
        receiptNumber: `${syntheticPrefix}-target-receipt`,
        amount: "100.00",
        balanceAfter: "0.00",
        currency: "USD",
        method: "CASH",
        paidAt: new Date("2029-01-01T00:00:00Z"),
      },
    });
    const otherPlan = await prisma.paymentPlan.create({
      data: { bookingRequestId: other.id, totalAmount: "50.00", currency: "USD", installmentCount: 1 },
    });
    const otherInstallment = await prisma.paymentInstallment.create({
      data: {
        paymentPlanId: otherPlan.id,
        installmentNumber: 1,
        dueDate: new Date("2030-02-01T00:00:00Z"),
        amount: "50.00",
      },
    });
    await prisma.payment.create({
      data: {
        paymentPlanId: otherPlan.id,
        installmentId: otherInstallment.id,
        recordedById: adminId,
        receiptNumber: `${syntheticPrefix}-other-receipt`,
        amount: "10.00",
        balanceAfter: "40.00",
        currency: "USD",
        method: "CASH",
        paidAt: new Date("2029-02-01T00:00:00Z"),
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: "BOOKING_STATUS_UPDATED",
        entityType: "BookingRequest",
        entityId: target.id,
        metadata: { previousStatus: "PENDING", newStatus: "REVIEWING" },
      },
    });
    const artist = await prisma.artist.create({
      data: { slug: `${syntheticPrefix}-artist`, name: "Synthetic Artist", role: "Tattoo Artist" },
    });
    const artwork = await prisma.archiveArtwork.create({
      data: {
        title: "Synthetic Archive Fixture",
        slug: `${syntheticPrefix}-artwork`,
        altText: "Synthetic fixture",
        storageKey: `archive/${syntheticPrefix}/${randomUUID()}.png`,
        contentType: "image/png",
      },
    });

    await authenticateTestAdmin();
    const deleteResponse = await deleteBooking(
      deleteRequest(`http://localhost/api/admin/bookings/${target.id}`, {}, { storageKey: "attacker/arbitrary.png" }),
      { params: { id: target.id } },
    );
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ success: true, cleanupPending: false });
    expect(deleteObject.mock.calls.map(([key]) => key).sort()).toEqual([targetStorageKey]);
    expect(await prisma.bookingRequest.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.bookingReferenceImage.count({ where: { bookingRequestId: target.id } })).toBe(0);
    expect(await prisma.bookingNote.count({ where: { bookingRequestId: target.id } })).toBe(0);
    expect(await prisma.appointment.count({ where: { bookingRequestId: target.id } })).toBe(0);
    expect(await prisma.tattooConsentRecord.count({ where: { bookingRequestId: target.id } })).toBe(0);
    expect(await prisma.clientAccessToken.count({ where: { bookingRequestId: target.id } })).toBe(0);
    expect(await prisma.clientSession.count({ where: { bookingRequestId: target.id } })).toBe(0);
    expect(await prisma.paymentPlan.count({ where: { bookingRequestId: target.id } })).toBe(0);
    expect(await prisma.paymentInstallment.count({ where: { paymentPlanId: targetPlan.id } })).toBe(0);
    expect(await prisma.payment.count({ where: { paymentPlanId: targetPlan.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: target.id, action: "BOOKING_STATUS_UPDATED" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: targetReference, action: "BOOKING_CREATED" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: targetReference, action: "BOOKING_DELETED", userId: adminId } })).toBe(1);

    expect(await prisma.bookingRequest.findUnique({ where: { id: other.id } })).not.toBeNull();
    expect(await prisma.bookingReferenceImage.findUnique({ where: { storageKey: otherStorageKey } })).not.toBeNull();
    expect(await prisma.paymentPlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
    expect(await prisma.paymentInstallment.findUnique({ where: { id: otherInstallment.id } })).not.toBeNull();
    expect(await prisma.payment.findUnique({ where: { receiptNumber: `${syntheticPrefix}-other-receipt` } })).not.toBeNull();
    expect(await prisma.artist.findUnique({ where: { id: artist.id } })).not.toBeNull();
    expect(await prisma.archiveArtwork.findUnique({ where: { id: artwork.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: adminId } })).not.toBeNull();

    const repeatedDelete = await deleteBooking(
      deleteRequest(`http://localhost/api/admin/bookings/${target.id}`),
      { params: { id: target.id } },
    );
    expect(repeatedDelete.status).toBe(404);
    expect(deleteObject).toHaveBeenCalledTimes(1);

    await prisma.auditLog.deleteMany({ where: { entityType: "BookingRequest", entityId: targetReference } });
    await prisma.artist.delete({ where: { id: artist.id } });
    await prisma.archiveArtwork.delete({ where: { id: artwork.id } });
  });

  it("reports private image cleanup failures without exposing provider errors", async () => {
    const email = `${syntheticPrefix}-delete-storage-failure@example.test`;
    const created = await submitBooking(email, `${syntheticPrefix}-delete-storage-failure`);
    const { referenceNumber } = await created.json();
    syntheticAuditReferences.push(referenceNumber);
    const booking = await prisma.bookingRequest.findUniqueOrThrow({ where: { referenceNumber } });
    const storageKey = `booking-reference-images/${booking.id}/${randomUUID()}.png`;
    await prisma.bookingReferenceImage.create({
      data: {
        bookingRequestId: booking.id,
        storageKey,
        originalFilename: "synthetic.png",
        mimeType: "image/png",
        fileSize: 8,
      },
    });
    await authenticateTestAdmin();
    deleteObject.mockRejectedValueOnce(new Error("synthetic provider secret"));

    const response = await deleteBooking(
      deleteRequest(`http://localhost/api/admin/bookings/${booking.id}`),
      { params: { id: booking.id } },
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ success: true, cleanupPending: true });
    expect(JSON.stringify(payload)).not.toContain("synthetic provider secret");
    expect(await prisma.bookingRequest.findUnique({ where: { id: booking.id } })).toBeNull();
  });

  it("returns not found for a concurrent second delete", async () => {
    const email = `${syntheticPrefix}-delete-race@example.test`;
    const created = await submitBooking(email, `${syntheticPrefix}-delete-race`);
    const { referenceNumber } = await created.json();
    syntheticAuditReferences.push(referenceNumber);
    const booking = await prisma.bookingRequest.findUniqueOrThrow({ where: { referenceNumber } });
    await authenticateTestAdmin();

    const responses = await Promise.all([
      deleteBooking(deleteRequest(`http://localhost/api/admin/bookings/${booking.id}`), { params: { id: booking.id } }),
      deleteBooking(deleteRequest(`http://localhost/api/admin/bookings/${booking.id}`), { params: { id: booking.id } }),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 404]);
    expect(await prisma.bookingRequest.findUnique({ where: { id: booking.id } })).toBeNull();
  });

  it("returns the same generic login failure for wrong password and unknown email", async () => {
    async function attempt(email: string, password: string) {
      const form = new FormData();
      form.set("email", email);
      form.set("password", password);
      return login(new Request("http://localhost/api/admin/login", { method: "POST", body: form }));
    }
    const wrongPassword = await attempt(adminEmail, "wrong-synthetic-password");
    const unknownUser = await attempt(`${syntheticPrefix}-unknown@example.test`, "wrong-synthetic-password");
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownUser.json());
    expect((await attempt("malformed-email", "password")).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: adminId } })).toBe(0);
  });

  it("sets Secure on the admin session cookie in production mode", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const form = new FormData();
      form.set("email", adminEmail);
      form.set("password", "synthetic-test-password");
      const response = await login(new Request("http://localhost/api/admin/login", { method: "POST", body: form }));
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("authenticates, protects admin routes, updates status/notes, enforces origin, and logs out", async () => {
    const email = `${syntheticPrefix}-admin-booking@example.test`;
    const bookingResponse = await submitBooking(email, `${syntheticPrefix}-admin-booking`);
    const bookingPayload = await bookingResponse.json();
    const booking = await prisma.bookingRequest.findUnique({ where: { referenceNumber: bookingPayload.referenceNumber } });
    expect(booking).toBeTruthy();

    expect((await bookingList(new Request("http://localhost/api/admin/bookings"))).status).toBe(401);

    const form = new FormData();
    form.set("email", adminEmail.toUpperCase());
    form.set("password", "synthetic-test-password");
    const loginResponse = await login(new Request("http://localhost/api/admin/login", { method: "POST", body: form }));
    expect(loginResponse.status).toBe(200);
    expect(await loginResponse.json()).toEqual({ success: true });
    const token = sessionCookie(loginResponse);
    expect(token).toBeTruthy();
    cookieState.token = decodeURIComponent(token!);
    const session = await prisma.session.findFirst({ where: { userId: adminId } });
    expect(session?.tokenHash).not.toBe(cookieState.token);

    const listResponse = await bookingList(new Request("http://localhost/api/admin/bookings"));
    expect(listResponse.status).toBe(200);
    expect(JSON.stringify(await listResponse.json())).not.toContain("passwordHash");

    const badOrigin = await updateBooking(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}`, { status: "REVIEWING" }, { Origin: "http://localhost.attacker.test" }),
      { params: { id: booking!.id } },
    );
    expect(badOrigin.status).toBe(403);
    const missingOrigin = await createNote(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}/notes`, { body: "Synthetic note" }, { Origin: "" }),
      { params: { id: booking!.id } },
    );
    expect(missingOrigin.status).toBe(403);
    const nullOrigin = await updateBooking(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}`, { status: "REVIEWING" }, { Origin: "null" }),
      { params: { id: booking!.id } },
    );
    expect(nullOrigin.status).toBe(403);

    const updateResponse = await updateBooking(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}`, { status: "REVIEWING" }),
      { params: { id: booking!.id } },
    );
    expect(updateResponse.status).toBe(200);
    expect(sendStatusNotification).toHaveBeenCalledOnce();
    expect(sendStatusNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ email, referenceNumber: bookingPayload.referenceNumber }),
      "REVIEWING",
    );
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: booking!.id, action: "BOOKING_STATUS_UPDATED" },
    });
    expect(audit?.userId).toBe(adminId);
    expect(audit?.metadata).toEqual({ previousStatus: "PENDING", newStatus: "REVIEWING" });

    const noOp = await updateBooking(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}`, { status: "REVIEWING" }),
      { params: { id: booking!.id } },
    );
    expect(noOp.status).toBe(409);
    expect(sendStatusNotification).toHaveBeenCalledOnce();

    const invalidStatus = await updateBooking(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}`, { status: "NOT_A_STATUS" }),
      { params: { id: booking!.id } },
    );
    expect(invalidStatus.status).toBe(400);
    expect(await prisma.bookingRequest.findUnique({ where: { id: booking!.id } })).toMatchObject({ status: "REVIEWING" });

    const approved = await updateBooking(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}`, { status: "APPROVED" }),
      { params: { id: booking!.id } },
    );
    expect(approved.status).toBe(200);
    expect(sendStatusNotification).toHaveBeenCalledTimes(2);
    expect(await prisma.auditLog.findMany({
      where: { entityId: booking!.id, action: "BOOKING_STATUS_UPDATED" },
      orderBy: { createdAt: "asc" },
    })).toHaveLength(2);

    const forgedNote = await createNote(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}/notes`, { body: "Spoof", authorId: randomUUID() }),
      { params: { id: booking!.id } },
    );
    expect(forgedNote.status).toBe(400);
    const whitespaceNote = await createNote(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}/notes`, { body: "   " }),
      { params: { id: booking!.id } },
    );
    expect(whitespaceNote.status).toBe(400);
    const oversizedNote = await createNote(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}/notes`, { body: "n".repeat(5001) }),
      { params: { id: booking!.id } },
    );
    expect(oversizedNote.status).toBe(400);
    const noteResponse = await createNote(
      mutationRequest(`http://localhost/api/admin/bookings/${booking!.id}/notes`, { body: "Synthetic internal note" }),
      { params: { id: booking!.id } },
    );
    expect(noteResponse.status).toBe(201);
    const note = await prisma.bookingNote.findFirst({ where: { bookingRequestId: booking!.id } });
    expect(note?.authorId).toBe(adminId);
    expect(await prisma.auditLog.count({
      where: { entityId: booking!.id, action: "BOOKING_NOTE_ADDED", userId: adminId },
    })).toBe(1);

    const detailResponse = await bookingDetail(new Request(`http://localhost/api/admin/bookings/${booking!.id}`), { params: { id: booking!.id } });
    const detailText = await detailResponse.text();
    expect(detailResponse.status).toBe(200);
    expect(detailText).not.toContain("storageKey");
    expect(detailText).not.toContain("passwordHash");

    const logoutResponse = await logout(mutationRequest("http://localhost/api/admin/logout", undefined));
    expect(logoutResponse.status).toBe(200);
    expect(await prisma.session.count({ where: { userId: adminId } })).toBe(0);
    expect((await bookingList(new Request("http://localhost/api/admin/bookings"))).status).toBe(401);
  });
});
