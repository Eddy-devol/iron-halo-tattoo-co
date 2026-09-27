import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authorizeAdminMutation } from "@/lib/server/admin-mutation";
import { getBookingDocuments } from "@/lib/server/booking-documents";
import { centsToDecimal, parseMoneyToCents } from "@/lib/server/payment-ledger";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const planSchema = z.object({
  totalAmount: z.string().max(13),
  currency: z.string().regex(/^[A-Z]{3}$/).refine((value) => {
    try {
      const options = new Intl.NumberFormat("en-US", { style: "currency", currency: value }).resolvedOptions();
      return options.minimumFractionDigits === 2 && options.maximumFractionDigits === 2;
    } catch {
      return false;
    }
  }),
  installments: z.array(z.object({
    dueDate: dateSchema,
    amount: z.string().max(13),
  }).strict()).min(1).max(24),
}).strict().superRefine((plan, context) => {
  for (let index = 1; index < plan.installments.length; index += 1) {
    if (plan.installments[index].dueDate < plan.installments[index - 1].dueDate) {
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
    return NextResponse.json({ error: "Enter a valid currency, total, and one to 24 dated installments." }, { status: 400 });
  }
  const totalCents = parseMoneyToCents(parsed.data.totalAmount);
  const installmentCents = parsed.data.installments.map(({ amount }) => parseMoneyToCents(amount));
  if (totalCents === null || installmentCents.some((amount) => amount === null)
    || installmentCents.reduce<number>((total, amount) => total + (amount ?? 0), 0) !== totalCents) {
    return NextResponse.json({ error: "Installment amounts must be positive and add up exactly to the total price." }, { status: 400 });
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
          installmentCount: parsed.data.installments.length,
          installments: {
            create: parsed.data.installments.map((installment, index) => ({
              installmentNumber: index + 1,
              dueDate: new Date(`${installment.dueDate}T00:00:00.000Z`),
              amount: centsToDecimal(installmentCents[index]!),
            })),
          },
        },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "PAYMENT_PLAN_CREATED",
          entityType: "BookingRequest",
          entityId: booking.id,
          metadata: {
            paymentPlanId: plan.id,
            totalAmount: parsed.data.totalAmount,
            currency: parsed.data.currency,
            installmentCount: parsed.data.installments.length,
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
