type BackgroundMusicAudioElement = Pick<
  HTMLAudioElement,
  "currentTime" | "paused" | "play" | "volume"
>;

const DEFAULT_BACKGROUND_MUSIC_VOLUME = 1;
const BACKGROUND_MUSIC_FADE_FRAME_MS = 16;

function resetBackgroundMusicVolume(audio: BackgroundMusicAudioElement) {
  audio.volume = DEFAULT_BACKGROUND_MUSIC_VOLUME;
}

function clampBackgroundMusicVolume(volume: number) {
  return Math.max(0, Math.min(DEFAULT_BACKGROUND_MUSIC_VOLUME, volume));
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

export function fadeBackgroundMusicTo(
  audio: BackgroundMusicAudioElement | null,
  targetVolume: number,
  durationMs: number
) {
  if (!audio) {
    return Promise.resolve();
  }

  const resolvedTargetVolume = clampBackgroundMusicVolume(targetVolume);

  if (durationMs <= 0) {
    audio.volume = resolvedTargetVolume;
    return Promise.resolve();
  }

  const startingVolume = Number.isFinite(audio.volume)
    ? clampBackgroundMusicVolume(audio.volume)
    : DEFAULT_BACKGROUND_MUSIC_VOLUME;
  const volumeDelta = resolvedTargetVolume - startingVolume;

  return new Promise<void>((resolve) => {
    const startedAt = Date.now();

    const step = () => {
      const elapsedMs = Date.now() - startedAt;
      const progress = Math.min(elapsedMs / durationMs, 1);

      audio.volume = clampBackgroundMusicVolume(
        startingVolume + volumeDelta * progress
      );

      if (progress >= 1) {
        resolve();
        return;
      }

      globalThis.setTimeout(step, BACKGROUND_MUSIC_FADE_FRAME_MS);
    };

    step();
  });
}

export function fadeOutBackgroundMusic(
  audio: BackgroundMusicAudioElement | null,
  durationMs: number
) {
  return fadeBackgroundMusicTo(audio, 0, durationMs);
}
