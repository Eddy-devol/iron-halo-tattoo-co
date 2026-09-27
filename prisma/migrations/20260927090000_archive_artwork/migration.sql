CREATE TABLE "ArchiveArtwork" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "style" TEXT,
  "altText" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArchiveArtwork_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArchiveArtwork_slug_key" ON "ArchiveArtwork"("slug");
CREATE UNIQUE INDEX "ArchiveArtwork_storageKey_key" ON "ArchiveArtwork"("storageKey");
CREATE INDEX "ArchiveArtwork_published_idx" ON "ArchiveArtwork"("published");
CREATE INDEX "ArchiveArtwork_featured_idx" ON "ArchiveArtwork"("featured");
CREATE INDEX "ArchiveArtwork_sortOrder_idx" ON "ArchiveArtwork"("sortOrder");
CREATE INDEX "ArchiveArtwork_createdAt_idx" ON "ArchiveArtwork"("createdAt");
