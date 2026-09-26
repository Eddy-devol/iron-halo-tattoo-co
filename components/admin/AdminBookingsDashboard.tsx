"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";

const statuses = [
  "PENDING",
  "REVIEWING",
  "NEEDS_INFORMATION",
  "APPROVED",
  "DECLINED",
  "BOOKED",
  "COMPLETED",
  "CANCELLED",
] as const;

type BookingRow = {
  id: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: (typeof statuses)[number];
  createdAt: string;
};

type BookingListResponse = {
  bookings: BookingRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const fieldClass = "min-w-0 border border-ink/20 bg-transparent px-4 py-3 text-sm text-ink outline-none focus:border-rust";

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AdminBookingsDashboard() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<BookingListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBookings = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) query.set("search", search);
    if (status) query.set("status", status);
    try {
      const response = await fetch(`/api/admin/bookings?${query.toString()}`, { signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load bookings.");
      setResult(payload as BookingListResponse);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load bookings.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBookings(controller.signal);
    return () => controller.abort();
  }, [loadBookings]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <main className="min-h-screen bg-[#f1ede5] text-ink">
      <AdminHeader />
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <p className="eyebrow">Studio console</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-5xl sm:text-6xl">Booking requests</h1>
            <p className="mt-3 max-w-xl text-sm text-ink/55">Review incoming consultation requests and their reference details.</p>
          </div>
          {result && <p className="text-xs uppercase tracking-[.16em] text-ink/50">{result.pagination.total} total</p>}
        </div>

        <form onSubmit={submitSearch} className="mt-9 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <label className="sr-only" htmlFor="booking-search">Search reference, name, email, or phone</label>
          <input
            id="booking-search"
            className={fieldClass}
            placeholder="Reference, name, email, or phone"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <label className="sr-only" htmlFor="booking-status">Filter by status</label>
          <select
            id="booking-status"
            className={fieldClass}
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{formatStatus(item)}</option>)}
          </select>
          <button type="submit" className="button-primary px-6">Search</button>
        </form>

        <section className="mt-7 border border-ink/15 bg-white/30" aria-label="Booking requests">
          {loading ? (
            <p className="px-6 py-12 text-sm text-ink/55" role="status">Loading booking requests…</p>
          ) : error ? (
            <div className="px-6 py-12" role="alert">
              <p className="text-sm text-rust">{error}</p>
              <button type="button" className="mt-4 text-xs uppercase tracking-[.16em] underline" onClick={() => {
                const controller = new AbortController();
                void loadBookings(controller.signal);
              }}>Try again</button>
            </div>
          ) : !result?.bookings.length ? (
            <p className="px-6 py-12 text-sm text-ink/55">No booking requests match your search.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left">
                  <thead className="border-b border-ink/15 text-[10px] uppercase tracking-[.16em] text-ink/50">
                    <tr>
                      <th className="px-5 py-4 font-semibold">Request</th>
                      <th className="px-5 py-4 font-semibold">Contact</th>
                      <th className="px-5 py-4 font-semibold">Status</th>
                      <th className="px-5 py-4 font-semibold">Received</th>
                      <th className="px-5 py-4"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {result.bookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-white/40">
                        <td className="px-5 py-4">
                          <p className="text-xs uppercase tracking-[.12em] text-rust">{booking.referenceNumber}</p>
                          <p className="mt-1 font-medium">{booking.fullName}</p>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <p>{booking.email}</p>
                          {booking.phone && <p className="mt-1 text-xs text-ink/50">{booking.phone}</p>}
                        </td>
                        <td className="px-5 py-4 text-sm capitalize">{formatStatus(booking.status)}</td>
                        <td className="px-5 py-4 text-sm text-ink/60">{formatDate(booking.createdAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <Link href={`/admin/bookings/${booking.id}`} className="text-xs uppercase tracking-[.14em] text-rust hover:underline">View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-ink/15 px-5 py-4">
                <p className="text-xs text-ink/55">Page {result.pagination.page} of {Math.max(result.pagination.totalPages, 1)}</p>
                <div className="flex gap-2">
                  <button type="button" className="button-quiet px-4 py-2 text-[10px] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                  <button type="button" className="button-quiet px-4 py-2 text-[10px] disabled:opacity-40" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
