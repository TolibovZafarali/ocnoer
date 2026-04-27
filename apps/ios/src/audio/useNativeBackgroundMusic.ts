import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import type { NativeAudioPreferences } from "../storage/audioPreferenceStorage";
import {
  getNativeBackgroundMusicAudioManager,
  type BackgroundMusicManagerSnapshot
} from "./backgroundMusicAudioManager";
import type { NativeBackgroundMusicCue } from "./nativeBackgroundMusicCue";

const ACTIVE_FADE_MS = 450;
const BACKGROUND_FADE_MS = 140;

export type NativeBackgroundMusicStatus = {
  label: string;
  detail: string | null;
  state:
    | "ended"
    | "loading"
    | "muted"
    | "playing"
    | "paused"
    | "silent"
    | "unsupported"
    | "error";
};

function isAppStateActive(value: string) {
  return value === "active";
}

function createDisplayStatus(input: {
  cue: NativeBackgroundMusicCue;
  preferences: NativeAudioPreferences;
  isAppActive: boolean;
  isPlaybackEnabled: boolean;
  isSessionActive: boolean;
  managerSnapshot: BackgroundMusicManagerSnapshot;
}): NativeBackgroundMusicStatus {
  if (input.preferences.muted) {
    return {
      state: "muted",
      label: "Audio muted",
      detail: "Music is off"
    };
  }

  if (!input.isPlaybackEnabled) {
    return {
      state: "paused",
      label: "Audio paused",
      detail: "Waiting for ending text"
    };
  }

  if (!input.isAppActive || !input.isSessionActive) {
    return {
      state: "paused",
      label: "Audio paused",
      detail: input.isAppActive
        ? "Reader session is ending"
        : "App is in background"
    };
  }

  if (input.cue.status === "unsupported") {
    return {
      state: "unsupported",
      label: "Music unavailable",
      detail: input.cue.reason
    };
  }

  if (input.managerSnapshot.state === "error") {
    return {
      state: "error",
      label: "Audio issue",
      detail: input.managerSnapshot.error
    };
  }

  if (
    input.cue.status === "playable" &&
    input.managerSnapshot.state === "ended"
  ) {
    return {
      state: "ended",
      label: input.cue.label,
      detail: "Ending music complete"
    };
  }

  if (input.cue.status === "silence") {
    return {
      state: "silent",
      label: "No music",
      detail: input.cue.reason
    };
  }

  if (input.managerSnapshot.state === "loading") {
    return {
      state: "loading",
      label: "Loading music",
      detail: input.cue.label
    };
  }

  return {
    state: "playing",
    label: input.cue.label,
    detail:
      input.cue.source === "chapter-ending-card"
        ? "Chapter ending music"
        : input.cue.source === "scene-cue"
          ? "Scene music cue"
          : "Scene music"
  };
}

export function useNativeBackgroundMusic(input: {
  cue: NativeBackgroundMusicCue;
  isPlaybackEnabled?: boolean;
  isSessionActive?: boolean;
  preferences: NativeAudioPreferences;
  sessionId: string;
}) {
  const manager = useMemo(() => getNativeBackgroundMusicAudioManager(), []);
  const [managerSnapshot, setManagerSnapshot] =
    useState<BackgroundMusicManagerSnapshot>({
      state: "idle",
      activeLabel: null,
      error: null
    });
  const [isAppActive, setIsAppActive] = useState(
    isAppStateActive(AppState.currentState)
  );

  useEffect(() => {
    return manager.subscribe(setManagerSnapshot);
  }, [manager]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(isAppStateActive(nextState));
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const cue =
      input.cue.status === "playable"
        ? {
            key: input.cue.key,
            label: input.cue.label,
            loop: input.cue.source !== "chapter-ending-card",
            url: input.cue.url
          }
        : null;

    manager.setTarget({
      cue,
      sessionId: input.sessionId,
      shouldPlay: Boolean(
        cue &&
        isAppActive &&
        !input.preferences.muted &&
        (input.isPlaybackEnabled ?? true) &&
        (input.isSessionActive ?? true)
      ),
      volume: input.preferences.volume,
      fadeMs: isAppActive ? ACTIVE_FADE_MS : BACKGROUND_FADE_MS
    });
  }, [
    input.cue,
    input.isPlaybackEnabled,
    input.isSessionActive,
    input.preferences.muted,
    input.preferences.volume,
    input.sessionId,
    isAppActive,
    manager
  ]);

  useEffect(() => {
    return () => {
      manager.stopAndRelease();
    };
  }, [manager]);

  return useMemo(
    () =>
      createDisplayStatus({
        cue: input.cue,
        preferences: input.preferences,
        isAppActive,
        isPlaybackEnabled: input.isPlaybackEnabled ?? true,
        isSessionActive: input.isSessionActive ?? true,
        managerSnapshot
      }),
    [
      input.cue,
      input.isPlaybackEnabled,
      input.isSessionActive,
      input.preferences,
      isAppActive,
      managerSnapshot
    ]
  );
}
