import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fadeOutBackgroundMusic,
  restartBackgroundMusic,
  resumePausedBackgroundMusic
} from "./player-story-reader-audio";

function createPlayMock() {
  return vi.fn(async () => undefined);
}

function createAudioElement(input?: {
  currentTime?: number;
  paused?: boolean;
  volume?: number;
  playMock?: ReturnType<typeof createPlayMock>;
}) {
  const playMock = input?.playMock ?? createPlayMock();

  return {
    currentTime: input?.currentTime ?? 12,
    paused: input?.paused ?? true,
    volume: input?.volume ?? 1,
    play: playMock,
    playMock
  };
}

describe("player story reader audio helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("restarts background music from the beginning", () => {
    const audio = createAudioElement({
      currentTime: 42,
      volume: 0.25
    });

    restartBackgroundMusic(audio);

    expect(audio.currentTime).toBe(0);
    expect(audio.volume).toBe(1);
    expect(audio.playMock).toHaveBeenCalledTimes(1);
  });

  it("retries background music only while paused", () => {
    const pausedAudio = createAudioElement({
      paused: true,
      volume: 0.1
    });
    const playingAudio = createAudioElement({
      paused: false
    });

    resumePausedBackgroundMusic(pausedAudio);
    resumePausedBackgroundMusic(playingAudio);

    expect(pausedAudio.playMock).toHaveBeenCalledTimes(1);
    expect(pausedAudio.volume).toBe(1);
    expect(playingAudio.playMock).not.toHaveBeenCalled();
  });

  it("fades background music down to silence over time", async () => {
    vi.useFakeTimers();

    const audio = createAudioElement({
      paused: false,
      volume: 1
    });

    const fadePromise = fadeOutBackgroundMusic(audio, 64);

    await vi.advanceTimersByTimeAsync(32);
    expect(audio.volume).toBeLessThan(1);
    expect(audio.volume).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(64);
    await fadePromise;

    expect(audio.volume).toBe(0);
  });

  it("mutes background music immediately when the fade duration is zero", async () => {
    const audio = createAudioElement({
      paused: false,
      volume: 0.8
    });

    await fadeOutBackgroundMusic(audio, 0);

    expect(audio.volume).toBe(0);
  });

  it("ignores missing audio elements", () => {
    expect(() => {
      restartBackgroundMusic(null);
      resumePausedBackgroundMusic(null);
    }).not.toThrow();
  });
});
