"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import type { ArchiveArtwork } from "@/components/admin/archive-types";

type Props = {
  artwork?: ArchiveArtwork;
};

export default function AdminArchiveArtworkForm({ artwork }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(
        artwork ? `/api/admin/archive/${encodeURIComponent(artwork.id)}` : "/api/admin/archive",
        { method: artwork ? "PATCH" : "POST", body: form },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save artwork.");
      if (payload.cleanupPending) {
        setMessage("Artwork saved. The previous image could not be removed automatically; operator cleanup is needed.");
      } else {
        setMessage("Artwork saved.");
      }
      if (!artwork && payload.artwork?.id) {
        window.location.href = `/admin/archive/${encodeURIComponent(payload.artwork.id)}`;
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save artwork.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-light min-h-screen bg-[#f1ede5] text-ink">
      <AdminHeader />
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <Link href="/admin/archive" className="nav-link inline-flex min-h-11 items-center text-xs uppercase tracking-[.14em] text-ink/65">
          ← Archive
        </Link>
        <p className="eyebrow mt-9">Studio console</p>
        <h1 className="mt-3 font-display text-5xl sm:text-6xl">{artwork ? "Edit artwork" : "Add artwork"}</h1>

        {message && <p className="mt-6 border border-ink/15 bg-white/40 px-4 py-3 text-sm" role="status">{message}</p>}
        {error && <p className="mt-6 border border-rust/40 bg-rust/5 px-4 py-3 text-sm text-rust" role="alert">{error}</p>}

        <form onSubmit={submit} className="surface-card mt-8 space-y-7 border-ink/10 bg-white/35 p-5 sm:p-9">
          {artwork && (
            <div className="relative aspect-[4/3] max-w-xl overflow-hidden bg-ink/10">
              <Image src={artwork.imageUrl} alt={artwork.altText} fill unoptimized className="object-cover" />
            </div>
          )}
          <div>
            <label className="eyebrow" htmlFor="artwork-title">Title</label>
            <input id="artwork-title" name="title" required maxLength={120} defaultValue={artwork?.title ?? ""} className="field-control field-control-light mt-2" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artwork-alt">Image alt text</label>
            <input id="artwork-alt" name="altText" maxLength={250} defaultValue={artwork?.altText ?? ""} placeholder="Defaults to the artwork title" className="field-control field-control-light mt-2" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artwork-style">Style / category</label>
            <input id="artwork-style" name="style" maxLength={80} defaultValue={artwork?.style ?? ""} className="field-control field-control-light mt-2" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artwork-description">Description (optional)</label>
            <textarea id="artwork-description" name="description" maxLength={3000} rows={4} defaultValue={artwork?.description ?? ""} className="field-control field-control-light mt-2 min-h-32 resize-y" />
          </div>
          <div>
            <label className="eyebrow" htmlFor="artwork-image">{artwork ? "Replace image (optional)" : "Artwork image"}</label>
            <input id="artwork-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required={!artwork} className="field-control field-control-light mt-2 cursor-pointer" />
            <p className="mt-2 text-xs text-ink/55">JPEG, PNG, or WebP. Maximum 10 MB.</p>
          </div>
          <div>
            <label className="eyebrow" htmlFor="artwork-sort">Sort order</label>
            <input id="artwork-sort" name="sortOrder" type="number" min={0} max={1000000} step={1} defaultValue={artwork?.sortOrder ?? 0} className="field-control field-control-light mt-2 max-w-48" />
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <label className="flex items-center gap-3 text-sm">
              <input name="featured" type="checkbox" value="true" defaultChecked={artwork?.featured ?? false} className="field-checkbox" />
              Featured
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input name="published" type="checkbox" value="true" defaultChecked={artwork?.published ?? false} className="field-checkbox" />
              Published on public site
            </label>
          </div>
          <input type="hidden" name="featured" value="false" />
          <input type="hidden" name="published" value="false" />
          <div className="flex flex-wrap items-center gap-4 border-t border-ink/10 pt-6">
            <button type="submit" disabled={saving} className="button-primary px-6 disabled:cursor-wait disabled:opacity-50">
              {saving ? "Saving…" : "Save artwork"}
            </button>
            <Link href="/admin/archive" className="nav-link inline-flex min-h-11 items-center text-xs uppercase tracking-[.14em] text-ink/65">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
