import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { handleServiceError, jsonError } from "@/lib/api";
import { processPayment } from "@/lib/payment";

const bodySchema = z.object({
  paymentId: z.string().min(1),
  cardNumber: z.string().min(13).max(19),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return jsonError("Authentication required.", 401, "UNAUTHORIZED");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("paymentId and cardNumber are required.", 400);
  }

  try {
    const result = await processPayment(
      session.user.id,
      parsed.data.paymentId,
      parsed.data.cardNumber,
    );

    return NextResponse.json({
      payment: {
        id: result.payment.id,
        status: result.payment.status,
        amountCents: result.payment.amountCents,
      },
      reservation: {
        id: result.reservation.id,
        seatLabel: result.reservation.seat.label,
        createdAt: result.reservation.createdAt,
      },
      alreadyProcessed: result.alreadyProcessed,
    });
  } catch (error) {
    return handleServiceError(error);
  }
}
