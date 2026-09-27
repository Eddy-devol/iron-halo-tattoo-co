const { randomUUID } = require("node:crypto");
const { Prisma, PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const requiredTables = [
  "User",
  "Session",
  "BookingRequest",
  "BookingReferenceImage",
  "BookingNote",
  "AuditLog",
  "Appointment",
  "ArchiveArtwork",
  "PaymentPlan",
  "PaymentInstallment",
  "Payment",
  "TattooConsentRecord",
];
const expectedIdempotencyStatuses = ["COMPLETED", "PROCESSING"];

function bookingData(idempotencyKey, referenceNumber) {
  return {
    referenceNumber,
    fullName: "Phase 2J.3C Synthetic Test",
    email: "phase2j3c@example.test",
    description: "Synthetic data used only to verify the isolated test database.",
    placement: "Test placement",
    size: "Test size",
    idempotencyKey,
    idempotencyHash: randomUUID(),
    idempotencyStatus: "PROCESSING",
    status: "PENDING",
  };
}

async function main() {
  const [{ databaseName }] = await prisma.$queryRaw`
    SELECT current_database() AS "databaseName"
  `;
  if (databaseName !== "iron_halo_test") {
    throw new Error("Connected database did not match the expected isolated test database.");
  }
  console.info("Database connection: verified (iron_halo_test)");

  const tableRows = await prisma.$queryRaw`
    SELECT tablename AS name
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
  `;
  const tables = new Set(tableRows.map(({ name }) => name));
  const missingTables = requiredTables.filter((table) => !tables.has(table));
  console.info(`Required tables present: ${requiredTables.length - missingTables.length}/${requiredTables.length}`);
  if (missingTables.length) console.warn(`Required tables missing from current schema: ${missingTables.join(", ")}`);

  const columnRows = await prisma.$queryRaw`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'BookingRequest'
  `;
  const columns = new Set(columnRows.map(({ name }) => name));
  const idempotencyColumns = ["idempotencyKey", "idempotencyHash", "idempotencyStatus"];
  const missingColumns = idempotencyColumns.filter((column) => !columns.has(column));
  if (missingColumns.length) throw new Error(`BookingRequest is missing expected idempotency columns: ${missingColumns.join(", ")}`);
  console.info("BookingRequest idempotency columns: verified");
  if (!columns.has("artistName")) throw new Error("BookingRequest artistName column is missing.");
  console.info("BookingRequest artist assignment field: verified");

  const documentColumnRows = await prisma.$queryRaw`
    SELECT table_name AS "tableName", column_name AS name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('PaymentPlan', 'PaymentInstallment', 'Payment', 'TattooConsentRecord')
  `;
  const documentColumns = new Map();
  for (const row of documentColumnRows) {
    if (!documentColumns.has(row.tableName)) documentColumns.set(row.tableName, new Set());
    documentColumns.get(row.tableName).add(row.name);
  }
  const expectedDocumentColumns = {
    PaymentPlan: ["bookingRequestId", "totalAmount", "currency", "status", "installmentCount"],
    PaymentInstallment: ["paymentPlanId", "installmentNumber", "dueDate", "amount"],
    Payment: ["paymentPlanId", "installmentId", "amount", "balanceAfter", "source", "recordedById"],
    TattooConsentRecord: ["bookingRequestId", "dateOfBirth", "governmentIdType", "governmentIdLastFour", "status", "consentTextSnapshot"],
  };
  for (const [tableName, expected] of Object.entries(expectedDocumentColumns)) {
    const actual = documentColumns.get(tableName) || new Set();
    const missing = expected.filter((column) => !actual.has(column));
    if (missing.length) throw new Error(`${tableName} is missing document/payment fields: ${missing.join(", ")}`);
  }
  console.info("Payment and consent document fields: verified");

  const archiveColumnRows = await prisma.$queryRaw`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ArchiveArtwork'
  `;
  const archiveColumns = new Set(archiveColumnRows.map(({ name }) => name));
  const requiredArchiveColumns = [
    "title",
    "slug",
    "description",
    "style",
    "altText",
    "storageKey",
    "contentType",
    "featured",
    "published",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ];
  const missingArchiveColumns = requiredArchiveColumns.filter((column) => !archiveColumns.has(column));
  if (missingArchiveColumns.length) {
    throw new Error(`ArchiveArtwork is missing expected columns: ${missingArchiveColumns.join(", ")}`);
  }
  console.info("ArchiveArtwork fields: verified");

  const enumRows = await prisma.$queryRaw`
    SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname IN ('BookingStatus', 'BookingIdempotencyStatus')
    GROUP BY t.typname
  `;
  const enums = new Map(enumRows.map(({ name, labels }) => [name, labels]));
  if (!enums.has("BookingStatus")) throw new Error("BookingStatus enum is missing.");
  const actualIdempotencyStatuses = enums.get("BookingIdempotencyStatus") || [];
  if (expectedIdempotencyStatuses.some((label) => !actualIdempotencyStatuses.includes(label))) {
    throw new Error("BookingIdempotencyStatus enum is missing expected labels.");
  }
  console.info("Booking enums and idempotency labels: verified");

  const indexRows = await prisma.$queryRaw`
    SELECT i.indisunique AS "isUnique", array_agg(a.attname ORDER BY key.ordinality) AS columns
    FROM pg_class table_class
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    JOIN pg_index i ON i.indrelid = table_class.oid
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = table_class.oid AND a.attnum = key.attnum
    WHERE namespace.nspname = 'public' AND table_class.relname = 'BookingRequest'
    GROUP BY i.indexrelid, i.indisunique
  `;
  const hasUniqueIdempotencyIndex = indexRows.some(
    ({ isUnique, columns: indexColumns }) => isUnique && indexColumns.length === 1 && indexColumns[0] === "idempotencyKey",
  );
  if (!hasUniqueIdempotencyIndex) throw new Error("Unique PostgreSQL index on BookingRequest.idempotencyKey is missing.");
  console.info("PostgreSQL idempotency unique index: verified");

  const archiveIndexRows = await prisma.$queryRaw`
    SELECT array_agg(a.attname ORDER BY key.ordinality) AS columns
    FROM pg_class table_class
    JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
    JOIN pg_index i ON i.indrelid = table_class.oid
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = table_class.oid AND a.attnum = key.attnum
    WHERE namespace.nspname = 'public' AND table_class.relname = 'ArchiveArtwork'
    GROUP BY i.indexrelid
  `;
  const archiveIndexedColumns = new Set(
    archiveIndexRows.flatMap(({ columns }) => columns),
  );
  const missingArchiveIndexes = ["published", "featured", "sortOrder", "createdAt"]
    .filter((column) => !archiveIndexedColumns.has(column));
  if (missingArchiveIndexes.length) {
    throw new Error(`ArchiveArtwork is missing expected indexes: ${missingArchiveIndexes.join(", ")}`);
  }
  console.info("ArchiveArtwork indexes: verified");

  const concurrentResults = await Promise.all(
    Array.from({ length: 5 }, () => prisma.$queryRaw`SELECT 1 AS value`),
  );
  if (concurrentResults.length !== 5) throw new Error("Concurrent database smoke test failed.");
  console.info("Concurrent PostgreSQL queries: verified (5)");

  const key = `phase2j3c-${randomUUID()}`;
  const reference = `IH-TEST-${randomUUID()}`;
  let primaryId;
  let duplicateId;
  let committedId;
  try {
    const created = await prisma.bookingRequest.create({ data: bookingData(key, reference) });
    primaryId = created.id;
    const readBack = await prisma.bookingRequest.findUnique({ where: { id: created.id } });
    if (!readBack || readBack.idempotencyStatus !== "PROCESSING") {
      throw new Error("Synthetic booking read-back did not match the created record.");
    }
    console.info("Synthetic booking create/read: verified");

    let duplicateRejected = false;
    try {
      const duplicate = await prisma.bookingRequest.create({
        data: bookingData(key, `IH-TEST-${randomUUID()}`),
      });
      duplicateId = duplicate.id;
    } catch (error) {
      duplicateRejected = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!duplicateRejected) throw error;
    }
    if (!duplicateRejected) throw new Error("Duplicate idempotency key was not rejected by PostgreSQL.");
    console.info("Duplicate idempotency key rejection: verified");

    const committed = await prisma.$transaction((transaction) =>
      transaction.bookingRequest.create({
        data: bookingData(`phase2j3c-commit-${randomUUID()}`, `IH-TEST-${randomUUID()}`),
      }),
    );
    committedId = committed.id;
    const committedRead = await prisma.bookingRequest.findUnique({ where: { id: committed.id } });
    if (!committedRead) throw new Error("Transaction commit smoke test failed.");
    console.info("Transaction commit and cleanup: verified");

    const rollbackId = randomUUID();
    const rollbackReference = `IH-TEST-${randomUUID()}`;
    const rollbackMarker = new Error("Phase 2J.3C controlled rollback");
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.bookingRequest.create({
          data: { ...bookingData(`phase2j3c-rollback-${randomUUID()}`, rollbackReference), id: rollbackId },
        });
        throw rollbackMarker;
      });
    } catch (error) {
      if (error !== rollbackMarker) throw error;
    }
    const rolledBack = await prisma.bookingRequest.findUnique({ where: { id: rollbackId } });
    if (rolledBack) throw new Error("Controlled rollback left a synthetic booking behind.");
    console.info("Transaction rollback: verified");
  } finally {
    const ids = [primaryId, duplicateId, committedId].filter(Boolean);
    if (ids.length) {
      await prisma.bookingRequest.deleteMany({ where: { id: { in: ids } } });
      const remaining = await prisma.bookingRequest.count({ where: { id: { in: ids } } });
      if (remaining !== 0) throw new Error("Synthetic database verification records were not fully cleaned up.");
      console.info("Synthetic verification records cleanup: verified");
    }
  }

  if (missingTables.length) {
    process.exitCode = 1;
    console.error("Database verification incomplete: expected tables are absent from the current schema.");
  } else {
    console.info("Test database verification: passed");
  }
}

main()
  .catch((error) => {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error.name;
    console.error(`Test database verification failed (${code}).`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
