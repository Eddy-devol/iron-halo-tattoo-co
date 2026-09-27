import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  allowedImageTypes,
  extensionForMimeType,
  hasValidImageSignature,
  maxReferenceImageBytes,
} from "@/lib/server/storage/image-validation";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();
const booleanField = z.enum(["true", "false"]).transform((value) => value === "true");
const sortOrderField = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(1_000_000));

export const createArchiveArtworkFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: nullableText(3000),
  style: nullableText(80),
  altText: optionalText(250),
  featured: booleanField.default("false"),
  published: booleanField.default("false"),
  sortOrder: sortOrderField.default("0"),
}).strict();

export const updateArchiveArtworkFieldsSchema = createArchiveArtworkFieldsSchema.partial().strict();

export type ArchiveArtworkFields = z.infer<typeof createArchiveArtworkFieldsSchema>;

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

function nullableFormText(form: FormData, name: string) {
  const value = formText(form, name);
  if (value === undefined) return undefined;
  return value.trim() || null;
}

export function parseArchiveArtworkForm(form: FormData): ReturnType<typeof createArchiveArtworkFieldsSchema.safeParse>;
export function parseArchiveArtworkForm(
  form: FormData,
  partial: false,
): ReturnType<typeof createArchiveArtworkFieldsSchema.safeParse>;
export function parseArchiveArtworkForm(
  form: FormData,
  partial: true,
): ReturnType<typeof updateArchiveArtworkFieldsSchema.safeParse>;
export function parseArchiveArtworkForm(form: FormData, partial = false) {
  const values = {
    title: formText(form, "title"),
    description: nullableFormText(form, "description"),
    style: nullableFormText(form, "style"),
    altText: formText(form, "altText")?.trim() || undefined,
    featured: formText(form, "featured"),
    published: formText(form, "published"),
    sortOrder: formText(form, "sortOrder"),
  };
  if (partial) {
    return updateArchiveArtworkFieldsSchema.safeParse(
      Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
    );
  }
  return createArchiveArtworkFieldsSchema.safeParse(values);
}

export function validateArchiveImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.name.length === 0) {
    return { success: false as const, error: "Choose an image to upload." };
  }
  if (!allowedImageTypes.includes(value.type as (typeof allowedImageTypes)[number])) {
    return { success: false as const, error: "Use a JPEG, PNG, or WebP image." };
  }
  if (value.size === 0 || value.size > maxReferenceImageBytes) {
    return { success: false as const, error: "Image must be smaller than 10 MB." };
  }

  const extension = extensionForMimeType(value.type);
  if (!extension) return { success: false as const, error: "Unsupported image type." };
  return {
    success: true as const,
    file: value,
    extension,
  };
}

export async function readValidatedArchiveImage(file: File, extension: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageSignature(bytes, file.type)) {
    return { success: false as const };
  }
  return {
    success: true as const,
    bytes,
    storageKey: `archive-artwork/${randomUUID()}.${extension}`,
  };
}

export function archiveSlug(title: string) {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "artwork";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export const archiveSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
