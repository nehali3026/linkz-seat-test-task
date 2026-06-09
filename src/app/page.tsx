import { SeatGrid } from "@/components/seat-grid";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-3xl font-semibold tracking-tight">
          Reserve your seat
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-300">
          This assessment demonstrates a business-critical reservation workflow
          with authenticated access, optimistic concurrency control, temporary
          seat holds, and payment-confirmed reservations.
        </p>
      </section>

      <SeatGrid />
    </div>
  );
}
