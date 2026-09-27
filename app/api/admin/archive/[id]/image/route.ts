import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAdmin } from "@/lib/server/auth";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { readPrivateObject } from "@/lib/server/storage/s3";
import { allowedImageTypes } from "@/lib/server/storage/image-validation";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }

  try {
    const artwork = await prisma.archiveArtwork.findUnique({
      where: { id: params.id },
      select: { storageKey: true, contentType: true },
    });
    if (!artwork || !allowedImageTypes.includes(artwork.contentType as (typeof allowedImageTypes)[number])) {
      return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
    }
    const image = await readPrivateObject(artwork.storageKey);
    return new Response(Buffer.from(image), {
      headers: {
        "Content-Type": artwork.contentType,
        "Content-Length": String(image.byteLength),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("ADMIN_ARCHIVE_IMAGE_FAILED", {
      errorCategory: safeErrorCategory(error),
      artworkId: params.id,
    });
    return NextResponse.json({ error: "Artwork is temporarily unavailable." }, { status: 503 });
  }
}
