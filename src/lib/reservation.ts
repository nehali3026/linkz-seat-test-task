import { SeatStatus } from "@/generated/prisma/client";
import { HOLD_DURATION_MINUTES } from "@/lib/constants";
import { prisma } from "@/lib/db";

export class ReservationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "SEAT_UNAVAILABLE"
      | "HOLD_NOT_FOUND"
      | "HOLD_EXPIRED"
      | "HOLD_OWNERSHIP"
      | "ALREADY_RESERVED",
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

export async function releaseExpiredHolds(): Promise<number> {
  const now = new Date();

  const expiredHolds = await prisma.seatHold.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, seatId: true },
  });

  if (expiredHolds.length === 0) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    for (const hold of expiredHolds) {
      await tx.payment.deleteMany({ where: { holdId: hold.id } });
      await tx.seatHold.delete({ where: { id: hold.id } });
      await tx.seat.updateMany({
        where: { id: hold.seatId, status: SeatStatus.HELD },
        data: { status: SeatStatus.AVAILABLE },
      });
    }
  });

  return expiredHolds.length;
}

export async function createSeatHold(userId: string, seatId: number) {
  await releaseExpiredHolds();

  const expiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const seat = await tx.seat.findUnique({ where: { id: seatId } });

    if (!seat) {
      throw new ReservationError("Seat not found.", "SEAT_UNAVAILABLE");
    }

    if (seat.status !== SeatStatus.AVAILABLE) {
      throw new ReservationError(
        "This seat is no longer available.",
        "SEAT_UNAVAILABLE",
      );
    }

    const updated = await tx.seat.updateMany({
      where: { id: seatId, status: SeatStatus.AVAILABLE },
      data: { status: SeatStatus.HELD },
    });

    if (updated.count === 0) {
      throw new ReservationError(
        "This seat was just taken by another user.",
        "SEAT_UNAVAILABLE",
      );
    }

    const hold = await tx.seatHold.create({
      data: {
        seatId,
        userId,
        expiresAt,
      },
      include: {
        seat: true,
      },
    });

    return hold;
  });
}

export async function getActiveHoldForUser(userId: string, holdId: string) {
  await releaseExpiredHolds();

  const hold = await prisma.seatHold.findUnique({
    where: { id: holdId },
    include: { seat: true, payment: true },
  });

  if (!hold) {
    throw new ReservationError("Hold not found.", "HOLD_NOT_FOUND");
  }

  if (hold.userId !== userId) {
    throw new ReservationError(
      "You do not own this seat hold.",
      "HOLD_OWNERSHIP",
    );
  }

  if (hold.expiresAt <= new Date()) {
    throw new ReservationError("Your hold has expired.", "HOLD_EXPIRED");
  }

  if (hold.seat.status === SeatStatus.RESERVED) {
    throw new ReservationError("This seat is already reserved.", "ALREADY_RESERVED");
  }

  return hold;
}

export async function confirmReservation(
  holdId: string,
  paymentId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const hold = await tx.seatHold.findUnique({
      where: { id: holdId },
      include: { seat: true, payment: true },
    });

    if (!hold) {
      throw new ReservationError("Hold not found.", "HOLD_NOT_FOUND");
    }

    if (hold.userId !== userId) {
      throw new ReservationError(
        "You do not own this seat hold.",
        "HOLD_OWNERSHIP",
      );
    }

    if (hold.expiresAt <= new Date()) {
      throw new ReservationError("Your hold has expired.", "HOLD_EXPIRED");
    }

    if (hold.seat.status === SeatStatus.RESERVED) {
      throw new ReservationError("This seat is already reserved.", "ALREADY_RESERVED");
    }

    const payment = await tx.payment.findUnique({ where: { id: paymentId } });

    if (!payment || payment.holdId !== holdId) {
      throw new ReservationError("Payment not found.", "HOLD_NOT_FOUND");
    }

    const reservation = await tx.reservation.create({
      data: {
        seatId: hold.seatId,
        userId,
        paymentId,
      },
      include: {
        seat: true,
        payment: true,
      },
    });

    await tx.seat.update({
      where: { id: hold.seatId },
      data: { status: SeatStatus.RESERVED },
    });

    await tx.seatHold.delete({ where: { id: holdId } });

    return reservation;
  });
}

export async function releaseHold(holdId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const hold = await tx.seatHold.findUnique({ where: { id: holdId } });

    if (!hold) {
      return null;
    }

    if (hold.userId !== userId) {
      throw new ReservationError(
        "You do not own this seat hold.",
        "HOLD_OWNERSHIP",
      );
    }

    await tx.payment.deleteMany({ where: { holdId } });
    await tx.seatHold.delete({ where: { id: holdId } });
    await tx.seat.updateMany({
      where: { id: hold.seatId, status: SeatStatus.HELD },
      data: { status: SeatStatus.AVAILABLE },
    });

    return hold;
  });
}
