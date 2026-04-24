import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createNativeAudioPreferences,
  DEFAULT_NATIVE_AUDIO_PREFERENCES,
  loadNativeAudioPreferences,
  saveNativeAudioPreferences,
  type NativeAudioPreferences
} from "../storage/audioPreferenceStorage";

export type NativeAudioPreferencesState = {
  preferences: NativeAudioPreferences;
  isLoading: boolean;
  error: string | null;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to load audio preferences.";
}

export function useAudioPreferences(): NativeAudioPreferencesState {
  const mountedRef = useRef(true);
  const [preferences, setPreferences] = useState<NativeAudioPreferences>(
    DEFAULT_NATIVE_AUDIO_PREFERENCES
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const loadedPreferences = await loadNativeAudioPreferences();

        if (!cancelled && mountedRef.current) {
          setPreferences(loadedPreferences);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled && mountedRef.current) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    let cancelled = false;

    void saveNativeAudioPreferences(preferences).catch((saveError) => {
      if (!cancelled && mountedRef.current) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Unable to save audio preferences."
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isLoading, preferences]);

  const toggleMuted = useCallback(() => {
    setPreferences((currentValue) =>
      createNativeAudioPreferences({
        muted: !currentValue.muted,
        volume: currentValue.volume
      })
    );
  }, []);

  const setVolume = useCallback((volume: number) => {
    setPreferences((currentValue) =>
      createNativeAudioPreferences({
        muted: volume <= 0 ? true : currentValue.muted,
        volume
      })
    );
  }, []);

  return useMemo(
    () => ({
      preferences,
      isLoading,
      error,
      toggleMuted,
      setVolume
    }),
    [error, isLoading, preferences, setVolume, toggleMuted]
  );
}
