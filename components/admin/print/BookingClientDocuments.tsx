import React from "react";
import type { BookingDocumentData } from "@/lib/server/admin-print-data";
import {
  consentDraftText,
  getConsentText,
  getPaymentPlanAgreementText,
  paymentPlanDraftText,
} from "@/lib/server/booking-documents";
import PrintButton from "@/components/admin/print/PrintButton";

function shown(value: string | null | undefined) {
  return value?.trim() || "Not provided";
}

function displayDate(value: string | Date | null | undefined) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

function displayDateTime(value: string | Date | null | undefined) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function money(amount: string, currency: string) {
  const [whole, fraction = "00"] = amount.split(".");
  return `${currency} ${whole}.${fraction.padEnd(2, "0")}`;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="document-field">
      <dt>{label}</dt>
      <dd>{shown(value)}</dd>
    </div>
  );
}

function DocumentHeader({ title, booking }: { title: string; booking: BookingDocumentData }) {
  return (
    <header className="document-header">
      <p className="document-brand">IRON HALO TATTOO CO.</p>
      <h1>{title}</h1>
      <p>Booking reference: <strong>{booking.referenceNumber}</strong></p>
    </header>
  );
}

export function BookingConfirmationDocument({ booking }: { booking: BookingDocumentData }) {
  const plan = booking.paymentPlan;
  const appointment = booking.appointments[0];
  return (
    <section className="document-page">
      <DocumentHeader title="Booking Confirmation" booking={booking} />
      <section className="document-section">
        <h2>Booking information</h2>
        <dl className="document-grid">
          <Field label="Status" value={booking.status.replaceAll("_", " ")} />
          <Field label="Request date" value={displayDate(booking.createdAt)} />
          <Field label="Appointment" value={appointment ? `${displayDateTime(appointment.startAt)} – ${displayDateTime(appointment.endAt)}` : null} />
          <Field label="Artist" value={booking.artistName} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Client information</h2>
        <dl className="document-grid">
          <Field label="Name" value={booking.consentRecord?.legalName || booking.fullName} />
          <Field label="Email" value={booking.email} />
          <Field label="Phone" value={booking.phone} />
          <Field label="Address" value={booking.consentRecord?.addressLine1} />
          <Field label="City" value={booking.consentRecord?.city} />
          <Field label="State / ZIP" value={[booking.consentRecord?.state, booking.consentRecord?.postalCode].filter(Boolean).join(" ") || null} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Tattoo information</h2>
        <dl className="document-grid">
          <Field label="Description" value={booking.description} />
          <Field label="Style" value={booking.style} />
          <Field label="Placement" value={booking.placement} />
          <Field label="Approximate size" value={booking.size} />
          <Field label="Color preference" value={booking.colorPreference} />
          <Field label="Preferred timeframe" value={booking.preferredTimeframe} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Payment summary</h2>
        {plan ? (
          <dl className="document-grid">
            <Field label="Total price" value={money(plan.totalAmount, plan.currency)} />
            <Field label="Amount paid" value={money(plan.amountPaid, plan.currency)} />
            <Field label="Remaining balance" value={money(plan.remainingBalance, plan.currency)} />
            <Field label="Payment status" value={plan.status.replaceAll("_", " ")} />
          </dl>
        ) : <p>No payment plan recorded.</p>}
      </section>
      <PrintButton />
    </section>
  );
}

export function TattooConsentDocument({ booking }: { booking: BookingDocumentData }) {
  const consent = booking.consentRecord;
  const configuredConsent = consent?.consentTextSnapshot || getConsentText();
  const approvedText = configuredConsent || consentDraftText;
  return (
    <section className="document-page">
      <DocumentHeader title="Tattoo Procedure Consent" booking={booking} />
      <p className="document-notice">
        Studio document for review; this is not represented as an official Texas DSHS form.
      </p>
      {!configuredConsent && <p className="document-notice"><strong>Draft only:</strong> final wording requires studio and qualified counsel approval before client use.</p>}
      <section className="document-section">
        <h2>Client information</h2>
        <dl className="document-grid">
          <Field label="Legal name" value={consent?.legalName || booking.fullName} />
          <Field label="Date of birth" value={displayDate(consent?.dateOfBirth)} />
          <Field label="Address" value={consent?.addressLine1} />
          <Field label="City" value={consent?.city} />
          <Field label="State" value={consent?.state} />
          <Field label="ZIP" value={consent?.postalCode} />
          <Field label="Phone" value={booking.phone} />
          <Field label="Email" value={booking.email} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Identification record</h2>
        <dl className="document-grid">
          <Field label="Government ID type" value={consent?.governmentIdType} />
          <Field label="ID reference (last four only)" value={consent?.governmentIdLastFour ? `•••• ${consent.governmentIdLastFour}` : null} />
          <Field label="Verified by" value={consent?.verifiedByName} />
          <Field label="Verification date" value={consent?.identificationVerifiedAt ? displayDate(consent.identificationVerifiedAt) : "Not recorded"} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Tattoo information</h2>
        <dl className="document-grid">
          <Field label="Design description" value={booking.description} />
          <Field label="Placement" value={booking.placement} />
          <Field label="Approximate size" value={booking.size} />
          <Field label="Artist / tattooer" value={booking.artistName} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Consent and acknowledgment</h2>
        {approvedText ? (
          <div className="document-copy">{approvedText.split(/\r?\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        ) : (
          <p className="document-notice">
            Consent wording is not configured. The studio must supply and review final consent text with qualified counsel before this form is used for client signature. Topics for review include procedure, potential risks, aftercare, permanence, and client responsibility.
          </p>
        )}
      </section>
      <section className="document-section">
        <h2>Signatures</h2>
        <div className="signature-grid">
          <p>Client signature <span /></p><p>Date <span /></p>
          <p>Artist / tattooer <span /></p><p>Date <span /></p>
        </div>
      </section>
      <p className="document-footnote">Physical signatures are required. Printing this document does not record completion.</p>
      <PrintButton />
    </section>
  );
}

export function PaymentPlanDocument({ booking }: { booking: BookingDocumentData }) {
  const plan = booking.paymentPlan;
  if (!plan) return null;
  const configuredAgreement = getPaymentPlanAgreementText();
  const agreement = configuredAgreement || paymentPlanDraftText;
  const finalDue = plan.installments.at(-1)?.dueDate;
  return (
    <section className="document-page">
      <DocumentHeader title="Tattoo Installment Payment Plan" booking={booking} />
      <section className="document-section">
        <h2>Client details</h2>
        <dl className="document-grid">
          <Field label="Name" value={booking.consentRecord?.legalName || booking.fullName} />
          <Field label="Booking reference" value={booking.referenceNumber} />
          <Field label="Email" value={booking.email} />
          <Field label="Phone" value={booking.phone} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Tattoo details</h2>
        <dl className="document-grid">
          <Field label="Description" value={booking.description} />
          <Field label="Placement" value={booking.placement} />
          <Field label="Artist" value={booking.artistName} />
          <Field label="Estimated price" value={money(plan.totalAmount, plan.currency)} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Payment plan</h2>
        <table className="document-table">
          <thead><tr><th>Installment</th><th>Due date</th><th>Amount</th><th>Paid</th><th>Date paid</th></tr></thead>
          <tbody>{plan.installments.map((installment) => (
            <tr key={installment.id}>
              <td>{installment.installmentNumber}</td>
              <td>{displayDate(installment.dueDate)}</td>
              <td>{money(installment.amount, plan.currency)}</td>
              <td>{money(installment.amountPaid, plan.currency)}</td>
              <td>{displayDate(installment.lastPaidAt)}</td>
            </tr>
          ))}</tbody>
        </table>
        <dl className="document-grid document-totals">
          <Field label="Total price" value={money(plan.totalAmount, plan.currency)} />
          <Field label="Total paid" value={money(plan.amountPaid, plan.currency)} />
          <Field label="Remaining balance" value={money(plan.remainingBalance, plan.currency)} />
          <Field label="Final payment due" value={displayDate(finalDue)} />
        </dl>
      </section>
      <section className="document-section">
        <h2>Agreement</h2>
        {!configuredAgreement && <p className="document-notice"><strong>Draft only:</strong> final payment terms require studio review before client use.</p>}
        {agreement ? (
          <div className="document-copy">{agreement.split(/\r?\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        ) : (
          <p className="document-notice">
            Studio payment-plan wording is not configured. The studio must review and supply its final policy language before using this agreement for signature.
          </p>
        )}
        <div className="signature-grid">
          <p>Client signature <span /></p><p>Date <span /></p>
          <p>Studio representative <span /></p><p>Date <span /></p>
        </div>
      </section>
      <PrintButton />
    </section>
  );
}

export function PaymentReceiptDocument({
  booking,
  paymentId,
}: {
  booking: BookingDocumentData;
  paymentId: string;
}) {
  const plan = booking.paymentPlan;
  const payment = plan?.payments.find(({ id }) => id === paymentId);
  if (!plan || !payment) return null;
  return (
    <section className="document-page">
      <DocumentHeader title="Payment Receipt" booking={booking} />
      <p className="document-notice">Manually recorded payment; no payment processor was used.</p>
      <section className="document-section">
        <h2>Receipt details</h2>
        <dl className="document-grid">
          <Field label="Receipt / reference number" value={payment.receiptNumber} />
          <Field label="Booking reference" value={booking.referenceNumber} />
          <Field label="Client" value={booking.consentRecord?.legalName || booking.fullName} />
          <Field label="Payment date" value={displayDate(payment.paidAt)} />
          <Field label="Payment method" value={payment.method.replaceAll("_", " ")} />
          <Field label="Amount paid" value={money(payment.amount, payment.currency)} />
          <Field label="Payment-plan total" value={money(plan.totalAmount, plan.currency)} />
          <Field label="Remaining balance after payment" value={money(payment.balanceAfter, payment.currency)} />
        </dl>
      </section>
      <PrintButton />
    </section>
  );
}

export function ClientPacket({ booking }: { booking: BookingDocumentData }) {
  return (
    <div className="client-packet" aria-label="Client Packet">
      <BookingConfirmationDocument booking={booking} />
      {booking.paymentPlan && <PaymentPlanDocument booking={booking} />}
      <TattooConsentDocument booking={booking} />
    </div>
  );
}

export function PrintDocumentUnavailable() {
  return <main className="print-document"><p>Document unavailable. Return to the booking and try again.</p></main>;
}
