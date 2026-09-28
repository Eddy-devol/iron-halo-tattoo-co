import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authorizeAdminMutation } from "@/lib/server/admin-mutation";
import { getCurrentAdmin } from "@/lib/server/auth";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/server/storage/s3";
import { requestBodyTooLarge } from "@/lib/server/security";
import { adminArtistImageUrl, artistSlug, parseArtistForm, validateArtistImage } from "./validation";

export const runtime = "nodejs";

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

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const artists = await prisma.artist.findMany({
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: artistSelect,
    });
    return NextResponse.json({ artists: artists.map(presentArtist) });
  } catch (error) {
    console.error("ADMIN_ARTIST_LIST_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load artist profiles." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request, maxArtistRequestBytes)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  const authorization = await authorizeAdminMutation(request, maxArtistRequestBytes);
  if ("response" in authorization) return authorization.response;

  let uploadedKey: string | undefined;
  try {
    const form = await request.formData();
    const fields = parseArtistForm(form);
    if (!fields.success) return NextResponse.json({ error: "Check the artist details and try again." }, { status: 400 });
    const image = await validateArtistImage(form.get("image"));
    if (!image.success) return NextResponse.json({ error: image.error }, { status: 400 });
    uploadedKey = image.storageKey;

    await uploadPrivateObject(image.storageKey, image.bytes, image.contentType);
    const artist = await prisma.$transaction(async (transaction) => {
      const created = await transaction.artist.create({
        data: {
          ...fields.data,
          slug: artistSlug(fields.data.name),
          imageKey: image.storageKey,
          imageContentType: image.contentType,
        },
        select: artistSelect,
      });
      await transaction.auditLog.create({
        data: {
          userId: authorization.admin.id,
          action: "ARTIST_PROFILE_CREATED",
          entityType: "Artist",
          entityId: created.id,
          metadata: { slug: created.slug, published: created.published },
        },
      });
      return created;
    });
    return NextResponse.json({ artist: presentArtist(artist) }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deletePrivateObject(uploadedKey);
      } catch (cleanupError) {
        console.error("ARTIST_IMAGE_UPLOAD_CLEANUP_FAILED", {
          errorCategory: safeErrorCategory(cleanupError),
        });
      }
    }
    console.error("ADMIN_ARTIST_CREATE_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to save artist profile." }, { status: 500 });
  }
}
