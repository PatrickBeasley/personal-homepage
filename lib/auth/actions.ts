"use server";

import { redirect } from "next/navigation";

import { normalizeNextPath } from "@/lib/auth/redirects";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Password sign-in. Runs entirely on the server, so no Supabase SDK reaches
 * the browser and a native form POST is the intended path rather than a
 * failure mode.
 *
 * Every failure redirects to exactly one target. Supabase already returns a
 * single generic error for "no such user" and "wrong password"; this must not
 * widen that, so no branch below may depend on the kind of failure. Thrown
 * failures (network, DNS, service down) are treated identically to returned
 * ones for the same reason.
 */
export async function signInWithPasswordAction(formData: FormData) {
  const email = readField(formData, "email");
  const password = readField(formData, "password");
  const next = normalizeNextPath(readField(formData, "next") || null, "/dashboard");

  const supabase = await createServerSupabaseClient();

  let failed = false;

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    failed = Boolean(error);
  } catch {
    // A thrown transport or service failure collapses into the same outcome as
    // a rejected credential. It cannot reveal whether an account exists, so
    // enumeration safety is preserved.
    failed = true;
  }

  // Outside the try on purpose: redirect() signals by throwing, and catching
  // it would swallow the navigation.
  if (failed) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}
