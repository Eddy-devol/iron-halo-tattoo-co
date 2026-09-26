const { spawnSync } = require("node:child_process");
const { getTestDatabaseUrl } = require("./test-database-safety");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const action = process.argv[2];
if (action === "up" || action === "down") {
  const args = ["compose", "-f", "docker-compose.test.yml", action === "up" ? "up" : "down"];
  if (action === "up") args.push("-d", "--wait");
  run("docker", args);
} else if (action === "migrate") {
  run("npx", ["prisma", "migrate", "deploy"]);
} else if (action === "status") {
  run("npx", ["prisma", "migrate", "status"]);
} else if (action === "verify") {
  run("node", ["scripts/verify-test-database.js"]);
} else if (action === "integration") {
  run("npx", ["vitest", "run", "--config", "vitest.integration.config.ts"]);
} else if (action === "e2e") {
  run("npx", ["playwright", "test"]);
} else if (action === "generate") {
  run("npx", ["prisma", "generate"]);
} else {
  console.error("Usage: node scripts/test-database.js <up|down|migrate|status|verify|integration|e2e|generate>");
  process.exit(1);
}
