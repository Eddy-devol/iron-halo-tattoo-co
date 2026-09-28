import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieState, uploadObject, deleteObject, readObject } = vi.hoisted(() => ({
  cookieState: { token: undefined as string | undefined },
  uploadObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  readObject: vi.fn(async () => Uint8Array.from([0xff, 0xd8, 0xff, 0x00])),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => cookieState.token ? { value: cookieState.token } : undefined,
  }),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/server/storage/s3", () => ({
  uploadPrivateObject: uploadObject,
  deletePrivateObject: deleteObject,
  readPrivateObject: readObject,
  createSignedReadUrl: vi.fn(),
}));

vi.mock("@/lib/server/security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/security")>();
  return {
    ...actual,
    enforceRateLimit: vi.fn(async () => ({ allowed: true as const })),
  };
});

import { POST as createArtist, GET as listAdminArtists } from "@/app/api/admin/artists/route";
import {
  DELETE as deleteArtist,
  GET as getAdminArtist,
  PATCH as updateArtist,
} from "@/app/api/admin/artists/[id]/route";
import { GET as getAdminImage } from "@/app/api/admin/artists/[id]/image/route";
import { GET as publicArtists } from "@/app/api/artists/route";
import { GET as publicArtistImage } from "@/app/api/artists/[slug]/image/route";
import { maxReferenceImageBytes } from "@/lib/server/storage/image-validation";

const prisma = new PrismaClient();
const origin = "https://staging.example.test";
const prefix = `phase4d-${randomUUID()}`;
const sessionToken = `synthetic-session-${randomUUID()}`;
let adminId: string;

function artistForm(options: {
  name?: string;
  role?: string;
  image?: File;
  published?: boolean;
  displayOrder?: number;
} = {}) {
  const form = new FormData();
  form.set("name", options.name ?? `${prefix} artist`);
  form.set("role", options.role ?? "Tattoo artist");
  form.set("bio", "Synthetic test profile, not a real artist.");
  form.set("specialties", "Synthetic linework, blackwork");
  form.set("instagramUrl", "https://www.instagram.com/synthetic.artist/");
  form.set("displayOrder", String(options.displayOrder ?? 0));
  form.set("published", String(options.published ?? false));
  form.set("removeImage", "false");
  if (options.image) form.set("image", options.image);
  return form;
}

function jpeg(name = "synthetic.jpg") {
  return new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], name, { type: "image/jpeg" });
}

function mutation(url: string, method: "POST" | "PATCH" | "DELETE", body?: BodyInit, originHeader = origin) {
  const headers = new Headers({ Origin: originHeader });
  if (body && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
  return new Request(url, { method, headers, body });
}

beforeAll(async () => {
  const databaseRows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  expect(databaseRows[0].current_database).toBe("iron_halo_test");
  process.env.NEXT_PUBLIC_SITE_URL = origin;
  adminId = (await prisma.user.create({
    data: { email: `${prefix}-admin@example.test`, name: "Synthetic Artist Admin", role: "ADMIN" },
    select: { id: true },
  })).id;
  await prisma.session.create({
    data: {
      tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
      userId: adminId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
});

beforeEach(() => {
  cookieState.token = undefined;
  vi.clearAllMocks();
});

afterEach(async () => {
  const artists = await prisma.artist.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true },
  });
  if (artists.length) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Artist", entityId: { in: artists.map(({ id }) => id) } },
    });
  }
  await prisma.artist.deleteMany({ where: { name: { startsWith: prefix } } });
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: adminId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe("Artist profile routes against isolated PostgreSQL", () => {
  it("requires an authenticated admin and rejects cross-origin changes", async () => {
    expect((await listAdminArtists()).status).toBe(401);
    const unauthenticated = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: jpeg() }),
    ));
    expect(unauthenticated.status).toBe(401);

    cookieState.token = sessionToken;
    const crossOrigin = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: jpeg() }),
      "https://staging.example.test.attacker.invalid",
    ));
    expect(crossOrigin.status).toBe(403);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("creates private artist profiles and does not expose storage metadata", async () => {
    cookieState.token = sessionToken;
    const response = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: jpeg(), name: `${prefix} created` }),
    ));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.artist).toMatchObject({
      name: `${prefix} created`,
      role: "Tattoo artist",
      published: false,
      imageUrl: expect.stringMatching(/^\/api\/admin\/artists\/.+\/image$/),
    });
    expect(payload.artist).not.toHaveProperty("imageKey");
    const [key] = uploadObject.mock.calls[0];
    expect(key).toMatch(/^artist-profiles\/[0-9a-f-]+\.jpg$/);
    expect(key).not.toContain("synthetic.jpg");
    expect(await prisma.artist.findUnique({ where: { id: payload.artist.id } })).toMatchObject({
      imageKey: key,
      imageContentType: "image/jpeg",
      published: false,
    });
    expect((await listAdminArtists()).status).toBe(200);
  });

  it("rejects unsupported, signature-invalid, oversized images and invalid fields", async () => {
    cookieState.token = sessionToken;
    const unsupported = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: new File(["gif"], "portrait.gif", { type: "image/gif" }) }),
    ));
    expect(unsupported.status).toBe(400);

    const invalidSignature = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: new File(["not an image"], "portrait.jpg", { type: "image/jpeg" }) }),
    ));
    expect(invalidSignature.status).toBe(400);

    const oversized = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: new File([new Uint8Array(maxReferenceImageBytes + 1)], "large.jpg", { type: "image/jpeg" }) }),
    ));
    expect(oversized.status).toBe(400);

    const invalidUrlForm = artistForm({ image: jpeg() });
    invalidUrlForm.set("instagramUrl", "http://localhost/internal");
    const invalidUrl = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      invalidUrlForm,
    ));
    expect(invalidUrl.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("publishes only intended profiles and sanitizes the public response", async () => {
    cookieState.token = sessionToken;
    const hiddenResponse = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: jpeg(), name: `${prefix} hidden` }),
    ));
    const hidden = (await hiddenResponse.json()).artist;
    const shownResponse = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: jpeg(), name: `${prefix} shown`, displayOrder: 3 }),
    ));
    const shown = (await shownResponse.json()).artist;
    expect((await updateArtist(mutation(
      `https://staging.example.test/api/admin/artists/${shown.id}`,
      "PATCH",
      JSON.stringify({ published: true }),
    ), { params: { id: shown.id } })).status).toBe(200);

    const response = await publicArtists();
    const payload = await response.json();
    const visible = payload.artists.filter((artist: { name: string }) => artist.name.startsWith(prefix));
    expect(visible.map((artist: { name: string }) => artist.name)).toEqual([`${prefix} shown`]);
    expect(visible[0]).toMatchObject({
      slug: shown.slug,
      imageUrl: `/api/artists/${shown.slug}/image`,
      imageAlt: `${prefix} shown — Tattoo artist`,
    });
    expect(JSON.stringify(visible)).not.toContain(shown.id);
    expect(JSON.stringify(visible)).not.toContain("imageKey");
    expect(JSON.stringify(visible)).not.toContain("artist-profiles/");
    expect(hidden.published).toBe(false);
  });

  it("replaces private images after profile update and serves them only to authorized/public profiles", async () => {
    cookieState.token = sessionToken;
    const response = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: jpeg(), name: `${prefix} replacement` }),
    ));
    const { artist } = await response.json();
    const prior = await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } });
    const replacementForm = artistForm({
      image: jpeg("replacement.jpg"),
      name: `${prefix} replaced`,
      published: true,
    });
    const updated = await updateArtist(mutation(
      `https://staging.example.test/api/admin/artists/${artist.id}`,
      "PATCH",
      replacementForm,
    ), { params: { id: artist.id } });
    expect(updated.status).toBe(200);
    const saved = await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } });
    expect(saved).toMatchObject({ name: `${prefix} replaced`, published: true });
    expect(saved.imageKey).not.toBe(prior.imageKey);
    expect(deleteObject).toHaveBeenCalledWith(prior.imageKey);

    const publicImage = await publicArtistImage(new Request(`https://staging.example.test/api/artists/${artist.slug}/image`), {
      params: { slug: artist.slug },
    });
    expect(publicImage.status).toBe(200);
    expect(publicImage.headers.get("content-type")).toBe("image/jpeg");
    expect(publicImage.headers.get("x-content-type-options")).toBe("nosniff");
    expect(readObject).toHaveBeenCalledWith(saved.imageKey);

    cookieState.token = undefined;
    expect((await getAdminImage(new Request(`https://staging.example.test/api/admin/artists/${artist.id}/image`), {
      params: { id: artist.id },
    })).status).toBe(401);
    cookieState.token = sessionToken;
    expect((await getAdminImage(new Request(`https://staging.example.test/api/admin/artists/${artist.id}/image`), {
      params: { id: artist.id },
    })).status).toBe(200);
  });

  it("keeps draft images private, supports image removal, and deletes profile images", async () => {
    cookieState.token = sessionToken;
    const response = await createArtist(mutation(
      "https://staging.example.test/api/admin/artists",
      "POST",
      artistForm({ image: jpeg(), name: `${prefix} cleanup` }),
    ));
    const { artist } = await response.json();
    const record = await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } });
    expect((await publicArtistImage(new Request(`https://staging.example.test/api/artists/${artist.slug}/image`), {
      params: { slug: artist.slug },
    })).status).toBe(404);

    const removeForm = new FormData();
    removeForm.set("removeImage", "true");
    const removed = await updateArtist(mutation(
      `https://staging.example.test/api/admin/artists/${artist.id}`,
      "PATCH",
      removeForm,
    ), { params: { id: artist.id } });
    expect(removed.status).toBe(200);
    expect(await prisma.artist.findUniqueOrThrow({ where: { id: artist.id } })).toMatchObject({
      imageKey: null,
      imageContentType: null,
    });
    expect(deleteObject).toHaveBeenCalledWith(record.imageKey);

    const deleted = await deleteArtist(new Request(
      `https://staging.example.test/api/admin/artists/${artist.id}`,
      { method: "DELETE", headers: { Origin: origin } },
    ), { params: { id: artist.id } });
    expect(deleted.status).toBe(200);
    expect(await prisma.artist.findUnique({ where: { id: artist.id } })).toBeNull();
  });
});
