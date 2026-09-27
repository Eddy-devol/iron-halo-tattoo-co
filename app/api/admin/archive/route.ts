import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { adminArchiveImageUrl, authorizeArchiveMutation } from "@/lib/server/archive-api";
import {
  archiveSlug,
  parseArchiveArtworkForm,
  readValidatedArchiveImage,
  validateArchiveImage,
} from "@/lib/server/archive-validation";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/server/storage/s3";
import { getCurrentAdmin } from "@/lib/server/auth";
import { requestBodyTooLarge } from "@/lib/server/security";

const maxArchiveRequestBytes = 11 * 1024 * 1024;

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const artworks = await prisma.archiveArtwork.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        storageKey: true,
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
      },
    });
    return NextResponse.json({
      artworks: artworks.map((artwork) => ({
        id: artwork.id,
        title: artwork.title,
        slug: artwork.slug,
        description: artwork.description,
        style: artwork.style,
        altText: artwork.altText,
        contentType: artwork.contentType,
        featured: artwork.featured,
        published: artwork.published,
        sortOrder: artwork.sortOrder,
        createdAt: artwork.createdAt.toISOString(),
        updatedAt: artwork.updatedAt.toISOString(),
        imageUrl: adminArchiveImageUrl(artwork.id),
      })),
    });
  } catch (error) {
    console.error("ADMIN_ARCHIVE_LIST_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load the Archive." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, maxArchiveRequestBytes)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const authorization = await authorizeArchiveMutation(request, "ADMIN_ARCHIVE_MUTATION_RATE_LIMITED");
  if ("response" in authorization) return authorization.response;

  let storageKey: string | undefined;
  try {
    const form = await request.formData();
    const fields = parseArchiveArtworkForm(form);
    if (!fields.success) return NextResponse.json({ error: "Check the artwork details and try again." }, { status: 400 });

    const image = validateArchiveImage(form.get("image"));
    if (!image.success) return NextResponse.json({ error: image.error }, { status: 400 });
    const imageData = await readValidatedArchiveImage(image.file, image.extension);
    if (!imageData.success) return NextResponse.json({ error: "The selected file is not a valid image." }, { status: 400 });
    storageKey = imageData.storageKey;

    await uploadPrivateObject(storageKey, imageData.bytes, image.file.type);
    const title = fields.data.title;
    const artwork = await prisma.$transaction(async (transaction) => {
      const created = await transaction.archiveArtwork.create({
        data: {
          ...fields.data,
          title,
          altText: fields.data.altText || title,
          slug: archiveSlug(title),
          storageKey: storageKey!,
          contentType: image.file.type,
        },
        select: {
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
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "ARCHIVE_ARTWORK_CREATED",
          entityType: "ArchiveArtwork",
          entityId: created.id,
          metadata: { slug: created.slug, published: created.published },
        },
      });
      return created;
    });

    return NextResponse.json({
      artwork: {
        ...artwork,
        createdAt: artwork.createdAt.toISOString(),
        updatedAt: artwork.updatedAt.toISOString(),
        imageUrl: adminArchiveImageUrl(artwork.id),
      },
    }, { status: 201 });
  } catch (error) {
    if (storageKey) {
      try {
        await deletePrivateObject(storageKey);
      } catch (cleanupError) {
        console.error("ARCHIVE_UPLOAD_CLEANUP_FAILED", {
          errorCategory: safeErrorCategory(cleanupError),
        });
      }
    }
    console.error("ADMIN_ARCHIVE_CREATE_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to save artwork." }, { status: 500 });
  }
}
