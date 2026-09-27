import "server-only";
import { ConsentStatus, PaymentMethod, PaymentPlanStatus, PaymentSource } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculatePaymentSummary, centsToString } from "@/lib/server/payment-ledger";

export type BookingDocumentData = {
  id: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  description: string;
  style: string | null;
  placement: string;
  size: string;
  colorPreference: string | null;
  preferredTimeframe: string | null;
  artistName: string | null;
  status: string;
  createdAt: string;
  appointments: Array<{ startAt: string; endAt: string }>;
  consentRecord: {
    legalName: string | null;
    dateOfBirth: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    governmentIdType: string | null;
    governmentIdLastFour: string | null;
    identificationVerifiedAt: string | null;
    verifiedByName: string | null;
    status: ConsentStatus;
    completedAt: string | null;
    consentTextSnapshot: string | null;
  } | null;
  paymentPlan: {
    id: string;
    totalAmount: string;
    amountPaid: string;
    remainingBalance: string;
    currency: string;
    status: PaymentPlanStatus;
    installmentCount: number;
    createdAt: string;
    installments: Array<{
      id: string;
      installmentNumber: number;
      dueDate: string;
      amount: string;
      amountPaid: string;
      remaining: string;
      lastPaidAt: string | null;
    }>;
    payments: Array<{
      id: string;
      receiptNumber: string;
      installmentNumber: number;
      amount: string;
      balanceAfter: string;
      currency: string;
      method: PaymentMethod;
      source: PaymentSource;
      paidAt: string;
      reference: string | null;
      notes: string | null;
      recordedByName: string;
    }>;
  } | null;
};

export async function getBookingDocuments(bookingId: string): Promise<BookingDocumentData | null> {
  const booking = await prisma.bookingRequest.findUnique({
    where: { id: bookingId },
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
      status: true,
      createdAt: true,
      appointments: {
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
        orderBy: { startAt: "asc" },
        take: 1,
        select: { startAt: true, endAt: true },
      },
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
          consentTextSnapshot: true,
        },
      },
      paymentPlan: {
        include: {
          installments: {
            orderBy: { installmentNumber: "asc" },
            include: {
              payments: {
                orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
                select: { amount: true, paidAt: true },
              },
            },
          },
          payments: {
            orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
            include: { recordedBy: { select: { name: true } }, installment: { select: { installmentNumber: true } } },
          },
        },
      },
    },
  });
  if (!booking) return null;

  const plan = booking.paymentPlan;
  const paymentSummary = plan
    ? calculatePaymentSummary(plan.totalAmount, plan.payments, plan.status === "CANCELLED")
    : null;
  return {
    ...booking,
    paymentPlan: plan && paymentSummary ? {
      id: plan.id,
      totalAmount: centsToString(paymentSummary.totalCents),
      amountPaid: centsToString(paymentSummary.paidCents),
      remainingBalance: centsToString(paymentSummary.remainingCents),
      currency: plan.currency,
      status: paymentSummary.status,
      installmentCount: plan.installmentCount,
      createdAt: plan.createdAt.toISOString(),
      installments: plan.installments.map((installment) => {
        const installmentPaid = calculatePaymentSummary(installment.amount, installment.payments);
        return {
          id: installment.id,
          installmentNumber: installment.installmentNumber,
          dueDate: installment.dueDate.toISOString(),
          amount: centsToString(installmentPaid.totalCents),
          amountPaid: centsToString(installmentPaid.paidCents),
          remaining: centsToString(installmentPaid.remainingCents),
          lastPaidAt: installment.payments.length
            ? installment.payments[installment.payments.length - 1].paidAt.toISOString()
            : null,
        };
      }),
      payments: plan.payments.map((payment) => ({
        id: payment.id,
        receiptNumber: payment.receiptNumber,
        installmentNumber: payment.installment.installmentNumber,
        amount: payment.amount.toFixed(2),
        balanceAfter: payment.balanceAfter.toFixed(2),
        currency: payment.currency,
        method: payment.method,
        source: payment.source,
        paidAt: payment.paidAt.toISOString(),
        reference: payment.reference,
        notes: payment.notes,
        recordedByName: payment.recordedBy.name ?? "Admin",
      })),
    } : null,
    consentRecord: booking.consentRecord ? {
      ...booking.consentRecord,
      dateOfBirth: booking.consentRecord.dateOfBirth?.toISOString() ?? null,
      identificationVerifiedAt: booking.consentRecord.identificationVerifiedAt?.toISOString() ?? null,
      verifiedByName: booking.consentRecord.verifiedBy?.name ?? null,
      completedAt: booking.consentRecord.completedAt?.toISOString() ?? null,
    } : null,
    createdAt: booking.createdAt.toISOString(),
    appointments: booking.appointments.map((appointment) => ({
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
    })),
  };
}

export function getConsentText() {
  return process.env.TATTOO_CONSENT_TEXT?.trim() ?? "";
}

export function getPaymentPlanAgreementText() {
  return process.env.TATTOO_PAYMENT_PLAN_AGREEMENT?.trim() ?? "";
}

export const consentDraftText = [
  "DRAFT FOR STUDIO AND QUALIFIED COUNSEL REVIEW — not final client-facing legal language.",
  "I have had the opportunity to discuss the proposed tattoo procedure, ask questions, and receive answers before deciding whether to proceed.",
  "I understand that tattooing may involve discomfort and potential risks, including infection, allergic reaction, scarring, and healing or pigment outcomes that vary by person.",
  "I have received or will receive aftercare instructions and understand that following them and communicating relevant health or allergy information are my responsibility.",
  "I understand that a tattoo is intended to be permanent and that appearance may change over time.",
].join("\n");

export const paymentPlanDraftText = [
  "DRAFT FOR STUDIO REVIEW — the studio must approve its final payment-plan language before client use.",
  "I have reviewed the installment amounts and due dates shown above and understand this document records a payment schedule, not an online payment authorization.",
  "Payments listed as paid are manually recorded by the studio. Any additional studio policy language must be supplied and reviewed separately.",
].join("\n");
