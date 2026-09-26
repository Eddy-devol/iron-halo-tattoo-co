import { z } from "zod";

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(max).optional(),
);

export const bookingRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(320),
  phone: optionalText(40),
  description: z.string().trim().min(20).max(3000),
  style: optionalText(120),
  placement: z.string().trim().min(2).max(120),
  size: z.string().trim().min(1).max(80),
  colorPreference: optionalText(80),
  preferredTimeframe: optionalText(120),
  budget: optionalText(120),
  additionalNotes: optionalText(3000),
  consent: z.literal("on"),
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
