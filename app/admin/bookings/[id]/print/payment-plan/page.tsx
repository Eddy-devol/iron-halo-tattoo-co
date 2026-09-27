import React from "react";
import { notFound } from "next/navigation";
import { PaymentPlanDocument } from "@/components/admin/print/BookingClientDocuments";
import { loadAdminPrintData } from "@/lib/server/admin-print-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Tattoo payment plan | Admin", robots: { index: false, follow: false, noarchive: true } };

export default async function PaymentPlanPage({ params }: { params: { id: string } }) {
  const booking = await loadAdminPrintData(params.id);
  if (!booking.paymentPlan) notFound();
  return <main className="print-document"><PaymentPlanDocument booking={booking} /></main>;
}
