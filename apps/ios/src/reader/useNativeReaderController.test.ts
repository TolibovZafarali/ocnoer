import { describe, expect, it, vi } from "vitest";

vi.mock("./imagePreload", () => ({
  ensureChapterAssetsReady: vi.fn(),
  ensureSceneAssetsReady: vi.fn(),
  getAssetCacheErrorMessage: vi.fn(() => null),
  warmNextSceneAssets: vi.fn()
}));

vi.mock("../runtime/runtimeRepository", () => ({
  createMobileRuntimeRepository: vi.fn(() => ({
    loadChapter: vi.fn(),
    loadSession: vi.fn()
  }))
}));

vi.mock("../storage/playerProgressStorage", () => ({
  loadProgressByPlayerId: vi.fn()
}));

vi.mock("../sync/playerProgressSync", () => ({
  saveSyncedPlayerProgress: vi.fn()
}));

import { commitNativeReaderStateAfterAssetGate } from "./useNativeReaderController";

describe("commitNativeReaderStateAfterAssetGate", () => {
  it("waits for required target assets before committing visible state", async () => {
    let resolveAssets!: () => void;
    const ensureAssets = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAssets = resolve;
        })
    );
    const commit = vi.fn();

    const commitPromise = commitNativeReaderStateAfterAssetGate({
      ensureAssets,
      commit
    });

    await Promise.resolve();

    expect(ensureAssets).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();

    resolveAssets();
    await commitPromise;

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("does not commit visible state when target assets fail to prepare", async () => {
    const ensureAssets = vi.fn(async () => {
      throw new Error("asset missing");
    });
    const commit = vi.fn();

    await expect(
      commitNativeReaderStateAfterAssetGate({
        ensureAssets,
        commit
      })
    ).rejects.toThrow("asset missing");

    expect(commit).not.toHaveBeenCalled();
  });
});
