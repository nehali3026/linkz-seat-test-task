import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, SeatStatus } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const users = [
    { email: "alice@example.com", name: "Alice Johnson" },
    { email: "bob@example.com", name: "Bob Smith" },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
      },
      create: {
        email: user.email,
        name: user.name,
        passwordHash,
      },
    });
  }

  const seatLabels = ["Seat A1", "Seat A2", "Seat A3"];

  for (const label of seatLabels) {
    await prisma.seat.upsert({
      where: { label },
      update: {
        status: SeatStatus.AVAILABLE,
      },
      create: {
        label,
        status: SeatStatus.AVAILABLE,
      },
    });
  }

  console.log("Seeded demo users and 3 seats.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
