import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center text-zinc-500">Loading login form...</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
