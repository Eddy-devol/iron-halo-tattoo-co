import { PaymentInstallmentStatus, PaymentPlanStatus, Prisma } from "@prisma/client";

export function parseMoneyToCents(value: string) {
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function decimalToCents(value: Prisma.Decimal | string) {
  const text = typeof value === "string" ? value : value.toFixed(2);
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Unexpected stored monetary value.");
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
}

export function centsToDecimal(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid monetary amount.");
  return new Prisma.Decimal(`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`);
}

export function centsToString(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function derivePaymentStatus(totalCents: number, paidCents: number, cancelled = false) {
  if (cancelled) return PaymentPlanStatus.CANCELLED;
  if (paidCents === 0) return PaymentPlanStatus.PENDING;
  if (paidCents > totalCents) throw new Error("Recorded payments exceed the plan total.");
  if (paidCents === totalCents) return PaymentPlanStatus.COMPLETED;
  return PaymentPlanStatus.ACTIVE;
}

export function deriveInstallmentStatus(totalCents: number, paidCents: number, dueDate: Date, now = new Date()) {
  if (paidCents > totalCents) throw new Error("Recorded payments exceed the installment amount.");
  if (paidCents >= totalCents) return PaymentInstallmentStatus.PAID;
  if (dueDate.toISOString().slice(0, 10) < now.toISOString().slice(0, 10)) return PaymentInstallmentStatus.OVERDUE;
  if (paidCents > 0) return PaymentInstallmentStatus.PARTIALLY_PAID;
  return PaymentInstallmentStatus.PENDING;
}

export function calculatePaymentSummary(
  total: Prisma.Decimal | string,
  payments: Array<{ amount: Prisma.Decimal | string }>,
  cancelled = false,
) {
  const totalCents = decimalToCents(total);
  const paidCents = payments.reduce((sum, payment) => sum + decimalToCents(payment.amount), 0);
  if (paidCents > totalCents) throw new Error("Recorded payments exceed the plan total.");
  return {
    totalCents,
    paidCents,
    remainingCents: totalCents - paidCents,
    status: derivePaymentStatus(totalCents, paidCents, cancelled),
  };
}
