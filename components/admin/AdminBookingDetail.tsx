"use client";

import Link from "next/link";
import { BookingStatus } from "@prisma/client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminBookingDocumentsAndPayments from "@/components/admin/AdminBookingDocumentsAndPayments";
import StatusBadge from "@/components/StatusBadge";

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
  const router = useRouter();
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const [booking, setBooking] = useState<BookingDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus | "">("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (!dialog) return;
    if (deleteConfirmationOpen && !dialog.open) dialog.showModal();
    if (!deleteConfirmationOpen && dialog.open) dialog.close();
  }, [deleteConfirmationOpen]);

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

  async function handleDelete() {
    if (!booking) return;

    setDeleteSaving(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to delete booking.");
      setDeleteConfirmationOpen(false);
      router.push(`/admin?deleted=1${payload.cleanupPending ? "&cleanupPending=1" : ""}`);
    } catch (deleteError) {
      setDeleteError(deleteError instanceof Error ? deleteError.message : "Unable to delete booking.");
    } finally {
      setDeleteSaving(false);
    }
  }

  return (
    <main className="admin-light min-h-screen bg-[#f1ede5] text-ink">
      <AdminHeader />
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-6 sm:py-16">
        <Link href="/admin" className="nav-link inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.16em] text-ink/60">← All booking requests</Link>
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
                <h1 className="font-display text-4xl sm:text-6xl">{booking.fullName}</h1>
                <StatusBadge status={booking.status} />
              </div>
              <p className="mt-4 text-xs text-ink/50">Received {formatDate(booking.createdAt)}</p>
            </div>

            <section className="surface-card mt-8 border-ink/10 bg-white/35 p-5 sm:p-6">
              <h2 className="font-display text-3xl">Booking status</h2>
              <form onSubmit={handleStatusSubmit} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="grid gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-ink/55">
                  Status
                  <select
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value as BookingStatus)}
                    disabled={statusSaving}
                    className="field-control field-control-light min-w-56 font-normal normal-case tracking-normal"
                  >
                    {bookingStatuses.map((status) => (
                      <option key={status} value={status}>{formatStatus(status)}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={statusSaving || selectedStatus === booking.status}
                  className="button-primary !min-h-11 !border-ink !bg-ink !px-5 !py-3 !text-[10px] !tracking-[.14em] !text-bone disabled:cursor-not-allowed disabled:opacity-45"
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
                  className="field-control field-control-light min-h-32 resize-y py-3 leading-6"
                />
                {noteError && <p className="mt-2 text-sm text-rust" role="alert">{noteError}</p>}
                <button
                  type="submit"
                  disabled={noteSaving || !noteDraft.trim()}
                  className="button-primary mt-3 !min-h-11 !border-ink !bg-ink !px-5 !py-3 !text-[10px] !tracking-[.14em] !text-bone disabled:cursor-not-allowed disabled:opacity-45"
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
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <StatusBadge status={change.previousStatus} />
                        <span aria-hidden="true" className="text-ink/45">→</span>
                        <StatusBadge status={change.newStatus} />
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
                      <a href={image.url} target="_blank" rel="noreferrer" className="nav-link inline-flex min-h-11 items-center text-xs uppercase tracking-[.12em] text-ink/75">Open image <span className="link-arrow ml-1" aria-hidden="true">↗</span></a>
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

            <section className="mt-12 border-t border-rust/30 pt-8">
              <h2 className="font-display text-3xl">Delete booking request</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-ink/60">
                Permanently remove this request and its associated records.
              </p>
              {deleteError && <p className="mt-3 text-sm text-rust" role="alert">{deleteError}</p>}
              <button
                type="button"
                onClick={() => {
                  setDeleteError("");
                  setDeleteConfirmationOpen(true);
                }}
                disabled={deleteSaving}
                className="mt-5 inline-flex min-h-11 items-center justify-center border border-rust bg-rust px-5 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-bone transition-colors hover:bg-rust/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete booking
              </button>
              <dialog
                ref={confirmationDialog}
                aria-labelledby="delete-booking-title"
                aria-describedby="delete-booking-description"
                onCancel={(event) => {
                  event.preventDefault();
                  if (!deleteSaving) setDeleteConfirmationOpen(false);
                }}
                className="w-[min(calc(100%-2rem),34rem)] border border-ink/15 bg-[#f1ede5] p-0 text-ink shadow-2xl backdrop:bg-ink/70"
              >
                <div className="p-6 sm:p-8">
                  <p className="eyebrow">Permanent action</p>
                  <h3 id="delete-booking-title" className="mt-3 font-display text-3xl">
                    Delete this booking request permanently?
                  </h3>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[.15em] text-ink/55">
                    {booking.referenceNumber}
                  </p>
                  <p id="delete-booking-description" className="mt-5 text-sm leading-6 text-ink/70">
                    This will permanently remove the booking request, its notes and history, payment records and plan,
                    consent record, client access records, and private reference images. This action cannot be undone.
                  </p>
                  {deleteError && <p className="mt-4 text-sm text-rust" role="alert">{deleteError}</p>}
                  <div className="mt-7 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      autoFocus
                      onClick={() => setDeleteConfirmationOpen(false)}
                      disabled={deleteSaving}
                      className="button-quiet !border-ink/35 !px-5 !py-3 !text-[10px] !tracking-[.14em] text-ink disabled:opacity-45"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleteSaving}
                      className="inline-flex min-h-11 items-center justify-center border border-rust bg-rust px-5 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-bone transition-colors hover:bg-rust/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleteSaving ? "Deleting…" : "Delete permanently"}
                    </button>
                  </div>
                </div>
              </dialog>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
