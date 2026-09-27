import React from "react";
import { ClientPacket } from "@/components/admin/print/BookingClientDocuments";
import { loadAdminPrintData } from "@/lib/server/admin-print-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Client packet | Admin", robots: { index: false, follow: false, noarchive: true } };

export default async function ClientPacketPage({ params }: { params: { id: string } }) {
  const booking = await loadAdminPrintData(params.id);
  return <main className="print-document"><ClientPacket booking={booking} /></main>;
}
