import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn()
  }
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createOfflinePlayerSession,
  loadOfflinePlayerSession,
  OFFLINE_PLAYER,
  saveOfflinePlayerSession,
  withOfflineCatName
} from "./offlinePlayerStorage";

describe("offline player storage", () => {
  let saved: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    saved = new Map();
    vi.mocked(AsyncStorage.getItem).mockImplementation(
      async (key) => saved.get(key) ?? null
    );
    vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      saved.set(key, value);
    });
  });

  it("creates the fictional reader without requiring a stored session", async () => {
    expect((await loadOfflinePlayerSession()).player).toEqual(OFFLINE_PLAYER);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("persists the chosen name and lock across session restores", async () => {
    const player = withOfflineCatName(OFFLINE_PLAYER, "  Little   Moon  ");
    await saveOfflinePlayerSession(player);

    const restored = await loadOfflinePlayerSession();
    expect(restored.player).toEqual({
      ...OFFLINE_PLAYER,
      catName: "Little Moon",
      catNameLocked: true
    });
    expect(withOfflineCatName(restored.player, "Different")).toEqual(
      restored.player
    );
  });

  it("validates names before saving and always retains the fictional identity", () => {
    expect(() => withOfflineCatName(OFFLINE_PLAYER, "")).toThrow(
      "Enter a cat name."
    );
    expect(() => withOfflineCatName(OFFLINE_PLAYER, "🐱")).toThrow();
    expect(
      createOfflinePlayerSession({
        ...OFFLINE_PLAYER,
        id: "old-player",
        firstName: "Existing user"
      }).player
    ).toEqual(OFFLINE_PLAYER);
  });

  it("recovers from corrupt local profile data without contacting a backend", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue("{invalid");
    expect((await loadOfflinePlayerSession()).player).toEqual(OFFLINE_PLAYER);
  });
});
