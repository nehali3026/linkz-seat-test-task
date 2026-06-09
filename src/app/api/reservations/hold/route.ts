import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { handleServiceError, jsonError } from "@/lib/api";
import { createSeatHold } from "@/lib/reservation";

const bodySchema = z.object({
  seatId: z.number().int().positive(),
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
    return jsonError("seatId must be a positive integer.", 400);
  }

  try {
    const hold = await createSeatHold(session.user.id, parsed.data.seatId);

    return NextResponse.json({
      hold: {
        id: hold.id,
        seatId: hold.seatId,
        seatLabel: hold.seat.label,
        expiresAt: hold.expiresAt,
      },
    });
  } catch (error) {
    return handleServiceError(error);
  }
}
