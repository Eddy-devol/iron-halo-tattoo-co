"use client";

import ArtistPortrait from "@/components/ArtistPortrait";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import type { AdminArtist } from "@/components/admin/artist-types";

type Props = {
  artist?: AdminArtist;
};

export default function AdminArtistForm({ artist }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedImage) {
      setImagePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(selectedImage);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedImage]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(
        artist ? `/api/admin/artists/${encodeURIComponent(artist.id)}` : "/api/admin/artists",
        { method: artist ? "PATCH" : "POST", body: form },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save artist profile.");
      setMessage(payload.cleanupPending
        ? "Profile saved. The previous image could not be removed automatically; operator cleanup is needed."
        : "Artist profile saved.");
      if (!artist && payload.artist?.id) {
        window.location.href = `/admin/artists/${encodeURIComponent(payload.artist.id)}`;
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save artist profile.");
    } finally {
      setSaving(false);
    }
  }

  const imageSource = imagePreview ?? artist?.imageUrl;

  return (
    <main className="admin-light min-h-screen bg-[#f1ede5] text-ink">
      <AdminHeader />
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <Link href="/admin/artists" className="nav-link inline-flex min-h-11 items-center text-xs uppercase tracking-[.14em] text-ink/65">
          ← Artists
        </Link>
        <p className="eyebrow mt-8">Studio console</p>
        <h1 className="mt-3 font-display text-5xl sm:text-6xl">{artist ? "Edit artist" : "Add artist"}</h1>

        {message && <p className="mt-6 border border-ink/15 bg-white/40 px-4 py-3 text-sm" role="status">{message}</p>}
        {error && <p className="mt-6 border border-rust/40 bg-rust/5 px-4 py-3 text-sm text-rust" role="alert">{error}</p>}

        <form onSubmit={submit} className="surface-card mt-7 space-y-7 border-ink/10 bg-white/35 p-5 sm:p-9">
          {imageSource && (
            <ArtistPortrait
              src={imageSource}
              alt={`Portrait of ${artist?.name ?? "the artist"}`}
              className="image-frame aspect-[4/5] max-w-sm"
            />
          )}
          <div>
            <label className="eyebrow" htmlFor="artist-name">Name</label>
            <input id="artist-name" name="name" required maxLength={120} defaultValue={artist?.name ?? ""} className="field-control field-control-light mt-2" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artist-role">Role</label>
            <input id="artist-role" name="role" required maxLength={80} defaultValue={artist?.role ?? ""} className="field-control field-control-light mt-2" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artist-bio">Short biography</label>
            <textarea id="artist-bio" name="bio" maxLength={2000} rows={5} defaultValue={artist?.bio ?? ""} className="field-control field-control-light mt-2 min-h-32 resize-y" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artist-specialties">Specialties</label>
            <textarea
              id="artist-specialties"
              name="specialties"
              rows={3}
              defaultValue={artist?.specialties.join(", ") ?? ""}
              placeholder="Separate specialties with commas"
              className="field-control field-control-light mt-2 min-h-24 resize-y"
            />
            <p className="mt-2 text-xs text-ink/55">Use up to 12 short terms, separated by commas.</p>
          </div>
          <div>
            <label className="eyebrow" htmlFor="artist-instagram">Instagram URL (optional)</label>
            <input id="artist-instagram" name="instagramUrl" type="url" maxLength={2048} defaultValue={artist?.instagramUrl ?? ""} className="field-control field-control-light mt-2" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artist-image">{artist ? "Replace portrait (optional)" : "Portrait"}</label>
            <input
              id="artist-image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={!artist}
              onChange={(event) => setSelectedImage(event.currentTarget.files?.[0] ?? null)}
              className="field-control field-control-light mt-2 cursor-pointer"
            />
            <p className="mt-2 text-xs text-ink/55">JPEG, PNG, or WebP. Maximum 10 MB.</p>
            {artist?.imageUrl && (
              <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
                <input name="removeImage" type="checkbox" value="true" className="field-checkbox" />
                Remove current portrait
              </label>
            )}
          </div>
          <div>
            <label className="eyebrow" htmlFor="artist-order">Display order</label>
            <input id="artist-order" name="displayOrder" type="number" min={0} max={1000000} step={1} defaultValue={artist?.displayOrder ?? 0} className="field-control field-control-light mt-2 max-w-48" />
          </div>
          <div>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input name="published" type="checkbox" value="true" defaultChecked={artist?.published ?? false} className="field-checkbox" />
              Publish profile on the public site
            </label>
            <input type="hidden" name="published" value="false" />
            <input type="hidden" name="removeImage" value="false" />
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-ink/10 pt-6">
            <button type="submit" disabled={saving} className="button-primary px-6 disabled:cursor-wait disabled:opacity-50">
              {saving ? "Saving…" : "Save artist"}
            </button>
            <Link href="/admin/artists" className="nav-link inline-flex min-h-11 items-center text-xs uppercase tracking-[.14em] text-ink/65">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
