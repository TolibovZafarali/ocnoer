import { beforeEach, describe, expect, it, vi } from "vitest";

const findPlayerProfileForSecretMock = vi.fn();
const getPlayerProfileSessionDataMock = vi.fn();
const touchPlayerPresenceMock = vi.fn();
const cookieSetMock = vi.fn();
const cookieGetMock = vi.fn();
const cookiesMock = vi.fn(async () => ({
  set: cookieSetMock,
  get: cookieGetMock
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

vi.mock("@/lib/player-profiles", () => ({
  findPlayerProfileForSecret: findPlayerProfileForSecretMock,
  getPlayerProfileSessionData: getPlayerProfileSessionDataMock,
  touchPlayerPresence: touchPlayerPresenceMock
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseServerEnv: () => ({
    serviceRoleKey: "test-service-role-key"
  })
}));

const { PlayerStatus } = await import("@prisma/client");
const { getPlayerSession, signInAsPlayerSecret } =
  await import("@/lib/auth/player");

describe("player auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieGetMock.mockReturnValue(undefined);
    touchPlayerPresenceMock.mockResolvedValue({ count: 1 });
  });

  it("denies sign-in for inactive players", async () => {
    findPlayerProfileForSecretMock.mockResolvedValue({
      id: "player_1",
      firstName: "Luna",
      catName: null,
      catNameLocked: false,
      status: PlayerStatus.INACTIVE
    });

    await expect(signInAsPlayerSecret("luna.secret")).resolves.toEqual({
      ok: false
    });
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(touchPlayerPresenceMock).not.toHaveBeenCalled();
  });

  it("creates a signed cookie for active players", async () => {
    findPlayerProfileForSecretMock.mockResolvedValue({
      id: "player_1",
      firstName: "Luna",
      catName: null,
      catNameLocked: false,
      status: PlayerStatus.ACTIVE
    });

    await expect(signInAsPlayerSecret("luna.secret")).resolves.toEqual({
      ok: true,
      player: {
        id: "player_1",
        firstName: "Luna",
        catName: null,
        catNameLocked: false
      }
    });

    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    expect(touchPlayerPresenceMock).toHaveBeenCalledWith("player_1");
    const [cookieName, cookieValue, options] = cookieSetMock.mock.calls[0];
    expect(cookieName).toBe("ocnoer_player_session");
    expect(String(cookieValue).startsWith("player_1.")).toBe(true);
    expect(options).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax"
    });
  });

  it("invalidates session access when profile becomes inactive", async () => {
    findPlayerProfileForSecretMock.mockResolvedValue({
      id: "player_1",
      firstName: "Luna",
      catName: null,
      catNameLocked: false,
      status: PlayerStatus.ACTIVE
    });
    await signInAsPlayerSecret("luna.secret");

    const [, cookieValue] = cookieSetMock.mock.calls[0] ?? [];
    cookieGetMock.mockReturnValueOnce({
      value: cookieValue
    });
    getPlayerProfileSessionDataMock.mockResolvedValueOnce({
      id: "player_1",
      firstName: "Luna",
      catName: null,
      catNameLocked: false,
      status: PlayerStatus.INACTIVE
    });

    await expect(getPlayerSession()).resolves.toEqual({
      player: null
    });
  });
});
