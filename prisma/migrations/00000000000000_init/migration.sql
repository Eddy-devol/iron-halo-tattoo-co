CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'REVIEWING', 'NEEDS_INFORMATION', 'APPROVED', 'DECLINED', 'BOOKED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "DepositStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'REFUNDED', 'FAILED');

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BookingRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referenceNumber" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "description" TEXT NOT NULL,
  "style" TEXT,
  "placement" TEXT NOT NULL,
  "size" TEXT NOT NULL,
  "colorPreference" TEXT,
  "preferredTimeframe" TEXT,
  "budget" TEXT,
  "additionalNotes" TEXT,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BookingReferenceImage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingRequestId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingReferenceImage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BookingNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingRequestId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Appointment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingRequestId" UUID NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
  "depositStatus" "DepositStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "BookingRequest_referenceNumber_key" ON "BookingRequest"("referenceNumber");
CREATE UNIQUE INDEX "BookingReferenceImage_storageKey_key" ON "BookingReferenceImage"("storageKey");
CREATE INDEX "BookingRequest_status_createdAt_idx" ON "BookingRequest"("status", "createdAt");
CREATE INDEX "BookingRequest_email_idx" ON "BookingRequest"("email");
CREATE INDEX "BookingReferenceImage_bookingRequestId_idx" ON "BookingReferenceImage"("bookingRequestId");
CREATE INDEX "BookingNote_bookingRequestId_createdAt_idx" ON "BookingNote"("bookingRequestId", "createdAt");
CREATE INDEX "Appointment_bookingRequestId_idx" ON "Appointment"("bookingRequestId");
CREATE INDEX "Appointment_startAt_status_idx" ON "Appointment"("startAt", "status");
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
ALTER TABLE "BookingReferenceImage" ADD CONSTRAINT "BookingReferenceImage_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingNote" ADD CONSTRAINT "BookingNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;