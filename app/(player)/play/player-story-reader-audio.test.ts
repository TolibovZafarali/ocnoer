import { describe, expect, it, vi } from "vitest";

import {
  restartBackgroundMusic,
  resumePausedBackgroundMusic
} from "./player-story-reader-audio";

function createPlayMock() {
  return vi.fn(async () => undefined);
}

function createAudioElement(input?: {
  currentTime?: number;
  paused?: boolean;
  playMock?: ReturnType<typeof createPlayMock>;
}) {
  const playMock = input?.playMock ?? createPlayMock();

  return {
    currentTime: input?.currentTime ?? 12,
    paused: input?.paused ?? true,
    play: playMock,
    playMock
  };
}

describe("player story reader audio helpers", () => {
  it("restarts background music from the beginning", () => {
    const audio = createAudioElement({
      currentTime: 42
    });

    restartBackgroundMusic(audio);

    expect(audio.currentTime).toBe(0);
    expect(audio.playMock).toHaveBeenCalledTimes(1);
  });

  it("retries background music only while paused", () => {
    const pausedAudio = createAudioElement({
      paused: true
    });
    const playingAudio = createAudioElement({
      paused: false
    });

    resumePausedBackgroundMusic(pausedAudio);
    resumePausedBackgroundMusic(playingAudio);

    expect(pausedAudio.playMock).toHaveBeenCalledTimes(1);
    expect(playingAudio.playMock).not.toHaveBeenCalled();
  });

  it("ignores missing audio elements", () => {
    expect(() => {
      restartBackgroundMusic(null);
      resumePausedBackgroundMusic(null);
    }).not.toThrow();
  });
});
