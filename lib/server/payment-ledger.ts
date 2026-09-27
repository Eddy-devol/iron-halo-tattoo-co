import { PaymentPlanStatus, Prisma } from "@prisma/client";

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
  if (paidCents >= totalCents) return PaymentPlanStatus.PAID;
  return PaymentPlanStatus.PARTIALLY_PAID;
}

export function calculatePaymentSummary(
  total: Prisma.Decimal | string,
  payments: Array<{ amount: Prisma.Decimal | string }>,
  cancelled = false,
) {
  const totalCents = decimalToCents(total);
  const paidCents = payments.reduce((sum, payment) => sum + decimalToCents(payment.amount), 0);
  return {
    totalCents,
    paidCents,
    remainingCents: Math.max(0, totalCents - paidCents),
    status: derivePaymentStatus(totalCents, paidCents, cancelled),
  };
}
