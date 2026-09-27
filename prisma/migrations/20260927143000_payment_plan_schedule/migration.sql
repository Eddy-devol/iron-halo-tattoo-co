ALTER TYPE "PaymentPlanStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "PaymentPlanStatus" ADD VALUE 'COMPLETED';
CREATE TYPE "PaymentFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM');
CREATE TYPE "PaymentInstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

ALTER TABLE "PaymentPlan"
  ADD COLUMN "initialAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "frequency" "PaymentFrequency" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "firstDueDate" DATE;

UPDATE "PaymentPlan" plan
SET "firstDueDate" = (
  SELECT MIN(installment."dueDate")
  FROM "PaymentInstallment" installment
  WHERE installment."paymentPlanId" = plan."id"
);

ALTER TABLE "PaymentPlan"
  ALTER COLUMN "firstDueDate" SET NOT NULL;

ALTER TABLE "PaymentInstallment"
  ADD COLUMN "status" "PaymentInstallmentStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "PaymentInstallment" installment
SET "status" = CASE
  WHEN COALESCE((SELECT SUM(payment."amount") FROM "Payment" payment WHERE payment."installmentId" = installment."id"), 0) >= installment."amount"
    THEN 'PAID'::"PaymentInstallmentStatus"
  WHEN COALESCE((SELECT SUM(payment."amount") FROM "Payment" payment WHERE payment."installmentId" = installment."id"), 0) > 0
    THEN 'PARTIALLY_PAID'::"PaymentInstallmentStatus"
  ELSE 'PENDING'::"PaymentInstallmentStatus"
END;
