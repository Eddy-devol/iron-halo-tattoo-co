import "server-only";

import { prisma } from "@/lib/db/prisma";

export async function listPublishedArchiveArtworks() {
  return prisma.archiveArtwork.findMany({
    where: { published: true },
    select: {
      title: true,
      slug: true,
      description: true,
      style: true,
      altText: true,
      featured: true,
    },
    orderBy: [
      { featured: "desc" },
      { sortOrder: "asc" },
      { createdAt: "desc" },
    ],
  });
}
