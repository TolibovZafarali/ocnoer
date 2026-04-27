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

type BackgroundMusicTargetIdentity = {
  key: string;
  sessionId: string | null;
  url: string;
};

type FailedBackgroundMusicTarget = BackgroundMusicTargetIdentity & {
  error: string;
};

type RemoteAudioMetadata = {
  contentLength: string | null;
  contentType: string | null;
  etag: string | null;
  extension: string;
  signatureExtension: string | null;
};

const DEFAULT_FADE_MS = 450;
const FADE_FRAME_MS = 32;
const PLAYER_LOAD_TIMEOUT_MS = 15000;
const PLAYER_LOAD_POLL_MS = 50;
const PLAYER_PLAYBACK_START_TIMEOUT_MS = 3500;
const PLAYER_PLAYBACK_START_POLL_MS = 50;
const BACKGROUND_MUSIC_CACHE_DIR = "ocnoer-background-music";
const DEFAULT_AUDIO_FILE_EXTENSION = "mp3";
const AUDIO_SIGNATURE_BYTE_COUNT = 64;
const IOS_SUPPORTED_AUDIO_FILE_EXTENSIONS = new Set([
  "aac",
  "m4a",
  "mp3",
  "mp4",
  "wav"
]);
const IOS_COMPATIBLE_AUDIO_DERIVATIVE_SUFFIXES = [
  ".ios.m4a",
  ".ios.mp3",
  ".m4a",
  ".mp3"
];

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return 0;
  }

  return Math.max(0, Math.min(1, volume));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function warnBackgroundMusicIssue(message: string) {
  if (!isDevelopmentBuild()) {
    return;
  }

  console.warn(`[Ocnoer iOS Reader] ${message}`);
}

class BackgroundMusicTargetLoadError extends Error {
  target: BackgroundMusicTargetIdentity;

  constructor(input: {
    cause: unknown;
    target: BackgroundMusicTargetIdentity;
  }) {
    super(getErrorMessage(input.cause, "Unable to play background music."));
    this.name = "BackgroundMusicTargetLoadError";
    this.target = input.target;
  }
}

function targetMatchesCue(
  target: BackgroundMusicTargetIdentity | null,
  cue: BackgroundMusicPlayableTarget | null,
  sessionId: string | null
) {
  return Boolean(
    target &&
    cue &&
    target.key === cue.key &&
    target.url === cue.url &&
    target.sessionId === sessionId
  );
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
    case "audio/flac":
    case "audio/x-flac":
      return "flac";
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

function bytesStartWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((value, index) => bytes[index] === value);
}

function bytesAsciiEquals(bytes: Uint8Array, offset: number, expected: string) {
  if (bytes.length < offset + expected.length) {
    return false;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function extensionFromAudioSignature(bytes: Uint8Array | null) {
  if (!bytes || bytes.length === 0) {
    return null;
  }

  if (bytesAsciiEquals(bytes, 0, "ID3")) {
    return "mp3";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "mp3";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) {
    return "aac";
  }

  if (bytesAsciiEquals(bytes, 4, "ftyp")) {
    return "m4a";
  }

  if (
    bytesAsciiEquals(bytes, 0, "RIFF") &&
    bytesAsciiEquals(bytes, 8, "WAVE")
  ) {
    return "wav";
  }

  if (bytesAsciiEquals(bytes, 0, "OggS")) {
    return "ogg";
  }

  if (bytesAsciiEquals(bytes, 0, "fLaC")) {
    return "flac";
  }

  if (bytesStartWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return "webm";
  }

  return null;
}

function isIosSupportedAudioExtension(extension: string) {
  return IOS_SUPPORTED_AUDIO_FILE_EXTENSIONS.has(extension.toLowerCase());
}

function createStableFileHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function fetchRemoteAudioHeaders(url: string) {
  try {
    const response = await fetch(url, {
      method: "HEAD"
    });

    if (!response.ok && response.status !== 405) {
      return null;
    }

    return {
      contentLength: response.headers.get("content-length"),
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag")
    };
  } catch {
    return null;
  }
}

async function fetchRemoteAudioHeaderBytes(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Range: `bytes=0-${AUDIO_SIGNATURE_BYTE_COUNT - 1}`
      }
    });

    if (!response.ok && response.status !== 206) {
      return null;
    }

    const arrayBuffer =
      typeof response.arrayBuffer === "function"
        ? await response.arrayBuffer()
        : null;

    return arrayBuffer ? new Uint8Array(arrayBuffer) : null;
  } catch {
    return null;
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

async function getRemoteAudioMetadata(
  url: string
): Promise<RemoteAudioMetadata> {
  const headers = await fetchRemoteAudioHeaders(url);

  if (!headers) {
    throw new Error("The background music source is not reachable.");
  }

  const signatureExtension = extensionFromAudioSignature(
    await fetchRemoteAudioHeaderBytes(url)
  );
  const extension =
    signatureExtension ??
    getPathExtension(url) ??
    extensionFromAudioContentType(headers.contentType) ??
    DEFAULT_AUDIO_FILE_EXTENSION;

  return {
    ...headers,
    extension,
    signatureExtension
  };
}

function createDerivativeUrlCandidate(url: string, suffix: string) {
  try {
    const parsed = new URL(url);

    parsed.pathname = `${parsed.pathname}${suffix}`;
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    const [baseUrl] = url.split(/[?#]/);

    return baseUrl ? `${baseUrl}${suffix}` : null;
  }
}

async function resolveIosCompatibleAudioDerivative(url: string) {
  for (const suffix of IOS_COMPATIBLE_AUDIO_DERIVATIVE_SUFFIXES) {
    const candidateUrl = createDerivativeUrlCandidate(url, suffix);

    if (!candidateUrl) {
      continue;
    }

    try {
      const metadata = await getRemoteAudioMetadata(candidateUrl);

      if (isIosSupportedAudioExtension(metadata.extension)) {
        return {
          metadata,
          url: candidateUrl
        };
      }
    } catch {
      // Missing derivatives are expected while older runtime assets are still
      // being migrated to iOS-compatible audio.
    }
  }

  return null;
}

async function downloadRemoteAudioFile(
  url: string,
  metadata: RemoteAudioMetadata
) {
  const cacheIdentity = [
    url,
    metadata.etag,
    metadata.contentLength,
    metadata.signatureExtension,
    metadata.extension
  ]
    .filter(Boolean)
    .join("|");
  const cacheFile = new File(
    getBackgroundMusicCacheDirectory(),
    `${createStableFileHash(cacheIdentity)}.${metadata.extension}`
  );

  if (cacheFile.exists && cacheFile.size > 0) {
    return cacheFile.uri;
  }

  const downloadedFile = await File.downloadFileAsync(url, cacheFile, {
    idempotent: true
  });

  return downloadedFile.uri;
}

async function resolvePlayableAudioUri(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    return url;
  }

  const metadata = await getRemoteAudioMetadata(url);

  if (!isIosSupportedAudioExtension(metadata.extension)) {
    const derivative = await resolveIosCompatibleAudioDerivative(url);

    if (derivative) {
      return downloadRemoteAudioFile(derivative.url, derivative.metadata);
    }

    throw new Error(
      `Unsupported iOS background music format: ${metadata.extension}. Publish an iOS-compatible MP3, AAC, M4A, or WAV derivative for this track.`
    );
  }

  return downloadRemoteAudioFile(url, metadata);
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

function getPlayerStatus(player: AudioPlayer) {
  try {
    return player.currentStatus;
  } catch {
    return null;
  }
}

function getPlayerRuntimeState(player: AudioPlayer) {
  const status = getPlayerStatus(player);
  const normalizedTimeControlStatus =
    status?.timeControlStatus?.toLowerCase() ?? "";

  return {
    isLoaded: Boolean(player.isLoaded && (status?.isLoaded ?? true)),
    isPaused: Boolean(
      player.paused || normalizedTimeControlStatus.includes("paused")
    ),
    isPlaying: Boolean(
      player.playing ||
      status?.playing ||
      normalizedTimeControlStatus.includes("playing")
    ),
    isWaitingToPlay: normalizedTimeControlStatus.includes("waiting")
  };
}

function isPlayerActive(player: AudioPlayer) {
  const state = getPlayerRuntimeState(player);

  return (
    state.isLoaded &&
    (state.isPlaying || (state.isWaitingToPlay && !state.isPaused))
  );
}

function isPlayerPlaybackStarted(player: AudioPlayer) {
  const state = getPlayerRuntimeState(player);

  return state.isLoaded && state.isPlaying && !state.isPaused;
}

function shouldStartPlayer(player: AudioPlayer) {
  const state = getPlayerRuntimeState(player);

  return (
    state.isLoaded &&
    (state.isPaused || (!state.isPlaying && !state.isWaitingToPlay))
  );
}

function releasePlayer(player: AudioPlayer) {
  try {
    player.pause();
  } finally {
    player.remove();
  }
}

async function waitForPlayerPlaybackStart(
  player: AudioPlayer,
  shouldContinue: () => boolean
) {
  const startedAt = Date.now();

  while (!isPlayerPlaybackStarted(player)) {
    if (!shouldContinue()) {
      return false;
    }

    if (Date.now() - startedAt >= PLAYER_PLAYBACK_START_TIMEOUT_MS) {
      return shouldContinue();
    }

    await waitForDuration(PLAYER_PLAYBACK_START_POLL_MS);
  }

  return shouldContinue();
}

export class NativeBackgroundMusicAudioManager {
  private audioModeConfigured = false;
  private current: CurrentBackgroundMusicPlayer | null = null;
  private failedTarget: FailedBackgroundMusicTarget | null = null;
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
    const nextTarget = {
      cue: target.cue ?? null,
      sessionId: target.sessionId ?? null,
      shouldPlay: target.shouldPlay ?? false,
      volume: clampVolume(target.volume ?? 0),
      fadeMs: target.fadeMs ?? DEFAULT_FADE_MS
    };

    if (
      !this.failedTarget ||
      !targetMatchesCue(
        this.failedTarget,
        nextTarget.shouldPlay ? nextTarget.cue : null,
        nextTarget.sessionId
      )
    ) {
      this.failedTarget = null;
    }

    this.target = nextTarget;

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
    this.failedTarget = null;

    this.run();
  }

  waitForTargetPlaybackStart(input: {
    cue: BackgroundMusicPlayableTarget | null;
    sessionId: string | null;
    shouldPlay: boolean;
    timeoutMs?: number;
  }) {
    if (!input.shouldPlay || !input.cue) {
      return Promise.resolve(this.snapshot);
    }

    const timeoutMs = input.timeoutMs ?? PLAYER_PLAYBACK_START_TIMEOUT_MS;
    const startedAt = Date.now();
    const targetCue = input.cue;

    return new Promise<BackgroundMusicManagerSnapshot>((resolve) => {
      let pollTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

      const cleanup = () => {
        this.listeners.delete(check);

        if (pollTimeout) {
          globalThis.clearTimeout(pollTimeout);
          pollTimeout = null;
        }
      };

      const finish = () => {
        cleanup();
        resolve(this.snapshot);
      };

      const isTargetPlaying = () =>
        Boolean(
          this.current &&
          targetMatchesCue(this.current, targetCue, input.sessionId) &&
          this.current.hasStarted &&
          isPlayerPlaybackStarted(this.current.player)
        );

      const isTargetFailed = () =>
        targetMatchesCue(this.failedTarget, targetCue, input.sessionId);

      const schedulePoll = () => {
        if (pollTimeout) {
          return;
        }

        pollTimeout = globalThis.setTimeout(() => {
          pollTimeout = null;
          check();
        }, PLAYER_PLAYBACK_START_POLL_MS);
      };

      function check() {
        if (
          isTargetPlaying() ||
          isTargetFailed() ||
          Date.now() - startedAt >= timeoutMs
        ) {
          finish();
          return;
        }

        schedulePoll();
      }

      this.listeners.add(check);
      check();
    });
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

    if (targetMatchesCue(this.failedTarget, targetCue, this.target.sessionId)) {
      return true;
    }

    return (
      this.current?.url === targetCue.url &&
      this.current.key === targetCue.key &&
      this.current.sessionId === this.target.sessionId &&
      this.current.hasStarted &&
      isPlayerActive(this.current.player) &&
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

    try {
      await fadePlayerTo(current.player, 0, fadeMs);
    } finally {
      releasePlayer(current.player);
    }
  }

  private async createAndPlay(targetCue: BackgroundMusicPlayableTarget) {
    await this.ensureAudioMode();
    await setIsAudioActiveAsync(true);

    const targetSessionId = this.target.sessionId;
    const targetIdentity = {
      key: targetCue.key,
      sessionId: targetSessionId,
      url: targetCue.url
    };

    this.emit({
      state: "loading",
      activeLabel: targetCue.label,
      error: null
    });

    // Runtime music URLs are often extensionless Supabase objects. Resolve a
    // typed local file before constructing AVPlayer so playback never races an
    // async source replacement.
    const playableUri = await resolvePlayableAudioUri(targetCue.url).catch(
      (error) => {
        throw new BackgroundMusicTargetLoadError({
          cause: error,
          target: targetIdentity
        });
      }
    );
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
    this.failedTarget = null;

    await waitForPlayerPlaybackStart(player, isStillTarget);

    if (!isStillTarget()) {
      return;
    }

    await fadePlayerTo(player, this.target.volume, this.target.fadeMs);

    this.emit({
      state: "playing",
      activeLabel: targetCue.label,
      error: null
    });
  }

  private run() {
    if (this.isRunning || this.isSatisfied()) {
      return;
    }

    this.isRunning = true;

    void this.process()
      .catch((error) => {
        const errorMessage = getErrorMessage(
          error,
          "Unable to play background music."
        );
        const failedTarget =
          error instanceof BackgroundMusicTargetLoadError
            ? error.target
            : this.target.shouldPlay && this.target.cue
              ? {
                  key: this.target.cue.key,
                  sessionId: this.target.sessionId,
                  url: this.target.cue.url
                }
              : null;

        if (
          failedTarget &&
          targetMatchesCue(
            failedTarget,
            this.target.shouldPlay ? this.target.cue : null,
            this.target.sessionId
          )
        ) {
          this.failedTarget = {
            ...failedTarget,
            error: errorMessage
          };
          warnBackgroundMusicIssue(errorMessage);
        }

        if (this.current) {
          releasePlayer(this.current.player);
        }
        this.current = null;
        this.emit({
          state: "error",
          activeLabel: null,
          error: errorMessage
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

        if (!getPlayerRuntimeState(this.current.player).isLoaded) {
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

        if (
          !this.current.hasStarted ||
          shouldStartPlayer(this.current.player)
        ) {
          this.current.player.play();
          this.current.hasStarted = true;
        } else if (isPlayerActive(this.current.player)) {
          this.current.hasStarted = true;
        }

        const currentPlayer = this.current.player;
        const isStillTarget = () =>
          this.target.shouldPlay &&
          this.target.sessionId === this.current?.sessionId &&
          this.target.cue?.url === targetCue.url;

        await waitForPlayerPlaybackStart(currentPlayer, isStillTarget);

        if (!isStillTarget()) {
          return;
        }

        await fadePlayerTo(
          currentPlayer,
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
