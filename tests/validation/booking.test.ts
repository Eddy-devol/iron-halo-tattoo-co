import { describe, expect, it } from "vitest";
import { bookingRequestSchema } from "@/lib/validation/booking";

const validBooking = {
  fullName: "Synthetic Test Client",
  email: "test@example.invalid",
  phone: "555-0100",
  description: "A synthetic tattoo concept with enough detail for validation.",
  style: "blackwork",
  placement: "left forearm",
  size: "4 inches",
  colorPreference: "Black & grey",
  preferredTimeframe: "Spring",
  budget: "$500",
  additionalNotes: "Synthetic test note.",
  consent: "on",
};

describe("booking validation", () => {
  it("accepts a complete valid booking", () => {
    expect(bookingRequestSchema.safeParse(validBooking).success).toBe(true);
  });

  it("rejects invalid required fields and consent", () => {
    expect(bookingRequestSchema.safeParse({ ...validBooking, fullName: "A" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...validBooking, email: "bad" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...validBooking, description: "too short" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...validBooking, consent: "yes" }).success).toBe(false);
  });

  it("normalizes blank optional fields", () => {
    const result = bookingRequestSchema.parse({ ...validBooking, phone: "  ", style: "" });
    expect(result.phone).toBeUndefined();
    expect(result.style).toBeUndefined();
  });

  it("enforces field limits", () => {
    expect(bookingRequestSchema.safeParse({ ...validBooking, description: "x".repeat(3001) }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...validBooking, email: `${"x".repeat(320)}@example.invalid` }).success).toBe(false);
  });
});
