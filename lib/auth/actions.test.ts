import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * `vi.hoisted` is required, not stylistic. vitest hoists `vi.mock` calls above
 * everything else in the file, so a factory that closes over an ordinary
 * top-level `const` throws "Cannot access before initialization". Anything a
 * mock factory references must be created inside `vi.hoisted`.
 */
const { signInWithPassword, redirect } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  redirect: vi.fn((url: string) => {
    // The real redirect() signals by throwing; mirroring that keeps the action
    // under test on its true control-flow path.
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { signInWithPassword },
  }),
}));

async function callAndCaptureRedirect(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("REDIRECT:")) {
      return message.slice("REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("action did not redirect");
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.append(key, value));
  return data;
}

describe("signInWithPasswordAction", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    redirect.mockClear();
  });

  it("redirects to the requested path on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    const { signInWithPasswordAction } = await import("./actions");
    const target = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "a@b.com", password: "pw", next: "/dashboard" })),
    );

    expect(target).toBe("/dashboard");
  });

  // The enumeration-safety property. These three failures must be
  // indistinguishable to the caller, so the redirect target must be identical.
  it("redirects identically for every credential failure", async () => {
    const { signInWithPasswordAction } = await import("./actions");

    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const wrongPassword = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "known@b.com", password: "bad", next: "/dashboard" })),
    );

    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const unknownUser = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "nobody@b.com", password: "pw", next: "/dashboard" })),
    );

    signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    const unconfirmed = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "known@b.com", password: "pw", next: "/dashboard" })),
    );

    expect(wrongPassword).toBe(unknownUser);
    expect(unknownUser).toBe(unconfirmed);
    expect(wrongPassword).toContain("error=1");
  });

  it("treats a thrown transport failure the same as a rejected credential", async () => {
    const { signInWithPasswordAction } = await import("./actions");

    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const returnedError = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "a@b.com", password: "pw", next: "/dashboard" })),
    );

    signInWithPassword.mockRejectedValue(new Error("fetch failed"));
    const thrownError = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "a@b.com", password: "pw", next: "/dashboard" })),
    );

    expect(thrownError).toBe(returnedError);
  });

  it("refuses an off-site next target", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    const { signInWithPasswordAction } = await import("./actions");
    const target = await callAndCaptureRedirect(() =>
      signInWithPasswordAction(form({ email: "a@b.com", password: "pw", next: "https://evil.example" })),
    );

    expect(target).toBe("/dashboard");
  });
});
