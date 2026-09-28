export type AdminArtist = {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string | null;
  specialties: string[];
  instagramUrl: string | null;
  displayOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  imageUrl: string | null;
};
