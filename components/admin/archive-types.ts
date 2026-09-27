export type ArchiveArtwork = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  style: string | null;
  altText: string;
  contentType: string;
  featured: boolean;
  published: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  imageUrl: string;
};
