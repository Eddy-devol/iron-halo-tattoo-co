import React from "react";
import { BookingConfirmationDocument } from "@/components/admin/print/BookingClientDocuments";
import { loadAdminPrintData } from "@/lib/server/admin-print-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Booking confirmation | Admin", robots: { index: false, follow: false, noarchive: true } };

export default async function BookingConfirmationPage({ params }: { params: { id: string } }) {
  const booking = await loadAdminPrintData(params.id);
  return <main className="print-document"><BookingConfirmationDocument booking={booking} /></main>;
}
