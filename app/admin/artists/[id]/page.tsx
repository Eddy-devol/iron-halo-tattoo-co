import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import AdminArtistForm from "@/components/admin/AdminArtistForm";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAdmin } from "@/lib/server/auth";

export const metadata = { title: "Edit artist | Admin" };

export default async function EditArtistPage({ params }: { params: { id: string } }) {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const artist = await prisma.artist.findUnique({
    where: { id: params.id },
    select: {
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
    },
  });
  if (!artist) notFound();
  const { imageKey, createdAt, updatedAt, ...fields } = artist;
  return (
    <AdminArtistForm
      artist={{
        ...fields,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        imageUrl: imageKey ? `/api/admin/artists/${encodeURIComponent(artist.id)}/image` : null,
      }}
    />
  );
}
