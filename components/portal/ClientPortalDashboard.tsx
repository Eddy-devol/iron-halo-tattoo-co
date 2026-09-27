"use client";

import React from "react";
import { useState } from "react";
import type { ClientPortalBooking } from "@/lib/server/client-portal";

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
        <button type="button" onClick={() => void logout()} disabled={signingOut} className="text-xs uppercase tracking-[.16em] text-bone/60 underline decoration-rust/60 underline-offset-4 hover:text-bone disabled:opacity-50">{signingOut ? "Signing out…" : "Sign out"}</button>
      </header>
      <div className="mx-auto max-w-6xl pb-20 pt-12 sm:pt-16">
        <p className="eyebrow">YOUR BOOKING · {booking.referenceNumber}</p>
        <h1 className="mt-5 max-w-4xl font-display text-6xl leading-[.95] sm:text-8xl">A considered<br /><em className="text-rust">next step.</em></h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-bone/60">Your private view of the booking details and documents shared by the studio.</p>
        {logoutError && <p className="mt-5 text-sm text-rust" role="alert">{logoutError}</p>}

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <section className="border border-white/15 p-6 sm:p-8">
            <p className="eyebrow">BOOKING</p>
            <h2 className="mt-4 font-display text-3xl">{booking.fullName}</h2>
            <p className="mt-2 text-sm text-bone/60">{displayStatus(booking.status)}</p>
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

          <section className="border border-white/15 p-6 sm:p-8">
            <p className="eyebrow">APPOINTMENT</p>
            {appointment ? (
              <div className="mt-6">
                <h2 className="font-display text-3xl">{dateTime(appointment.startAt)}</h2>
                <p className="mt-3 text-sm text-bone/60">Until {dateTime(appointment.endAt)}</p>
              </div>
            ) : <p className="mt-6 text-sm leading-7 text-bone/60">Appointment not yet scheduled.</p>}
          </section>

          <section className="border border-white/15 p-6 sm:p-8">
            <p className="eyebrow">PAYMENT</p>
            {plan ? (
              <>
                <p className="mt-4 text-sm capitalize text-bone/60">{displayStatus(plan.status)}</p>
                <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-white/10 py-5">
                  <Field label="Total" value={amount(plan.totalAmount, plan.currency)} />
                  <Field label="Paid" value={amount(plan.amountPaid, plan.currency)} />
                  <Field label="Remaining" value={amount(plan.remainingBalance, plan.currency)} />
                </dl>
                <div className="mt-6">
                  <h2 className="eyebrow">INSTALLMENTS</h2>
                  <ul className="mt-3 divide-y divide-white/10">
                    {plan.installments.map((installment) => (
                      <li key={installment.installmentNumber} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-xs">
                        <span>#{installment.installmentNumber} · {date(installment.dueDate)} · {displayStatus(installment.status)}</span>
                        <span>{amount(installment.amount, plan.currency)}</span>
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
                          <span>{date(payment.paidAt)} · {displayStatus(payment.method)}</span>
                          <span className="flex items-center gap-4">{amount(payment.amount, payment.currency)} <a className="text-rust underline underline-offset-4" href={`/portal/documents/receipt/${encodeURIComponent(payment.receiptNumber)}`}>Receipt</a></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : <p className="mt-6 text-sm leading-7 text-bone/60">A payment plan has not been recorded for this booking.</p>}
            <p className="mt-5 text-xs leading-6 text-bone/40">Payment information is read-only here. Contact the studio with any questions.</p>
          </section>

          <section className="border border-white/15 p-6 sm:p-8">
            <p className="eyebrow">CONSENT</p>
            <h2 className="mt-4 font-display text-3xl capitalize">{booking.consent?.status === "COMPLETED" ? "Completed" : "Not completed"}</h2>
            {booking.consent?.status === "COMPLETED"
              ? <p className="mt-4 text-sm leading-7 text-bone/60">Consent completed{booking.consent.completedAt ? ` on ${date(booking.consent.completedAt)}` : ""}.</p>
              : <p className="mt-4 text-sm leading-7 text-bone/60">Consent has not yet been completed. Please follow the studio’s instructions before your appointment. Physical completion is recorded by the studio.</p>}
            {booking.consent && <a className="mt-6 inline-flex text-xs uppercase tracking-[.16em] text-rust underline underline-offset-4" href="/portal/documents/consent">View consent document</a>}
          </section>
        </div>

        <section className="mt-5 border border-white/15 p-6 sm:p-8">
          <p className="eyebrow">DOCUMENTS</p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4 text-xs uppercase tracking-[.14em]">
            <a className="text-bone/75 underline decoration-rust/60 underline-offset-4 hover:text-bone" href="/portal/documents/confirmation">Booking confirmation</a>
            {plan && <a className="text-bone/75 underline decoration-rust/60 underline-offset-4 hover:text-bone" href="/portal/documents/payment-plan">Payment plan</a>}
            {booking.consent && <a className="text-bone/75 underline decoration-rust/60 underline-offset-4 hover:text-bone" href="/portal/documents/consent">Consent form</a>}
            <a className="text-bone/75 underline decoration-rust/60 underline-offset-4 hover:text-bone" href="/portal/documents/client-packet">Client packet</a>
            {plan?.payments.map((payment) => <a key={payment.receiptNumber} className="text-bone/75 underline decoration-rust/60 underline-offset-4 hover:text-bone" href={`/portal/documents/receipt/${encodeURIComponent(payment.receiptNumber)}`}>Receipt · {payment.receiptNumber}</a>)}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="min-w-0"><dt className="eyebrow">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-bone/75">{value?.trim() || "Not provided"}</dd></div>;
}
