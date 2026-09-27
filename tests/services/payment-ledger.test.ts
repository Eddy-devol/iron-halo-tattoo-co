import { describe, expect, it } from "vitest";
import {
  calculatePaymentSummary,
  centsToDecimal,
  centsToString,
  derivePaymentStatus,
  parseMoneyToCents,
} from "@/lib/server/payment-ledger";

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
    expect(partial).toMatchObject({ totalCents: 10_000, paidCents: 4_500, remainingCents: 5_500, status: "PARTIALLY_PAID" });

    const paid = calculatePaymentSummary(centsToDecimal(10_000), [
      { amount: centsToDecimal(10_000) },
    ]);
    expect(paid).toMatchObject({ totalCents: 10_000, paidCents: 10_000, remainingCents: 0, status: "PAID" });
    expect(centsToString(paid.remainingCents)).toBe("0.00");
  });

  it("derives pending, partial, paid, and cancelled plan statuses", () => {
    expect(derivePaymentStatus(10_000, 0)).toBe("PENDING");
    expect(derivePaymentStatus(10_000, 1)).toBe("PARTIALLY_PAID");
    expect(derivePaymentStatus(10_000, 10_000)).toBe("PAID");
    expect(derivePaymentStatus(10_000, 0, true)).toBe("CANCELLED");
  });
});
