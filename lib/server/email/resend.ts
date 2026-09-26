import "server-only";

import { Resend } from "resend";
import type { BookingStatus } from "@prisma/client";
import { bookingReceivedEmail, bookingStatusEmail, newBookingAdminEmail, type BookingEmailData } from "./templates";

type RecipientCategory = "customer" | "admin";

class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

function config() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new EmailConfigurationError("Email service is not configured.");
  return { apiKey, from, replyTo: process.env.EMAIL_REPLY_TO?.trim() || undefined };
}

function errorCategory(error: unknown) {
  return error instanceof EmailConfigurationError ? "configuration" : "provider";
}

async function send(message: { to: string; category: RecipientCategory; type: string; referenceNumber: string; subject: string; html: string; text: string }) {
  console.info("EMAIL_SEND_ATTEMPTED", { type: message.type, referenceNumber: message.referenceNumber, recipientCategory: message.category });
  try {
    const emailConfig = config();
    const result = await new Resend(emailConfig.apiKey).emails.send({
      from: emailConfig.from,
      to: message.to,
      replyTo: emailConfig.replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (result.error) throw new Error("Email provider rejected the request.");
    console.info("EMAIL_SENT", { type: message.type, referenceNumber: message.referenceNumber, recipientCategory: message.category });
  } catch (error) {
    console.error("EMAIL_SEND_FAILED", { type: message.type, referenceNumber: message.referenceNumber, recipientCategory: message.category, errorCategory: errorCategory(error) });
  }
}

function adminUrl(bookingId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) return undefined;
  try {
    return new URL(`/admin/bookings/${encodeURIComponent(bookingId)}`, siteUrl).toString();
  } catch {
    return undefined;
  }
}

export async function sendNewBookingNotifications(booking: BookingEmailData) {
  const adminRecipient = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  const messages = [];
  if (adminRecipient) {
    const message = newBookingAdminEmail(booking, adminUrl(booking.id));
    messages.push(send({ ...message, to: adminRecipient, category: "admin", type: "new_booking_admin", referenceNumber: booking.referenceNumber }));
  } else {
    console.error("EMAIL_SEND_FAILED", { type: "new_booking_admin", referenceNumber: booking.referenceNumber, recipientCategory: "admin", errorCategory: "configuration" });
  }
  const customerMessage = bookingReceivedEmail(booking);
  messages.push(send({ ...customerMessage, to: booking.email, category: "customer", type: "booking_received", referenceNumber: booking.referenceNumber }));
  await Promise.all(messages);
}

export async function sendBookingStatusNotification(booking: Pick<BookingEmailData, "email" | "referenceNumber">, status: BookingStatus) {
  const message = bookingStatusEmail(booking.referenceNumber, status);
  if (!message) return;
  await send({ ...message, to: booking.email, category: "customer", type: `booking_status_${status.toLowerCase()}`, referenceNumber: booking.referenceNumber });
}
