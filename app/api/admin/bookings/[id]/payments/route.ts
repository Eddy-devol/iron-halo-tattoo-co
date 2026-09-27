import { PaymentMethod, PaymentPlanStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authorizeAdminMutation } from "@/lib/server/admin-mutation";
import { getCurrentAdmin } from "@/lib/server/auth";
import { getBookingDocuments } from "@/lib/server/booking-documents";
import { calculatePaymentSummary, centsToDecimal, deriveInstallmentStatus, parseMoneyToCents } from "@/lib/server/payment-ledger";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const uuidSchema = z.string().uuid();
const paidDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const paymentSchema = z.object({
  installmentId: z.string().uuid(),
  amount: z.string().max(13),
  method: z.nativeEnum(PaymentMethod),
  paidAt: paidDateSchema,
  reference: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).strict();

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!uuidSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid booking ID." }, { status: 400 });
  }
  try {
    const booking = await prisma.bookingRequest.findUnique({
      where: { id: params.id },
      select: {
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
              include: {
                recordedBy: { select: { name: true } },
                installment: { select: { installmentNumber: true } },
              },
            },
          },
        },
      },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const plan = booking.paymentPlan;
    const summary = plan
      ? calculatePaymentSummary(plan.totalAmount, plan.payments, plan.status === PaymentPlanStatus.CANCELLED)
      : null;
    const paymentPlan = plan && summary ? {
      id: plan.id,
      totalAmount: `${Math.floor(summary.totalCents / 100)}.${String(summary.totalCents % 100).padStart(2, "0")}`,
      amountPaid: `${Math.floor(summary.paidCents / 100)}.${String(summary.paidCents % 100).padStart(2, "0")}`,
      remainingBalance: `${Math.floor(summary.remainingCents / 100)}.${String(summary.remainingCents % 100).padStart(2, "0")}`,
      currency: plan.currency,
      status: summary.status,
      frequency: plan.frequency,
      installmentCount: plan.installmentCount,
      firstDueDate: plan.firstDueDate?.toISOString() ?? null,
      createdAt: plan.createdAt.toISOString(),
      installments: plan.installments.map((installment) => {
        const installmentSummary = calculatePaymentSummary(installment.amount, installment.payments);
        const lastPayment = installment.payments[installment.payments.length - 1];
        return {
          id: installment.id,
          installmentNumber: installment.installmentNumber,
          dueDate: installment.dueDate.toISOString(),
          amount: `${Math.floor(installmentSummary.totalCents / 100)}.${String(installmentSummary.totalCents % 100).padStart(2, "0")}`,
          amountPaid: `${Math.floor(installmentSummary.paidCents / 100)}.${String(installmentSummary.paidCents % 100).padStart(2, "0")}`,
          remaining: `${Math.floor(installmentSummary.remainingCents / 100)}.${String(installmentSummary.remainingCents % 100).padStart(2, "0")}`,
          lastPaidAt: lastPayment?.paidAt.toISOString() ?? null,
          status: deriveInstallmentStatus(installmentSummary.totalCents, installmentSummary.paidCents, installment.dueDate),
        };
      }),
      payments: plan.payments.map((payment) => ({
        id: payment.id,
        receiptNumber: payment.receiptNumber,
        installmentNumber: payment.installment?.installmentNumber ?? null,
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
    } : null;
    return NextResponse.json(
      { paymentPlan },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("ADMIN_PAYMENT_PLAN_READ_FAILED", {
      errorCategory: safeErrorCategory(error),
      bookingId: params.id,
    });
    return NextResponse.json({ error: "Unable to load payment details." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
  const parsed = paymentSchema.safeParse(body);
  const amountCents = parsed.success ? parseMoneyToCents(parsed.data.amount) : null;
  if (!parsed.success || amountCents === null) {
    return NextResponse.json({ error: "Enter a valid positive payment amount and payment details." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const plan = await transaction.paymentPlan.findUnique({
        where: { bookingRequestId: params.id },
        select: { id: true, totalAmount: true, currency: true, status: true },
      });
      if (!plan) return { kind: "plan_missing" as const };
      await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentPlan" WHERE "id" = ${plan.id}::uuid FOR UPDATE`);
      const lockedPlan = await transaction.paymentPlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: {
          payments: { select: { amount: true } },
          installments: { where: { id: parsed.data.installmentId }, include: { payments: { select: { amount: true } } } },
        },
      });
      if (lockedPlan.status === PaymentPlanStatus.CANCELLED) return { kind: "cancelled" as const };
      const installment = lockedPlan.installments[0];
      if (!installment) return { kind: "installment_missing" as const };

      const summary = calculatePaymentSummary(lockedPlan.totalAmount, lockedPlan.payments);
      const installmentSummary = calculatePaymentSummary(installment.amount, installment.payments);
      if (amountCents > summary.remainingCents || amountCents > installmentSummary.remainingCents) {
        return { kind: "overpayment" as const };
      }
      const newPaidCents = summary.paidCents + amountCents;
      const newStatus = newPaidCents === summary.totalCents
        ? PaymentPlanStatus.COMPLETED
        : PaymentPlanStatus.ACTIVE;
      const payment = await transaction.payment.create({
        data: {
          paymentPlanId: lockedPlan.id,
          installmentId: installment.id,
          recordedById: authorization.admin.id,
          receiptNumber: `IH-${randomUUID().toUpperCase()}`,
          amount: centsToDecimal(amountCents),
          balanceAfter: centsToDecimal(summary.totalCents - newPaidCents),
          currency: lockedPlan.currency,
          method: parsed.data.method,
          source: "MANUAL",
          paidAt: new Date(`${parsed.data.paidAt}T12:00:00.000Z`),
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
        },
        select: { id: true, receiptNumber: true, amount: true },
      });
      await transaction.paymentPlan.update({
        where: { id: lockedPlan.id },
        data: { status: newStatus },
      });
      await transaction.paymentInstallment.update({
        where: { id: installment.id },
        data: {
          status: deriveInstallmentStatus(
            installmentSummary.totalCents,
            installmentSummary.paidCents + amountCents,
            installment.dueDate,
          ),
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "PAYMENT_RECORDED_MANUALLY",
          entityType: "BookingRequest",
          entityId: params.id,
          metadata: {
            paymentId: payment.id,
            amount: payment.amount.toFixed(2),
            currency: lockedPlan.currency,
            status: newStatus,
          },
        },
      });
      return { kind: "recorded" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "plan_missing") return NextResponse.json({ error: "Payment plan not found." }, { status: 404 });
    if (result.kind === "cancelled") return NextResponse.json({ error: "Payments cannot be recorded on a cancelled plan." }, { status: 409 });
    if (result.kind === "installment_missing") return NextResponse.json({ error: "Selected installment was not found." }, { status: 404 });
    if (result.kind === "overpayment") return NextResponse.json({ error: "Payment exceeds the remaining plan or installment balance." }, { status: 400 });
    const booking = await getBookingDocuments(params.id);
    return NextResponse.json(
      { paymentPlan: booking?.paymentPlan },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Payment changed concurrently. Reload and retry." }, { status: 409 });
    }
    console.error("ADMIN_PAYMENT_RECORD_FAILED", {
      errorCategory: safeErrorCategory(error),
      bookingId: params.id,
    });
    return NextResponse.json({ error: "Unable to record payment." }, { status: 500 });
  }
}
