"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

// One message for every credential failure. Supabase returns the same error
// for "no such user" and "wrong password", and this component must not widen
// that: no branch here may depend on whether the address has an account.
const CREDENTIALS_ERROR = "Invalid email or password.";
const UNEXPECTED_ERROR = "Something went wrong. Please try again.";
const EMAIL_REQUIRED = "Enter your email address first.";
const MAGIC_LINK_SENT = "Check your email for a sign-in link.";

type Pending = "idle" | "password" | "magic";

/**
 * Stable no-op subscribe for the hydration check below. Defined at module scope
 * so its identity never changes and `useSyncExternalStore` never resubscribes —
 * nothing external is being watched; only the server/client snapshot differs.
 */
const subscribeToNothing = () => () => {};

const INPUT_CLASS =
  "h-[46px] w-full rounded-[11px] border border-border-2 bg-surface-2 px-[15px] text-[15px] text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export default function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Pending>("idle");
  const [error, setError] = useState<string | null>(initialError);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  /*
   * Both controls stay disabled until React has hydrated, because until then
   * `handlePasswordSubmit` is not attached and its `preventDefault()` cannot
   * run. A submit in that window is a *native* form submit, which is how
   * credentials ended up in the query string on a machine where the bundle
   * never executed. `method="post"` on the form below is the real containment
   * for that; this is the second layer, and it also turns a form that looks
   * functional but silently does nothing into one that visibly explains why.
   *
   * Server-rendered HTML has this false, so the notice is present without JS
   * and disappears on hydration.
   *
   * `useSyncExternalStore` rather than the reflexive setState-in-an-effect:
   * the server snapshot is false and the client snapshot is true, which is
   * exactly the question being asked, and it cannot trigger the cascading
   * render that `react-hooks/set-state-in-effect` exists to prevent.
   */
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  const busy = pending !== "idle";
  const disabled = busy || !hydrated;

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Guards a second submit while the first request is still open.
    if (busy) {
      return;
    }

    setPending("password");
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(CREDENTIALS_ERROR);
        setPending("idle");
        return;
      }

      // push() then refresh(): the server components on the destination have
      // to re-read the session cookie the sign-in just wrote.
      router.push(next);
      router.refresh();
    } catch {
      setError(UNEXPECTED_ERROR);
      setPending("idle");
    }
  }

  async function handleMagicLink() {
    if (busy) {
      return;
    }

    if (!email.trim()) {
      setError(EMAIL_REQUIRED);
      return;
    }

    setPending("magic");
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const emailRedirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;

      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
          // This is a sign-in backup, never a registration path.
          shouldCreateUser: false,
        },
      });
    } catch {
      // Intentionally swallowed. The confirmation below is shown for every
      // outcome so the response cannot distinguish a known address from an
      // unknown one (shouldCreateUser: false makes unknown addresses error).
    }

    setMagicLinkSent(true);
    setPending("idle");
  }

  return (
    <div className="w-full max-w-[380px] rounded-[20px] border border-border bg-surface p-8 shadow-lg animate-[pbPop_0.25s_ease_both] motion-reduce:animate-none">
      <div className="mb-[18px] grid h-[46px] w-[46px] place-items-center rounded-[12px] bg-accent font-mono text-[17px] font-semibold text-white">
        PB
      </div>
      <h1 className="m-0 mb-1.5 font-heading text-[22px] font-semibold tracking-[-0.02em]">
        Private dashboard
      </h1>

      {magicLinkSent ? (
        <>
          <p className="m-0 mb-5 text-[13px] text-muted" role="status">
            {MAGIC_LINK_SENT}
          </p>
          <Link
            href="/"
            className="flex h-10 items-center justify-center rounded-[11px] text-[13px] text-muted hover:text-text"
          >
            ← Back to site
          </Link>
        </>
      ) : (
        <>
          <p className="m-0 mb-5 text-[13px] text-muted">Sign in to continue.</p>

          {/*
            `method="post"` is load-bearing security, not a formality. If this
            form is ever submitted natively — because the bundle was blocked,
            failed, or had not hydrated yet — the browser serialises every named
            field. With the default GET that put the email and password in the
            query string, and from there into browser history, Vercel's request
            logs, and any intercepting corporate proxy. POST puts them in the
            request body instead. Do not remove this, and do not add `action`.
          */}
          <form
            onSubmit={handlePasswordSubmit}
            method="post"
            className="flex flex-col gap-[11px]"
          >
            <label htmlFor="login-email" className="sr-only">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={disabled}
              className={INPUT_CLASS}
            />

            <label htmlFor="login-password" className="sr-only">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={disabled}
              className={INPUT_CLASS}
            />

            {error ? (
              <p
                role="alert"
                className="m-0 rounded-[11px] border border-border-2 bg-surface-2 px-[15px] py-3 text-[13px] font-medium text-text"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={disabled}
              className="mt-1 h-12 cursor-pointer rounded-[12px] bg-accent text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "password" ? "Signing in…" : "Sign in →"}
            </button>

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={disabled}
              className="h-10 cursor-pointer rounded-[11px] bg-transparent text-[13px] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "magic" ? "Sending…" : "Email me a magic link"}
            </button>

            {/*
              Present in the server-rendered HTML and removed on hydration, so
              it is invisible on a normal load and permanent when the bundle
              never runs. Without it the form looks entirely functional and
              silently does nothing, which is exactly how this was found.
            */}
            {!hydrated ? (
              <p role="status" className="m-0 text-center text-[12px] text-muted">
                Loading… if this message stays, JavaScript is blocked here and sign-in
                will not work.
              </p>
            ) : null}

            <Link
              href="/"
              className="flex h-10 items-center justify-center rounded-[11px] text-[13px] text-muted hover:text-text"
            >
              ← Back to site
            </Link>
          </form>
        </>
      )}
    </div>
  );
}
