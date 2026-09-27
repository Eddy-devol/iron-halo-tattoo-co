import React from "react";
import type { Metadata } from "next";
import ClientPortalDashboard from "@/components/portal/ClientPortalDashboard";
import { requireClientPortalBooking } from "@/lib/server/client-portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your client portal", robots: { index: false, follow: false, noarchive: true } };

export default async function ClientPortalPage() {
  const booking = await requireClientPortalBooking();
  return <ClientPortalDashboard booking={booking} />;
}
