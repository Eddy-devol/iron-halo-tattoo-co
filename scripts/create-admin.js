const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const readline = require("node:readline/promises");
const process = require("node:process");

const prisma = new PrismaClient();
const minimumPasswordLength = 12;

async function readHiddenPassword(rl) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return (await rl.question("Admin password: ")).trim();
  }

  return new Promise((resolve, reject) => {
    let password = "";
    const onData = (chunk) => {
      const input = chunk.toString();
      if (input === "\u0003") {
        cleanup();
        reject(new Error("Admin creation cancelled."));
      } else if (input === "\r" || input === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(password);
      } else if (input === "\u007f" || input === "\b") {
        password = password.slice(0, -1);
      } else {
        password += input;
      }
    };
    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    process.stdout.write("Admin password: ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Admin email: ")).trim().toLowerCase();
  const password = await readHiddenPassword(rl);
  rl.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required.");
  if (password.length < minimumPasswordLength) throw new Error("Password must be at least 12 characters.");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with that email already exists.");
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash, role: "ADMIN" } });
  console.log("Admin account created.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
