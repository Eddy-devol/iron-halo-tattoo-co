"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import type { ArchiveArtwork } from "@/components/admin/archive-types";

export default function AdminArchiveDashboard() {
  const [artworks, setArtworks] = useState<ArchiveArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadArtworks = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/archive", { signal, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load the Archive.");
      setArtworks(payload.artworks as ArchiveArtwork[]);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load the Archive.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadArtworks(controller.signal);
    return () => controller.abort();
  }, [loadArtworks]);

  async function removeArtwork(artwork: ArchiveArtwork) {
    if (!window.confirm(`Delete “${artwork.title}” from the Archive?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/archive/${encodeURIComponent(artwork.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to delete artwork.");
      setArtworks((current) => current.filter((item) => item.id !== artwork.id));
      setMessage(payload.cleanupPending
        ? "Artwork was removed, but its stored image needs operator cleanup."
        : "Artwork deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete artwork.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f1ede5] text-ink">
      <AdminHeader />
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <p className="eyebrow">Studio console</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-5xl sm:text-6xl">The Archive</h1>
            <p className="mt-3 max-w-xl text-sm text-ink/55">Curate the work shown on the public studio page.</p>
          </div>
          <Link href="/admin/archive/new" className="button-primary px-6">Add artwork</Link>
        </div>

        {message && <p className="mt-6 border border-ink/15 bg-white/40 px-4 py-3 text-sm" role="status">{message}</p>}
        {error && <p className="mt-6 border border-rust/40 bg-rust/5 px-4 py-3 text-sm text-rust" role="alert">{error}</p>}

        <section className="mt-8" aria-label="Archive artwork">
          {loading ? (
            <p className="border border-ink/15 bg-white/30 px-6 py-12 text-sm text-ink/55" role="status">Loading artwork…</p>
          ) : error && !artworks.length ? (
            <div className="border border-ink/15 bg-white/30 px-6 py-12">
              <button type="button" className="text-xs uppercase tracking-[.16em] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rust" onClick={() => void loadArtworks()}>
                Try again
              </button>
            </div>
          ) : !artworks.length ? (
            <p className="border border-ink/15 bg-white/30 px-6 py-12 text-sm text-ink/55">The Archive is empty. Add the first artwork when ready.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {artworks.map((artwork) => (
                <article key={artwork.id} className="overflow-hidden border border-ink/15 bg-white/40">
                  <div className="relative aspect-[4/5] bg-ink/10">
                    <Image
                      src={artwork.imageUrl}
                      alt={artwork.altText}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[.15em]">
                      <span className={artwork.published ? "text-emerald-800" : "text-ink/45"}>{artwork.published ? "Published" : "Unpublished"}</span>
                      {artwork.featured && <span className="text-rust">Featured</span>}
                    </div>
                    <h2 className="mt-3 font-display text-3xl">{artwork.title}</h2>
                    {artwork.style && <p className="mt-1 text-xs uppercase tracking-[.14em] text-rust">{artwork.style}</p>}
                    <div className="mt-5 flex items-center justify-between border-t border-ink/10 pt-4">
                      <Link className="text-xs uppercase tracking-[.14em] text-rust underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rust" href={`/admin/archive/${encodeURIComponent(artwork.id)}`}>
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="text-xs uppercase tracking-[.14em] text-ink/55 underline-offset-4 hover:text-rust hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-rust"
                        onClick={() => void removeArtwork(artwork)}
                        aria-label={`Delete ${artwork.title}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
