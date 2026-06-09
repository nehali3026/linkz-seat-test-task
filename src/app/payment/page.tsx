import { Suspense } from "react";
import { PaymentForm } from "@/components/payment-form";

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center text-zinc-500">Loading checkout...</div>
      }
    >
      <PaymentForm />
    </Suspense>
  );
}
