"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";

type Installment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: string;
  amountPaid: string;
  remaining: string;
  lastPaidAt: string | null;
};

type Payment = {
  id: string;
  receiptNumber: string;
  installmentNumber: number;
  amount: string;
  balanceAfter: string;
  currency: string;
  method: string;
  source: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  recordedByName: string;
};

type PaymentPlan = {
  id: string;
  totalAmount: string;
  amountPaid: string;
  remainingBalance: string;
  currency: string;
  status: string;
  installmentCount: number;
  installments: Installment[];
  payments: Payment[];
} | null;

type ConsentRecord = {
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

type InstallmentDraft = { dueDate: string; amount: string };

function amountLabel(amount: string, currency: string) {
  const [whole, cents = "00"] = amount.split(".");
  return `${currency} ${whole}.${cents.padEnd(2, "0")}`;
}

function shortDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "—";
}

function ActionButton({ children, disabled, type = "submit" }: { children: ReactNode; disabled?: boolean; type?: "submit" | "button" }) {
  return (
    <button type={type} disabled={disabled} className="border border-ink bg-ink px-5 py-3 text-[10px] uppercase tracking-[.16em] text-white disabled:cursor-not-allowed disabled:opacity-45">
      {children}
    </button>
  );
}

export default function AdminBookingDocumentsAndPayments({
  bookingId,
  fullName,
  email,
  phone,
  artistName,
  consentRecord,
}: {
  bookingId: string;
  fullName: string;
  email: string;
  phone: string | null;
  artistName: string | null;
  consentRecord: ConsentRecord;
}) {
  const [plan, setPlan] = useState<PaymentPlan>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [installments, setInstallments] = useState<InstallmentDraft[]>([{ dueDate: "", amount: "" }]);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [legalName, setLegalName] = useState(consentRecord?.legalName ?? fullName);
  const [dateOfBirth, setDateOfBirth] = useState(consentRecord?.dateOfBirth?.slice(0, 10) ?? "");
  const [addressLine1, setAddressLine1] = useState(consentRecord?.addressLine1 ?? "");
  const [city, setCity] = useState(consentRecord?.city ?? "");
  const [stateName, setStateName] = useState(consentRecord?.state ?? "");
  const [postalCode, setPostalCode] = useState(consentRecord?.postalCode ?? "");
  const [governmentIdType, setGovernmentIdType] = useState(consentRecord?.governmentIdType ?? "");
  const [governmentIdLastFour, setGovernmentIdLastFour] = useState(consentRecord?.governmentIdLastFour ?? "");
  const [identificationVerified, setIdentificationVerified] = useState(Boolean(consentRecord?.identificationVerifiedAt));
  const [consentStatus, setConsentStatus] = useState(consentRecord?.status ?? "NOT_COMPLETED");
  const [consentMessage, setConsentMessage] = useState("");
  const [assignedArtist, setAssignedArtist] = useState(artistName ?? "");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const paymentResponse = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/payments`);
        const paymentPayload = await paymentResponse.json();
        if (!paymentResponse.ok) throw new Error(paymentPayload.error || "Unable to load payments.");
        if (active) setPlan(paymentPayload.paymentPlan ?? null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load payments.");
      } finally {
        if (active) setPlanLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [bookingId]);

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/payment-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount,
          currency: currency.toUpperCase(),
          installments,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create payment plan.");
      setPlan(payload.paymentPlan);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create payment plan.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentId: selectedInstallmentId,
          amount: paymentAmount,
          method: paymentMethod,
          paidAt: paymentDate,
          reference: paymentReference || null,
          notes: paymentNotes || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to record payment.");
      setPlan(payload.paymentPlan);
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentNotes("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to record payment.");
    } finally {
      setBusy(false);
    }
  }

  async function saveConsent(complete = false, reopen = false) {
    setBusy(true);
    setError("");
    setConsentMessage("");
    try {
      if (complete && !window.confirm("Confirm that the physical client and artist signatures have been received and checked?")) return;
      if (reopen && !window.confirm("Reopen this consent record? It will be marked not completed until a new physical form is signed.")) return;
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/consent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: legalName || null,
          dateOfBirth: dateOfBirth || null,
          addressLine1: addressLine1 || null,
          city: city || null,
          state: stateName || null,
          postalCode: postalCode || null,
          governmentIdType: governmentIdType || null,
          governmentIdLastFour: governmentIdLastFour || null,
          identificationVerified,
          artistName: assignedArtist || null,
          ...(complete ? { status: "COMPLETED", physicalSignatureReceived: true } : {}),
          ...(reopen ? { status: "NOT_COMPLETED" } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save client record.");
      setConsentStatus(payload.consentRecord.status);
      setConsentMessage(complete
        ? "Physical consent completion recorded."
        : reopen
          ? "Consent record reopened; a new physical signature is required."
          : "Client record saved.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save client record.");
    } finally {
      setBusy(false);
    }
  }

  const openInstallments = plan?.installments.filter((item) => item.remaining !== "0.00") ?? [];

  return (
    <div className="mt-10 space-y-10 border-t border-ink/15 pt-8">
      <section>
        <h2 className="font-display text-3xl">Documents</h2>
        <p className="mt-2 text-xs text-ink/55">Documents are private to authenticated administrators. Printing does not change booking or consent status.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="button-quiet" target="_blank" rel="noreferrer" href={`/admin/bookings/${encodeURIComponent(bookingId)}/print/confirmation`}>Print booking confirmation</Link>
          <Link className="button-quiet" target="_blank" rel="noreferrer" href={`/admin/bookings/${encodeURIComponent(bookingId)}/print/consent`}>Print consent form</Link>
          {plan && <Link className="button-quiet" target="_blank" rel="noreferrer" href={`/admin/bookings/${encodeURIComponent(bookingId)}/print/payment-plan`}>Print payment plan</Link>}
          <Link className="button-quiet" target="_blank" rel="noreferrer" href={`/admin/bookings/${encodeURIComponent(bookingId)}/print/client-packet`}>Print client packet</Link>
        </div>
      </section>

      <section className="border-t border-ink/15 pt-8">
        <h2 className="font-display text-3xl">Payments</h2>
        {planLoading ? <p className="mt-4 text-sm text-ink/55" role="status">Loading payment plan…</p> : null}
        {error && <p className="mt-4 text-sm text-rust" role="alert">{error}</p>}
        {plan ? (
          <>
            <dl className="mt-5 grid gap-5 border-y border-ink/10 py-5 sm:grid-cols-4">
              <div><dt className="eyebrow">Total price</dt><dd className="mt-2 text-sm">{amountLabel(plan.totalAmount, plan.currency)}</dd></div>
              <div><dt className="eyebrow">Amount paid</dt><dd className="mt-2 text-sm">{amountLabel(plan.amountPaid, plan.currency)}</dd></div>
              <div><dt className="eyebrow">Remaining balance</dt><dd className="mt-2 text-sm">{amountLabel(plan.remainingBalance, plan.currency)}</dd></div>
              <div><dt className="eyebrow">Payment status</dt><dd className="mt-2 text-sm capitalize">{plan.status.toLowerCase().replaceAll("_", " ")}</dd></div>
            </dl>
            <div className="mt-6 overflow-x-auto">
              <h3 className="eyebrow mb-3">Payment ledger</h3>
              {!plan.payments.length ? <p className="text-sm text-ink/55">No payments recorded.</p> : (
                <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                  <thead><tr className="border-b border-ink/15 text-[10px] uppercase tracking-[.12em] text-ink/50">
                    <th className="py-3 pr-3">Payment</th><th className="py-3 pr-3">Amount</th><th className="py-3 pr-3">Date</th><th className="py-3 pr-3">Method</th><th className="py-3 pr-3">Recorded by</th><th className="py-3 pr-3">Reference / notes</th><th className="py-3">Receipt</th>
                  </tr></thead>
                  <tbody>{plan.payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-ink/10 align-top">
                      <td className="py-3 pr-3">#{payment.installmentNumber} · Manual</td>
                      <td className="py-3 pr-3">{amountLabel(payment.amount, payment.currency)}</td>
                      <td className="py-3 pr-3">{shortDate(payment.paidAt)}</td>
                      <td className="py-3 pr-3">{payment.method.replaceAll("_", " ")}</td>
                      <td className="py-3 pr-3">{payment.recordedByName}</td>
                      <td className="max-w-48 whitespace-pre-wrap py-3 pr-3">{[payment.reference, payment.notes].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="py-3"><Link className="text-rust underline" target="_blank" rel="noreferrer" href={`/admin/bookings/${encodeURIComponent(bookingId)}/print/payment/${encodeURIComponent(payment.id)}`}>Print</Link></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            {openInstallments.length > 0 && (
              <form onSubmit={submitPayment} className="mt-8 border border-ink/15 bg-white/25 p-5 sm:p-6">
                <h3 className="font-display text-2xl">Record payment</h3>
                <p className="mt-2 text-xs text-ink/55">Payments are manually recorded. This does not change the booking status.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-xs">Installment
                    <select required value={selectedInstallmentId || openInstallments[0]?.id || ""} onChange={(event) => setSelectedInstallmentId(event.target.value)} className="border border-ink/20 bg-[#f1ede5] p-3">
                      {openInstallments.map((item) => <option key={item.id} value={item.id}>#{item.installmentNumber} — {amountLabel(item.remaining, plan.currency)} remaining</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs">Amount
                    <input required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="border border-ink/20 bg-transparent p-3" />
                  </label>
                  <label className="grid gap-2 text-xs">Payment method
                    <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="border border-ink/20 bg-[#f1ede5] p-3">
                      <option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs">Payment date
                    <input required type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="border border-ink/20 bg-transparent p-3" />
                  </label>
                  <label className="grid gap-2 text-xs">Reference
                    <input maxLength={200} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="border border-ink/20 bg-transparent p-3" />
                  </label>
                  <label className="grid gap-2 text-xs">Internal payment notes
                    <input maxLength={1000} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="border border-ink/20 bg-transparent p-3" />
                  </label>
                </div>
                <div className="mt-5"><ActionButton disabled={busy}>{busy ? "Saving…" : "Record payment"}</ActionButton></div>
              </form>
            )}
          </>
        ) : !planLoading ? (
          <form onSubmit={submitPlan} className="mt-5 border border-ink/15 bg-white/25 p-5 sm:p-6">
            <h3 className="font-display text-2xl">Create payment plan</h3>
            <p className="mt-2 text-xs text-ink/55">Set custom installment amounts and due dates. Their sum must exactly match the total.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs">Total tattoo price
                <input required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} className="border border-ink/20 bg-transparent p-3" />
              </label>
              <label className="grid gap-2 text-xs">Currency (ISO 4217)
                <input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" placeholder="e.g. USD" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="border border-ink/20 bg-transparent p-3 uppercase" />
              </label>
            </div>
            <div className="mt-6 space-y-3">
              {installments.map((installment, index) => (
                <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="grid gap-2 text-xs">Installment {index + 1} due date
                    <input type="date" required value={installment.dueDate} onChange={(event) => setInstallments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate: event.target.value } : item))} className="border border-ink/20 bg-transparent p-3" />
                  </label>
                  <label className="grid gap-2 text-xs">Amount
                    <input required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?" value={installment.amount} onChange={(event) => setInstallments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} className="border border-ink/20 bg-transparent p-3" />
                  </label>
                  <button type="button" disabled={installments.length <= 1} onClick={() => setInstallments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="border border-ink/20 px-4 py-3 text-xs disabled:opacity-40">Remove</button>
                </div>
              ))}
              <button type="button" disabled={installments.length >= 24} onClick={() => setInstallments((current) => [...current, { dueDate: "", amount: "" }])} className="text-xs uppercase tracking-[.14em] text-rust underline">Add installment</button>
            </div>
            <div className="mt-5"><ActionButton disabled={busy}>{busy ? "Saving…" : "Create payment plan"}</ActionButton></div>
          </form>
        ) : null}
      </section>

      <section className="border-t border-ink/15 pt-8">
        <h2 className="font-display text-3xl">Client record & consent</h2>
        <p className="mt-2 text-xs text-ink/55">Government ID numbers are not collected. Store only the ID type and last four digits when needed.</p>
        <p className="mt-2 text-xs text-ink/55">Consent status: <strong className="capitalize">{consentStatus.toLowerCase().replaceAll("_", " ")}</strong>{consentRecord?.completedAt ? ` · completed ${shortDate(consentRecord.completedAt)}` : ""}</p>
        {consentRecord?.identificationVerifiedAt && (
          <p className="mt-2 text-xs text-ink/55">
            Identification verified by {consentRecord.verifiedByName || "Admin"} on {shortDate(consentRecord.identificationVerifiedAt)}.
          </p>
        )}
        <form onSubmit={(event) => { event.preventDefault(); void saveConsent(); }} className="mt-5 border border-ink/15 bg-white/25 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs">Legal name<input maxLength={160} value={legalName} onChange={(event) => setLegalName(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="grid gap-2 text-xs">Date of birth<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="grid gap-2 text-xs">Street address<input maxLength={200} value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="grid gap-2 text-xs">City<input maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="grid gap-2 text-xs">State / region<input maxLength={80} value={stateName} onChange={(event) => setStateName(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="grid gap-2 text-xs">ZIP / postal code<input maxLength={20} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="grid gap-2 text-xs">Government ID type<input maxLength={80} value={governmentIdType} onChange={(event) => setGovernmentIdType(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="grid gap-2 text-xs">ID last four digits only<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={governmentIdLastFour} onChange={(event) => setGovernmentIdLastFour(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <label className="flex items-center gap-3 text-xs sm:col-span-2"><input type="checkbox" checked={identificationVerified} onChange={(event) => setIdentificationVerified(event.target.checked)} />I verified the identification in person</label>
            <label className="grid gap-2 text-xs">Assigned artist / tattooer<input maxLength={160} value={assignedArtist} onChange={(event) => setAssignedArtist(event.target.value)} className="border border-ink/20 bg-transparent p-3" /></label>
            <p className="text-xs text-ink/55 sm:col-span-2">Client contact on file: {email}{phone ? ` · ${phone}` : ""}.</p>
          </div>
          {consentMessage && <p className="mt-4 text-sm" role="status">{consentMessage}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton disabled={busy || consentStatus === "COMPLETED"}>{busy ? "Saving…" : "Save client record"}</ActionButton>
            <button type="button" disabled={busy || consentStatus === "COMPLETED"} onClick={() => {
              void saveConsent(true);
            }} className="border border-ink/30 px-5 py-3 text-[10px] uppercase tracking-[.16em] disabled:opacity-45">Mark paper consent complete</button>
            {consentStatus === "COMPLETED" && <button type="button" disabled={busy} onClick={() => { void saveConsent(false, true); }} className="border border-ink/30 px-5 py-3 text-[10px] uppercase tracking-[.16em] disabled:opacity-45">Reopen consent</button>}
            <Link className="button-quiet" target="_blank" rel="noreferrer" href={`/admin/bookings/${encodeURIComponent(bookingId)}/print/consent`}>Print consent</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
