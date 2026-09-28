import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  allowedImageTypes,
  extensionForMimeType,
  hasValidImageSignature,
  maxReferenceImageBytes,
} from "@/lib/server/storage/image-validation";

const instagramUrlSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "instagram.com" || url.hostname === "www.instagram.com") &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}, "Enter a valid Instagram URL.");

export const artistFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(2000).nullable(),
  specialties: z.array(z.string().trim().min(1).max(60)).max(12),
  instagramUrl: instagramUrlSchema.nullable(),
  displayOrder: z.number().int().min(0).max(1_000_000),
  published: z.boolean(),
});

export const artistPatchSchema = artistFieldsSchema.partial();

export function parseArtistForm(form: FormData): ReturnType<typeof artistFieldsSchema.safeParse>;
export function parseArtistForm(form: FormData, partial: true): ReturnType<typeof artistPatchSchema.safeParse>;
export function parseArtistForm(form: FormData, partial = false) {
  const candidate: Record<string, unknown> = {};
  const read = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };
  const setIfPresent = (name: string, value: unknown) => {
    if (!partial || form.has(name)) candidate[name] = value;
  };

  setIfPresent("name", read("name"));
  setIfPresent("role", read("role"));
  setIfPresent("bio", read("bio")?.trim() || null);
  const specialties = read("specialties");
  setIfPresent(
    "specialties",
    specialties === undefined
      ? undefined
      : specialties.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean),
  );

  const instagramUrl = read("instagramUrl");
  setIfPresent("instagramUrl", instagramUrl?.trim() || null);
  const displayOrder = read("displayOrder");
  setIfPresent("displayOrder", displayOrder === undefined ? undefined : Number(displayOrder));
  const published = read("published");
  setIfPresent(
    "published",
    published === "true" ? true : published === "false" ? false : published,
  );

  return (partial ? artistPatchSchema : artistFieldsSchema).safeParse(candidate);
}

export async function validateArtistImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.name.length === 0) {
    return { success: false as const, error: "Choose a profile image." };
  }
  if (!allowedImageTypes.some((type) => type === value.type)) {
    return { success: false as const, error: "Use a JPEG, PNG, or WebP image." };
  }
  if (value.size < 1 || value.size > maxReferenceImageBytes) {
    return { success: false as const, error: "The image must be no larger than 10 MB." };
  }

  const extension = extensionForMimeType(value.type);
  if (!extension) return { success: false as const, error: "Use a JPEG, PNG, or WebP image." };
  const bytes = Buffer.from(await value.arrayBuffer());
  if (!hasValidImageSignature(bytes, value.type)) {
    return { success: false as const, error: "The selected file is not a valid image." };
  }
  return {
    success: true as const,
    file: value,
    bytes,
    contentType: value.type,
    storageKey: `artist-profiles/${randomUUID()}.${extension}`,
  };
}

export function artistSlug(name: string) {
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-+$/g, "") || "artist";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export function adminArtistImageUrl(id: string) {
  return `/api/admin/artists/${encodeURIComponent(id)}/image`;
}
