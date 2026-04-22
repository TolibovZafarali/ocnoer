type BackgroundMusicAudioElement = Pick<
  HTMLAudioElement,
  "currentTime" | "paused" | "play" | "volume"
>;

const DEFAULT_BACKGROUND_MUSIC_VOLUME = 1;
const BACKGROUND_MUSIC_FADE_FRAME_MS = 16;

function resetBackgroundMusicVolume(audio: BackgroundMusicAudioElement) {
  audio.volume = DEFAULT_BACKGROUND_MUSIC_VOLUME;
}

export function restartBackgroundMusic(
  audio: BackgroundMusicAudioElement | null
) {
  if (!audio) {
    return;
  }

  resetBackgroundMusicVolume(audio);
  audio.currentTime = 0;

  void audio.play().catch(() => undefined);
}

export function resumePausedBackgroundMusic(
  audio: BackgroundMusicAudioElement | null
) {
  if (!audio || !audio.paused) {
    return;
  }

  resetBackgroundMusicVolume(audio);
  void audio.play().catch(() => undefined);
}

export function fadeOutBackgroundMusic(
  audio: BackgroundMusicAudioElement | null,
  durationMs: number
) {
  if (!audio) {
    return Promise.resolve();
  }

  if (durationMs <= 0) {
    audio.volume = 0;
    return Promise.resolve();
  }

  const startingVolume = Number.isFinite(audio.volume)
    ? audio.volume
    : DEFAULT_BACKGROUND_MUSIC_VOLUME;

  if (startingVolume <= 0) {
    audio.volume = 0;
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const startedAt = Date.now();

    const step = () => {
      const elapsedMs = Date.now() - startedAt;
      const progress = Math.min(elapsedMs / durationMs, 1);

      audio.volume = Math.max(0, startingVolume * (1 - progress));

      if (progress >= 1) {
        resolve();
        return;
      }

      globalThis.setTimeout(step, BACKGROUND_MUSIC_FADE_FRAME_MS);
    };

    step();
  });
}
