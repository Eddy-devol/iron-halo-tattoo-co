import { describe, expect, it } from "vitest";
import { bookingReceivedEmail, bookingStatusEmail, newBookingAdminEmail } from "@/lib/server/email/templates";

describe("transactional email templates", () => {
  it("escapes admin email HTML and excludes private fields", () => {
    const email = newBookingAdminEmail({
      id: "00000000-0000-0000-0000-000000000001",
      referenceNumber: "IH-2026-ABC234",
      fullName: "<Synthetic Client>",
      email: "test@example.invalid",
      phone: null,
      style: "blackwork",
      placement: "forearm",
      size: "4 inches",
      preferredTimeframe: null,
      budget: null,
    });
    expect(email.html).toContain("&lt;Synthetic Client&gt;");
    expect(email.html).not.toContain("storageKey");
    expect(email.html).not.toContain("passwordHash");
    expect(email.text).toContain("IH-2026-ABC234");
  });

  it("uses request language for customer confirmation", () => {
    const email = bookingReceivedEmail({ referenceNumber: "IH-2026-ABC234" });
    expect(email.text).toContain("booking request");
    expect(email.text).toContain("not an appointment confirmation");
    expect(email.text).toContain("IH-2026-ABC234");
  });

  it("only creates customer status messages for intended statuses", () => {
    expect(bookingStatusEmail("IH-2026-ABC234", "APPROVED")).not.toBeNull();
    expect(bookingStatusEmail("IH-2026-ABC234", "DECLINED")).not.toBeNull();
    expect(bookingStatusEmail("IH-2026-ABC234", "NEEDS_INFORMATION")).not.toBeNull();
    for (const status of ["PENDING", "REVIEWING", "BOOKED", "COMPLETED", "CANCELLED"] as const) {
      expect(bookingStatusEmail("IH-2026-ABC234", status)).toBeNull();
    }
  });
});
