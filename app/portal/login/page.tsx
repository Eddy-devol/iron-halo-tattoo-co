import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ClientPortalLogin from "@/components/portal/ClientPortalLogin";
import { getCurrentClientSession } from "@/lib/server/client-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Client portal sign in", robots: { index: false, follow: false, noarchive: true } };

export default async function ClientPortalLoginPage() {
  if (await getCurrentClientSession()) redirect("/portal");
  return <ClientPortalLogin />;
}
