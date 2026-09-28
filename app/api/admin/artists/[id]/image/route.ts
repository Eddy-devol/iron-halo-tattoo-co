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
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  }
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: params.id },
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
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("ADMIN_ARTIST_IMAGE_FAILED", {
      errorCategory: safeErrorCategory(error),
      artistId: params.id,
    });
    return NextResponse.json({ error: "Artist image is temporarily unavailable." }, { status: 503 });
  }
}
