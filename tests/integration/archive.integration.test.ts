import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieState, uploadObject, deleteObject, readObject } = vi.hoisted(() => ({
  cookieState: { token: undefined as string | undefined },
  uploadObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  readObject: vi.fn(async () => Uint8Array.from([0xff, 0xd8, 0xff])),
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

import { POST as createArtwork, GET as listAdminArtwork } from "@/app/api/admin/archive/route";
import {
  DELETE as deleteArtwork,
  GET as getAdminArtwork,
  PATCH as updateArtwork,
} from "@/app/api/admin/archive/[id]/route";
import { GET as getAdminImage } from "@/app/api/admin/archive/[id]/image/route";
import { GET as publicArchive } from "@/app/api/archive/route";
import { GET as publicArtworkImage } from "@/app/api/archive/[slug]/image/route";
import { maxReferenceImageBytes } from "@/lib/server/storage/image-validation";

const prisma = new PrismaClient();
const origin = "https://staging.example.test";
const prefix = `phase3a-${randomUUID()}`;
const sessionToken = `synthetic-session-${randomUUID()}`;
let adminId: string;

function artworkForm(options: {
  title?: string;
  image?: File;
  featured?: boolean;
  published?: boolean;
  sortOrder?: number;
  description?: string;
} = {}) {
  const form = new FormData();
  form.set("title", options.title ?? `${prefix} synthetic artwork`);
  form.set("description", options.description ?? "");
  form.set("style", "Synthetic linework");
  form.set("altText", "Synthetic test artwork");
  form.set("featured", String(options.featured ?? false));
  form.set("published", String(options.published ?? false));
  form.set("sortOrder", String(options.sortOrder ?? 0));
  if (options.image) form.set("image", options.image);
  return form;
}

function jpeg(name = "synthetic.jpg") {
  return new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], name, { type: "image/jpeg" });
}

function mutation(url: string, body?: BodyInit, originHeader = origin) {
  return new Request(url, {
    method: url.endsWith("/archive") ? "POST" : "PATCH",
    headers: { Origin: originHeader },
    body,
  });
}

async function createPublishedArtwork(title: string, options: { featured?: boolean; sortOrder?: number } = {}) {
  return prisma.archiveArtwork.create({
    data: {
      title,
      slug: `${prefix}-${randomUUID().slice(0, 8)}`,
      altText: title,
      storageKey: `archive-artwork/${randomUUID()}.jpg`,
      contentType: "image/jpeg",
      published: true,
      featured: options.featured ?? false,
      sortOrder: options.sortOrder ?? 0,
    },
  });
}

beforeAll(async () => {
  const databaseRows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  expect(databaseRows[0].current_database).toBe("iron_halo_test");
  process.env.NEXT_PUBLIC_SITE_URL = origin;
  adminId = (await prisma.user.create({
    data: { email: `${prefix}-admin@example.test`, name: "Synthetic Archive Admin", role: "ADMIN" },
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
  const records = await prisma.archiveArtwork.findMany({
    where: { title: { startsWith: prefix } },
    select: { id: true, storageKey: true },
  });
  if (records.length) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "ArchiveArtwork", entityId: { in: records.map(({ id }) => id) } },
    });
    await prisma.archiveArtwork.deleteMany({ where: { id: { in: records.map(({ id }) => id) } } });
  }
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: adminId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe("Archive routes against isolated PostgreSQL", () => {
  it("rejects unauthenticated archive admin requests", async () => {
    expect((await listAdminArtwork()).status).toBe(401);
    const response = await createArtwork(mutation("https://staging.example.test/api/admin/archive", artworkForm({ image: jpeg() })));
    expect(response.status).toBe(401);
  });

  it("creates artwork with validated image and keeps storage metadata private", async () => {
    cookieState.token = sessionToken;
    const response = await createArtwork(mutation(
      "https://staging.example.test/api/admin/archive",
      artworkForm({ image: jpeg(), title: `${prefix} created` }),
    ));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.artwork).toMatchObject({ title: `${prefix} created`, published: false });
    expect(payload.artwork).not.toHaveProperty("storageKey");
    expect(uploadObject).toHaveBeenCalledOnce();
    const [key] = uploadObject.mock.calls[0];
    expect(key).toMatch(/^archive-artwork\/[0-9a-f-]+\.jpg$/);
    expect(key).not.toContain("synthetic.jpg");
    expect(await prisma.archiveArtwork.findUnique({ where: { id: payload.artwork.id } })).toMatchObject({
      contentType: "image/jpeg",
      storageKey: key,
      altText: "Synthetic test artwork",
    });

    const listResponse = await listAdminArtwork();
    expect(listResponse.status).toBe(200);
    expect(await listResponse.text()).not.toContain("storageKey");
  });

  it("rejects unsupported, signature-invalid, and oversized images", async () => {
    cookieState.token = sessionToken;
    const oversizedRequest = await createArtwork(new Request(
      "https://staging.example.test/api/admin/archive",
      {
        method: "POST",
        headers: { Origin: origin, "Content-Length": String(11 * 1024 * 1024 + 1) },
      },
    ));
    expect(oversizedRequest.status).toBe(413);

    const unsupported = await createArtwork(mutation(
      "https://staging.example.test/api/admin/archive",
      artworkForm({ image: new File(["gif"], "art.gif", { type: "image/gif" }) }),
    ));
    expect(unsupported.status).toBe(400);

    const badSignature = await createArtwork(mutation(
      "https://staging.example.test/api/admin/archive",
      artworkForm({ image: new File(["not an image"], "art.jpg", { type: "image/jpeg" }) }),
    ));
    expect(badSignature.status).toBe(400);

    const oversizedImage = new File([new Uint8Array(maxReferenceImageBytes + 1)], "large.jpg", { type: "image/jpeg" });
    const oversized = await createArtwork(mutation(
      "https://staging.example.test/api/admin/archive",
      artworkForm({ image: oversizedImage }),
    ));
    expect(oversized.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("enforces exact origin protection for mutations", async () => {
    cookieState.token = sessionToken;
    const response = await createArtwork(mutation(
      "https://staging.example.test/api/admin/archive",
      artworkForm({ image: jpeg() }),
      "https://staging.example.test.attacker.invalid",
    ));
    expect(response.status).toBe(403);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("does not expose unpublished artwork and orders published work featured, sort order, newest", async () => {
    const hidden = await prisma.archiveArtwork.create({
      data: {
        title: `${prefix} unpublished`,
        slug: `${prefix}-hidden`,
        altText: "Hidden artwork",
        storageKey: `archive-artwork/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        published: false,
      },
    });
    const regularLate = await createPublishedArtwork(`${prefix} regular late`, { sortOrder: 5 });
    const featuredLate = await createPublishedArtwork(`${prefix} featured late`, { featured: true, sortOrder: 5 });
    const featuredEarly = await createPublishedArtwork(`${prefix} featured early`, { featured: true, sortOrder: 1 });
    const regularEarly = await createPublishedArtwork(`${prefix} regular early`, { sortOrder: 1 });

    const response = await publicArchive();
    const payload = await response.json();
    const visible = payload.artworks.filter((item: { title: string }) => item.title.startsWith(prefix));
    expect(visible.map((item: { title: string }) => item.title)).toEqual([
      featuredEarly.title,
      featuredLate.title,
      regularEarly.title,
      regularLate.title,
    ]);
    expect(visible.some((item: { title: string }) => item.title === hidden.title)).toBe(false);
    expect(JSON.stringify(visible)).not.toContain(hidden.storageKey);
    expect(JSON.stringify(visible)).not.toContain(regularEarly.id);
  });

  it("updates artwork and deletes the previous image only after database update", async () => {
    cookieState.token = sessionToken;
    const createdResponse = await createArtwork(mutation(
      "https://staging.example.test/api/admin/archive",
      artworkForm({ image: jpeg(), title: `${prefix} replace`, description: "Initial description" }),
    ));
    const created = await createdResponse.json();
    const previous = await prisma.archiveArtwork.findUniqueOrThrow({ where: { id: created.artwork.id } });
    vi.clearAllMocks();

    const form = new FormData();
    form.set("title", `${prefix} replaced`);
    form.set("description", "");
    form.set("published", "true");
    form.set("image", jpeg("new-name.jpg"));
    const response = await updateArtwork(mutation(
      `https://staging.example.test/api/admin/archive/${created.artwork.id}`,
      form,
    ), { params: { id: created.artwork.id } });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.artwork).toMatchObject({ title: `${prefix} replaced`, published: true });
    const updated = await prisma.archiveArtwork.findUniqueOrThrow({ where: { id: created.artwork.id } });
    expect(updated.storageKey).not.toBe(previous.storageKey);
    expect(updated.description).toBeNull();
    expect(uploadObject).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledWith(previous.storageKey);
  });

  it("deletes artwork and its private object", async () => {
    cookieState.token = sessionToken;
    const createdResponse = await createArtwork(mutation(
      "https://staging.example.test/api/admin/archive",
      artworkForm({ image: jpeg(), title: `${prefix} delete` }),
    ));
    const created = await createdResponse.json();
    const record = await prisma.archiveArtwork.findUniqueOrThrow({ where: { id: created.artwork.id } });

    const response = await deleteArtwork(
      new Request(`https://staging.example.test/api/admin/archive/${record.id}`, { method: "DELETE", headers: { Origin: origin } }),
      { params: { id: record.id } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, cleanupPending: false });
    expect(await prisma.archiveArtwork.findUnique({ where: { id: record.id } })).toBeNull();
    expect(deleteObject).toHaveBeenCalledWith(record.storageKey);
  });

  it("serves public images only for published artwork and blocks invalid identifiers", async () => {
    const hidden = await prisma.archiveArtwork.create({
      data: {
        title: `${prefix} private`,
        slug: `${prefix}-private`,
        altText: "Private artwork",
        storageKey: `archive-artwork/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        published: false,
      },
    });
    const published = await createPublishedArtwork(`${prefix} visible`);
    readObject.mockClear();

    expect((await publicArtworkImage(new Request("https://staging.example.test/api/archive/invalid%2Fpath/image"), {
      params: { slug: "../arbitrary-object" },
    })).status).toBe(404);
    expect(readObject).not.toHaveBeenCalled();

    expect((await publicArtworkImage(new Request("https://staging.example.test/api/archive/hidden/image"), {
      params: { slug: hidden.slug },
    })).status).toBe(404);
    expect(readObject).not.toHaveBeenCalled();

    const response = await publicArtworkImage(new Request(`https://staging.example.test/api/archive/${published.slug}/image`), {
      params: { slug: published.slug },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(readObject).toHaveBeenCalledWith(published.storageKey);
  });

  it("serves unpublished previews only through authenticated admin image delivery", async () => {
    const hidden = await prisma.archiveArtwork.create({
      data: {
        title: `${prefix} admin preview`,
        slug: `${prefix}-admin-preview`,
        altText: "Admin preview",
        storageKey: `archive-artwork/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        published: false,
      },
    });
    readObject.mockClear();
    expect((await getAdminImage(new Request("https://staging.example.test/api/admin/archive/image"), {
      params: { id: "not-a-uuid" },
    })).status).toBe(401);
    cookieState.token = sessionToken;
    expect((await getAdminImage(new Request("https://staging.example.test/api/admin/archive/image"), {
      params: { id: "not-a-uuid" },
    })).status).toBe(404);
    expect(readObject).not.toHaveBeenCalled();

    const response = await getAdminImage(new Request(`https://staging.example.test/api/admin/archive/${hidden.id}/image`), {
      params: { id: hidden.id },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readObject).toHaveBeenCalledWith(hidden.storageKey);
  });
});
