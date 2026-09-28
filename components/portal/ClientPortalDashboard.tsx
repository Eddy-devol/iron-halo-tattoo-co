"use client";

import React from "react";
import { useState } from "react";
import type { ClientPortalBooking } from "@/lib/server/client-portal";
import StatusBadge from "@/components/StatusBadge";

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

function amount(value: string, currency: string) {
  return `${currency} ${value}`;
}

function displayStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export default function ClientPortalDashboard({ booking }: { booking: ClientPortalBooking }) {
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const plan = booking.paymentPlan;
  const appointment = booking.appointments[0];

  async function logout() {
    setLogoutError("");
    setSigningOut(true);
    try {
      const response = await fetch("/api/client/auth/logout", { method: "POST" });
      if (response.ok) {
        window.location.assign("/portal/login");
        return;
      }
      setLogoutError("Unable to sign out. Please try again.");
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-5 py-8 text-bone sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-white/15 pb-6">
        <div><p className="eyebrow">IRON HALO TATTOO CO.</p><p className="mt-2 text-xs text-bone/45">Private client space</p></div>
        <button type="button" onClick={() => void logout()} disabled={signingOut} className="button-quiet min-h-10 px-4 py-2 text-[10px] text-bone/70 disabled:opacity-50">{signingOut ? "Signing out…" : "Sign out"}</button>
      </header>
      <div className="mx-auto max-w-6xl pb-20 pt-12 sm:pt-16">
        <p className="eyebrow">YOUR BOOKING · {booking.referenceNumber}</p>
        <h1 className="mt-5 max-w-4xl font-display text-6xl leading-[.95] sm:text-8xl">A considered<br /><em className="text-rust">next step.</em></h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-bone/60">Your private view of the booking details and documents shared by the studio.</p>
        {logoutError && <p className="mt-5 text-sm text-rust" role="alert">{logoutError}</p>}

        <div className="mt-10 grid gap-4 sm:mt-14 sm:gap-5 md:grid-cols-2">
          <section className="surface-card min-w-0 p-5 sm:p-8">
            <p className="eyebrow">BOOKING</p>
            <h2 className="mt-4 font-display text-3xl">{booking.fullName}</h2>
            <div className="mt-3"><StatusBadge status={booking.status} tone="dark" /></div>
            <dl className="mt-7 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-2">
              <Field label="Tattoo" value={booking.description} />
              <Field label="Style" value={booking.style} />
              <Field label="Placement" value={booking.placement} />
              <Field label="Approximate scale" value={booking.size} />
              <Field label="Color" value={booking.colorPreference} />
              <Field label="Artist" value={booking.artistName} />
              <Field label="Preferred timeframe" value={booking.preferredTimeframe} />
            </dl>
          </section>

          <section className="surface-card min-w-0 p-5 sm:p-8">
            <p className="eyebrow">APPOINTMENT</p>
            {appointment ? (
              <div className="mt-6">
                <h2 className="font-display text-3xl">{dateTime(appointment.startAt)}</h2>
                <p className="mt-3 text-sm text-bone/60">Until {dateTime(appointment.endAt)}</p>
              </div>
            ) : <p className="mt-6 text-sm leading-7 text-bone/60">Appointment not yet scheduled.</p>}
          </section>

          <section className="surface-card min-w-0 p-5 sm:p-8">
            <p className="eyebrow">PAYMENT</p>
            {plan ? (
              <>
                <div className="mt-3"><StatusBadge status={plan.status} tone="dark" /></div>
                <dl className="mt-6 grid grid-cols-1 gap-4 border-y border-white/10 py-5 min-[420px]:grid-cols-3">
                  <Field label="Total" value={amount(plan.totalAmount, plan.currency)} />
                  <Field label="Paid to date" value={amount(plan.amountPaid, plan.currency)} />
                  <Field label="Remaining" value={amount(plan.remainingBalance, plan.currency)} />
                </dl>
                <div className="mt-6">
                  <h2 className="eyebrow">INSTALLMENTS · {plan.installmentCount} {plan.frequency.toLowerCase()}</h2>
                  <ul className="mt-3 divide-y divide-white/10">
                    {plan.installments.map((installment) => (
                      <li key={installment.installmentNumber} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-xs">
                        <span className="flex min-w-0 flex-wrap items-center gap-2"><span>#{installment.installmentNumber} · {date(installment.dueDate)}</span><StatusBadge status={installment.status} tone="dark" /></span>
                        <span className="whitespace-nowrap tabular-nums">{amount(installment.amount, plan.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-6">
                  <h2 className="eyebrow">PAYMENT HISTORY</h2>
                  {!plan.payments.length ? <p className="mt-3 text-sm text-bone/50">No payments recorded.</p> : (
                    <ul className="mt-3 divide-y divide-white/10">
                      {plan.payments.map((payment) => (
                        <li key={payment.receiptNumber} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                          <span className="flex flex-wrap items-center gap-2 text-bone/65">{date(payment.paidAt)} · {displayStatus(payment.source)} · {displayStatus(payment.method)}</span>
                          <span className="flex items-center gap-4 whitespace-nowrap tabular-nums">{amount(payment.amount, payment.currency)} <a className="nav-link min-h-11 py-3 text-bone/80" href={`/portal/documents/receipt/${encodeURIComponent(payment.receiptNumber)}`}>Receipt</a></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : <p className="mt-6 text-sm leading-7 text-bone/60">A payment plan has not been recorded for this booking.</p>}
            <p className="mt-5 text-xs leading-6 text-bone/40">Payment information is read-only here. Contact the studio with any questions.</p>
          </section>

          <section className="surface-card min-w-0 p-5 sm:p-8">
            <p className="eyebrow">CONSENT</p>
            <div className="mt-4"><StatusBadge status={booking.consent?.status ?? "NOT_COMPLETED"} tone="dark" /></div>
            {booking.consent?.status === "COMPLETED"
              ? <p className="mt-4 text-sm leading-7 text-bone/60">Consent completed{booking.consent.completedAt ? ` on ${date(booking.consent.completedAt)}` : ""}.</p>
              : <p className="mt-4 text-sm leading-7 text-bone/60">Consent has not yet been completed. Please follow the studio’s instructions before your appointment. Physical completion is recorded by the studio.</p>}
            {booking.consent && <a className="nav-link mt-4 inline-flex min-h-11 items-center text-xs uppercase tracking-[.14em] text-bone/80" href="/portal/documents/consent">View consent document <span className="link-arrow ml-2" aria-hidden="true">↗</span></a>}
          </section>
        </div>

        <section className="surface-card mt-4 p-5 sm:mt-5 sm:p-8">
          <p className="eyebrow">DOCUMENTS</p>
          <div className="mt-4 flex flex-wrap gap-1 text-xs uppercase tracking-[.12em] sm:mt-5">
            <a className="nav-link flex min-h-11 items-center px-2 text-bone/75" href="/portal/documents/confirmation">Booking confirmation</a>
            {plan && <a className="nav-link flex min-h-11 items-center px-2 text-bone/75" href="/portal/documents/payment-plan">Payment plan</a>}
            {booking.consent && <a className="nav-link flex min-h-11 items-center px-2 text-bone/75" href="/portal/documents/consent">Consent form</a>}
            <a className="nav-link flex min-h-11 items-center px-2 text-bone/75" href="/portal/documents/client-packet">Client packet</a>
            {plan?.payments.map((payment) => <a key={payment.receiptNumber} className="nav-link flex min-h-11 items-center px-2 text-bone/75" href={`/portal/documents/receipt/${encodeURIComponent(payment.receiptNumber)}`}>Receipt · {payment.receiptNumber}</a>)}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0"><dt className="eyebrow">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-bone/75">{value?.trim() || "Not provided"}</dd></div>;
}
