"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Linkz Seats
          </Link>
          <p className="text-sm text-zinc-500">
            Public seat reservation platform
          </p>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {status === "loading" ? (
            <span className="text-zinc-400">Checking session...</span>
          ) : session?.user ? (
            <>
              <span className="hidden text-zinc-600 sm:inline dark:text-zinc-300">
                Signed in as {session.user.name ?? session.user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
