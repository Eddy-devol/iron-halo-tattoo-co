import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import AdminArchiveArtworkForm from "@/components/admin/AdminArchiveArtworkForm";
import type { ArchiveArtwork } from "@/components/admin/archive-types";
import { adminArchiveImageUrl } from "@/lib/server/archive-api";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAdmin } from "@/lib/server/auth";

export const metadata = { title: "Edit artwork | Admin" };
const idSchema = z.string().uuid();

export default async function EditArchiveArtworkPage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  if (!idSchema.safeParse(params.id).success) notFound();

  const artwork = await prisma.archiveArtwork.findUnique({
    where: { id: params.id },
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
  if (!artwork) notFound();

  const serialized: ArchiveArtwork = {
    ...artwork,
    createdAt: artwork.createdAt.toISOString(),
    updatedAt: artwork.updatedAt.toISOString(),
    imageUrl: adminArchiveImageUrl(artwork.id),
  };
  return <AdminArchiveArtworkForm artwork={serialized} />;
}
