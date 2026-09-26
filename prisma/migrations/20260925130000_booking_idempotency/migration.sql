CREATE TYPE "BookingIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED');

ALTER TABLE "BookingRequest"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyHash" TEXT,
  ADD COLUMN "idempotencyStatus" "BookingIdempotencyStatus";

CREATE UNIQUE INDEX "BookingRequest_idempotencyKey_key" ON "BookingRequest"("idempotencyKey");
