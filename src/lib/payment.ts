import { PaymentStatus } from "@/generated/prisma/client";
import { MOCK_PAYMENT_FAILURE_CARD, SEAT_PRICE_CENTS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  confirmReservation,
  getActiveHoldForUser,
  releaseHold,
  ReservationError,
} from "@/lib/reservation";

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: "DECLINED" | "INVALID_HOLD" | "ALREADY_PROCESSED",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

function simulatePaymentGateway(cardNumber: string): {
  success: boolean;
  failureReason?: string;
} {
  const normalized = cardNumber.replace(/\s/g, "");

  if (!/^\d{13,19}$/.test(normalized)) {
    return { success: false, failureReason: "Invalid card number." };
  }

  if (normalized === MOCK_PAYMENT_FAILURE_CARD) {
    return { success: false, failureReason: "Card declined by issuer." };
  }

  return { success: true };
}

export async function initiatePayment(
  userId: string,
  holdId: string,
  idempotencyKey: string,
) {
  await getActiveHoldForUser(userId, holdId);

  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
    include: { hold: { include: { seat: true } }, reservation: true },
  });

  if (existing) {
    if (existing.hold.userId !== userId) {
      throw new PaymentError("Invalid payment request.", "INVALID_HOLD");
    }

    return existing;
  }

  return prisma.payment.create({
    data: {
      holdId,
      amountCents: SEAT_PRICE_CENTS,
      idempotencyKey,
    },
    include: {
      hold: { include: { seat: true } },
      reservation: { include: { seat: true } },
    },
  });
}

export async function processPayment(
  userId: string,
  paymentId: string,
  cardNumber: string,
) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      hold: { include: { seat: true } },
      reservation: { include: { seat: true } },
    },
  });

  if (!payment) {
    throw new PaymentError("Payment not found.", "INVALID_HOLD");
  }

  if (payment.hold.userId !== userId) {
    throw new PaymentError("Invalid payment request.", "INVALID_HOLD");
  }

  if (payment.status === PaymentStatus.COMPLETED && payment.reservation) {
    return {
      payment,
      reservation: payment.reservation,
      alreadyProcessed: true,
    };
  }

  if (payment.status === PaymentStatus.FAILED) {
    throw new PaymentError(
      payment.failureReason ?? "Payment previously failed.",
      "DECLINED",
    );
  }

  try {
    await getActiveHoldForUser(userId, payment.holdId);
  } catch (error) {
    if (error instanceof ReservationError) {
      throw new PaymentError(error.message, "INVALID_HOLD");
    }
    throw error;
  }

  const gatewayResult = simulatePaymentGateway(cardNumber);

  if (!gatewayResult.success) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: gatewayResult.failureReason,
        completedAt: new Date(),
      },
    });

    await releaseHold(payment.holdId, userId);

    throw new PaymentError(
      gatewayResult.failureReason ?? "Payment declined.",
      "DECLINED",
    );
  }

  const completedPayment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: PaymentStatus.COMPLETED,
      completedAt: new Date(),
    },
    include: {
      hold: { include: { seat: true } },
    },
  });

  const reservation = await confirmReservation(
    payment.holdId,
    paymentId,
    userId,
  );

  return {
    payment: completedPayment,
    reservation,
    alreadyProcessed: false,
  };
}
