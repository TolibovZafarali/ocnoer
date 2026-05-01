import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const updateManyMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    playerProfile: {
      findMany: findManyMock,
      create: createMock,
      update: updateMock,
      updateMany: updateManyMock,
      findUnique: findUniqueMock
    }
  }
}));

const {
  PlayerProfileError,
  createPlayerProfile,
  isPlayerOnline,
  normalizePlayerUsername,
  setPlayerProfileCatNameOnce,
  touchPlayerPresence,
  updatePlayerProfile
} = await import("@/lib/player-profiles");
const { PlayerStatus } = await import("@prisma/client");

describe("player profile helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes usernames to lowercase and trimmed values", () => {
    expect(normalizePlayerUsername("  LUNA.Secret  ")).toBe("luna.secret");
  });

  it("detects online players from a recent last-seen timestamp", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");

    expect(isPlayerOnline(new Date("2026-05-01T11:56:00.000Z"), now)).toBe(
      true
    );
    expect(isPlayerOnline(new Date("2026-05-01T11:54:59.000Z"), now)).toBe(
      false
    );
    expect(isPlayerOnline(null, now)).toBe(false);
  });

  it("creates profiles with normalized username and lock state based on cat name", async () => {
    createMock.mockResolvedValue({ id: "player_1" });

    await createPlayerProfile({
      firstName: "Luna",
      username: "  Luna.Secret  ",
      catName: " Nox ",
      status: PlayerStatus.ACTIVE
    });

    expect(createMock).toHaveBeenCalledWith({
      data: {
        firstName: "Luna",
        username: "Luna.Secret",
        usernameNormalized: "luna.secret",
        catName: "Nox",
        catNameLocked: true,
        status: PlayerStatus.ACTIVE
      }
    });
  });

  it("rejects invalid username characters", async () => {
    await expect(
      createPlayerProfile({
        firstName: "Luna",
        username: "bad username",
        catName: null,
        status: PlayerStatus.ACTIVE
      })
    ).rejects.toBeInstanceOf(PlayerProfileError);

    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate usernames when the normalized value already exists", async () => {
    createMock.mockRejectedValueOnce({
      code: "P2002"
    });

    await expect(
      createPlayerProfile({
        firstName: "Luna",
        username: "  Luna.Secret  ",
        catName: null,
        status: PlayerStatus.ACTIVE
      })
    ).rejects.toBeInstanceOf(PlayerProfileError);
  });

  it("unlocks cat-name prompt when admin clears cat name", async () => {
    findUniqueMock.mockResolvedValueOnce({
      catNameLocked: true
    });
    updateMock.mockResolvedValue({ id: "player_1" });

    await updatePlayerProfile({
      playerId: "player_1",
      firstName: "Luna",
      username: "luna.secret",
      catName: "",
      status: PlayerStatus.INACTIVE
    });

    expect(updateMock).toHaveBeenCalledWith({
      where: {
        id: "player_1"
      },
      data: {
        firstName: "Luna",
        username: "luna.secret",
        usernameNormalized: "luna.secret",
        catName: null,
        catNameLocked: false,
        status: PlayerStatus.INACTIVE
      }
    });
  });

  it("allows admin cat-name edits after lock without unlocking", async () => {
    findUniqueMock.mockResolvedValueOnce({
      catNameLocked: true
    });
    updateMock.mockResolvedValue({ id: "player_1" });

    await updatePlayerProfile({
      playerId: "player_1",
      firstName: "Luna",
      username: "luna.secret",
      catName: "Nova",
      status: PlayerStatus.ACTIVE
    });

    expect(updateMock).toHaveBeenCalledWith({
      where: {
        id: "player_1"
      },
      data: {
        firstName: "Luna",
        username: "luna.secret",
        usernameNormalized: "luna.secret",
        catName: "Nova",
        catNameLocked: true,
        status: PlayerStatus.ACTIVE
      }
    });
  });

  it("locks cat name on first player write and returns existing value afterwards", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 1 });

    await expect(
      setPlayerProfileCatNameOnce({
        playerId: "player_1",
        catName: "Nox"
      })
    ).resolves.toEqual({
      updated: true,
      catName: "Nox",
      catNameLocked: true
    });

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        id: "player_1",
        OR: [
          {
            catNameLocked: false
          },
          {
            catName: null
          }
        ],
        status: PlayerStatus.ACTIVE
      },
      data: {
        catName: "Nox",
        catNameLocked: true
      }
    });

    updateManyMock.mockResolvedValueOnce({ count: 0 });
    findUniqueMock.mockResolvedValueOnce({
      catName: "Nox",
      catNameLocked: true,
      status: PlayerStatus.ACTIVE
    });

    await expect(
      setPlayerProfileCatNameOnce({
        playerId: "player_1",
        catName: "Renamed"
      })
    ).resolves.toEqual({
      updated: false,
      catName: "Nox",
      catNameLocked: true,
      status: PlayerStatus.ACTIVE
    });
  });

  it("touches player presence only when the stored timestamp is stale", async () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    updateManyMock.mockResolvedValueOnce({ count: 1 });

    await touchPlayerPresence("player_1", now);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        id: "player_1",
        OR: [
          {
            lastSeenAt: null
          },
          {
            lastSeenAt: {
              lt: new Date("2026-05-01T11:59:00.000Z")
            }
          }
        ]
      },
      data: {
        lastSeenAt: now
      }
    });
  });
});
