import React from "react";
import type { ClientPortalBooking } from "@/lib/server/client-portal";
import PortalPrintButton from "@/components/portal/PortalPrintButton";

type DocumentType = "confirmation" | "consent" | "payment-plan" | "client-packet" | "receipt";

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

function amount(value: string, currency: string) {
  return `${currency} ${value}`;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="document-field"><dt>{label}</dt><dd>{value?.trim() || "Not provided"}</dd></div>;
}

function Header({ title, booking }: { title: string; booking: ClientPortalBooking }) {
  return <header className="document-header"><p className="document-brand">IRON HALO TATTOO CO.</p><h1>{title}</h1><p>Booking reference: <strong>{booking.referenceNumber}</strong></p></header>;
}

function Confirmation({ booking }: { booking: ClientPortalBooking }) {
  const appointment = booking.appointments[0];
  return (
    <section className="document-page">
      <Header title="Booking Confirmation" booking={booking} />
      <section className="document-section"><h2>Booking</h2><dl className="document-grid">
        <Field label="Status" value={booking.status.replaceAll("_", " ")} />
        <Field label="Client" value={booking.fullName} />
        <Field label="Tattoo" value={booking.description} />
        <Field label="Style" value={booking.style} />
        <Field label="Placement" value={booking.placement} />
        <Field label="Approximate scale" value={booking.size} />
        <Field label="Color" value={booking.colorPreference} />
        <Field label="Artist" value={booking.artistName} />
        <Field label="Appointment" value={appointment ? `${dateTime(appointment.startAt)} – ${dateTime(appointment.endAt)}` : "Appointment not yet scheduled."} />
      </dl></section>
    </section>
  );
}

function Consent({ booking }: { booking: ClientPortalBooking }) {
  const consent = booking.consent;
  if (!consent) return null;
  return (
    <section className="document-page">
      <Header title="Tattoo Procedure Consent" booking={booking} />
      <p className="document-notice">Consent status: <strong>{consent.status === "COMPLETED" ? "Completed" : "Not completed"}</strong></p>
      <p className="document-notice">
        {consent.status === "COMPLETED"
          ? "Consent completed."
          : "Consent has not yet been completed. Please follow the studio’s instructions before your appointment. Physical completion is recorded by the studio."}
        {" "}Viewing or printing this document does not complete consent.
      </p>
      <section className="document-section"><h2>Client information</h2><dl className="document-grid">
        <Field label="Legal name" value={consent.legalName || booking.fullName} />
        <Field label="Date of birth" value={consent.dateOfBirth ? date(consent.dateOfBirth) : null} />
        <Field label="Address" value={consent.addressLine1} />
        <Field label="City" value={consent.city} />
        <Field label="State / ZIP" value={[consent.state, consent.postalCode].filter(Boolean).join(" ") || null} />
      </dl></section>
      <section className="document-section"><h2>Tattoo information</h2><dl className="document-grid">
        <Field label="Description" value={booking.description} />
        <Field label="Placement" value={booking.placement} />
        <Field label="Approximate size" value={booking.size} />
        <Field label="Artist / tattooer" value={booking.artistName} />
      </dl></section>
      <section className="document-section"><h2>Consent information</h2>
        {consent.consentText
          ? <div className="document-copy">{consent.consentText.split(/\r?\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          : <p className="document-notice">Client-ready consent wording has not been provided yet. Please follow the studio’s instructions before your appointment.</p>}
      </section>
    </section>
  );
}

function PaymentPlan({ booking }: { booking: ClientPortalBooking }) {
  const plan = booking.paymentPlan;
  if (!plan) return null;
  return (
    <section className="document-page">
      <Header title="Payment Plan" booking={booking} />
      <section className="document-section"><h2>Payment summary</h2><dl className="document-grid">
        <Field label="Status" value={plan.status.replaceAll("_", " ")} />
        <Field label="Total" value={amount(plan.totalAmount, plan.currency)} />
        <Field label="Paid" value={amount(plan.amountPaid, plan.currency)} />
        <Field label="Remaining" value={amount(plan.remainingBalance, plan.currency)} />
      </dl></section>
      <section className="document-section"><h2>Installments</h2><table className="document-table">
        <thead><tr><th>Installment</th><th>Due date</th><th>Amount</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead>
        <tbody>{plan.installments.map((item) => <tr key={item.installmentNumber}>
          <td>{item.installmentNumber}</td><td>{date(item.dueDate)}</td><td>{amount(item.amount, plan.currency)}</td>
          <td>{amount(item.amountPaid, plan.currency)}</td><td>{amount(item.remaining, plan.currency)}</td><td>{item.status.replaceAll("_", " ")}</td>
        </tr>)}</tbody>
      </table></section>
    </section>
  );
}

function Receipt({ booking, receiptNumber }: { booking: ClientPortalBooking; receiptNumber: string }) {
  const plan = booking.paymentPlan;
  const payment = plan?.payments.find((item) => item.receiptNumber === receiptNumber);
  if (!plan || !payment) return null;
  return (
    <section className="document-page">
      <Header title="Payment Receipt" booking={booking} />
      <p className="document-notice">Manually recorded payment; no payment processor was used.</p>
      <section className="document-section"><h2>Receipt details</h2><dl className="document-grid">
        <Field label="Receipt number" value={payment.receiptNumber} />
        <Field label="Client" value={booking.fullName} />
        <Field label="Payment date" value={date(payment.paidAt)} />
        <Field label="Payment method" value={payment.method.replaceAll("_", " ")} />
        <Field label="Amount paid" value={amount(payment.amount, payment.currency)} />
        <Field label="Payment-plan total" value={amount(plan.totalAmount, plan.currency)} />
        <Field label="Remaining balance after payment" value={amount(payment.balanceAfter, payment.currency)} />
      </dl></section>
    </section>
  );
}

export default function ClientPortalDocument({
  type,
  booking,
  receiptNumber,
}: {
  type: DocumentType;
  booking: ClientPortalBooking;
  receiptNumber?: string;
}) {
  const content = type === "confirmation" ? <Confirmation booking={booking} />
    : type === "consent" ? <Consent booking={booking} />
      : type === "payment-plan" ? <PaymentPlan booking={booking} />
        : type === "receipt" ? <Receipt booking={booking} receiptNumber={receiptNumber ?? ""} />
          : <div className="client-packet"><Confirmation booking={booking} />{booking.paymentPlan && <PaymentPlan booking={booking} />}{booking.consent && <Consent booking={booking} />}</div>;
  return <main className="print-document">{content}<PortalPrintButton /></main>;
}
