import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { safeErrorCategory } from "@/lib/server/safe-error-category";
import { readPrivateObject } from "@/lib/server/storage/s3";
import { allowedImageTypes } from "@/lib/server/storage/image-validation";

export const runtime = "nodejs";

const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  if (!slugSchema.safeParse(params.slug).success) {
    return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  }
  try {
    const artist = await prisma.artist.findFirst({
      where: { slug: params.slug, published: true },
      select: { imageKey: true, imageContentType: true },
    });
    if (
      !artist?.imageKey ||
      !artist.imageContentType ||
      !allowedImageTypes.some((type) => type === artist.imageContentType)
    ) {
      return NextResponse.json({ error: "Artist not found." }, { status: 404 });
    }
    const image = await readPrivateObject(artist.imageKey);
    return new Response(Buffer.from(image), {
      headers: {
        "Content-Type": artist.imageContentType,
        "Content-Length": String(image.byteLength),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("PUBLIC_ARTIST_IMAGE_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Artist image is temporarily unavailable." }, { status: 503 });
  }
}
