import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const fileSystemMock = vi.hoisted(() => {
  const files = new Map<string, { exists: boolean; size: number }>();
  const cache = {
    exists: true,
    uri: "file:///cache"
  };

  class Directory {
    exists: boolean;
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
      this.exists = true;
    }

    create = vi.fn(() => {
      this.exists = true;
    });
  }

  class File {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }

    get exists() {
      return files.get(this.uri)?.exists ?? false;
    }

    set exists(value: boolean) {
      files.set(this.uri, {
        exists: value,
        size: files.get(this.uri)?.size ?? 0
      });
    }

    get size() {
      return files.get(this.uri)?.size ?? 0;
    }

    set size(value: number) {
      files.set(this.uri, {
        exists: files.get(this.uri)?.exists ?? false,
        size: value
      });
    }

    static downloadFileAsync = vi.fn(
      async (_url: string, destination: File) => {
        destination.exists = true;
        destination.size = 128;
        return destination;
      }
    );
  }

  return {
    cache,
    Directory,
    File,
    files
  };
});

vi.mock("expo-audio", () => ({
  createAudioPlayer: audioMock.createAudioPlayer,
  setAudioModeAsync: audioMock.setAudioModeAsync,
  setIsAudioActiveAsync: audioMock.setIsAudioActiveAsync
}));

vi.mock("expo-file-system", () => ({
  Directory: fileSystemMock.Directory,
  File: fileSystemMock.File,
  Paths: {
    cache: fileSystemMock.cache
  }
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

function waitForCreatedPlayerCount(count: number) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (audioMock.createAudioPlayer.mock.calls.length >= count) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= 1000) {
        reject(new Error(`Timed out waiting for ${count} audio players.`));
        return;
      }

      globalThis.setTimeout(check, 0);
    };

    check();
  });
}

describe("NativeBackgroundMusicAudioManager", () => {
  beforeEach(() => {
    audioMock.players.length = 0;
    audioMock.createAudioPlayer.mockClear();
    audioMock.setAudioModeAsync.mockClear();
    audioMock.setIsAudioActiveAsync.mockClear();
    fileSystemMock.files.clear();
    fileSystemMock.File.downloadFileAsync.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? "audio/mpeg" : null
        }
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches extensionless runtime music before creating the iOS player", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const playing = waitForManagerState(manager, "playing");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme";

    manager.setTarget({
      cue: {
        key: "scene:music_theme",
        label: "Theme",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.7,
      fadeMs: 0
    });

    await playing;

    expect(fileSystemMock.File.downloadFileAsync).toHaveBeenCalledWith(
      targetUrl,
      expect.objectContaining({
        uri: expect.stringMatching(/\.mp3$/)
      }),
      {
        idempotent: true
      }
    );
    expect(audioMock.createAudioPlayer).toHaveBeenCalledWith(
      {
        uri: expect.stringMatching(
          /^file:\/\/\/cache\/ocnoer-background-music\/.+\.mp3$/
        )
      },
      expect.objectContaining({
        downloadFirst: false,
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
      sessionId: "session-a",
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
      sessionId: "session-a",
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
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await playing;

    const idle = waitForManagerState(manager, "idle");
    manager.setTarget({
      cue: null,
      sessionId: "session-a",
      shouldPlay: false,
      volume: 0,
      fadeMs: 0
    });

    await idle;

    expect(audioMock.players[0]?.pause).toHaveBeenCalledTimes(1);
    expect(audioMock.players[0]?.remove).toHaveBeenCalledTimes(1);
  });

  it("restarts the same track for a new reader session", async () => {
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
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await firstPlaying;

    manager.setTarget({
      cue: {
        key: "scene:music_theme",
        label: "Theme",
        url: targetUrl
      },
      sessionId: "session-b",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await waitForCreatedPlayerCount(2);

    expect(audioMock.createAudioPlayer).toHaveBeenCalledTimes(2);
    expect(audioMock.players[0]?.pause).toHaveBeenCalledTimes(1);
    expect(audioMock.players[0]?.remove).toHaveBeenCalledTimes(1);
    expect(audioMock.players[1]?.seekTo).toHaveBeenCalledWith(0);
    expect(audioMock.players[1]?.play).toHaveBeenCalledTimes(1);
  });
});
