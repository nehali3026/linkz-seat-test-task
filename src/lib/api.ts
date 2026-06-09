import { NextResponse } from "next/server";
import { PaymentError } from "@/lib/payment";
import { ReservationError } from "@/lib/reservation";

export function jsonError(
  message: string,
  status: number,
  code?: string,
) {
  return NextResponse.json({ error: message, code }, { status });
}

export function handleServiceError(error: unknown) {
  if (error instanceof ReservationError) {
    const status =
      error.code === "HOLD_OWNERSHIP"
        ? 403
        : error.code === "SEAT_UNAVAILABLE"
          ? 409
          : 400;

    return jsonError(error.message, status, error.code);
  }

  if (error instanceof PaymentError) {
    const status =
      error.code === "DECLINED"
        ? 402
        : error.code === "ALREADY_PROCESSED"
          ? 409
          : 400;

    return jsonError(error.message, status, error.code);
  }

  console.error(error);
  return jsonError("An unexpected error occurred.", 500);
}
