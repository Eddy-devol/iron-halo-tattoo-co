"use client";

import ArtistPortrait from "@/components/ArtistPortrait";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import type { AdminArtist } from "@/components/admin/artist-types";

export default function AdminArtistsDashboard() {
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadArtists = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/artists", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load artist profiles.");
      setArtists(payload.artists);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load artist profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArtists();
  }, [loadArtists]);

  async function togglePublished(artist: AdminArtist) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/artists/${encodeURIComponent(artist.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !artist.published }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update artist profile.");
      setMessage(`${artist.name} ${payload.artist.published ? "published" : "unpublished"}.`);
      await loadArtists();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update artist profile.");
    }
  }

  async function deleteArtist(artist: AdminArtist) {
    if (!window.confirm(`Delete the profile for ${artist.name}?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/artists/${encodeURIComponent(artist.id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to delete artist profile.");
      setMessage(payload.cleanupPending
        ? `${artist.name} was removed. Its private image needs operator cleanup.`
        : `${artist.name} was removed.`);
      await loadArtists();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete artist profile.");
    }
  }

  return (
    <main className="admin-light min-h-screen bg-[#f1ede5] text-ink">
      <AdminHeader />
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-5 border-b border-ink/15 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Studio console</p>
            <h1 className="mt-3 font-display text-5xl sm:text-6xl">Artists</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-ink/60">
              Manage artist profiles shown on the public studio site.
            </p>
          </div>
          <Link href="/admin/artists/new" className="button-primary w-full sm:w-auto">Add artist</Link>
        </div>

        {message && <p className="mt-6 border border-ink/15 bg-white/40 px-4 py-3 text-sm" role="status">{message}</p>}
        {error && <p className="mt-6 border border-rust/40 bg-rust/5 px-4 py-3 text-sm text-rust" role="alert">{error}</p>}

        <div className="surface-card mt-7 border-ink/10 bg-white/35">
          {loading ? (
            <p className="px-5 py-8 text-sm text-ink/60" role="status">Loading artist profiles…</p>
          ) : error && artists.length === 0 ? (
            <div className="px-5 py-8">
              <p className="text-sm text-ink/60">Artist profiles couldn’t be loaded.</p>
              <button
                type="button"
                className="mt-4 min-h-11 text-xs uppercase tracking-[.16em] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rust"
                onClick={() => void loadArtists()}
              >
                Try again
              </button>
            </div>
          ) : artists.length === 0 ? (
            <div className="px-5 py-10 sm:px-8">
              <h2 className="font-display text-3xl">No artist profiles yet</h2>
              <p className="mt-2 text-sm text-ink/60">Add a profile when you have artist details and a portrait ready.</p>
            </div>
          ) : (
            <div
              className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-rust"
              tabIndex={0}
              role="region"
              aria-label="Artist profiles"
            >
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">Artist profiles and publication status</caption>
                <thead>
                  <tr className="border-b border-ink/10 text-[10px] uppercase tracking-[.15em] text-ink/55">
                    <th scope="col" className="px-5 py-4 font-medium">Artist</th>
                    <th scope="col" className="px-5 py-4 font-medium">Specialties</th>
                    <th scope="col" className="px-5 py-4 font-medium">Display order</th>
                    <th scope="col" className="px-5 py-4 font-medium">Status</th>
                    <th scope="col" className="px-5 py-4 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {artists.map((artist) => (
                    <tr key={artist.id} className="border-b border-ink/10 last:border-0 hover:bg-white/40">
                      <th scope="row" className="px-5 py-4 font-normal">
                        <div className="flex items-center gap-3">
                          <ArtistPortrait
                            src={artist.imageUrl}
                            alt=""
                            sizes="48px"
                            className="size-12 shrink-0 border border-ink/10"
                          />
                          <span>
                            <Link href={`/admin/artists/${encodeURIComponent(artist.id)}`} className="font-medium text-ink underline-offset-4 hover:underline focus-visible:underline">
                              {artist.name}
                            </Link>
                            <span className="mt-1 block text-xs text-ink/55">{artist.role}</span>
                          </span>
                        </div>
                      </th>
                      <td className="max-w-sm px-5 py-4 text-sm text-ink/65">{artist.specialties.join(", ") || "—"}</td>
                      <td className="px-5 py-4 text-sm tabular-nums">{artist.displayOrder}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex min-h-7 items-center border px-2.5 text-[10px] uppercase tracking-[.12em] ${
                          artist.published ? "border-rust/30 bg-rust/5 text-ink/75" : "border-ink/15 bg-ink/[.03] text-ink/55"
                        }`}>
                          {artist.published ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-4 whitespace-nowrap">
                          <button type="button" onClick={() => void togglePublished(artist)} className="nav-link min-h-11 text-[10px] uppercase tracking-[.12em]">
                            {artist.published ? "Unpublish" : "Publish"}
                          </button>
                          <button type="button" onClick={() => void deleteArtist(artist)} className="nav-link min-h-11 text-[10px] uppercase tracking-[.12em] text-rust">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
