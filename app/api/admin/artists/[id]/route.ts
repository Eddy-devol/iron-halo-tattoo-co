import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authorizeAdminMutation } from "@/lib/server/admin-mutation";
import { getCurrentAdmin } from "@/lib/server/auth";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/server/storage/s3";
import { requestBodyTooLarge } from "@/lib/server/security";
import { adminArtistImageUrl, parseArtistForm, validateArtistImage, artistPatchSchema } from "../validation";

export const runtime = "nodejs";

const idSchema = z.string().uuid();
const maxArtistRequestBytes = 11 * 1024 * 1024;
const artistSelect = {
  id: true,
  slug: true,
  name: true,
  role: true,
  bio: true,
  specialties: true,
  instagramUrl: true,
  imageKey: true,
  displayOrder: true,
  published: true,
  createdAt: true,
  updatedAt: true,
} as const;

function presentArtist(artist: {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string | null;
  specialties: string[];
  instagramUrl: string | null;
  imageKey: string | null;
  displayOrder: number;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const { imageKey, ...fields } = artist;
  return {
    ...fields,
    createdAt: artist.createdAt.toISOString(),
    updatedAt: artist.updatedAt.toISOString(),
    imageUrl: imageKey ? adminArtistImageUrl(artist.id) : null,
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!idSchema.safeParse(params.id).success) return NextResponse.json({ error: "Invalid artist ID." }, { status: 400 });
  try {
    const artist = await prisma.artist.findUnique({ where: { id: params.id }, select: artistSelect });
    if (!artist) return NextResponse.json({ error: "Artist not found." }, { status: 404 });
    return NextResponse.json({ artist: presentArtist(artist) });
  } catch (error) {
    console.error("ADMIN_ARTIST_DETAIL_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load artist profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (requestBodyTooLarge(request, maxArtistRequestBytes)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const authorization = await authorizeAdminMutation(request, maxArtistRequestBytes);
  if ("response" in authorization) return authorization.response;
  if (!idSchema.safeParse(params.id).success) return NextResponse.json({ error: "Invalid artist ID." }, { status: 400 });

  let uploadedKey: string | undefined;
  try {
    const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
    let fields: { success: boolean; data?: Record<string, unknown> };
    let imageValue: FormDataEntryValue | null = null;
    let removeImage = false;
    if (isJson) {
      let body: unknown;
      try {
        body = JSON.parse(await request.text());
      } catch {
        return NextResponse.json({ error: "Check the artist details and try again." }, { status: 400 });
      }
      const parsed = artistPatchSchema.safeParse(body);
      fields = parsed.success ? { success: true, data: parsed.data } : { success: false };
    } else {
      const form = await request.formData();
      const parsed = parseArtistForm(form, true);
      fields = parsed.success ? { success: true, data: parsed.data } : { success: false };
      imageValue = form.get("image");
      removeImage = form.get("removeImage") === "true";
    }
    if (!fields.success || !fields.data) {
      return NextResponse.json({ error: "Check the artist details and try again." }, { status: 400 });
    }

    const hasImage = imageValue instanceof File && imageValue.name.length > 0;
    if (hasImage && removeImage) {
      return NextResponse.json({ error: "Choose either a replacement image or remove the current image." }, { status: 400 });
    }
    if (!hasImage && !removeImage && Object.keys(fields.data).length === 0) {
      return NextResponse.json({ error: "Make a change before saving." }, { status: 400 });
    }

    const existing = await prisma.artist.findUnique({
      where: { id: params.id },
      select: { id: true, imageKey: true },
    });
    if (!existing) return NextResponse.json({ error: "Artist not found." }, { status: 404 });

    let replacement: { bytes: Buffer; contentType: string; storageKey: string } | undefined;
    if (hasImage) {
      const image = await validateArtistImage(imageValue);
      if (!image.success) return NextResponse.json({ error: image.error }, { status: 400 });
      replacement = {
        bytes: image.bytes,
        contentType: image.contentType,
        storageKey: image.storageKey,
      };
      uploadedKey = replacement.storageKey;
      await uploadPrivateObject(replacement.storageKey, replacement.bytes, replacement.contentType);
    }

    const artist = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.artist.update({
        where: { id: params.id },
        data: {
          ...fields.data,
          ...(replacement
            ? { imageKey: replacement.storageKey, imageContentType: replacement.contentType }
            : removeImage
              ? { imageKey: null, imageContentType: null }
              : {}),
        },
        select: artistSelect,
      });
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "ARTIST_PROFILE_UPDATED",
          entityType: "Artist",
          entityId: updated.id,
          metadata: {
            slug: updated.slug,
            published: updated.published,
            imageReplaced: Boolean(replacement),
            imageRemoved: removeImage,
          },
        },
      });
      return updated;
    });

    let cleanupPending = false;
    const oldKey = existing.imageKey;
    if (oldKey && (replacement || removeImage)) {
      try {
        await deletePrivateObject(oldKey);
      } catch (error) {
        cleanupPending = true;
        console.error("ARTIST_OLD_IMAGE_CLEANUP_FAILED", {
          errorCategory: safeErrorCategory(error),
          artistId: params.id,
        });
      }
    }
    return NextResponse.json({ artist: presentArtist(artist), cleanupPending });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deletePrivateObject(uploadedKey);
      } catch (cleanupError) {
        console.error("ARTIST_IMAGE_UPLOAD_CLEANUP_FAILED", {
          errorCategory: safeErrorCategory(cleanupError),
          artistId: params.id,
        });
      }
    }
    console.error("ADMIN_ARTIST_UPDATE_FAILED", {
      errorCategory: safeErrorCategory(error),
      artistId: params.id,
    });
    return NextResponse.json({ error: "Unable to update artist profile." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (requestBodyTooLarge(request, 64 * 1024)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const authorization = await authorizeAdminMutation(request);
  if ("response" in authorization) return authorization.response;
  if (!idSchema.safeParse(params.id).success) return NextResponse.json({ error: "Invalid artist ID." }, { status: 400 });

  try {
    const artist = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.artist.findUnique({
        where: { id: params.id },
        select: { id: true, slug: true, imageKey: true },
      });
      if (!existing) return null;
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "ARTIST_PROFILE_DELETED",
          entityType: "Artist",
          entityId: existing.id,
          metadata: { slug: existing.slug },
        },
      });
      await transaction.artist.delete({ where: { id: existing.id } });
      return existing;
    });
    if (!artist) return NextResponse.json({ error: "Artist not found." }, { status: 404 });
    if (artist.imageKey) {
      try {
        await deletePrivateObject(artist.imageKey);
        return NextResponse.json({ success: true, cleanupPending: false });
      } catch (error) {
        console.error("ARTIST_IMAGE_DELETE_FAILED", {
          errorCategory: safeErrorCategory(error),
          artistId: params.id,
        });
        return NextResponse.json({ success: true, cleanupPending: true });
      }
    }
    return NextResponse.json({ success: true, cleanupPending: false });
  } catch (error) {
    console.error("ADMIN_ARTIST_DELETE_FAILED", {
      errorCategory: safeErrorCategory(error),
      artistId: params.id,
    });
    return NextResponse.json({ error: "Unable to delete artist profile." }, { status: 500 });
  }
}
