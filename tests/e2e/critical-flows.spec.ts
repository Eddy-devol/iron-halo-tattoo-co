import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const { getTestDatabaseUrl } = require("../../scripts/test-database-safety") as {
  getTestDatabaseUrl: (options?: { allowTestUrlAsDatabaseUrl?: boolean }) => string;
};
const runId = randomUUID();
const adminEmail = `phase2j5-admin-${runId}@example.test`;
const adminPassword = `Synthetic-E2E-${randomUUID()}-Only`;
const bookingName = `Phase 2J.5 Synthetic ${runId.slice(0, 8)}`;
const bookingEmail = `phase2j5-booking-${runId}@example.test`;
let adminId: string;
let prisma: PrismaClient | undefined;

function assertIsolatedTestTarget(rawUrl: string | undefined, variableName: string) {
  if (!rawUrl) throw new Error(`${variableName} is required for E2E.`);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${variableName} must be a valid database URL.`);
  }
  const username = decodeURIComponent(url.username).toLowerCase();
  const database = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    database !== "iron_halo_test" ||
    !/(^|[-_])test($|[-_])/.test(username)
  ) {
    throw new Error(`${variableName} must target the approved isolated PostgreSQL test database.`);
  }
}

test.beforeAll(async () => {
  const safeTestUrl = getTestDatabaseUrl({ allowTestUrlAsDatabaseUrl: true });
  assertIsolatedTestTarget(safeTestUrl, "DATABASE_URL_TEST");
  process.env.DATABASE_URL = safeTestUrl;
  process.env.DATABASE_URL_TEST = safeTestUrl;
  assertIsolatedTestTarget(process.env.DATABASE_URL, "DATABASE_URL");
  prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(adminPassword, 4);
  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "Synthetic E2E Admin", passwordHash, role: "ADMIN" },
    select: { id: true },
  });
  adminId = admin.id;
});

test.afterAll(async () => {
  if (prisma && adminId) {
    const bookings = await prisma.bookingRequest.findMany({
      where: { email: bookingEmail },
      select: { id: true, referenceNumber: true },
    });
    if (bookings.length) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityId: { in: bookings.map(({ id }) => id) } },
            { entityId: { in: bookings.map(({ referenceNumber }) => referenceNumber) } },
          ],
        },
      });
      await prisma.bookingRequest.deleteMany({ where: { id: { in: bookings.map(({ id }) => id) } } });
    }
    await prisma.session.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
  }
  await prisma?.$disconnect();
});

test("public booking retry and authenticated admin workflow", async ({ page }) => {
  test.setTimeout(120_000);
  const bookingKeys: string[] = [];
  let firstPost = true;
  let retryStatus: number | undefined;
  let retryError: string | undefined;
  await page.route("**/api/bookings", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const key = request.headers()["idempotency-key"];
    if (key) bookingKeys.push(key);
    const response = await route.fetch();
    if (firstPost) {
      firstPost = false;
      await route.abort();
      return;
    }
    retryStatus = response.status();
    const responseBody = await response.body();
    if (retryStatus !== 201) {
      try {
        retryError = (JSON.parse(responseBody.toString()) as { error?: string }).error;
      } catch {
        retryError = "Unexpected non-JSON response.";
      }
    }
    await route.fulfill({ response, body: responseBody });
  });

  await page.goto("/book");
  await expect(page.getByRole("heading", { name: /make an.*enquiry/i })).toBeVisible();

  const name = page.getByLabel("Full name");
  await expect(name).toHaveAttribute("required", "");
  await expect(page.getByLabel("Email address")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Tell us about the idea")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Placement")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Approximate size")).toHaveAttribute("required", "");

  await name.fill(bookingName);
  await page.getByLabel("Email address").fill(bookingEmail);
  await page.getByLabel("Phone (optional)").fill("+15555550100");
  await page.getByLabel("Placement").fill("Synthetic forearm");
  await page.getByLabel("Approximate size").fill("4 inches");
  await page.getByLabel("Style").fill("Synthetic linework");
  await page.getByLabel("Tell us about the idea").fill("Synthetic browser test request, not a real tattoo inquiry.");
  await page.getByLabel("Color").selectOption({ label: "Black & grey" });
  await page.getByLabel(/i confirm this information is accurate/i).check();

  await page.getByRole("button", { name: /send request/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: /send request/i }).click();
  await expect.poll(() => retryStatus).not.toBeUndefined();
  if (retryStatus !== 201) {
    throw new Error(`Booking retry returned ${retryStatus}: ${retryError ?? "no API error details"}`);
  }
  await expect(page.getByText("REQUEST RECEIVED")).toBeVisible();
  await expect(page.getByText(/we will review your request/i)).toBeVisible();
  await expect(page.getByText(/appointment confirmed/i)).toHaveCount(0);

  const reference = (await page.locator("strong").innerText()).trim();
  expect(reference).toMatch(/^IH-\d{4}-[A-Z2-9]{6}$/);
  expect(bookingKeys).toHaveLength(2);
  expect(bookingKeys[0]).toBeTruthy();
  expect(bookingKeys[1]).toBe(bookingKeys[0]);

  const storedBooking = await prisma.bookingRequest.findUnique({
    where: { idempotencyKey: bookingKeys[0] },
    include: { referenceImages: true },
  });
  expect(storedBooking).toMatchObject({
    fullName: bookingName,
    email: bookingEmail,
    referenceNumber: reference,
    status: "PENDING",
    idempotencyStatus: "COMPLETED",
  });
  expect(storedBooking?.referenceImages).toHaveLength(0);
  expect(await prisma.bookingRequest.count({ where: { email: bookingEmail } })).toBe(1);

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill("wrong-synthetic-password");
  const failedLoginResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/login") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enter console" }).click();
  const loginResponse = await failedLoginResponse;
  const loginError = page.locator("form p[role='alert']");
  const genericFailure = await loginError.innerText();
  expect(genericFailure, `Login HTTP ${loginResponse.status()}, Content-Type: ${loginResponse.request().headers()["content-type"] ?? "missing"}`)
    .toBe("Invalid email or password.");

  await page.getByLabel("Email").fill(`${runId}@unknown.example.test`);
  await page.getByLabel("Password").fill("wrong-synthetic-password");
  await page.getByRole("button", { name: "Enter console" }).click();
  await expect(loginError).toHaveText(genericFailure);

  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Enter console" }).click();
  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { name: "Booking requests" })).toBeVisible();

  await page.getByLabel("Search reference, name, email, or phone").fill(bookingName);
  await page.getByRole("button", { name: "Search" }).click();
  const row = page.getByRole("row").filter({ hasText: bookingName });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: bookingName })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText("Synthetic browser test request, not a real tattoo inquiry.")).toBeVisible();
  await expect(page.getByText(/passwordHash|session token|storage credentials/i)).toHaveCount(0);

  await page.getByLabel("Status").selectOption("REVIEWING");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText(/pending → reviewing/i)).toBeVisible();
  expect((await prisma.bookingRequest.findUnique({ where: { id: storedBooking!.id } }))?.status).toBe("REVIEWING");
  const statusAudit = await prisma.auditLog.findFirst({
    where: { entityId: storedBooking!.id, action: "BOOKING_STATUS_UPDATED" },
  });
  expect(statusAudit?.userId).toBe(adminId);

  const note = `Synthetic internal E2E note ${runId}`;
  await page.getByLabel("Add an internal note").fill(note);
  const noteResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/notes") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add internal note" }).click();
  const noteResponse = await noteResponsePromise;
  expect(noteResponse.status()).toBe(201);
  const noteParagraph = page.locator("ol li p").filter({ hasText: note });
  await expect(noteParagraph).toBeVisible();
  expect(await prisma.bookingNote.count({ where: { bookingRequestId: storedBooking!.id, authorId: adminId } })).toBe(1);
  await page.reload();
  await expect(noteParagraph).toBeVisible();
  expect(await prisma.bookingNote.count({ where: { bookingRequestId: storedBooking!.id, authorId: adminId } })).toBe(1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/admin/login");
  await page.goto("/admin");
  await page.waitForURL("**/admin/login");
  const unauthenticatedResponse = await page.request.get("/api/admin/bookings");
  expect(unauthenticatedResponse.status()).toBe(401);
});
