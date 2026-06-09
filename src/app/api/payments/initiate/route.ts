import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { handleServiceError, jsonError } from "@/lib/api";
import { initiatePayment } from "@/lib/payment";

const bodySchema = z.object({
  holdId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128),
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
    return jsonError("holdId and idempotencyKey are required.", 400);
  }

  try {
    const payment = await initiatePayment(
      session.user.id,
      parsed.data.holdId,
      parsed.data.idempotencyKey,
    );

    return NextResponse.json({
      payment: {
        id: payment.id,
        amountCents: payment.amountCents,
        status: payment.status,
        seatLabel: payment.hold.seat.label,
        holdExpiresAt: payment.hold.expiresAt,
        reservationId: payment.reservation?.id ?? null,
      },
    });
  } catch (error) {
    return handleServiceError(error);
  }
}
