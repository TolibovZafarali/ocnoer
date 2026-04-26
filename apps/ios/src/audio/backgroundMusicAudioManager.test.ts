import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NativeBackgroundMusicAudioManager,
  type BackgroundMusicManagerSnapshot
} from "./backgroundMusicAudioManager";

type MockAudioPlayer = {
  isLoaded: boolean;
  loop: boolean;
  paused: boolean;
  playing: boolean;
  volume: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
};

const audioMock = vi.hoisted(() => {
  const players: MockAudioPlayer[] = [];
  const createAudioPlayer = vi.fn(() => {
    const player: MockAudioPlayer = {
      isLoaded: true,
      loop: false,
      paused: true,
      playing: false,
      volume: 1,
      play: vi.fn(() => {
        player.paused = false;
        player.playing = true;
      }),
      pause: vi.fn(() => {
        player.paused = true;
        player.playing = false;
      }),
      remove: vi.fn(),
      seekTo: vi.fn(async () => undefined)
    };

    players.push(player);
    return player;
  });

  return {
    createAudioPlayer,
    players,
    setAudioModeAsync: vi.fn(async () => undefined),
    setIsAudioActiveAsync: vi.fn(async () => undefined)
  };
});

vi.mock("expo-audio", () => ({
  createAudioPlayer: audioMock.createAudioPlayer,
  setAudioModeAsync: audioMock.setAudioModeAsync,
  setIsAudioActiveAsync: audioMock.setIsAudioActiveAsync
}));

function waitForManagerState(
  manager: NativeBackgroundMusicAudioManager,
  state: BackgroundMusicManagerSnapshot["state"]
) {
  return new Promise<BackgroundMusicManagerSnapshot>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    const timeout = globalThis.setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for manager state: ${state}`));
    }, 1000);

    unsubscribe = manager.subscribe((snapshot) => {
      if (snapshot.state !== state) {
        return;
      }

      globalThis.clearTimeout(timeout);
      unsubscribe();
      resolve(snapshot);
    });
  });
}

function waitForNextTick() {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

describe("NativeBackgroundMusicAudioManager", () => {
  beforeEach(() => {
    audioMock.players.length = 0;
    audioMock.createAudioPlayer.mockClear();
    audioMock.setAudioModeAsync.mockClear();
    audioMock.setIsAudioActiveAsync.mockClear();
  });

  it("predownloads extensionless runtime music before playing on iOS", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const playing = waitForManagerState(manager, "playing");

    manager.setTarget({
      cue: {
        key: "scene:music_theme",
        label: "Theme",
        url: "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme"
      },
      shouldPlay: true,
      volume: 0.7,
      fadeMs: 0
    });

    await playing;

    expect(audioMock.createAudioPlayer).toHaveBeenCalledWith(
      {
        uri: "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme"
      },
      expect.objectContaining({
        downloadFirst: true,
        keepAudioSessionActive: true
      })
    );
    expect(audioMock.players).toHaveLength(1);
    expect(audioMock.players[0]?.seekTo).toHaveBeenCalledWith(0);
    expect(audioMock.players[0]?.play).toHaveBeenCalledTimes(1);
    expect(audioMock.players[0]?.volume).toBe(0.7);
  });

  it("keeps one player when the active dialogue still uses the same track", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const firstPlaying = waitForManagerState(manager, "playing");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme";

    manager.setTarget({
      cue: {
        key: "scene:music_theme",
        label: "Theme",
        url: targetUrl
      },
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await firstPlaying;

    manager.setTarget({
      cue: {
        key: "scene-cue:music_theme",
        label: "Theme",
        url: targetUrl
      },
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });
    await waitForNextTick();

    expect(audioMock.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audioMock.players).toHaveLength(1);
    expect(audioMock.players[0]?.play).toHaveBeenCalledTimes(1);
    expect(audioMock.players[0]?.remove).not.toHaveBeenCalled();
  });

  it("stops and releases music when the active story position resolves to silence", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const playing = waitForManagerState(manager, "playing");

    manager.setTarget({
      cue: {
        key: "scene:music_theme",
        label: "Theme",
        url: "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme"
      },
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await playing;

    const idle = waitForManagerState(manager, "idle");
    manager.setTarget({
      cue: null,
      shouldPlay: false,
      volume: 0,
      fadeMs: 0
    });

    await idle;

    expect(audioMock.players[0]?.pause).toHaveBeenCalledTimes(1);
    expect(audioMock.players[0]?.remove).toHaveBeenCalledTimes(1);
  });
});
