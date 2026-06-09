import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { releaseExpiredHolds } from "@/lib/reservation";

export async function GET() {
  await releaseExpiredHolds();

  const session = await auth();

  const seats = await prisma.seat.findMany({
    orderBy: { id: "asc" },
    include: {
      hold: {
        select: {
          id: true,
          userId: true,
          expiresAt: true,
        },
      },
      reservation: {
        select: {
          id: true,
          userId: true,
          createdAt: true,
        },
      },
    },
  });

  const payload = seats.map((seat) => ({
    id: seat.id,
    label: seat.label,
    status: seat.status,
    heldByCurrentUser:
      session?.user?.id != null && seat.hold?.userId === session.user.id,
    reservedByCurrentUser:
      session?.user?.id != null &&
      seat.reservation?.userId === session.user.id,
    holdExpiresAt: seat.hold?.expiresAt ?? null,
    holdId:
      session?.user?.id != null && seat.hold?.userId === session.user.id
        ? seat.hold.id
        : null,
  }));

  return NextResponse.json({ seats: payload });
}
