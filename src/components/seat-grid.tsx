"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type SeatView = {
  id: number;
  label: string;
  status: "AVAILABLE" | "HELD" | "RESERVED";
  heldByCurrentUser: boolean;
  reservedByCurrentUser: boolean;
  holdExpiresAt: string | null;
  holdId: string | null;
};

const statusStyles: Record<SeatView["status"], string> = {
  AVAILABLE:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  HELD: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  RESERVED:
    "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
};

export function SeatGrid() {
  const router = useRouter();
  const { data: session } = useSession();
  const [seats, setSeats] = useState<SeatView[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSeatId, setActionSeatId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSeats = useCallback(async () => {
    const response = await fetch("/api/seats", { cache: "no-store" });
    const data = await response.json();
    setSeats(data.seats ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSeats();
    const interval = setInterval(loadSeats, 5000);
    return () => clearInterval(interval);
  }, [loadSeats]);

  async function handleReserve(seatId: number) {
    if (!session?.user) {
      router.push("/login");
      return;
    }

    setActionSeatId(seatId);
    setError(null);

    try {
      const response = await fetch("/api/reservations/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to reserve seat.");
        return;
      }

      router.push(`/payment?holdId=${data.hold.id}`);
    } catch {
      setError("Network error while reserving seat.");
    } finally {
      setActionSeatId(null);
    }
  }

  function statusLabel(seat: SeatView) {
    if (seat.reservedByCurrentUser) return "Reserved by you";
    if (seat.heldByCurrentUser) return "Held for you";
    if (seat.status === "AVAILABLE") return "Available";
    if (seat.status === "HELD") return "Held by another user";
    return "Reserved";
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
        Loading seats...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Available seats</h2>
          <p className="text-sm text-zinc-500">
            Three public seats. Holds expire after 10 minutes if payment is not
            completed.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSeats}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {seats.map((seat) => {
          const canReserve =
            seat.status === "AVAILABLE" && !!session?.user;
          const canContinue =
            seat.heldByCurrentUser && seat.holdId != null;

          return (
            <article
              key={seat.id}
              className={`rounded-2xl border p-5 shadow-sm ${statusStyles[seat.status]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{seat.label}</h3>
                  <p className="mt-1 text-sm opacity-80">{statusLabel(seat)}</p>
                </div>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium uppercase tracking-wide dark:bg-black/20">
                  {seat.status}
                </span>
              </div>

              {seat.holdExpiresAt && seat.heldByCurrentUser ? (
                <p className="mt-3 text-xs opacity-80">
                  Hold expires at{" "}
                  {new Date(seat.holdExpiresAt).toLocaleTimeString()}
                </p>
              ) : null}

              <div className="mt-5">
                {canContinue ? (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/payment?holdId=${seat.holdId}`)
                    }
                    className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    Continue to payment
                  </button>
                ) : canReserve ? (
                  <button
                    type="button"
                    disabled={actionSeatId === seat.id}
                    onClick={() => handleReserve(seat.id)}
                    className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    {actionSeatId === seat.id ? "Reserving..." : "Select seat"}
                  </button>
                ) : !session?.user ? (
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="w-full rounded-lg border border-current px-3 py-2 text-sm font-medium"
                  >
                    Sign in to reserve
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-current px-3 py-2 text-sm font-medium opacity-60"
                  >
                    Unavailable
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
