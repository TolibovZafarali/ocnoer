import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer
} from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";

export type BackgroundMusicPlayableTarget = {
  key: string;
  label: string;
  url: string;
};

export type BackgroundMusicManagerState =
  | "idle"
  | "loading"
  | "playing"
  | "stopping"
  | "paused"
  | "error";

export type BackgroundMusicManagerSnapshot = {
  state: BackgroundMusicManagerState;
  activeLabel: string | null;
  error: string | null;
};

type BackgroundMusicTarget = {
  cue: BackgroundMusicPlayableTarget | null;
  sessionId: string | null;
  shouldPlay: boolean;
  volume: number;
  fadeMs: number;
};

type CurrentBackgroundMusicPlayer = {
  key: string;
  label: string;
  sessionId: string | null;
  url: string;
  player: AudioPlayer;
  hasStarted: boolean;
};

type BackgroundMusicListener = (
  snapshot: BackgroundMusicManagerSnapshot
) => void;

const DEFAULT_FADE_MS = 450;
const FADE_FRAME_MS = 32;
const PLAYER_LOAD_TIMEOUT_MS = 15000;
const PLAYER_LOAD_POLL_MS = 50;
const BACKGROUND_MUSIC_CACHE_DIR = "ocnoer-background-music";
const DEFAULT_AUDIO_FILE_EXTENSION = "mp3";

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return 0;
  }

  return Math.max(0, Math.min(1, volume));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function waitForDuration(durationMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

function getPathExtension(value: string) {
  const path = value.split(/[?#]/)[0] ?? "";
  const fileName = path.split("/").pop() ?? "";
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);

  return match?.[1]?.toLowerCase() ?? null;
}

function extensionFromAudioContentType(contentType: string | null) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();

  switch (normalized) {
    case "audio/aac":
      return "aac";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "audio/mpeg":
    case "audio/mp3":
    case "audio/x-mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    default:
      return null;
  }
}

function createStableFileHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function getRemoteAudioFileExtension(url: string) {
  const urlExtension = getPathExtension(url);

  if (urlExtension) {
    return urlExtension;
  }

  try {
    const response = await fetch(url, {
      method: "HEAD"
    });
    const contentType =
      response.ok || response.status === 405
        ? response.headers.get("content-type")
        : null;

    return (
      extensionFromAudioContentType(contentType) ?? DEFAULT_AUDIO_FILE_EXTENSION
    );
  } catch {
    return DEFAULT_AUDIO_FILE_EXTENSION;
  }
}

function getBackgroundMusicCacheDirectory() {
  const directory = new Directory(Paths.cache, BACKGROUND_MUSIC_CACHE_DIR);

  if (!directory.exists) {
    directory.create({
      idempotent: true,
      intermediates: true
    });
  }

  return directory;
}

async function resolvePlayableAudioUri(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    return url;
  }

  const extension = await getRemoteAudioFileExtension(url);
  const cacheFile = new File(
    getBackgroundMusicCacheDirectory(),
    `${createStableFileHash(url)}.${extension}`
  );

  if (cacheFile.exists && cacheFile.size > 0) {
    return cacheFile.uri;
  }

  const downloadedFile = await File.downloadFileAsync(url, cacheFile, {
    idempotent: true
  });

  return downloadedFile.uri;
}

async function fadePlayerTo(
  player: AudioPlayer,
  targetVolume: number,
  durationMs: number
) {
  const resolvedTargetVolume = clampVolume(targetVolume);

  if (durationMs <= 0) {
    player.volume = resolvedTargetVolume;
    return;
  }

  const startingVolume = clampVolume(player.volume);
  const volumeDelta = resolvedTargetVolume - startingVolume;
  const startedAt = Date.now();

  while (true) {
    const elapsedMs = Date.now() - startedAt;
    const progress = Math.min(elapsedMs / durationMs, 1);

    player.volume = clampVolume(startingVolume + volumeDelta * progress);

    if (progress >= 1) {
      return;
    }

    await waitForDuration(FADE_FRAME_MS);
  }
}

async function waitForPlayerLoad(
  player: AudioPlayer,
  shouldContinue: () => boolean
) {
  const startedAt = Date.now();

  while (!player.isLoaded) {
    if (!shouldContinue()) {
      return false;
    }

    if (Date.now() - startedAt >= PLAYER_LOAD_TIMEOUT_MS) {
      throw new Error("Timed out loading background music.");
    }

    await waitForDuration(PLAYER_LOAD_POLL_MS);
  }

  return shouldContinue();
}

export class NativeBackgroundMusicAudioManager {
  private audioModeConfigured = false;
  private current: CurrentBackgroundMusicPlayer | null = null;
  private isRunning = false;
  private listeners = new Set<BackgroundMusicListener>();
  private snapshot: BackgroundMusicManagerSnapshot = {
    state: "idle",
    activeLabel: null,
    error: null
  };
  private target: BackgroundMusicTarget = {
    cue: null,
    sessionId: null,
    shouldPlay: false,
    volume: 0,
    fadeMs: DEFAULT_FADE_MS
  };

  subscribe(listener: BackgroundMusicListener) {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  setTarget(target: Partial<BackgroundMusicTarget>) {
    this.target = {
      cue: target.cue ?? null,
      sessionId: target.sessionId ?? null,
      shouldPlay: target.shouldPlay ?? false,
      volume: clampVolume(target.volume ?? 0),
      fadeMs: target.fadeMs ?? DEFAULT_FADE_MS
    };

    this.run();
  }

  stopAndRelease() {
    this.target = {
      cue: null,
      sessionId: null,
      shouldPlay: false,
      volume: 0,
      fadeMs: 0
    };

    this.run();
  }

  private emit(snapshot: BackgroundMusicManagerSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }

  private async ensureAudioMode() {
    if (this.audioModeConfigured) {
      return;
    }

    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: "mixWithOthers",
      playsInSilentMode: true,
      shouldPlayInBackground: false
    });
    this.audioModeConfigured = true;
  }

  private isSatisfied() {
    const targetCue = this.target.shouldPlay ? this.target.cue : null;

    if (!targetCue) {
      return this.current == null;
    }

    return (
      this.current?.url === targetCue.url &&
      this.current.sessionId === this.target.sessionId &&
      Math.abs(this.current.player.volume - this.target.volume) < 0.02
    );
  }

  private async removePlayer(
    current: CurrentBackgroundMusicPlayer,
    fadeMs: number
  ) {
    this.emit({
      state: "stopping",
      activeLabel: current.label,
      error: null
    });

    await fadePlayerTo(current.player, 0, fadeMs);
    current.player.pause();
    current.player.remove();
  }

  private async createAndPlay(targetCue: BackgroundMusicPlayableTarget) {
    await this.ensureAudioMode();
    await setIsAudioActiveAsync(true);

    const targetSessionId = this.target.sessionId;

    this.emit({
      state: "loading",
      activeLabel: targetCue.label,
      error: null
    });

    // Runtime music URLs are often extensionless Supabase objects. Resolve a
    // typed local file before constructing AVPlayer so playback never races an
    // async source replacement.
    const playableUri = await resolvePlayableAudioUri(targetCue.url);
    const isStillTarget = () =>
      this.target.shouldPlay &&
      this.target.sessionId === targetSessionId &&
      this.target.cue?.url === targetCue.url;

    if (!isStillTarget()) {
      return;
    }

    const player = createAudioPlayer(
      {
        uri: playableUri
      },
      {
        downloadFirst: false,
        keepAudioSessionActive: true,
        updateInterval: 1000
      }
    );

    player.loop = true;
    player.volume = 0;

    this.current = {
      key: targetCue.key,
      label: targetCue.label,
      sessionId: targetSessionId,
      url: targetCue.url,
      player,
      hasStarted: false
    };

    const didLoad = await waitForPlayerLoad(player, isStillTarget);

    if (!didLoad) {
      return;
    }

    const latestCue = this.target.cue;

    if (latestCue?.url === targetCue.url) {
      this.current.key = latestCue.key;
      this.current.label = latestCue.label;
    }

    await player.seekTo(0).catch(() => undefined);

    if (!isStillTarget()) {
      return;
    }

    player.play();
    this.current.hasStarted = true;

    await fadePlayerTo(player, this.target.volume, this.target.fadeMs);

    this.emit({
      state: "playing",
      activeLabel: targetCue.label,
      error: null
    });
  }

  private run() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    void this.process()
      .catch((error) => {
        this.current?.player.pause();
        this.current?.player.remove();
        this.current = null;
        this.emit({
          state: "error",
          activeLabel: null,
          error: getErrorMessage(error, "Unable to play background music.")
        });
      })
      .finally(() => {
        this.isRunning = false;

        if (!this.isSatisfied()) {
          this.run();
        }
      });
  }

  private async process() {
    while (true) {
      const targetCue = this.target.shouldPlay ? this.target.cue : null;

      if (!targetCue) {
        if (!this.current) {
          await setIsAudioActiveAsync(false).catch(() => undefined);
          this.emit({
            state: "idle",
            activeLabel: null,
            error: null
          });
          return;
        }

        const current = this.current;
        this.current = null;
        await this.removePlayer(current, this.target.fadeMs);
        continue;
      }

      if (this.current?.url === targetCue.url) {
        if (this.current.sessionId !== this.target.sessionId) {
          const current = this.current;
          this.current = null;
          await this.removePlayer(current, this.target.fadeMs);
          continue;
        }

        this.current.key = targetCue.key;
        this.current.label = targetCue.label;
        this.current.player.loop = true;

        await this.ensureAudioMode();
        await setIsAudioActiveAsync(true);

        if (!this.current.hasStarted) {
          this.current.player.play();
          this.current.hasStarted = true;
        }

        await fadePlayerTo(
          this.current.player,
          this.target.volume,
          this.target.fadeMs
        );

        this.emit({
          state: "playing",
          activeLabel: targetCue.label,
          error: null
        });
        return;
      }

      if (this.current) {
        const current = this.current;
        this.current = null;
        await this.removePlayer(current, this.target.fadeMs);
        continue;
      }

      await this.createAndPlay(targetCue);
      return;
    }
  }
}

let sharedNativeBackgroundMusicAudioManager: NativeBackgroundMusicAudioManager | null =
  null;

export function getNativeBackgroundMusicAudioManager() {
  sharedNativeBackgroundMusicAudioManager ??=
    new NativeBackgroundMusicAudioManager();

  return sharedNativeBackgroundMusicAudioManager;
}
