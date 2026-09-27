import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClientPortalDocument from "@/components/portal/ClientPortalDocument";
import { requireClientPortalDocument } from "@/lib/server/client-portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Client document", robots: { index: false, follow: false, noarchive: true } };

const documentTypes = ["confirmation", "consent", "payment-plan", "client-packet"] as const;

function isDocumentType(value: string): value is (typeof documentTypes)[number] {
  return documentTypes.some((documentType) => documentType === value);
}

export default async function ClientDocumentPage({ params }: { params: { document: string } }) {
  if (!isDocumentType(params.document)) notFound();
  const type = params.document;
  const booking = await requireClientPortalDocument(type);
  return <ClientPortalDocument type={type} booking={booking} />;
}
