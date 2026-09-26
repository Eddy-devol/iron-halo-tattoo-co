const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { getDevelopmentSeedPassword } = require("../scripts/seed-safety");

async function main() {
  const password = getDevelopmentSeedPassword();
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.upsert({
      where: { email: "admin@example.test" },
      update: {},
      create: {
        email: "admin@example.test",
        name: "Development Admin",
        role: "ADMIN",
        passwordHash: bcrypt.hashSync(password, 12),
      },
    });

    const booking = await prisma.bookingRequest.upsert({
      where: { referenceNumber: "IH-2026-TEST01" },
      update: {},
      create: {
        referenceNumber: "IH-2026-TEST01",
        fullName: "Test Client",
        email: "test@example.test",
        description: "A clearly fictional development booking for testing the admin workflow.",
        placement: "Left forearm",
        size: "Medium",
        style: "Blackwork",
        status: "PENDING",
        notes: { create: { authorId: admin.id, body: "Development-only test note." } },
      },
    });

    console.log(`Seeded ${admin.email} and ${booking.referenceNumber}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });