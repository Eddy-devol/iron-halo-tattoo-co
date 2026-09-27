import { NextResponse } from "next/server";
import { listPublishedArchiveArtworks } from "@/lib/server/archive-public";
import { archiveImageUrl } from "@/lib/server/archive-api";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

export async function GET() {
  try {
    const artworks = await listPublishedArchiveArtworks();
    return NextResponse.json({
      artworks: artworks.map((artwork) => ({
        title: artwork.title,
        slug: artwork.slug,
        description: artwork.description,
        style: artwork.style,
        altText: artwork.altText,
        featured: artwork.featured,
        imageUrl: archiveImageUrl(artwork.slug),
      })),
    }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("PUBLIC_ARCHIVE_LIST_FAILED", { errorCategory: safeErrorCategory(error) });
    return NextResponse.json({ error: "Unable to load the Archive." }, { status: 500 });
  }
}
