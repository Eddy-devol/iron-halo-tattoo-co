CREATE TABLE "ClientAccessToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingRequestId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientAccessToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientAccessToken_bookingRequestId_fkey"
    FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClientAccessToken_tokenHash_key" ON "ClientAccessToken"("tokenHash");
CREATE INDEX "ClientAccessToken_bookingRequestId_expiresAt_idx" ON "ClientAccessToken"("bookingRequestId", "expiresAt");
CREATE INDEX "ClientAccessToken_expiresAt_idx" ON "ClientAccessToken"("expiresAt");

CREATE TABLE "ClientSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingRequestId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientSession_bookingRequestId_fkey"
    FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClientSession_tokenHash_key" ON "ClientSession"("tokenHash");
CREATE INDEX "ClientSession_bookingRequestId_expiresAt_idx" ON "ClientSession"("bookingRequestId", "expiresAt");
CREATE INDEX "ClientSession_expiresAt_idx" ON "ClientSession"("expiresAt");
