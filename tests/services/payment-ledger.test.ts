import { describe, expect, it } from "vitest";
import {
  calculatePaymentSummary,
  centsToDecimal,
  centsToString,
  deriveInstallmentStatus,
  derivePaymentStatus,
  parseMoneyToCents,
} from "@/lib/server/payment-ledger";
import { generatePaymentSchedule, scheduleTotalCents } from "@/lib/payment-schedule";

describe("payment ledger arithmetic", () => {
  it("parses positive monetary values as integer cents without floating-point math", () => {
    expect(parseMoneyToCents("125")).toBe(12_500);
    expect(parseMoneyToCents("125.4")).toBe(12_540);
    expect(parseMoneyToCents("0")).toBeNull();
    expect(parseMoneyToCents("-1.00")).toBeNull();
    expect(parseMoneyToCents("1.999")).toBeNull();
    expect(parseMoneyToCents("01.00")).toBeNull();
  });

  it("calculates partial and paid balances and statuses from persisted payment amounts", () => {
    const partial = calculatePaymentSummary(centsToDecimal(10_000), [
      { amount: centsToDecimal(3_250) },
      { amount: centsToDecimal(1_250) },
    ]);
    expect(partial).toMatchObject({ totalCents: 10_000, paidCents: 4_500, remainingCents: 5_500, status: "ACTIVE" });

    const paid = calculatePaymentSummary(centsToDecimal(10_000), [
      { amount: centsToDecimal(10_000) },
    ]);
    expect(paid).toMatchObject({ totalCents: 10_000, paidCents: 10_000, remainingCents: 0, status: "COMPLETED" });
    expect(centsToString(paid.remainingCents)).toBe("0.00");
  });

  it("derives pending, partial, paid, and cancelled plan statuses", () => {
    expect(derivePaymentStatus(10_000, 0)).toBe("PENDING");
    expect(derivePaymentStatus(10_000, 1)).toBe("ACTIVE");
    expect(derivePaymentStatus(10_000, 10_000)).toBe("COMPLETED");
    expect(derivePaymentStatus(10_000, 5_000)).not.toBe("COMPLETED");
    expect(() => derivePaymentStatus(10_000, 10_001)).toThrow();
    expect(derivePaymentStatus(10_000, 0, true)).toBe("CANCELLED");
  });

  it("generates exact monthly installment totals and calendar dates", () => {
    const schedule = generatePaymentSchedule({
      totalCents: 120_000,
      amountAlreadyPaidCents: 0,
      installmentCount: 8,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-01",
    });
    expect(schedule).toHaveLength(8);
    expect(schedule?.map(({ dueDate }) => dueDate)).toEqual([
      "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01",
      "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01",
    ]);
    expect(schedule?.every(({ amount }) => amount === "150.00")).toBe(true);
    expect(scheduleTotalCents(schedule ?? [])).toBe(120_000);
    expect(generatePaymentSchedule({
      totalCents: 3_000,
      amountAlreadyPaidCents: 0,
      installmentCount: 3,
      frequency: "WEEKLY",
      firstDueDate: "2026-10-01",
    })?.map(({ dueDate }) => dueDate)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
    expect(generatePaymentSchedule({
      totalCents: 3_000,
      amountAlreadyPaidCents: 0,
      installmentCount: 3,
      frequency: "BIWEEKLY",
      firstDueDate: "2026-10-01",
    })?.map(({ dueDate }) => dueDate)).toEqual(["2026-10-01", "2026-10-15", "2026-10-29"]);
  });

  it("distributes remainder cents exactly and subtracts deposits from future installments", () => {
    const uneven = generatePaymentSchedule({
      totalCents: 100_000,
      amountAlreadyPaidCents: 0,
      installmentCount: 3,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-31",
    });
    expect(uneven?.map(({ amount }) => amount)).toEqual(["333.34", "333.33", "333.33"]);
    expect(uneven?.map(({ dueDate }) => dueDate)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(scheduleTotalCents(uneven ?? [])).toBe(100_000);

    const depositSchedule = generatePaymentSchedule({
      totalCents: 120_000,
      amountAlreadyPaidCents: 20_000,
      installmentCount: 8,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-01",
    });
    expect(depositSchedule?.map(({ amount }) => amount)).toEqual(Array(8).fill("125.00"));
    expect(scheduleTotalCents(depositSchedule ?? [])).toBe(100_000);
    expect(generatePaymentSchedule({
      totalCents: 120_000,
      amountAlreadyPaidCents: 120_000,
      installmentCount: 0,
      frequency: "MONTHLY",
      firstDueDate: "",
    })).toEqual([]);
  });

  it("rejects invalid schedules and derives overdue installment status", () => {
    expect(generatePaymentSchedule({
      totalCents: 10_000,
      amountAlreadyPaidCents: 0,
      installmentCount: 0,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-01",
    })).toBeNull();
    expect(generatePaymentSchedule({
      totalCents: 1,
      amountAlreadyPaidCents: 0,
      installmentCount: 2,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-01",
    })).toBeNull();
    expect(generatePaymentSchedule({
      totalCents: 10_000,
      amountAlreadyPaidCents: -1,
      installmentCount: 2,
      frequency: "MONTHLY",
      firstDueDate: "2026-10-01",
    })).toBeNull();
    expect(deriveInstallmentStatus(10_000, 0, new Date("2026-09-01T00:00:00.000Z"), new Date("2026-09-27T00:00:00.000Z"))).toBe("OVERDUE");
    expect(deriveInstallmentStatus(10_000, 10_000, new Date("2026-09-01T00:00:00.000Z"))).toBe("PAID");
  });
});
