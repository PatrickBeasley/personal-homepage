import Link from "next/link";

import { sendMagicLinkAction, signInWithPasswordAction } from "@/lib/auth/actions";

const INPUT_CLASS =
  "h-[46px] w-full rounded-[11px] border border-border-2 bg-surface-2 px-[15px] text-[15px] text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/*
 * A Server Component on purpose. It carries no "use client", no state, and no
 * Supabase SDK, so it works with no client JavaScript at all — which is the
 * entire point. Next's docs guarantee progressive enhancement for forms
 * calling Server Actions from Server Components
 * (node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md).
 *
 * Errors arrive as a query flag rather than component state. The documented
 * way to render action state inline requires a Client Component with
 * useActionState — exactly the shape whose no-JS behaviour is not guaranteed.
 * The cost is retyping the email after a failed sign-in; that is deliberate.
 *
 * Only `email` is `required`. Marking the password required too would block
 * the magic-link button, which submits the same form and needs no password.
 * An empty password simply fails authentication and takes the normal error
 * path, so nothing is lost.
 */
export default function LoginForm({
  next,
  error,
  magicLinkSent,
}: {
  next: string;
  error: string | null;
  magicLinkSent: boolean;
}) {
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
            Check your email for a sign-in link.
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

          <form action={signInWithPasswordAction} className="flex flex-col gap-[11px]">
            <input type="hidden" name="next" value={next} />

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
              className={INPUT_CLASS}
            />

            <label htmlFor="login-password" className="sr-only">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
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

            {/* Default action signs in, so pressing Enter does the expected thing. */}
            <button
              type="submit"
              className="mt-1 h-12 cursor-pointer rounded-[12px] bg-accent text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sign in →
            </button>

            <button
              type="submit"
              formAction={sendMagicLinkAction}
              className="h-10 cursor-pointer rounded-[11px] bg-transparent text-[13px] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Email me a magic link
            </button>

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
