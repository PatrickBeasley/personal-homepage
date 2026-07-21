import type { Metadata } from "next";
import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/login-form";
import { normalizeNextPath } from "@/lib/auth/redirects";
import { getUserContext } from "@/lib/auth/user-context";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Two error channels, each generic within its class. Neither ever varies by
// whether the address has an account.
const LINK_ERROR_MESSAGE = "That sign-in link is no longer valid. Please sign in again.";
const CREDENTIALS_ERROR = "Invalid email or password.";

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

  const hasCredentialError = firstValue(params.error) !== null;
  const hasLinkError = firstValue(params.auth_error) !== null;
  const magicLinkSent = firstValue(params.sent) !== null;

  const { user, isAdmin } = await getUserContext();

  if (user) {
    redirect(isAdmin ? next : "/");
  }

  const error = hasCredentialError
    ? CREDENTIALS_ERROR
    : hasLinkError
      ? LINK_ERROR_MESSAGE
      : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <LoginForm next={next} error={error} magicLinkSent={magicLinkSent} />
    </main>
  );
}
