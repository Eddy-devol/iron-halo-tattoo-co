import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieState } = vi.hoisted(() => ({
  cookieState: { token: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => cookieState.token ? { value: cookieState.token } : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error("notFound"); },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/server/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/security")>();
  return { ...actual, enforceRateLimit: vi.fn(async () => ({ allowed: true as const })) };
});

import { POST as createPaymentPlan } from "@/app/api/admin/bookings/[id]/payment-plan/route";
import { GET as getPayments, POST as recordPayment } from "@/app/api/admin/bookings/[id]/payments/route";
import { PATCH as updateConsent } from "@/app/api/admin/bookings/[id]/consent/route";
import BookingConfirmationPage from "@/app/admin/bookings/[id]/print/confirmation/page";
import TattooConsentPage from "@/app/admin/bookings/[id]/print/consent/page";
import PaymentPlanPage from "@/app/admin/bookings/[id]/print/payment-plan/page";
import PaymentReceiptPage from "@/app/admin/bookings/[id]/print/payment/[paymentId]/page";
import ClientPacketPage from "@/app/admin/bookings/[id]/print/client-packet/page";

const prisma = new PrismaClient();
const origin = "http://localhost:3000";
const prefix = `phase3b-${randomUUID()}`;
const sessionToken = `synthetic-session-${randomUUID()}`;
let adminId: string;

function request(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

async function createBooking() {
  return prisma.bookingRequest.create({
    data: {
      referenceNumber: `IH-TEST-${randomUUID()}`,
      fullName: `${prefix} Test Client`,
      email: `${prefix}@example.test`,
      phone: "555-0100",
      description: "Synthetic tattoo description",
      placement: "Forearm",
      size: "4 inches",
      status: "PENDING",
      notes: {
        create: {
          authorId: adminId,
          body: `${prefix} SECRET INTERNAL NOTE`,
        },
      },
      referenceImages: {
        create: {
          storageKey: `booking-reference/${prefix}/private-key`,
          originalFilename: "synthetic.jpg",
          mimeType: "image/jpeg",
          fileSize: 12,
        },
      },
    },
  });
}

beforeAll(async () => {
  const [{ current_database: databaseName }] = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  expect(databaseName).toBe("iron_halo_test");
  process.env.NEXT_PUBLIC_SITE_URL = origin;
  process.env.TATTOO_CONSENT_TEXT = "Synthetic reviewed consent copy for test only.";
  adminId = (await prisma.user.create({
    data: { email: `${prefix}-admin@example.test`, name: "Synthetic Admin", role: "ADMIN" },
    select: { id: true },
  })).id;
  await prisma.session.create({
    data: {
      tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
      userId: adminId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
});

beforeEach(() => {
  cookieState.token = undefined;
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
    await prisma.bookingRequest.deleteMany({ where: { id: { in: bookings.map(({ id }) => id) } } });
  }
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: adminId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe("payment plans and private client documents", () => {
  it("rejects unauthenticated payment access and printable document routes", async () => {
    const booking = await createBooking();
    expect((await getPayments(new Request("http://localhost"), { params: { id: booking.id } })).status).toBe(401);
    await expect(BookingConfirmationPage({ params: { id: booking.id } })).rejects.toThrow("redirect:/admin/login");
    await expect(TattooConsentPage({ params: { id: booking.id } })).rejects.toThrow("redirect:/admin/login");
    await expect(PaymentPlanPage({ params: { id: booking.id } })).rejects.toThrow("redirect:/admin/login");
    await expect(PaymentReceiptPage({ params: { id: booking.id, paymentId: randomUUID() } })).rejects.toThrow("redirect:/admin/login");
    await expect(ClientPacketPage({ params: { id: booking.id } })).rejects.toThrow("redirect:/admin/login");
  });

  it("validates installment totals, rejects negative and excess payments, and does not change booking or consent status", async () => {
    cookieState.token = sessionToken;
    const booking = await createBooking();
    const url = `http://localhost/api/admin/bookings/${booking.id}/payment-plan`;
    const invalidPlan = await createPaymentPlan(request(url, {
      totalAmount: "100.00",
      currency: "USD",
      installments: [{ dueDate: "2026-10-01", amount: "99.99" }],
    }), { params: { id: booking.id } });
    expect(invalidPlan.status).toBe(400);
    const duplicateDates = await createPaymentPlan(request(url, {
      totalAmount: "100.00",
      currency: "USD",
      installments: [
        { dueDate: "2026-10-01", amount: "50.00" },
        { dueDate: "2026-10-01", amount: "50.00" },
      ],
    }), { params: { id: booking.id } });
    expect(duplicateDates.status).toBe(400);
    const unsupportedCurrencyPrecision = await createPaymentPlan(request(url, {
      totalAmount: "100.00",
      currency: "JPY",
      installments: [{ dueDate: "2026-10-01", amount: "100.00" }],
    }), { params: { id: booking.id } });
    expect(unsupportedCurrencyPrecision.status).toBe(400);

    const created = await createPaymentPlan(request(url, {
      totalAmount: "100.00",
      currency: "USD",
      installments: [
        { dueDate: "2026-10-01", amount: "40.00" },
        { dueDate: "2026-11-01", amount: "60.00" },
      ],
    }), { params: { id: booking.id } });
    expect(created.status).toBe(201);
    const firstPlan = (await created.json()).paymentPlan;
    expect(firstPlan).toMatchObject({ totalAmount: "100.00", amountPaid: "0.00", remainingBalance: "100.00", status: "PENDING" });
    expect(firstPlan.installments).toHaveLength(2);

    const paymentUrl = `http://localhost/api/admin/bookings/${booking.id}/payments`;
    const negative = await recordPayment(request(paymentUrl, {
      installmentId: firstPlan.installments[0].id,
      amount: "-1.00",
      method: "CASH",
      paidAt: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(negative.status).toBe(400);

    const partial = await recordPayment(request(paymentUrl, {
      installmentId: firstPlan.installments[0].id,
      amount: "20.00",
      method: "CASH",
      paidAt: "2026-10-01",
      reference: "manual reference",
      notes: "Synthetic payment",
    }), { params: { id: booking.id } });
    expect(partial.status).toBe(201);
    const partialPlan = (await partial.json()).paymentPlan;
    expect(partialPlan).toMatchObject({ amountPaid: "20.00", remainingBalance: "80.00", status: "ACTIVE" });
    expect(partialPlan.payments[0].source).toBe("MANUAL");

    const installmentOverpayment = await recordPayment(request(paymentUrl, {
      installmentId: firstPlan.installments[0].id,
      amount: "21.00",
      method: "CARD",
      paidAt: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(installmentOverpayment.status).toBe(400);
    const planOverpayment = await recordPayment(request(paymentUrl, {
      installmentId: firstPlan.installments[1].id,
      amount: "81.00",
      method: "CARD",
      paidAt: "2026-11-01",
    }), { params: { id: booking.id } });
    expect(planOverpayment.status).toBe(400);

    const finishFirstInstallment = await recordPayment(request(paymentUrl, {
      installmentId: firstPlan.installments[0].id,
      amount: "20.00",
      method: "CASH",
      paidAt: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(finishFirstInstallment.status).toBe(201);
    const complete = await recordPayment(request(paymentUrl, {
      installmentId: firstPlan.installments[1].id,
      amount: "60.00",
      method: "BANK_TRANSFER",
      paidAt: "2026-11-01",
    }), { params: { id: booking.id } });
    const paidPlan = (await complete.json()).paymentPlan;
    expect(paidPlan).toMatchObject({ amountPaid: "100.00", remainingBalance: "0.00", status: "COMPLETED" });

    const storedBooking = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: booking.id },
      include: { consentRecord: true },
    });
    expect(storedBooking.status).toBe("PENDING");
    expect(storedBooking.consentRecord).toBeNull();
  });

  it("creates an exact generated monthly schedule and completes at zero balance", async () => {
    cookieState.token = sessionToken;
    const booking = await createBooking();
    const url = `http://localhost/api/admin/bookings/${booking.id}/payment-plan`;
    const invalidZeroInstallment = await createPaymentPlan(request(url, {
      totalAmount: "1.00",
      currency: "USD",
      installments: [{ dueDate: "2026-10-01", amount: "0.00" }],
    }), { params: { id: booking.id } });
    expect(invalidZeroInstallment.status).toBe(400);
    const invalidNegativeInstallment = await createPaymentPlan(request(url, {
      totalAmount: "1.00",
      currency: "USD",
      installments: [{ dueDate: "2026-10-01", amount: "-1.00" }],
    }), { params: { id: booking.id } });
    expect(invalidNegativeInstallment.status).toBe(400);

    const created = await createPaymentPlan(request(url, {
      totalAmount: "1200.00",
      amountAlreadyPaid: "0.00",
      currency: "USD",
      frequency: "MONTHLY",
      installmentCount: 8,
      firstDueDate: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(created.status).toBe(201);
    let plan = (await created.json()).paymentPlan;
    expect(plan).toMatchObject({
      totalAmount: "1200.00",
      amountPaid: "0.00",
      remainingBalance: "1200.00",
      frequency: "MONTHLY",
      installmentCount: 8,
      status: "PENDING",
    });
    expect(plan.payments).toEqual([]);
    expect(plan.installments.map((item: { dueDate: string; amount: string }) => [
      item.dueDate.slice(0, 10),
      item.amount,
    ])).toEqual([
      ["2026-10-01", "150.00"], ["2026-11-01", "150.00"],
      ["2026-12-01", "150.00"], ["2027-01-01", "150.00"],
      ["2027-02-01", "150.00"], ["2027-03-01", "150.00"],
      ["2027-04-01", "150.00"], ["2027-05-01", "150.00"],
    ]);

    const paymentUrl = `http://localhost/api/admin/bookings/${booking.id}/payments`;
    for (const installment of plan.installments) {
      const result = await recordPayment(request(paymentUrl, {
        installmentId: installment.id,
        amount: installment.amount,
        method: "CASH",
        paidAt: installment.dueDate.slice(0, 10),
      }), { params: { id: booking.id } });
      expect(result.status).toBe(201);
      plan = (await result.json()).paymentPlan;
    }
    expect(plan).toMatchObject({ amountPaid: "1200.00", remainingBalance: "0.00", status: "COMPLETED" });
    expect(plan.installments.every((item: { status: string; remaining: string }) => item.status === "PAID" && item.remaining === "0.00")).toBe(true);
  });

  it("records a received deposit in the ledger and schedules only the remaining balance", async () => {
    cookieState.token = sessionToken;
    const booking = await createBooking();
    const url = `http://localhost/api/admin/bookings/${booking.id}/payment-plan`;
    const invalidOverpayment = await createPaymentPlan(request(url, {
      totalAmount: "1200.00",
      amountAlreadyPaid: "1200.01",
      paymentMethod: "CASH",
      paymentDate: "2026-09-27",
      currency: "USD",
      frequency: "MONTHLY",
      installmentCount: 8,
      firstDueDate: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(invalidOverpayment.status).toBe(400);
    const invalidNegativeDeposit = await createPaymentPlan(request(url, {
      totalAmount: "1200.00",
      amountAlreadyPaid: "-1.00",
      paymentMethod: "CASH",
      paymentDate: "2026-09-27",
      currency: "USD",
      frequency: "MONTHLY",
      installmentCount: 8,
      firstDueDate: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(invalidNegativeDeposit.status).toBe(400);

    const created = await createPaymentPlan(request(url, {
      totalAmount: "1200.00",
      amountAlreadyPaid: "200.00",
      paymentMethod: "CASH",
      paymentDate: "2026-09-27",
      currency: "USD",
      frequency: "MONTHLY",
      installmentCount: 8,
      firstDueDate: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(created.status).toBe(201);
    let plan = (await created.json()).paymentPlan;
    expect(plan).toMatchObject({
      totalAmount: "1200.00",
      amountPaid: "200.00",
      remainingBalance: "1000.00",
      frequency: "MONTHLY",
      installmentCount: 8,
      status: "ACTIVE",
    });
    expect(plan.installments.map((item: { amount: string }) => item.amount)).toEqual(Array(8).fill("125.00"));
    expect(plan.installments.reduce((sum: number, item: { amount: string }) => sum + Math.round(Number(item.amount) * 100), 0)).toBe(100_000);
    expect(plan.payments).toHaveLength(1);
    expect(plan.payments[0]).toMatchObject({ amount: "200.00", source: "DEPOSIT", installmentNumber: null });
    const savedDeposit = await prisma.payment.findUniqueOrThrow({
      where: { receiptNumber: plan.payments[0].receiptNumber },
    });
    expect(savedDeposit).toMatchObject({
      amount: new Prisma.Decimal("200.00"),
      source: "DEPOSIT",
      installmentId: null,
      method: "CASH",
      balanceAfter: new Prisma.Decimal("1000.00"),
    });

    const retry = await createPaymentPlan(request(url, {
      totalAmount: "1200.00",
      amountAlreadyPaid: "200.00",
      paymentMethod: "CASH",
      paymentDate: "2026-09-27",
      currency: "USD",
      frequency: "MONTHLY",
      installmentCount: 8,
      firstDueDate: "2026-10-01",
    }), { params: { id: booking.id } });
    expect(retry.status).toBe(409);
    expect(await prisma.payment.count({ where: { paymentPlanId: plan.id } })).toBe(1);

    const paymentUrl = `http://localhost/api/admin/bookings/${booking.id}/payments`;
    for (const installment of plan.installments) {
      const result = await recordPayment(request(paymentUrl, {
        installmentId: installment.id,
        amount: installment.amount,
        method: "CASH",
        paidAt: installment.dueDate.slice(0, 10),
      }), { params: { id: booking.id } });
      expect(result.status).toBe(201);
      plan = (await result.json()).paymentPlan;
    }
    expect(plan).toMatchObject({ amountPaid: "1200.00", remainingBalance: "0.00", status: "COMPLETED" });
    const storedBooking = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(storedBooking.status).toBe("PENDING");
  });

  it("records a full deposit as a payment and creates no future installments", async () => {
    cookieState.token = sessionToken;
    const booking = await createBooking();
    const response = await createPaymentPlan(request(`http://localhost/api/admin/bookings/${booking.id}/payment-plan`, {
      totalAmount: "100.00",
      amountAlreadyPaid: "100.00",
      paymentMethod: "MPESA",
      paymentDate: "2026-09-27",
      currency: "USD",
      frequency: "MONTHLY",
      installmentCount: 0,
    }), { params: { id: booking.id } });
    expect(response.status).toBe(201);
    const plan = (await response.json()).paymentPlan;
    expect(plan).toMatchObject({ amountPaid: "100.00", remainingBalance: "0.00", status: "COMPLETED", installmentCount: 0 });
    expect(plan.installments).toEqual([]);
    expect(plan.payments).toHaveLength(1);
    expect(plan.payments[0]).toMatchObject({ amount: "100.00", method: "MPESA", source: "DEPOSIT" });
  });

  it("requires a received physical signature before recording consent completion", async () => {
    cookieState.token = sessionToken;
    const booking = await createBooking();
    const url = `http://localhost/api/admin/bookings/${booking.id}/consent`;
    const rejected = await updateConsent(request(url, {
      legalName: "Synthetic Legal Name",
      dateOfBirth: "1990-01-01",
      status: "COMPLETED",
      physicalSignatureReceived: false,
    }, "PATCH"), { params: { id: booking.id } });
    expect(rejected.status).toBe(400);
    const saved = await updateConsent(request(url, {
      legalName: "Synthetic Legal Name",
      dateOfBirth: "1990-01-01",
      governmentIdType: "Driver license",
      governmentIdLastFour: "1234",
      identificationVerified: true,
      status: "COMPLETED",
      physicalSignatureReceived: true,
    }, "PATCH"), { params: { id: booking.id } });
    expect(saved.status).toBe(200);
    expect((await saved.json()).consentRecord.status).toBe("COMPLETED");
    const stored = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: booking.id },
      include: { consentRecord: true },
    });
    expect(stored.status).toBe("PENDING");
    expect(stored.consentRecord?.governmentIdLastFour).toBe("1234");
    const editedCompletedRecord = await updateConsent(request(url, {
      legalName: "Corrected Synthetic Name",
    }, "PATCH"), { params: { id: booking.id } });
    expect(editedCompletedRecord.status).toBe(409);
    const reopened = await updateConsent(request(url, {
      status: "NOT_COMPLETED",
    }, "PATCH"), { params: { id: booking.id } });
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).consentRecord.status).toBe("NOT_COMPLETED");
  });

  it("refuses consent completion while approved consent wording is not configured", async () => {
    cookieState.token = sessionToken;
    const booking = await createBooking();
    const configuredText = process.env.TATTOO_CONSENT_TEXT;
    delete process.env.TATTOO_CONSENT_TEXT;
    let response: Response;
    try {
      response = await updateConsent(request(`http://localhost/api/admin/bookings/${booking.id}/consent`, {
        status: "COMPLETED",
        physicalSignatureReceived: true,
      }, "PATCH"), { params: { id: booking.id } });
    } finally {
      process.env.TATTOO_CONSENT_TEXT = configuredText;
    }
    expect(response.status).toBe(409);
    expect(await prisma.tattooConsentRecord.findUnique({ where: { bookingRequestId: booking.id } })).toBeNull();
  });

  it("renders private printable documents without internal notes or storage keys and rejects nonexistent receipts", async () => {
    cookieState.token = sessionToken;
    const booking = await createBooking();
    const planResponse = await createPaymentPlan(request(`http://localhost/api/admin/bookings/${booking.id}/payment-plan`, {
      totalAmount: "25.00",
      currency: "USD",
      installments: [{ dueDate: "2026-10-01", amount: "25.00" }],
    }), { params: { id: booking.id } });
    const plan = (await planResponse.json()).paymentPlan;
    const paymentResponse = await recordPayment(request(`http://localhost/api/admin/bookings/${booking.id}/payments`, {
      installmentId: plan.installments[0].id,
      amount: "25.00",
      method: "OTHER",
      paidAt: "2026-10-01",
      notes: "SECRET INTERNAL PAYMENT NOTE",
    }), { params: { id: booking.id } });
    const payment = (await paymentResponse.json()).paymentPlan.payments[0];

    const confirmation = renderToStaticMarkup(await BookingConfirmationPage({ params: { id: booking.id } }));
    const consentText = process.env.TATTOO_CONSENT_TEXT;
    const paymentText = process.env.TATTOO_PAYMENT_PLAN_AGREEMENT;
    let consent: string;
    let paymentPlan: string;
    try {
      delete process.env.TATTOO_CONSENT_TEXT;
      delete process.env.TATTOO_PAYMENT_PLAN_AGREEMENT;
      consent = renderToStaticMarkup(await TattooConsentPage({ params: { id: booking.id } }));
      paymentPlan = renderToStaticMarkup(await PaymentPlanPage({ params: { id: booking.id } }));
    } finally {
      process.env.TATTOO_CONSENT_TEXT = consentText;
      process.env.TATTOO_PAYMENT_PLAN_AGREEMENT = paymentText;
    }
    const receipt = renderToStaticMarkup(await PaymentReceiptPage({ params: { id: booking.id, paymentId: payment.id } }));
    const packet = renderToStaticMarkup(await ClientPacketPage({ params: { id: booking.id } }));
    for (const document of [confirmation, consent, paymentPlan, receipt, packet]) {
      expect(document).not.toContain(`${prefix} SECRET INTERNAL NOTE`);
      expect(document).not.toContain("SECRET INTERNAL PAYMENT NOTE");
      expect(document).not.toContain(`booking-reference/${prefix}/private-key`);
    }
    expect(confirmation).toContain("Booking Confirmation");
    expect(consent).toContain("Tattoo Procedure Consent");
    expect(consent).toContain("DRAFT FOR STUDIO AND QUALIFIED COUNSEL REVIEW");
    expect(paymentPlan).toContain("Tattoo Installment Payment Plan");
    expect(paymentPlan).toContain("DRAFT FOR STUDIO REVIEW");
    expect(receipt).toContain(payment.receiptNumber);
    expect(packet).toContain("Client Packet");
    await expect(PaymentReceiptPage({ params: { id: booking.id, paymentId: randomUUID() } })).rejects.toThrow("notFound");
    const unchanged = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(unchanged.status).toBe("PENDING");
  });
});
