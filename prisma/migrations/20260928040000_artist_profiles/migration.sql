CREATE TABLE "Artist" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "role" VARCHAR(80) NOT NULL,
  "bio" TEXT,
  "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "instagramUrl" VARCHAR(2048),
  "imageKey" TEXT,
  "imageContentType" VARCHAR(32),
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");
CREATE UNIQUE INDEX "Artist_imageKey_key" ON "Artist"("imageKey");
CREATE INDEX "Artist_published_displayOrder_createdAt_idx"
  ON "Artist"("published", "displayOrder", "createdAt");
