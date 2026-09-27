import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { adminArchiveImageUrl, authorizeArchiveMutation } from "@/lib/server/archive-api";
import {
  parseArchiveArtworkForm,
  readValidatedArchiveImage,
  validateArchiveImage,
} from "@/lib/server/archive-validation";
import { getCurrentAdmin } from "@/lib/server/auth";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { requestBodyTooLarge } from "@/lib/server/security";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/server/storage/s3";

const idSchema = z.string().uuid();
const maxArchiveRequestBytes = 11 * 1024 * 1024;
const selectedArtwork = {
  id: true,
  title: true,
  slug: true,
  description: true,
  style: true,
  altText: true,
  contentType: true,
  featured: true,
  published: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid artwork ID." }, { status: 400 });
  }

  try {
    const artwork = await prisma.archiveArtwork.findUnique({
      where: { id: params.id },
      select: selectedArtwork,
    });
    if (!artwork) return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
    return NextResponse.json({
      artwork: {
        ...artwork,
        createdAt: artwork.createdAt.toISOString(),
        updatedAt: artwork.updatedAt.toISOString(),
        imageUrl: adminArchiveImageUrl(artwork.id),
      },
    });
  } catch (error) {
    console.error("ADMIN_ARCHIVE_DETAIL_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load artwork." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (requestBodyTooLarge(request, maxArchiveRequestBytes)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const authorization = await authorizeArchiveMutation(request, "ADMIN_ARCHIVE_MUTATION_RATE_LIMITED");
  if ("response" in authorization) return authorization.response;
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid artwork ID." }, { status: 400 });
  }

  let newStorageKey: string | undefined;
  try {
    const form = await request.formData();
    const fields = parseArchiveArtworkForm(form, true);
    if (!fields.success) return NextResponse.json({ error: "Check the artwork details and try again." }, { status: 400 });

    const imageValue = form.get("image");
    const hasImage = imageValue instanceof File && imageValue.name.length > 0;
    if (!hasImage && Object.keys(fields.data).length === 0) {
      return NextResponse.json({ error: "Make a change before saving." }, { status: 400 });
    }

    const existing = await prisma.archiveArtwork.findUnique({
      where: { id: params.id },
      select: { storageKey: true },
    });
    if (!existing) return NextResponse.json({ error: "Artwork not found." }, { status: 404 });

    let replacement: { bytes: Buffer; contentType: string; storageKey: string } | undefined;
    if (hasImage) {
      const image = validateArchiveImage(imageValue);
      if (!image.success) return NextResponse.json({ error: image.error }, { status: 400 });
      const imageData = await readValidatedArchiveImage(image.file, image.extension);
      if (!imageData.success) return NextResponse.json({ error: "The selected file is not a valid image." }, { status: 400 });
      replacement = {
        bytes: imageData.bytes,
        contentType: image.file.type,
        storageKey: imageData.storageKey,
      };
      newStorageKey = replacement.storageKey;
      await uploadPrivateObject(replacement.storageKey, replacement.bytes, replacement.contentType);
    }

    const artwork = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.archiveArtwork.update({
        where: { id: params.id },
        data: {
          ...fields.data,
          ...(replacement ? { storageKey: replacement.storageKey, contentType: replacement.contentType } : {}),
        },
        select: selectedArtwork,
      });
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "ARCHIVE_ARTWORK_UPDATED",
          entityType: "ArchiveArtwork",
          entityId: updated.id,
          metadata: {
            slug: updated.slug,
            published: updated.published,
            imageReplaced: Boolean(replacement),
          },
        },
      });
      return updated;
    });

    let cleanupPending = false;
    if (replacement) {
      try {
        await deletePrivateObject(existing.storageKey);
      } catch (error) {
        cleanupPending = true;
        console.error("ARCHIVE_OLD_IMAGE_CLEANUP_FAILED", {
          errorCategory: safeErrorCategory(error),
          artworkId: params.id,
        });
      }
    }

    return NextResponse.json({
      artwork: {
        ...artwork,
        createdAt: artwork.createdAt.toISOString(),
        updatedAt: artwork.updatedAt.toISOString(),
        imageUrl: adminArchiveImageUrl(artwork.id),
      },
      cleanupPending,
    });
  } catch (error) {
    if (newStorageKey) {
      try {
        await deletePrivateObject(newStorageKey);
      } catch (cleanupError) {
        console.error("ARCHIVE_UPLOAD_CLEANUP_FAILED", {
          errorCategory: safeErrorCategory(cleanupError),
          artworkId: params.id,
        });
      }
    }
    console.error("ADMIN_ARCHIVE_UPDATE_FAILED", {
      errorCategory: safeErrorCategory(error),
      artworkId: params.id,
    });
    return NextResponse.json({ error: "Unable to update artwork." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (requestBodyTooLarge(request, 64 * 1024)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const authorization = await authorizeArchiveMutation(request, "ADMIN_ARCHIVE_MUTATION_RATE_LIMITED");
  if ("response" in authorization) return authorization.response;
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid artwork ID." }, { status: 400 });
  }

  try {
    const artwork = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.archiveArtwork.findUnique({
        where: { id: params.id },
        select: { id: true, storageKey: true, slug: true },
      });
      if (!existing) return null;
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "ARCHIVE_ARTWORK_DELETED",
          entityType: "ArchiveArtwork",
          entityId: existing.id,
          metadata: { slug: existing.slug },
        },
      });
      await transaction.archiveArtwork.delete({ where: { id: existing.id } });
      return existing;
    });
    if (!artwork) return NextResponse.json({ error: "Artwork not found." }, { status: 404 });

    try {
      await deletePrivateObject(artwork.storageKey);
      return NextResponse.json({ success: true, cleanupPending: false });
    } catch (error) {
      console.error("ARCHIVE_IMAGE_DELETE_FAILED", {
        errorCategory: safeErrorCategory(error),
        artworkId: params.id,
      });
      return NextResponse.json({ success: true, cleanupPending: true });
    }
  } catch (error) {
    console.error("ADMIN_ARCHIVE_DELETE_FAILED", {
      errorCategory: safeErrorCategory(error),
      artworkId: params.id,
    });
    return NextResponse.json({ error: "Unable to delete artwork." }, { status: 500 });
  }
}
