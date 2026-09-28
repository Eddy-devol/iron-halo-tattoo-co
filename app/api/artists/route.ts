import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const artists = await prisma.artist.findMany({
      where: { published: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: {
        slug: true,
        name: true,
        role: true,
        bio: true,
        specialties: true,
        instagramUrl: true,
        imageKey: true,
      },
    });
    return NextResponse.json({
      artists: artists.map(({ imageKey, ...artist }) => ({
        ...artist,
        imageUrl: imageKey ? `/api/artists/${encodeURIComponent(artist.slug)}/image` : null,
        imageAlt: `${artist.name} — ${artist.role}`,
      })),
    }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("PUBLIC_ARTIST_LIST_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Artist profiles are temporarily unavailable." }, { status: 503 });
  }
}
