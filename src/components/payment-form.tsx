"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { MOCK_PAYMENT_FAILURE_CARD, SEAT_PRICE_CENTS } from "@/lib/constants";

type PaymentSummary = {
  id: string;
  amountCents: number;
  status: string;
  seatLabel: string;
  holdExpiresAt: string;
  reservationId: string | null;
};

export function PaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const holdId = searchParams.get("holdId");

  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holdId],
  );

  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [cardNumber, setCardNumber] = useState("4242424242424242");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!holdId) {
      setLoading(false);
      setError("Missing hold reference. Select a seat first.");
      return;
    }

    async function initiate() {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId, idempotencyKey }),
      });

      const data = await response.json();
      setLoading(false);

      if (!response.ok) {
        setError(data.error ?? "Unable to start payment.");
        return;
      }

      setPayment(data.payment);

      if (data.payment.reservationId) {
        setSuccess(`Seat ${data.payment.seatLabel} is already reserved.`);
      }
    }

    initiate();
  }, [holdId, idempotencyKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!payment) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/payments/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId: payment.id,
        cardNumber,
      }),
    });

    const data = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "Payment failed.");
      return;
    }

    setSuccess(
      `Seat ${data.reservation.seatLabel} reserved successfully.`,
    );

    setTimeout(() => router.push("/"), 2000);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
        Preparing checkout...
      </div>
    );
  }

  if (!holdId || !payment) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold">Payment unavailable</h1>
        <p className="text-sm text-zinc-500">
          {error ?? "We could not find an active hold for this checkout."}
        </p>
        <Link
          href="/"
          className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Back to seats
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-lg space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div>
        <h1 className="text-2xl font-semibold">Complete payment</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Mock payment gateway. Reservation is confirmed only after successful
          payment.
        </p>
      </div>

      <div className="rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
        <div className="flex justify-between">
          <span>Seat</span>
          <span className="font-medium">{payment.seatLabel}</span>
        </div>
        <div className="mt-2 flex justify-between">
          <span>Amount</span>
          <span className="font-medium">
            ${(payment.amountCents / 100).toFixed(2)}
          </span>
        </div>
        <div className="mt-2 flex justify-between">
          <span>Hold expires</span>
          <span className="font-medium">
            {new Date(payment.holdExpiresAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Card number</span>
        <input
          type="text"
          inputMode="numeric"
          value={cardNumber}
          onChange={(event) => setCardNumber(event.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="4242424242424242"
          required
        />
      </label>

      <p className="text-xs text-zinc-500">
        Use {MOCK_PAYMENT_FAILURE_CARD} to simulate a declined card. Any other
        valid-length number succeeds.
      </p>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {success}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Link
          href="/"
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting || !!success}
          className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {submitting
            ? "Processing..."
            : `Pay $${(SEAT_PRICE_CENTS / 100).toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}
