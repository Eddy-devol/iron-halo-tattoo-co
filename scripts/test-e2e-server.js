const { spawn } = require("node:child_process");
const { getTestDatabaseUrl } = require("./test-database-safety");

const port = "3100";
const env = { ...process.env };
for (const name of [
  "STORAGE_REGION",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_ENDPOINT",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "ADMIN_NOTIFICATION_EMAIL",
  "EMAIL_REPLY_TO",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
]) {
  delete env[name];
}

env.DATABASE_URL = getTestDatabaseUrl({ allowTestUrlAsDatabaseUrl: true });
env.DATABASE_URL_TEST = env.DATABASE_URL;
env.NEXT_PUBLIC_SITE_URL = `http://127.0.0.1:${port}`;
env.NODE_ENV = "development";
env.TRUST_PROXY_HEADERS = "false";

const child = spawn("npx", ["next", "dev", "-H", "127.0.0.1", "-p", port], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`E2E test server failed to start: ${error.name}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
