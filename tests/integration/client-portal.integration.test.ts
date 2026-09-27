import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieState, mailState, sendMock } = vi.hoisted(() => ({
  cookieState: { clientToken: undefined as string | undefined },
  mailState: { messages: [] as Array<{ to: string; html: string; text: string }> },
  sendMock: vi.fn(async (message: { to: string; html: string; text: string }) => {
    mailState.messages.push(message);
    return { data: { id: "synthetic-email-id" }, error: null };
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => name === "iron_halo_client_session" && cookieState.clientToken
      ? { value: cookieState.clientToken }
      : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error("notFound"); },
}));

vi.mock("server-only", () => ({}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("@/lib/server/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/security")>();
  return { ...actual, enforceRateLimit: vi.fn(async () => ({ allowed: true as const })) };
});

import { POST as requestClientLink } from "@/app/api/client/auth/request-link/route";
import { POST as verifyClientLink } from "@/app/api/client/auth/verify/route";
import { POST as logoutClient } from "@/app/api/client/auth/logout/route";
import { GET as getClientBooking } from "@/app/api/client/booking/route";
import * as clientBookingRoute from "@/app/api/client/booking/route";
import ClientDocumentPage from "@/app/portal/documents/[document]/page";
import ClientReceiptPage from "@/app/portal/documents/receipt/[receiptNumber]/page";
import { enforceRateLimit } from "@/lib/server/security";
import { clientSessionLifetimeSeconds, createOpaqueToken, hashClientToken } from "@/lib/server/client-auth";

const prisma = new PrismaClient();
const origin = "http://localhost:3000";
const prefix = `phase3c-${randomUUID()}`;
let adminId: string;

function request(url: string, body?: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function genericLinkRequest(email: string, bookingReference: string) {
  return request("http://localhost/api/client/auth/request-link", { email, bookingReference });
}

function tokenFromEmail() {
  const match = mailState.messages.at(-1)?.html.match(/#token=([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error("Synthetic email did not contain a client link token.");
  return match[1];
}

async function createBooking() {
  const booking = await prisma.bookingRequest.create({
    data: {
      referenceNumber: `IH-TEST-${randomUUID().slice(0, 6)}`.toUpperCase(),
      fullName: `${prefix} Client`,
      email: `${prefix}@example.test`,
      phone: "555-0100",
      description: "Synthetic tattoo description",
      style: "Blackwork",
      placement: "Forearm",
      size: "4 inches",
      colorPreference: "Black & grey",
      preferredTimeframe: "Autumn",
      status: "APPROVED",
      notes: { create: { authorId: adminId, body: `${prefix} SECRET ADMIN NOTE` } },
      referenceImages: {
        create: {
          storageKey: `booking-reference/${prefix}/private-key`,
          originalFilename: "private.jpg",
          mimeType: "image/jpeg",
          fileSize: 12,
        },
      },
    },
  });
  return booking;
}

async function requestAndVerifyLink(booking: Awaited<ReturnType<typeof createBooking>>) {
  const response = await requestClientLink(genericLinkRequest(booking.email, booking.referenceNumber));
  expect(response.status).toBe(200);
  const token = tokenFromEmail();
  const verifyResponse = await verifyClientLink(request("http://localhost/api/client/auth/verify", { token }));
  expect(verifyResponse.status).toBe(200);
  const cookieHeader = verifyResponse.headers.get("set-cookie") ?? "";
  const cookieValue = cookieHeader.match(/iron_halo_client_session=([^;]+)/)?.[1];
  expect(cookieValue).toBeTruthy();
  cookieState.clientToken = decodeURIComponent(cookieValue!);
  return token;
}

beforeAll(async () => {
  const [{ current_database: databaseName }] = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  expect(databaseName).toBe("iron_halo_test");
  process.env.NEXT_PUBLIC_SITE_URL = origin;
  process.env.RESEND_API_KEY = "synthetic-test-key";
  process.env.EMAIL_FROM = "test@example.test";
  adminId = (await prisma.user.create({
    data: { email: `${prefix}-admin@example.test`, name: "Synthetic Admin", role: "ADMIN" },
    select: { id: true },
  })).id;
});

beforeEach(() => {
  cookieState.clientToken = undefined;
  mailState.messages = [];
  sendMock.mockReset();
  sendMock.mockImplementation(async (message: { to: string; html: string; text: string }) => {
    mailState.messages.push(message);
    return { data: { id: "synthetic-email-id" }, error: null };
  });
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  const bookings = await prisma.bookingRequest.findMany({
    where: { email: { startsWith: prefix } },
    select: { id: true },
  });
  if (bookings.length) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "BookingRequest", entityId: { in: bookings.map(({ id }) => id) } },
    });
    await prisma.bookingRequest.deleteMany({
      where: { id: { in: bookings.map((booking) => booking.id) } },
    });
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe("client portal authentication and booking isolation", () => {
  it("returns indistinguishable link-request responses and stores only a token hash", async () => {
    const booking = await createBooking();
    expect(await prisma.bookingRequest.findFirst({
      where: { referenceNumber: booking.referenceNumber.toUpperCase(), email: { equals: booking.email, mode: "insensitive" } },
    })).not.toBeNull();
    const valid = await requestClientLink(genericLinkRequest(booking.email, booking.referenceNumber));
    expect(valid.status, JSON.stringify(await valid.clone().json())).toBe(200);
    expect(await prisma.clientAccessToken.findFirst({ where: { bookingRequestId: booking.id } })).not.toBeNull();
    expect(sendMock).toHaveBeenCalled();
    const invalid = await requestClientLink(genericLinkRequest(`${prefix}-missing@example.test`, "IH-TEST-MISSING"));
    expect(await valid.json()).toEqual(await invalid.json());
    expect(mailState.messages).toHaveLength(1);
    expect(mailState.messages[0].to).toBe(booking.email);
    const token = tokenFromEmail();
    const saved = await prisma.clientAccessToken.findFirstOrThrow({ where: { bookingRequestId: booking.id } });
    expect(saved.tokenHash).toBe(hashClientToken(token));
    expect(saved.tokenHash).not.toBe(token);
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(saved.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
  });

  it("consumes a link once, binds a hashed session to one booking, and rejects replay", async () => {
    const booking = await createBooking();
    const token = await requestAndVerifyLink(booking);
    expect(await prisma.clientAccessToken.findUnique({ where: { tokenHash: hashClientToken(token) } })).toBeNull();
    const savedSession = await prisma.clientSession.findUniqueOrThrow({
      where: { tokenHash: hashClientToken(cookieState.clientToken!) },
    });
    expect(savedSession.bookingRequestId).toBe(booking.id);
    expect(savedSession.tokenHash).not.toBe(cookieState.clientToken);
    expect(savedSession.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(savedSession.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + clientSessionLifetimeSeconds * 1000);
    const replay = await verifyClientLink(request("http://localhost/api/client/auth/verify", { token }));
    expect(replay.status).toBe(401);
  });

  it("rejects expired access tokens and expired client sessions", async () => {
    const booking = await createBooking();
    const expiredToken = createOpaqueToken();
    const expiredHash = hashClientToken(expiredToken);
    await prisma.clientAccessToken.create({
      data: { bookingRequestId: booking.id, tokenHash: expiredHash, expiresAt: new Date(Date.now() - 1000) },
    });
    const tokenResponse = await verifyClientLink(request("http://localhost/api/client/auth/verify", { token: expiredToken }));
    expect(tokenResponse.status).toBe(401);
    expect(await prisma.clientAccessToken.findUnique({ where: { tokenHash: expiredHash } })).toBeNull();

    const sessionToken = `expired-session-${randomUUID()}`;
    await prisma.clientSession.create({
      data: { bookingRequestId: booking.id, tokenHash: hashClientToken(sessionToken), expiresAt: new Date(Date.now() - 1000) },
    });
    cookieState.clientToken = sessionToken;
    expect((await getClientBooking(new Request("http://localhost/api/client/booking"))).status).toBe(401);
    expect(await prisma.clientSession.findUnique({ where: { tokenHash: hashClientToken(sessionToken) } })).toBeNull();
  });

  it("allows only the session-bound booking regardless of browser-supplied IDs", async () => {
    const ownBooking = await createBooking();
    const otherBooking = await prisma.bookingRequest.create({
      data: {
        referenceNumber: `IH-OTHER-${randomUUID()}`,
        fullName: "Other Synthetic Client",
        email: `${prefix}-other@example.test`,
        description: "Other private booking",
        placement: "Shoulder",
        size: "Small",
      },
    });
    await requestAndVerifyLink(ownBooking);
    const ownResponse = await getClientBooking(new Request(`http://localhost/api/client/booking?bookingId=${otherBooking.id}`));
    expect(ownResponse.status).toBe(200);
    const result = await ownResponse.json();
    expect(result.booking.referenceNumber).toBe(ownBooking.referenceNumber);
    expect(JSON.stringify(result)).not.toContain(otherBooking.referenceNumber);
    expect("POST" in clientBookingRoute).toBe(false);
    expect((await getClientBooking(new Request(`http://localhost/api/client/booking/${otherBooking.id}`))).status).toBe(200);
    expect((await (await getClientBooking(new Request("http://localhost/api/client/booking"))).json()).booking.referenceNumber).toBe(ownBooking.referenceNumber);
  });

  it("logs out the client session and clears the client-only cookie", async () => {
    const booking = await createBooking();
    await requestAndVerifyLink(booking);
    const rawSessionToken = cookieState.clientToken!;
    const response = await logoutClient(request("http://localhost/api/client/auth/logout"));
    expect(response.status).toBe(200);
    expect(await prisma.clientSession.findUnique({ where: { tokenHash: hashClientToken(rawSessionToken) } })).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    cookieState.clientToken = undefined;
    expect((await getClientBooking(new Request("http://localhost/api/client/booking"))).status).toBe(401);
  });

  it("rate limits link requests without sending email or revealing account existence", async () => {
    const booking = await createBooking();
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({ allowed: false, retryAfter: 900 });
    const limited = await requestClientLink(genericLinkRequest(booking.email, booking.referenceNumber));
    const unknown = await requestClientLink(genericLinkRequest("missing@example.test", "IH-TEST-MISSING"));
    expect(await limited.json()).toEqual(await unknown.json());
    expect(mailState.messages).toHaveLength(0);
  });

  it("rejects cross-origin auth mutations and does not log email addresses or link tokens", async () => {
    const booking = await createBooking();
    const invalidOrigin = new Request("http://localhost/api/client/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({ email: booking.email, bookingReference: booking.referenceNumber }),
    });
    expect((await requestClientLink(invalidOrigin)).status).toBe(403);
    expect(mailState.messages).toHaveLength(0);

    const loggedErrors: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      loggedErrors.push(args.map(String).join(" "));
    });
    sendMock.mockImplementationOnce(async (message: { to: string; html: string; text: string }) => {
      mailState.messages.push(message);
      throw new Error(`provider rejected ${message.to}`);
    });
    try {
      const response = await requestClientLink(genericLinkRequest(booking.email, booking.referenceNumber));
      expect(response.status).toBe(200);
      expect((await response.json()).message).toContain("If those details match");
      const rawToken = tokenFromEmail();
      expect(await prisma.clientAccessToken.findFirst({ where: { bookingRequestId: booking.id } })).toBeNull();
      const logs = loggedErrors.join("\n");
      expect(logs).toContain("CLIENT_PORTAL_EMAIL_FAILED");
      expect(logs).not.toContain(booking.email);
      expect(logs).not.toContain(booking.referenceNumber);
      expect(logs).not.toContain(rawToken);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("serves payment and safe document data without client mutation or administrative metadata", async () => {
    const booking = await createBooking();
    const plan = await prisma.paymentPlan.create({
      data: {
        bookingRequestId: booking.id,
        totalAmount: new Prisma.Decimal("100.00"),
        currency: "USD",
        installmentCount: 1,
        installments: {
          create: {
            installmentNumber: 1,
            dueDate: new Date("2026-10-01T00:00:00.000Z"),
            amount: new Prisma.Decimal("100.00"),
          },
        },
      },
      include: { installments: true },
    });
    const savedPayment = await prisma.payment.create({
      data: {
        paymentPlanId: plan.id,
        installmentId: plan.installments[0].id,
        recordedById: adminId,
        receiptNumber: `IH-${randomUUID()}`,
        amount: new Prisma.Decimal("25.00"),
        balanceAfter: new Prisma.Decimal("75.00"),
        currency: "USD",
        method: "CASH",
        source: "MANUAL",
        paidAt: new Date("2026-09-27T12:00:00.000Z"),
        notes: `${prefix} SECRET STAFF PAYMENT NOTE`,
      },
    });
    await prisma.tattooConsentRecord.create({
      data: {
        bookingRequestId: booking.id,
        legalName: booking.fullName,
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        governmentIdType: "Driver license",
        governmentIdLastFour: "9876",
        verifiedById: adminId,
        status: "NOT_COMPLETED",
      },
    });
    await requestAndVerifyLink(booking);
    const response = await getClientBooking(new Request("http://localhost/api/client/booking"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);
    expect(payload.booking.paymentPlan).toMatchObject({
      totalAmount: "100.00",
      amountPaid: "25.00",
      remainingBalance: "75.00",
      installments: [{ status: "PARTIALLY_PAID" }],
    });
    expect(payload.booking.paymentPlan.payments).toHaveLength(1);
    expect(payload.booking.consent.status).toBe("NOT_COMPLETED");
    expect(serialized).not.toContain("SECRET ADMIN NOTE");
    expect(serialized).not.toContain("SECRET STAFF PAYMENT NOTE");
    expect(serialized).not.toContain("private-key");
    expect(serialized).not.toContain("9876");
    expect(serialized).not.toContain("Synthetic Admin");

    const consentPage = renderToStaticMarkup(await ClientDocumentPage({ params: { document: "consent" } }));
    expect(consentPage).toContain("Consent has not yet been completed");
    expect(consentPage).toContain("Viewing or printing this document does not complete consent.");
    expect(consentPage).not.toContain("Signature");
    expect(consentPage).not.toContain("9876");
    expect(consentPage).not.toContain("SECRET ADMIN NOTE");
    expect((await prisma.tattooConsentRecord.findUniqueOrThrow({ where: { bookingRequestId: booking.id } })).status).toBe("NOT_COMPLETED");
    const confirmationPage = renderToStaticMarkup(await ClientDocumentPage({ params: { document: "confirmation" } }));
    const paymentPlanPage = renderToStaticMarkup(await ClientDocumentPage({ params: { document: "payment-plan" } }));
    const receiptPage = renderToStaticMarkup(await ClientReceiptPage({ params: { receiptNumber: savedPayment.receiptNumber } }));
    const packetPage = renderToStaticMarkup(await ClientDocumentPage({ params: { document: "client-packet" } }));
    expect(confirmationPage).toContain("Booking Confirmation");
    expect(paymentPlanPage).toContain("Payment Plan");
    expect(receiptPage).toContain(savedPayment.receiptNumber);
    expect(packetPage).toContain("Booking Confirmation");
    expect(receiptPage).not.toContain("SECRET STAFF PAYMENT NOTE");

    expect("POST" in clientBookingRoute).toBe(false);
  });

  it("rejects unauthenticated booking and document access and hides another booking's receipt", async () => {
    const booking = await createBooking();
    await expect(ClientDocumentPage({ params: { document: "confirmation" } })).rejects.toThrow("redirect:/portal/login");
    expect((await getClientBooking(new Request("http://localhost/api/client/booking"))).status).toBe(401);
    await requestAndVerifyLink(booking);
    await expect(ClientDocumentPage({ params: { document: "payment-plan" } })).rejects.toThrow("notFound");
    const anotherBooking = await prisma.bookingRequest.create({
      data: {
        referenceNumber: `IH-OTHER-${randomUUID()}`,
        fullName: "Other Synthetic Client",
        email: `${prefix}-other@example.test`,
        description: "Other private booking",
        placement: "Shoulder",
        size: "Small",
        paymentPlan: {
          create: {
            totalAmount: new Prisma.Decimal("10.00"),
            currency: "USD",
            installmentCount: 1,
            installments: {
              create: {
                installmentNumber: 1,
                dueDate: new Date("2026-10-01T00:00:00.000Z"),
                amount: new Prisma.Decimal("10.00"),
              },
            },
          },
        },
      },
      include: { paymentPlan: { include: { installments: true } } },
    });
    const anotherBookingReceipt = `IH-${randomUUID()}`;
    await prisma.payment.create({
      data: {
        paymentPlanId: anotherBooking.paymentPlan!.id,
        installmentId: anotherBooking.paymentPlan!.installments[0].id,
        recordedById: adminId,
        receiptNumber: anotherBookingReceipt,
        amount: new Prisma.Decimal("5.00"),
        balanceAfter: new Prisma.Decimal("5.00"),
        currency: "USD",
        method: "CASH",
        source: "MANUAL",
        paidAt: new Date("2026-09-27T12:00:00.000Z"),
      },
    });
    await expect(
      (async () => {
        const { requireClientPortalDocument } = await import("@/lib/server/client-portal");
        await requireClientPortalDocument("receipt", anotherBookingReceipt);
      })(),
    ).rejects.toThrow("notFound");
  });
});
