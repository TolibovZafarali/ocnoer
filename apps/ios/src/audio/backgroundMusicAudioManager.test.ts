import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NativeBackgroundMusicAudioManager,
  type BackgroundMusicManagerSnapshot
} from "./backgroundMusicAudioManager";

type MockAudioPlayer = {
  isLoaded: boolean;
  listeners: Array<(status: { didJustFinish?: boolean }) => void>;
  loop: boolean;
  paused: boolean;
  playing: boolean;
  addListener: ReturnType<typeof vi.fn>;
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
      listeners: [],
      loop: false,
      paused: true,
      playing: false,
      addListener: vi.fn((_eventName, listener) => {
        player.listeners.push(listener);
        return {
          remove: vi.fn(() => {
            player.listeners = player.listeners.filter(
              (currentListener) => currentListener !== listener
            );
          })
        };
      }),
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

function emitPlaybackFinished(player: MockAudioPlayer) {
  player.paused = true;
  player.playing = false;
  player.listeners.forEach((listener) => {
    listener({
      didJustFinish: true
    });
  });
}

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

function waitForPlayerPlayCallCount(player: MockAudioPlayer, count: number) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (player.play.mock.calls.length >= count) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= 1000) {
        reject(new Error(`Timed out waiting for ${count} play calls.`));
        return;
      }

      globalThis.setTimeout(check, 0);
    };

    check();
  });
}

function createArrayBuffer(bytes: number[]) {
  const buffer = new Uint8Array(bytes);

  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

function createFetchResponse(input: {
  bytes?: number[];
  headers?: Record<string, string | null>;
  status?: number;
}) {
  const status = input.status ?? 200;
  const normalizedHeaders = new Map(
    Object.entries(input.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value
    ])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => normalizedHeaders.get(name.toLowerCase()) ?? null
    },
    arrayBuffer: input.bytes
      ? async () => createArrayBuffer(input.bytes ?? [])
      : undefined
  };
}

const MP4_AUDIO_SIGNATURE = [
  0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d
];
const WEBM_AUDIO_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86];

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

  it("waits for a transition target cue to start playback", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme";
    const cue = {
      key: "scene:music_theme",
      label: "Theme",
      url: targetUrl
    };
    let resolved = false;
    const started = manager
      .waitForTargetPlaybackStart({
        cue,
        sessionId: "session-a",
        shouldPlay: true
      })
      .then((snapshot) => {
        resolved = true;
        return snapshot;
      });

    await waitForNextTick();

    expect(resolved).toBe(false);

    manager.setTarget({
      cue,
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.7,
      fadeMs: 0
    });

    await expect(started).resolves.toMatchObject({
      activeLabel: "Theme",
      error: null,
      state: "playing"
    });
  });

  it("uses the sniffed MP4 audio extension when storage reports mpeg", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { method?: string }) => {
        if (init?.method === "HEAD") {
          return createFetchResponse({
            headers: {
              "content-length": "128",
              "content-type": "audio/mpeg",
              etag: "mp4-etag"
            }
          });
        }

        return createFetchResponse({
          bytes: MP4_AUDIO_SIGNATURE,
          headers: {
            "content-type": "audio/mpeg"
          }
        });
      })
    );

    const manager = new NativeBackgroundMusicAudioManager();
    const playing = waitForManagerState(manager, "playing");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_mp4";

    manager.setTarget({
      cue: {
        key: "scene:music_mp4",
        label: "MP4",
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
        uri: expect.stringMatching(/\.m4a$/)
      }),
      {
        idempotent: true
      }
    );
    expect(audioMock.createAudioPlayer).toHaveBeenCalledWith(
      {
        uri: expect.stringMatching(
          /^file:\/\/\/cache\/ocnoer-background-music\/.+\.m4a$/
        )
      },
      expect.any(Object)
    );
  });

  it("uses an iOS-compatible derivative when the scene track is WebM", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const playing = waitForManagerState(manager, "playing");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_webm";
    const derivativeUrl = `${targetUrl}.ios.m4a`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        if (url === targetUrl && init?.method === "HEAD") {
          return createFetchResponse({
            headers: {
              "content-length": "4021745",
              "content-type": "audio/mpeg",
              etag: "webm-etag"
            }
          });
        }

        if (url === targetUrl) {
          return createFetchResponse({
            bytes: WEBM_AUDIO_SIGNATURE,
            headers: {
              "content-type": "audio/mpeg"
            }
          });
        }

        if (url === derivativeUrl && init?.method === "HEAD") {
          return createFetchResponse({
            headers: {
              "content-length": "128",
              "content-type": "audio/mp4",
              etag: "m4a-etag"
            }
          });
        }

        if (url === derivativeUrl) {
          return createFetchResponse({
            bytes: MP4_AUDIO_SIGNATURE,
            headers: {
              "content-type": "audio/mp4"
            }
          });
        }

        return createFetchResponse({
          status: 404
        });
      })
    );

    manager.setTarget({
      cue: {
        key: "scene:scene_3:music_webm",
        label: "WebM source",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.7,
      fadeMs: 0
    });

    await playing;

    expect(fileSystemMock.File.downloadFileAsync).toHaveBeenCalledWith(
      derivativeUrl,
      expect.objectContaining({
        uri: expect.stringMatching(/\.m4a$/)
      }),
      {
        idempotent: true
      }
    );
    expect(audioMock.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audioMock.players[0]?.play).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unsupported WebM target until the cue changes", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const error = waitForManagerState(manager, "error");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_webm";
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      if (url === targetUrl && init?.method === "HEAD") {
        return createFetchResponse({
          headers: {
            "content-length": "4021745",
            "content-type": "audio/mpeg",
            etag: "webm-etag"
          }
        });
      }

      if (url === targetUrl) {
        return createFetchResponse({
          bytes: WEBM_AUDIO_SIGNATURE,
          headers: {
            "content-type": "audio/mpeg"
          }
        });
      }

      return createFetchResponse({
        status: 404
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    manager.setTarget({
      cue: {
        key: "scene:scene_3:music_webm",
        label: "WebM source",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.7,
      fadeMs: 0
    });

    await expect(error).resolves.toMatchObject({
      error: expect.stringContaining("Unsupported iOS background music format")
    });

    const fetchCallCount = fetchMock.mock.calls.length;

    manager.setTarget({
      cue: {
        key: "scene:scene_3:music_webm",
        label: "WebM source",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.7,
      fadeMs: 0
    });
    await waitForNextTick();

    expect(fetchMock).toHaveBeenCalledTimes(fetchCallCount);
    expect(audioMock.createAudioPlayer).not.toHaveBeenCalled();
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

  it("plays chapter ending music once and reports when it ends", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const playing = waitForManagerState(manager, "playing");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/ending_theme";

    manager.setTarget({
      cue: {
        key: "chapter-ending-card:chapter_one:ending_theme",
        label: "Ending",
        loop: false,
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await playing;

    const player = audioMock.players[0];
    const ended = waitForManagerState(manager, "ended");

    expect(player?.loop).toBe(false);
    expect(player?.addListener).toHaveBeenCalledWith(
      "playbackStatusUpdate",
      expect.any(Function)
    );

    emitPlaybackFinished(player!);

    await expect(ended).resolves.toMatchObject({
      activeLabel: "Ending",
      error: null,
      state: "ended"
    });

    manager.setTarget({
      cue: {
        key: "chapter-ending-card:chapter_one:ending_theme",
        label: "Ending",
        loop: false,
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });
    await waitForNextTick();

    expect(player?.play).toHaveBeenCalledTimes(1);
    expect(audioMock.createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it("restarts the scene track when native playback was paused behind tracked state", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const firstPlaying = waitForManagerState(manager, "playing");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme";

    manager.setTarget({
      cue: {
        key: "scene:scene_3:music_theme",
        label: "Theme",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await firstPlaying;

    const player = audioMock.players[0];

    expect(player).toBeDefined();

    player!.paused = true;
    player!.playing = false;

    manager.setTarget({
      cue: {
        key: "scene:scene_3:music_theme",
        label: "Theme",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await waitForPlayerPlayCallCount(player!, 2);

    expect(audioMock.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(player!.remove).not.toHaveBeenCalled();
  });

  it("recreates the scene track when the tracked native player was unloaded", async () => {
    const manager = new NativeBackgroundMusicAudioManager();
    const firstPlaying = waitForManagerState(manager, "playing");
    const targetUrl =
      "https://example.supabase.co/storage/v1/object/public/runtime/media/background-music/music_theme";

    manager.setTarget({
      cue: {
        key: "scene:scene_3:music_theme",
        label: "Theme",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await firstPlaying;

    const player = audioMock.players[0];

    expect(player).toBeDefined();

    player!.isLoaded = false;
    player!.paused = true;
    player!.playing = false;

    manager.setTarget({
      cue: {
        key: "scene:scene_3:music_theme",
        label: "Theme",
        url: targetUrl
      },
      sessionId: "session-a",
      shouldPlay: true,
      volume: 0.85,
      fadeMs: 0
    });

    await waitForCreatedPlayerCount(2);

    expect(player!.pause).toHaveBeenCalledTimes(1);
    expect(player!.remove).toHaveBeenCalledTimes(1);
    expect(audioMock.players[1]?.seekTo).toHaveBeenCalledWith(0);
    expect(audioMock.players[1]?.play).toHaveBeenCalledTimes(1);
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
