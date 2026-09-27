import React from "react";
import type { Metadata } from "next";
import ClientPortalDocument from "@/components/portal/ClientPortalDocument";
import { requireClientPortalDocument } from "@/lib/server/client-portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment receipt", robots: { index: false, follow: false, noarchive: true } };

export default async function ClientReceiptPage({ params }: { params: { receiptNumber: string } }) {
  const booking = await requireClientPortalDocument("receipt", params.receiptNumber);
  return <ClientPortalDocument type="receipt" booking={booking} receiptNumber={params.receiptNumber} />;
}
