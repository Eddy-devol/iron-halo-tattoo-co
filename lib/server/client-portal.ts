import "server-only";
import { PaymentFrequency, PaymentInstallmentStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentClientSession } from "@/lib/server/client-auth";
import { calculatePaymentSummary, centsToString, deriveInstallmentStatus } from "@/lib/server/payment-ledger";

export type ClientPortalBooking = {
  referenceNumber: string;
  fullName: string;
  email: string;
  status: string;
  description: string;
  style: string | null;
  placement: string;
  size: string;
  colorPreference: string | null;
  preferredTimeframe: string | null;
  artistName: string | null;
  appointments: Array<{ startAt: string; endAt: string }>;
  consent: {
    status: "NOT_COMPLETED" | "COMPLETED";
    completedAt: string | null;
    legalName: string | null;
    dateOfBirth: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    consentText: string | null;
  } | null;
  paymentPlan: {
    totalAmount: string;
    amountPaid: string;
    remainingBalance: string;
    currency: string;
    status: string;
    frequency: PaymentFrequency;
    installmentCount: number;
    installments: Array<{
      installmentNumber: number;
      dueDate: string;
      amount: string;
      amountPaid: string;
      remaining: string;
      status: PaymentInstallmentStatus;
    }>;
    payments: Array<{
      receiptNumber: string;
      amount: string;
      balanceAfter: string;
      currency: string;
      method: string;
      source: string;
      paidAt: string;
    }>;
  } | null;
};

export async function getClientPortalBooking(bookingRequestId: string): Promise<ClientPortalBooking | null> {
  const booking = await prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
    select: {
      referenceNumber: true,
      fullName: true,
      email: true,
      status: true,
      description: true,
      style: true,
      placement: true,
      size: true,
      colorPreference: true,
      preferredTimeframe: true,
      artistName: true,
      appointments: {
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
        orderBy: { startAt: "asc" },
        take: 1,
        select: { startAt: true, endAt: true },
      },
      consentRecord: {
        select: {
          status: true,
          completedAt: true,
          legalName: true,
          dateOfBirth: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          consentTextSnapshot: true,
        },
      },
      paymentPlan: {
        select: {
          totalAmount: true,
          currency: true,
          status: true,
          frequency: true,
          installmentCount: true,
          installments: {
            orderBy: { installmentNumber: "asc" },
            select: {
              installmentNumber: true,
              dueDate: true,
              amount: true,
              payments: { select: { amount: true } },
            },
          },
          payments: {
            orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
            select: {
              receiptNumber: true,
              amount: true,
              balanceAfter: true,
              currency: true,
              method: true,
              source: true,
              paidAt: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!booking) return null;
  const plan = booking.paymentPlan;
  const summary = plan
    ? calculatePaymentSummary(plan.totalAmount, plan.payments, plan.status === "CANCELLED")
    : null;

  return {
    referenceNumber: booking.referenceNumber,
    fullName: booking.fullName,
    email: booking.email,
    status: booking.status,
    description: booking.description,
    style: booking.style,
    placement: booking.placement,
    size: booking.size,
    colorPreference: booking.colorPreference,
    preferredTimeframe: booking.preferredTimeframe,
    artistName: booking.artistName,
    appointments: booking.appointments.map(({ startAt, endAt }) => ({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    })),
    consent: booking.consentRecord ? {
      status: booking.consentRecord.status,
      completedAt: booking.consentRecord.completedAt?.toISOString() ?? null,
      legalName: booking.consentRecord.legalName,
      dateOfBirth: booking.consentRecord.dateOfBirth?.toISOString() ?? null,
      addressLine1: booking.consentRecord.addressLine1,
      city: booking.consentRecord.city,
      state: booking.consentRecord.state,
      postalCode: booking.consentRecord.postalCode,
      consentText: booking.consentRecord.consentTextSnapshot ?? process.env.TATTOO_CONSENT_TEXT?.trim() ?? null,
    } : null,
    paymentPlan: plan && summary ? {
      totalAmount: centsToString(summary.totalCents),
      amountPaid: centsToString(summary.paidCents),
      remainingBalance: centsToString(summary.remainingCents),
      currency: plan.currency,
      status: summary.status,
      frequency: plan.frequency,
      installmentCount: plan.installmentCount,
      installments: plan.installments.map((installment) => {
        const installmentSummary = calculatePaymentSummary(installment.amount, installment.payments);
        return {
          installmentNumber: installment.installmentNumber,
          dueDate: installment.dueDate.toISOString(),
          amount: centsToString(installmentSummary.totalCents),
          amountPaid: centsToString(installmentSummary.paidCents),
          remaining: centsToString(installmentSummary.remainingCents),
          status: deriveInstallmentStatus(installmentSummary.totalCents, installmentSummary.paidCents, installment.dueDate),
        };
      }),
      payments: plan.payments.map((payment) => ({
        receiptNumber: payment.receiptNumber,
        amount: payment.amount.toFixed(2),
        balanceAfter: payment.balanceAfter.toFixed(2),
        currency: payment.currency,
        method: payment.method,
        source: payment.source,
        paidAt: payment.paidAt.toISOString(),
      })),
    } : null,
  };
}

export async function requireClientPortalBooking() {
  const session = await getCurrentClientSession();
  if (!session) redirect("/portal/login");
  const booking = await getClientPortalBooking(session.bookingRequestId);
  if (!booking) notFound();
  return booking;
}

export async function requireClientPortalDocument(type: "confirmation" | "consent" | "payment-plan" | "client-packet" | "receipt", receiptNumber?: string) {
  const session = await getCurrentClientSession();
  if (!session) redirect("/portal/login");
  const booking = await getClientPortalBooking(session.bookingRequestId);
  if (!booking) notFound();
  if (type === "consent" && !booking.consent) notFound();
  if (type === "payment-plan" && !booking.paymentPlan) notFound();
  if (type === "receipt" && (!receiptNumber || !booking.paymentPlan?.payments.some((payment) => payment.receiptNumber === receiptNumber))) {
    notFound();
  }
  return booking;
}
