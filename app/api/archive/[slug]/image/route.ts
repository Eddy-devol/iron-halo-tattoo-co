import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { archiveSlugSchema } from "@/lib/server/archive-validation";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { readPrivateObject } from "@/lib/server/storage/s3";
import { allowedImageTypes } from "@/lib/server/storage/image-validation";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  if (!archiveSlugSchema.safeParse(params.slug).success) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }

  try {
    const artwork = await prisma.archiveArtwork.findFirst({
      where: { slug: params.slug, published: true },
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
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("PUBLIC_ARCHIVE_IMAGE_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Artwork is temporarily unavailable." }, { status: 503 });
  }
}
