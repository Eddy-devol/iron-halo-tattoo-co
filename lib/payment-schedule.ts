export type PaymentFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "CUSTOM";

export type InstallmentScheduleItem = {
  dueDate: string;
  amount: string;
};

function formatCents(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function dueDateAt(firstDueDate: string, frequency: Exclude<PaymentFrequency, "CUSTOM">, index: number) {
  const first = new Date(`${firstDueDate}T00:00:00.000Z`);
  if (frequency === "WEEKLY" || frequency === "BIWEEKLY") {
    first.setUTCDate(first.getUTCDate() + index * (frequency === "WEEKLY" ? 7 : 14));
    return first.toISOString().slice(0, 10);
  }
  const day = first.getUTCDate();
  const targetMonth = first.getUTCMonth() + index;
  const year = first.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function generatePaymentSchedule(options: {
  totalCents: number;
  amountAlreadyPaidCents: number;
  installmentCount: number;
  frequency: Exclude<PaymentFrequency, "CUSTOM">;
  firstDueDate: string;
}): InstallmentScheduleItem[] | null {
  const { totalCents, amountAlreadyPaidCents, installmentCount, frequency, firstDueDate } = options;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0
    || !Number.isSafeInteger(amountAlreadyPaidCents) || amountAlreadyPaidCents < 0 || amountAlreadyPaidCents > totalCents
    || !Number.isInteger(installmentCount) || installmentCount < 0 || installmentCount > 24) return null;
  const remainingCents = totalCents - amountAlreadyPaidCents;
  if (remainingCents === 0) return installmentCount === 0 ? [] : null;
  if (installmentCount < 1 || installmentCount > remainingCents || !/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) return null;
  const firstDate = new Date(`${firstDueDate}T00:00:00.000Z`);
  if (Number.isNaN(firstDate.getTime()) || firstDate.toISOString().slice(0, 10) !== firstDueDate) return null;
  const baseAmount = Math.floor(remainingCents / installmentCount);
  const remainder = remainingCents % installmentCount;
  const rows = Array.from({ length: installmentCount }, (_, index) => ({
    dueDate: dueDateAt(firstDueDate, frequency, index),
    amount: formatCents(baseAmount + (index < remainder ? 1 : 0)),
  }));
  return rows;
}

export function scheduleTotalCents(schedule: InstallmentScheduleItem[]) {
  let total = 0;
  for (const item of schedule) {
    const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(item.amount);
    if (!match) return null;
    total += Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}
