import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const signInAsPlayerSecretMock = vi.fn();
const clearPlayerSessionMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/auth/player", () => ({
  clearPlayerSession: clearPlayerSessionMock,
  signInAsPlayerSecret: signInAsPlayerSecretMock
}));

const {
  signInHomePlayerAction,
  signOutPlayerAction
} = await import("@/app/(player)/play/actions");

describe("player actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error state when the password is empty", async () => {
    const formData = new FormData();

    await expect(
      signInHomePlayerAction(
        {
          errorCount: 0
        },
        formData
      )
    ).resolves.toEqual({
      errorCount: 1
    });

    expect(signInAsPlayerSecretMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns a generic error for invalid or inactive players", async () => {
    signInAsPlayerSecretMock.mockResolvedValue({
      ok: false
    });

    const formData = new FormData();
    formData.set("password", "luna.secret");

    await expect(
      signInHomePlayerAction(
        {
          errorCount: 0
        },
        formData
      )
    ).resolves.toEqual({
      errorCount: 1
    });

    expect(signInAsPlayerSecretMock).toHaveBeenCalledWith("luna.secret");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects valid players to /play", async () => {
    signInAsPlayerSecretMock.mockResolvedValue({
      ok: true,
      player: {
        id: "player_1",
        firstName: "Luna",
        catName: null,
        catNameLocked: false
      }
    });

    const formData = new FormData();
    formData.set("password", "luna.secret");

    await expect(
      signInHomePlayerAction(
        {
          errorCount: 0
        },
        formData
      )
    ).rejects.toThrow("REDIRECT:/play");

    expect(signInAsPlayerSecretMock).toHaveBeenCalledWith("luna.secret");
    expect(redirectMock).toHaveBeenCalledWith("/play");
  });

  it("redirects sign-out to the homepage", async () => {
    clearPlayerSessionMock.mockResolvedValue(undefined);

    await expect(signOutPlayerAction()).rejects.toThrow("REDIRECT:/");

    expect(clearPlayerSessionMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
