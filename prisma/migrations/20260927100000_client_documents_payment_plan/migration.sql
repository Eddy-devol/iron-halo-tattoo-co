CREATE TYPE "PaymentPlanStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL');
CREATE TYPE "ConsentStatus" AS ENUM ('NOT_COMPLETED', 'COMPLETED');

ALTER TABLE "BookingRequest"
  ADD COLUMN "artistName" TEXT;

CREATE TABLE "PaymentPlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingRequestId" UUID NOT NULL,
  "archiveArtworkId" UUID,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" "PaymentPlanStatus" NOT NULL DEFAULT 'PENDING',
  "installmentCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentPlan_bookingRequestId_fkey"
    FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaymentPlan_archiveArtworkId_fkey"
    FOREIGN KEY ("archiveArtworkId") REFERENCES "ArchiveArtwork"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentPlan_bookingRequestId_key" ON "PaymentPlan"("bookingRequestId");
CREATE INDEX "PaymentPlan_status_createdAt_idx" ON "PaymentPlan"("status", "createdAt");

CREATE TABLE "PaymentInstallment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paymentPlanId" UUID NOT NULL,
  "installmentNumber" INTEGER NOT NULL,
  "dueDate" DATE NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "PaymentInstallment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentInstallment_paymentPlanId_fkey"
    FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentInstallment_paymentPlanId_installmentNumber_key"
  ON "PaymentInstallment"("paymentPlanId", "installmentNumber");
CREATE INDEX "PaymentInstallment_dueDate_idx" ON "PaymentInstallment"("dueDate");

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paymentPlanId" UUID NOT NULL,
  "installmentId" UUID NOT NULL,
  "recordedById" UUID NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "balanceAfter" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL',
  "paidAt" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_paymentPlanId_fkey"
    FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payment_installmentId_fkey"
    FOREIGN KEY ("installmentId") REFERENCES "PaymentInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payment_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");
CREATE INDEX "Payment_paymentPlanId_paidAt_idx" ON "Payment"("paymentPlanId", "paidAt");
CREATE INDEX "Payment_installmentId_paidAt_idx" ON "Payment"("installmentId", "paidAt");

CREATE TABLE "TattooConsentRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingRequestId" UUID NOT NULL,
  "legalName" TEXT,
  "dateOfBirth" DATE,
  "addressLine1" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "governmentIdType" TEXT,
  "governmentIdLastFour" VARCHAR(4),
  "identificationVerifiedAt" TIMESTAMP(3),
  "verifiedById" UUID,
  "status" "ConsentStatus" NOT NULL DEFAULT 'NOT_COMPLETED',
  "completedAt" TIMESTAMP(3),
  "completedById" UUID,
  "consentTextSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TattooConsentRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TattooConsentRecord_bookingRequestId_fkey"
    FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TattooConsentRecord_verifiedById_fkey"
    FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TattooConsentRecord_completedById_fkey"
    FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TattooConsentRecord_bookingRequestId_key" ON "TattooConsentRecord"("bookingRequestId");
CREATE INDEX "TattooConsentRecord_status_updatedAt_idx" ON "TattooConsentRecord"("status", "updatedAt");
