import { describe, expect, it } from "vitest";
import {
  allowedImageTypes,
  extensionForMimeType,
  hasValidImageSignature,
  maxReferenceImageBytes,
  maxReferenceImages,
} from "@/lib/server/storage/image-validation";

describe("reference image validation", () => {
  it("supports only JPEG, PNG, and WebP", () => {
    expect(allowedImageTypes).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("image/png")).toBe("png");
    expect(extensionForMimeType("image/webp")).toBe("webp");
    expect(extensionForMimeType("image/gif")).toBeNull();
  });

  it("validates image signatures independently of MIME labels", () => {
    expect(hasValidImageSignature(Uint8Array.from([0xff, 0xd8, 0xff]), "image/jpeg")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    const webp = new Uint8Array(12);
    webp.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
    expect(hasValidImageSignature(webp, "image/webp")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0, 1, 2]), "image/jpeg")).toBe(false);
    expect(hasValidImageSignature(new Uint8Array(), "image/png")).toBe(false);
  });

  it("keeps upload limits bounded", () => {
    expect(maxReferenceImages).toBe(5);
    expect(maxReferenceImageBytes).toBe(10 * 1024 * 1024);
  });
});
