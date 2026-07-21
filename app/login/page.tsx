import type { Metadata } from "next";
import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/login-form";
import { normalizeNextPath } from "@/lib/auth/redirects";
import { getUserContext } from "@/lib/auth/user-context";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Any failed magic-link landing collapses to one message: the specific
// auth_error code must never hint at whether the address has an account.
const LINK_ERROR_MESSAGE =
  "That sign-in link is no longer valid. Please sign in again.";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = normalizeNextPath(firstValue(params.next), "/dashboard");
  const hasLinkError = firstValue(params.auth_error) !== null;

  const { user, isAdmin } = await getUserContext();

  if (user) {
    redirect(isAdmin ? next : "/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <LoginForm next={next} initialError={hasLinkError ? LINK_ERROR_MESSAGE : null} />
    </main>
  );
}
