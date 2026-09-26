const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function getTestDatabaseUrl({ allowTestUrlAsDatabaseUrl = false } = {}) {
  loadEnvFile(".env.local");
  loadEnvFile(".env.test.local");
  loadEnvFile(".env.test");

  const value = process.env.DATABASE_URL_TEST;
  if (!value) throw new Error("DATABASE_URL_TEST is required; refusing to use DATABASE_URL.");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL_TEST must use the PostgreSQL protocol.");
  }

  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase();
  const user = decodeURIComponent(parsed.username).toLowerCase();
  const port = parsed.port || "5432";
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const testNamed = /(^|[-_])test($|[-_])/.test(database) && /(^|[-_])test($|[-_])/.test(user);
  if (!localHost || !testNamed || database !== "iron_halo_test" || port !== "55432") {
    throw new Error("DATABASE_URL_TEST must target the configured localhost iron_halo_test database.");
  }
  if (!allowTestUrlAsDatabaseUrl && value === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST must not equal DATABASE_URL.");
  }
  return value;
}

module.exports = { getTestDatabaseUrl };
