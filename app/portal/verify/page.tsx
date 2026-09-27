import React from "react";
import type { Metadata } from "next";
import ClientPortalLogin from "@/components/portal/ClientPortalLogin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Secure client portal link", robots: { index: false, follow: false, noarchive: true } };

export default function ClientPortalVerifyPage() {
  return <ClientPortalLogin />;
}
