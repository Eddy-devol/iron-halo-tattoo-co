import { describe, expect, it } from "vitest";
import { resolveStudioContactDetails } from "@/lib/studio-contact";

describe("studio contact details", () => {
  it("omits contact options when configuration is blank", () => {
    expect(resolveStudioContactDetails({ email: "", phone: " ", facebookUrl: "" })).toEqual({});
  });

  it("creates email and telephone links from valid configured values", () => {
    expect(resolveStudioContactDetails({
      email: "studio@example.org",
      phone: "+1 (555) 123-4567",
    })).toEqual({
      email: { label: "studio@example.org", href: "mailto:studio@example.org" },
      phone: { label: "+1 (555) 123-4567", href: "tel:+15551234567" },
    });
  });

  it("accepts HTTPS Facebook and Messenger links only", () => {
    expect(resolveStudioContactDetails({
      facebookUrl: "https://m.me/ironhalo",
    }).facebook).toEqual({
      label: "Facebook / Messenger",
      href: "https://m.me/ironhalo",
    });
    expect(resolveStudioContactDetails({
      facebookUrl: "https://facebook.com.attacker.example/ironhalo",
    }).facebook).toBeUndefined();
    expect(resolveStudioContactDetails({
      facebookUrl: "javascript:alert(1)",
    }).facebook).toBeUndefined();
  });

  it("omits malformed email and phone values", () => {
    expect(resolveStudioContactDetails({
      email: "not-an-email",
      phone: "not-a-phone",
    })).toEqual({});
  });

  it("encodes email URI delimiters while preserving the address separator", () => {
    expect(resolveStudioContactDetails({
      email: "studio#updates@example.org",
    }).email?.href).toBe("mailto:studio%23updates@example.org");
  });
});
