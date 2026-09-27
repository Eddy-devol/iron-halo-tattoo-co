import { PaymentFrequency, PaymentMethod, PaymentPlanStatus, PaymentSource, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { authorizeAdminMutation } from "@/lib/server/admin-mutation";
import { getBookingDocuments } from "@/lib/server/booking-documents";
import { centsToDecimal, deriveInstallmentStatus, parseMoneyToCents } from "@/lib/server/payment-ledger";
import { generatePaymentSchedule, scheduleTotalCents } from "@/lib/payment-schedule";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const planDateSchema = dateSchema.optional();
const planSchema = z.object({
  totalAmount: z.string().max(13),
  amountAlreadyPaid: z.string().max(13).default("0.00"),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  paymentDate: planDateSchema,
  currency: z.string().regex(/^[A-Z]{3}$/).refine((value) => {
    try {
      const options = new Intl.NumberFormat("en-US", { style: "currency", currency: value }).resolvedOptions();
      return options.minimumFractionDigits === 2 && options.maximumFractionDigits === 2;
    } catch {
      return false;
    }
  }),
  frequency: z.nativeEnum(PaymentFrequency).default(PaymentFrequency.CUSTOM),
  installmentCount: z.number().int().min(0).max(24).optional(),
  firstDueDate: dateSchema.optional(),
  installments: z.array(z.object({
    dueDate: dateSchema,
    amount: z.string().max(13),
  }).strict()).max(24).optional(),
}).strict().superRefine((plan, context) => {
  if (plan.frequency === PaymentFrequency.CUSTOM && plan.installments && plan.installmentCount !== undefined
    && plan.installmentCount !== plan.installments.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentCount"], message: "Installment count must match the custom schedule." });
  }
  const installments = plan.installments ?? [];
  const dates = new Set<string>();
  for (let index = 0; index < installments.length; index += 1) {
    const currentDate = installments[index].dueDate;
    if (dates.has(currentDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["installments", index, "dueDate"],
        message: "Installment due dates must be unique.",
      });
    }
    dates.add(currentDate);
    if (index > 0 && currentDate <= installments[index - 1].dueDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["installments", index, "dueDate"],
        message: "Installment due dates must be chronological.",
      });
    }
  }
});

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
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid total, paid amount, and payment schedule." }, { status: 400 });
  }
  const totalCents = parseMoneyToCents(parsed.data.totalAmount);
  const amountAlreadyPaidCents = parsed.data.amountAlreadyPaid === "0" || parsed.data.amountAlreadyPaid === "0.0" || parsed.data.amountAlreadyPaid === "0.00"
    ? 0
    : parseMoneyToCents(parsed.data.amountAlreadyPaid);
  if (totalCents === null || amountAlreadyPaidCents === null || amountAlreadyPaidCents > totalCents) {
    return NextResponse.json({ error: "Amount already paid must be zero or less than or equal to the total price." }, { status: 400 });
  }

  if (amountAlreadyPaidCents > 0 && (!parsed.data.paymentMethod || !parsed.data.paymentDate)) {
    return NextResponse.json({ error: "Payment method and payment date are required for an amount already received." }, { status: 400 });
  }
  if (amountAlreadyPaidCents === 0 && (parsed.data.paymentMethod || parsed.data.paymentDate)) {
    return NextResponse.json({ error: "Payment details can only be supplied when an amount has already been received." }, { status: 400 });
  }

  const remainingCents = totalCents - amountAlreadyPaidCents;
  let schedule = parsed.data.installments;
  let firstDueDate: string | undefined;
  if (remainingCents === 0) {
    if ((schedule?.length ?? 0) !== 0 || (parsed.data.installmentCount ?? 0) !== 0) {
      return NextResponse.json({ error: "A fully paid plan cannot have future installments." }, { status: 400 });
    }
    schedule = [];
  } else if (parsed.data.frequency !== PaymentFrequency.CUSTOM) {
    if (!parsed.data.installmentCount || !parsed.data.firstDueDate) {
      return NextResponse.json({ error: "Enter a positive future installment count and first due date." }, { status: 400 });
    }
    firstDueDate = parsed.data.firstDueDate;
    schedule = generatePaymentSchedule({
      totalCents,
      amountAlreadyPaidCents,
      installmentCount: parsed.data.installmentCount,
      frequency: parsed.data.frequency,
      firstDueDate: firstDueDate,
    }) ?? undefined;
  } else {
    if (!schedule?.length) {
      return NextResponse.json({ error: "Custom schedules require future installment dates and amounts." }, { status: 400 });
    }
    if (parsed.data.installmentCount !== undefined && parsed.data.installmentCount !== schedule.length) {
      return NextResponse.json({ error: "Installment count must match the custom schedule." }, { status: 400 });
    }
    firstDueDate = schedule[0].dueDate;
  }
  if (!schedule || schedule.length > 24) {
    return NextResponse.json({ error: "The payment schedule is invalid." }, { status: 400 });
  }
  const installmentCents = schedule.map(({ amount }) => parseMoneyToCents(amount));
  const scheduleTotal = scheduleTotalCents(schedule);
  if (installmentCents.some((amount) => amount === null)
    || scheduleTotal !== remainingCents
    || (schedule.length > 0 && schedule[0].dueDate !== firstDueDate)) {
    return NextResponse.json({ error: "Future installment amounts must be positive and add up exactly to the remaining balance." }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const booking = await transaction.bookingRequest.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      if (!booking) return { kind: "booking_missing" as const };

      const plan = await transaction.paymentPlan.create({
        data: {
          bookingRequestId: booking.id,
          totalAmount: centsToDecimal(totalCents),
          currency: parsed.data.currency,
          frequency: parsed.data.frequency,
          status: amountAlreadyPaidCents === totalCents
            ? PaymentPlanStatus.COMPLETED
            : amountAlreadyPaidCents > 0 ? PaymentPlanStatus.ACTIVE : PaymentPlanStatus.PENDING,
          installmentCount: schedule.length,
          firstDueDate: firstDueDate ? new Date(`${firstDueDate}T00:00:00.000Z`) : null,
          installments: {
            create: schedule.map((installment, index) => ({
              installmentNumber: index + 1,
              dueDate: new Date(`${installment.dueDate}T00:00:00.000Z`),
              amount: centsToDecimal(installmentCents[index]!),
              status: deriveInstallmentStatus(installmentCents[index]!, 0, new Date(`${installment.dueDate}T00:00:00.000Z`)),
            })),
          },
        },
        select: { id: true },
      });
      if (amountAlreadyPaidCents > 0) {
        const deposit = await transaction.payment.create({
          data: {
            paymentPlanId: plan.id,
            installmentId: null,
            recordedById: authorization.admin.id,
            receiptNumber: `IH-${randomUUID().toUpperCase()}`,
            amount: centsToDecimal(amountAlreadyPaidCents),
            balanceAfter: centsToDecimal(remainingCents),
            currency: parsed.data.currency,
            method: parsed.data.paymentMethod!,
            source: PaymentSource.DEPOSIT,
            paidAt: new Date(`${parsed.data.paymentDate}T12:00:00.000Z`),
          },
          select: { id: true, receiptNumber: true },
        });
        await transaction.auditLog.create({
          data: {
            userId: authorization.admin.id,
            action: "DEPOSIT_RECORDED_WITH_PAYMENT_PLAN",
            entityType: "BookingRequest",
            entityId: booking.id,
            metadata: { paymentPlanId: plan.id, paymentId: deposit.id, amount: centsToDecimal(amountAlreadyPaidCents).toFixed(2) },
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "PAYMENT_PLAN_CREATED",
          entityType: "BookingRequest",
          entityId: booking.id,
          metadata: {
            paymentPlanId: plan.id,
            totalAmount: parsed.data.totalAmount,
            amountAlreadyPaid: centsToDecimal(amountAlreadyPaidCents).toFixed(2),
            currency: parsed.data.currency,
            installmentCount: schedule.length,
          },
        },
      });
      return { kind: "created" as const };
    });

    if (created.kind === "booking_missing") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const booking = await getBookingDocuments(params.id);
    return NextResponse.json(
      { paymentPlan: booking?.paymentPlan },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A payment plan already exists for this booking." }, { status: 409 });
    }
    console.error("ADMIN_PAYMENT_PLAN_CREATE_FAILED", {
      errorCategory: safeErrorCategory(error),
      bookingId: params.id,
    });
    return NextResponse.json({ error: "Unable to create the payment plan." }, { status: 500 });
  }
}
