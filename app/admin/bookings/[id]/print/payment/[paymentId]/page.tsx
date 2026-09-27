import React from "react";
import { notFound } from "next/navigation";
import { PaymentReceiptDocument } from "@/components/admin/print/BookingClientDocuments";
import { loadAdminPrintData } from "@/lib/server/admin-print-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Payment receipt | Admin", robots: { index: false, follow: false, noarchive: true } };

export default async function PaymentReceiptPage({ params }: { params: { id: string; paymentId: string } }) {
  const booking = await loadAdminPrintData(params.id);
  const exists = booking.paymentPlan?.payments.some((payment: { id: string }) => payment.id === params.paymentId);
  if (!exists) notFound();
  return <main className="print-document"><PaymentReceiptDocument booking={booking} paymentId={params.paymentId} /></main>;
}
