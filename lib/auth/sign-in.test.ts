import { describe, expect, it, vi } from "vitest";

import { signInWithAutoDetectPassword } from "@/lib/auth/sign-in";

describe("signInWithAutoDetectPassword", () => {
  it("returns admin when first account succeeds", async () => {
    const signIn = vi.fn(
      async ({ account }: { account: "admin" | "player" }) =>
        ({
          ok: account === "admin",
          role: account === "admin" ? ("admin" as const) : null
        }) as const
    );

    const result = await signInWithAutoDetectPassword({
      adminEmail: "admin@example.com",
      playerEmail: "player@example.com",
      password: "secret",
      signIn
    });

    expect(result).toEqual({
      ok: true,
      role: "admin",
      redirectPath: "/admin",
      account: "admin"
    });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("falls back to player when admin fails", async () => {
    const signIn = vi.fn(async ({ account }: { account: "admin" | "player" }) => {
      if (account === "admin") {
        return { ok: false, role: null };
      }

      return { ok: true, role: "player" as const };
    });

    const result = await signInWithAutoDetectPassword({
      adminEmail: "admin@example.com",
      playerEmail: "player@example.com",
      password: "secret",
      signIn
    });

    expect(result).toEqual({
      ok: true,
      role: "player",
      redirectPath: "/play",
      account: "player"
    });
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("returns invalid credentials when both attempts fail", async () => {
    const signIn = vi.fn(async () => ({ ok: false, role: null }));

    const result = await signInWithAutoDetectPassword({
      adminEmail: "admin@example.com",
      playerEmail: "player@example.com",
      password: "secret",
      signIn
    });

    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("returns missing role when login succeeds without role metadata", async () => {
    const signIn = vi.fn(async () => ({ ok: true, role: null }));

    const result = await signInWithAutoDetectPassword({
      adminEmail: "admin@example.com",
      playerEmail: "player@example.com",
      password: "secret",
      signIn
    });

    expect(result).toEqual({ ok: false, reason: "missing_role" });
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
