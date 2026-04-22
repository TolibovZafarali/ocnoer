type BackgroundMusicAudioElement = Pick<
  HTMLAudioElement,
  "currentTime" | "paused" | "play"
>;

export function restartBackgroundMusic(
  audio: BackgroundMusicAudioElement | null
) {
  if (!audio) {
    return;
  }

  audio.currentTime = 0;

  void audio.play().catch(() => undefined);
}

export function resumePausedBackgroundMusic(
  audio: BackgroundMusicAudioElement | null
) {
  if (!audio || !audio.paused) {
    return;
  }

  void audio.play().catch(() => undefined);
}
