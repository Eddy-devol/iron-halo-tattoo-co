import type { BookingStatus } from "@prisma/client";

export type BookingEmailData = {
  id: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  style: string | null;
  placement: string;
  size: string;
  preferredTimeframe: string | null;
  budget: string | null;
};

export type EmailMessage = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function optional(value: string | null) {
  return value?.trim() || "Not provided";
}

function layout(content: string) {
  return `<div style="background:#171512;color:#f1ede5;font-family:Arial,sans-serif;line-height:1.6;padding:32px"><div style="max-width:620px;margin:0 auto"><p style="letter-spacing:.18em;font-size:12px">IRON HALO TATTOO CO.</p>${content}<p style="border-top:1px solid #514b42;color:#b8b0a4;font-size:12px;margin-top:32px;padding-top:16px">This message concerns a booking request, not a confirmed appointment.</p></div></div>`;
}

export function newBookingAdminEmail(booking: BookingEmailData, adminUrl?: string): EmailMessage {
  const reference = escapeHtml(booking.referenceNumber);
  const name = escapeHtml(booking.fullName);
  const email = escapeHtml(booking.email);
  const phone = escapeHtml(optional(booking.phone));
  const style = escapeHtml(optional(booking.style));
  const placement = escapeHtml(booking.placement);
  const size = escapeHtml(booking.size);
  const timeframe = escapeHtml(optional(booking.preferredTimeframe));
  const budget = escapeHtml(optional(booking.budget));
  const safeAdminUrl = adminUrl ? escapeHtml(adminUrl) : "";
  const link = safeAdminUrl ? `<p><a href="${safeAdminUrl}" style="color:#d49a79">Open booking in admin</a></p>` : "";

  return {
    subject: `New Booking Request — ${booking.referenceNumber}`,
    html: layout(`<h1 style="font-size:24px;font-weight:normal">New booking request received.</h1><p><strong>Reference:</strong> ${reference}</p><p><strong>Client:</strong> ${name}<br><strong>Email:</strong> ${email}<br><strong>Phone:</strong> ${phone}</p><p><strong>Style:</strong> ${style}<br><strong>Placement:</strong> ${placement}<br><strong>Size:</strong> ${size}<br><strong>Preferred timeframe:</strong> ${timeframe}<br><strong>Budget:</strong> ${budget}</p>${link}`),
    text: `IRON HALO TATTOO CO.

New booking request received.

Reference: ${booking.referenceNumber}
Client: ${booking.fullName}
Email: ${booking.email}
Phone: ${optional(booking.phone)}
Style: ${optional(booking.style)}
Placement: ${booking.placement}
Size: ${booking.size}
Preferred timeframe: ${optional(booking.preferredTimeframe)}
Budget: ${optional(booking.budget)}
${adminUrl ? `Open booking in admin: ${adminUrl}` : ""}`,
  };
}

export function bookingReceivedEmail(booking: Pick<BookingEmailData, "referenceNumber">): EmailMessage {
  const reference = escapeHtml(booking.referenceNumber);
  return {
    subject: `Booking Request Received — ${booking.referenceNumber}`,
    html: layout(`<h1 style="font-size:24px;font-weight:normal">Your booking request has been received.</h1><p>Your request is now under review.</p><p><strong>Reference:</strong> ${reference}</p><p>We will review your project and contact you with the next steps. This is not an appointment confirmation; no date, availability, or price has been promised.</p>`),
    text: `IRON HALO TATTOO CO.

Your booking request has been received and is now under review.

Reference: ${booking.referenceNumber}

We will review your project and contact you with the next steps. This is not an appointment confirmation; no date, availability, or price has been promised.`,
  };
}

export function bookingStatusEmail(referenceNumber: string, status: BookingStatus): EmailMessage | null {
  const reference = escapeHtml(referenceNumber);
  const messages: Partial<Record<BookingStatus, { subject: string; heading: string; htmlBody: string; textBody: string }>> = {
    APPROVED: {
      subject: `Booking Request Approved — ${referenceNumber}`,
      heading: "Your booking request has been approved for the next step.",
      htmlBody: "The studio will contact you with the next steps for scheduling. This does not confirm an appointment date or time.",
      textBody: "The studio will contact you with the next steps for scheduling. This does not confirm an appointment date or time.",
    },
    DECLINED: {
      subject: `Booking Request Update — ${referenceNumber}`,
      heading: "Thank you for submitting a booking request to Iron Halo Tattoo Co.",
      htmlBody: "After reviewing the request, we are unable to move forward with this project at this time.",
      textBody: "After reviewing the request, we are unable to move forward with this project at this time.",
    },
    NEEDS_INFORMATION: {
      subject: `Booking Request Update — ${referenceNumber}`,
      heading: "We need a little more information about your booking request.",
      htmlBody: "Please reply to this email or contact the studio so we can continue reviewing your project. Please do not include sensitive information.",
      textBody: "Please reply to this email or contact the studio so we can continue reviewing your project. Please do not include sensitive information.",
    },
  };
  const message = messages[status];
  if (!message) return null;

  return {
    subject: message.subject,
    html: layout(`<h1 style="font-size:24px;font-weight:normal">${escapeHtml(message.heading)}</h1><p><strong>Reference:</strong> ${reference}</p><p>${escapeHtml(message.htmlBody)}</p>`),
    text: `IRON HALO TATTOO CO.

${message.heading}

Reference: ${referenceNumber}

${message.textBody}`,
  };
}
