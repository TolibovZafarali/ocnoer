import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer
} from "expo-audio";

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
  shouldPlay: boolean;
  volume: number;
  fadeMs: number;
};

type CurrentBackgroundMusicPlayer = {
  key: string;
  label: string;
  url: string;
  player: AudioPlayer;
};

type BackgroundMusicListener = (
  snapshot: BackgroundMusicManagerSnapshot
) => void;

const DEFAULT_FADE_MS = 450;
const FADE_FRAME_MS = 32;

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
      shouldPlay: target.shouldPlay ?? false,
      volume: clampVolume(target.volume ?? 0),
      fadeMs: target.fadeMs ?? DEFAULT_FADE_MS
    };

    this.run();
  }

  stopAndRelease() {
    this.target = {
      cue: null,
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

    const player = createAudioPlayer(
      {
        uri: targetCue.url
      },
      {
        downloadFirst: false,
        updateInterval: 1000
      }
    );

    player.loop = true;
    player.volume = 0;

    this.current = {
      key: targetCue.key,
      label: targetCue.label,
      url: targetCue.url,
      player
    };
    this.emit({
      state: "loading",
      activeLabel: targetCue.label,
      error: null
    });

    await player.seekTo(0).catch(() => undefined);
    player.play();

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
        this.current.key = targetCue.key;
        this.current.label = targetCue.label;
        this.current.player.loop = true;

        await this.ensureAudioMode();
        await setIsAudioActiveAsync(true);

        if (!this.current.player.playing) {
          this.current.player.play();
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
