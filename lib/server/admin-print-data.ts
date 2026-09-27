import "server-only";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/server/auth";
import { getBookingDocuments, type BookingDocumentData } from "@/lib/server/booking-documents";
import { safeErrorCategory } from "@/lib/server/safe-error-category";

const idSchema = z.string().uuid();

export async function loadAdminPrintData(bookingId: string): Promise<BookingDocumentData> {
  if (!(await getCurrentAdmin())) redirect("/admin/login");
  if (!idSchema.safeParse(bookingId).success) notFound();
  let booking: BookingDocumentData | null;
  try {
    booking = await getBookingDocuments(bookingId);
  } catch (error) {
    console.error("ADMIN_PRINT_DOCUMENT_LOAD_FAILED", {
      errorCategory: safeErrorCategory(error),
      bookingId,
    });
    throw new Error("Unable to load this document.");
  }
  if (!booking) notFound();
  return booking;
}

export type { BookingDocumentData };
