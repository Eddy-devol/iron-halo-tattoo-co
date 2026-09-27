"use client";

import Link from "next/link";
import { BookingStatus } from "@prisma/client";
import { FormEvent, useEffect, useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminBookingDocumentsAndPayments from "@/components/admin/AdminBookingDocumentsAndPayments";

const bookingStatuses = Object.values(BookingStatus);

type BookingDetailData = {
  id: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  description: string;
  style: string | null;
  placement: string;
  size: string;
  colorPreference: string | null;
  preferredTimeframe: string | null;
  artistName: string | null;
  budget: string | null;
  additionalNotes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  consentRecord: {
    legalName: string | null;
    dateOfBirth: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    governmentIdType: string | null;
    governmentIdLastFour: string | null;
    identificationVerifiedAt: string | null;
    verifiedByName: string | null;
    status: "NOT_COMPLETED" | "COMPLETED";
    completedAt: string | null;
  } | null;
  notes: Array<{
    id: string;
    body: string;
    authorName: string | null;
    createdAt: string;
  }>;
  statusHistory: Array<{
    id: string;
    previousStatus: BookingStatus;
    newStatus: BookingStatus;
    actorName: string;
    createdAt: string;
  }>;
  referenceImages: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
    url: string;
  }>;
};

function display(value: string | null) {
  return value?.trim() || "Not provided";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function formatStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function DetailField({ label, value, className = "" }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-[.18em] text-ink/45">{label}</dt>
      <dd className="mt-2 whitespace-pre-wrap text-sm leading-6">{display(value)}</dd>
    </div>
  );
}

export default function AdminBookingDetail({ bookingId }: { bookingId: string }) {
  const [booking, setBooking] = useState<BookingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus | "">("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadBooking() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load booking details.");
        setBooking(payload.booking as BookingDetailData);
        setSelectedStatus(payload.booking.status as BookingStatus);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load booking details.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadBooking();
    return () => controller.abort();
  }, [bookingId]);

  async function handleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking || !selectedStatus || selectedStatus === booking.status) return;

    setStatusSaving(true);
    setStatusError("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update booking status.");
      setBooking((current) => current ? ({
        ...current,
        status: payload.statusChange.newStatus,
        updatedAt: payload.updatedAt,
        statusHistory: [...current.statusHistory, payload.statusChange],
      }) : current);
    } catch (saveError) {
      setStatusError(saveError instanceof Error ? saveError.message : "Unable to update booking status.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking || !noteDraft.trim()) return;

    setNoteSaving(true);
    setNoteError("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteDraft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to add internal note.");
      setBooking((current) => current ? ({ ...current, notes: [...current.notes, payload.note] }) : current);
      setNoteDraft("");
    } catch (saveError) {
      setNoteError(saveError instanceof Error ? saveError.message : "Unable to add internal note.");
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f1ede5] text-ink">
      <AdminHeader />
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <Link href="/admin" className="text-[10px] uppercase tracking-[.18em] text-ink/55 hover:text-rust">← All booking requests</Link>
        {loading ? (
          <p className="mt-12 text-sm text-ink/55" role="status">Loading booking details…</p>
        ) : error ? (
          <div className="mt-12 border border-ink/15 bg-white/30 p-6" role="alert">
            <p className="text-sm text-rust">{error}</p>
            <Link href="/admin" className="mt-4 inline-block text-xs uppercase tracking-[.15em] underline">Return to bookings</Link>
          </div>
        ) : booking ? (
          <>
            <div className="mt-8 border-b border-ink/15 pb-7">
              <p className="eyebrow">{booking.referenceNumber}</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <h1 className="font-display text-5xl sm:text-6xl">{booking.fullName}</h1>
                <p className="pb-2 text-sm capitalize text-ink/55">{formatStatus(booking.status)}</p>
              </div>
              <p className="mt-4 text-xs text-ink/50">Received {formatDate(booking.createdAt)}</p>
            </div>

            <section className="mt-8 border border-ink/15 bg-white/30 p-5 sm:p-6">
              <h2 className="font-display text-3xl">Booking status</h2>
              <form onSubmit={handleStatusSubmit} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="grid gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-ink/55">
                  Status
                  <select
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value as BookingStatus)}
                    disabled={statusSaving}
                    className="min-w-56 border border-ink/20 bg-[#f1ede5] px-3 py-3 text-sm font-normal normal-case tracking-normal text-ink"
                  >
                    {bookingStatuses.map((status) => (
                      <option key={status} value={status}>{formatStatus(status)}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={statusSaving || selectedStatus === booking.status}
                  className="border border-ink bg-ink px-5 py-3 text-[10px] uppercase tracking-[.16em] text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {statusSaving ? "Saving…" : "Save status"}
                </button>
              </form>
              {statusError && <p className="mt-3 text-sm text-rust" role="alert">{statusError}</p>}
            </section>

            <section className="mt-8">
              <h2 className="font-display text-3xl">Contact</h2>
              <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <DetailField label="Email" value={booking.email} />
                <DetailField label="Phone" value={booking.phone} />
              </dl>
            </section>

            <section className="mt-10 border-t border-ink/15 pt-8">
              <h2 className="font-display text-3xl">Internal notes</h2>
              <p className="mt-2 text-xs text-ink/55">Visible only to admins; these notes are not sent to the client.</p>
              <form onSubmit={handleNoteSubmit} className="mt-5">
                <label htmlFor="internal-note" className="sr-only">Add an internal note</label>
                <textarea
                  id="internal-note"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  maxLength={5000}
                  rows={4}
                  disabled={noteSaving}
                  placeholder="Write an internal note…"
                  className="w-full border border-ink/20 bg-white/40 p-4 text-sm leading-6 text-ink placeholder:text-ink/40"
                />
                {noteError && <p className="mt-2 text-sm text-rust" role="alert">{noteError}</p>}
                <button
                  type="submit"
                  disabled={noteSaving || !noteDraft.trim()}
                  className="mt-3 border border-ink bg-ink px-5 py-3 text-[10px] uppercase tracking-[.16em] text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {noteSaving ? "Adding note…" : "Add internal note"}
                </button>
              </form>
              {!booking.notes.length ? (
                <p className="mt-6 text-sm text-ink/55">No internal notes yet.</p>
              ) : (
                <ol className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
                  {booking.notes.map((note) => (
                    <li key={note.id} className="py-4">
                      <p className="whitespace-pre-wrap text-sm leading-6">{note.body}</p>
                      <p className="mt-2 text-xs text-ink/50">
                        {note.authorName || "Admin"} · {formatDate(note.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="mt-10 border-t border-ink/15 pt-8">
              <h2 className="font-display text-3xl">Status history</h2>
              {!booking.statusHistory.length ? (
                <p className="mt-4 text-sm text-ink/55">No status changes recorded.</p>
              ) : (
                <ol className="mt-5 divide-y divide-ink/10 border-y border-ink/10">
                  {booking.statusHistory.map((change) => (
                    <li key={change.id} className="py-4">
                      <p className="text-sm capitalize">
                        {formatStatus(change.previousStatus)} <span aria-hidden="true">→</span> {formatStatus(change.newStatus)}
                      </p>
                      <p className="mt-2 text-xs text-ink/50">{change.actorName} · {formatDate(change.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="mt-10 border-t border-ink/15 pt-8">
              <h2 className="font-display text-3xl">Project</h2>
              <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <DetailField label="Description" value={booking.description} className="sm:col-span-2" />
                <DetailField label="Style" value={booking.style} />
                <DetailField label="Placement" value={booking.placement} />
                <DetailField label="Size" value={booking.size} />
                <DetailField label="Color preference" value={booking.colorPreference} />
                <DetailField label="Preferred timeframe" value={booking.preferredTimeframe} />
                <DetailField label="Budget" value={booking.budget} />
                <DetailField label="Additional request details" value={booking.additionalNotes} className="sm:col-span-2" />
              </dl>
            </section>

            <section className="mt-10 border-t border-ink/15 pt-8">
              <h2 className="font-display text-3xl">Reference images</h2>
              {!booking.referenceImages.length ? (
                <p className="mt-4 text-sm text-ink/55">No reference images were attached.</p>
              ) : (
                <ul className="mt-5 divide-y divide-ink/10 border-y border-ink/10">
                  {booking.referenceImages.map((image) => (
                    <li key={image.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div>
                        <p className="text-sm">{image.originalFilename}</p>
                        <p className="mt-1 text-xs text-ink/50">{image.mimeType} · {(image.fileSize / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <a href={image.url} target="_blank" rel="noreferrer" className="text-xs uppercase tracking-[.14em] text-rust hover:underline">Open image</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <AdminBookingDocumentsAndPayments
              bookingId={booking.id}
              fullName={booking.fullName}
              email={booking.email}
              phone={booking.phone}
              artistName={booking.artistName}
              consentRecord={booking.consentRecord}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
