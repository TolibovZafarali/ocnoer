import AsyncStorage from "@react-native-async-storage/async-storage";

const AUDIO_PREFERENCES_STORAGE_KEY = "ocnoer.mobile.audioPreferences.v1";
const AUDIO_PREFERENCES_SCHEMA_VERSION = 1;

export type NativeAudioPreferences = {
  schemaVersion: typeof AUDIO_PREFERENCES_SCHEMA_VERSION;
  muted: boolean;
  volume: number;
};

export const DEFAULT_NATIVE_AUDIO_PREFERENCES: NativeAudioPreferences = {
  schemaVersion: AUDIO_PREFERENCES_SCHEMA_VERSION,
  muted: false,
  volume: 0.85
};

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return DEFAULT_NATIVE_AUDIO_PREFERENCES.volume;
  }

  return Math.max(0, Math.min(1, volume));
}

function isNativeAudioPreferences(
  value: unknown
): value is NativeAudioPreferences {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const candidate = value as {
    schemaVersion?: unknown;
    muted?: unknown;
    volume?: unknown;
  };

  return (
    candidate.schemaVersion === AUDIO_PREFERENCES_SCHEMA_VERSION &&
    typeof candidate.muted === "boolean" &&
    typeof candidate.volume === "number" &&
    Number.isFinite(candidate.volume)
  );
}

export async function loadNativeAudioPreferences() {
  const value = await AsyncStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);

  if (!value) {
    return DEFAULT_NATIVE_AUDIO_PREFERENCES;
  }

  const parsed = (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })();

  if (!isNativeAudioPreferences(parsed)) {
    await saveNativeAudioPreferences(DEFAULT_NATIVE_AUDIO_PREFERENCES);
    return DEFAULT_NATIVE_AUDIO_PREFERENCES;
  }

  return {
    ...parsed,
    volume: clampVolume(parsed.volume)
  };
}

export async function saveNativeAudioPreferences(
  preferences: NativeAudioPreferences
) {
  await AsyncStorage.setItem(
    AUDIO_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: AUDIO_PREFERENCES_SCHEMA_VERSION,
      muted: preferences.muted,
      volume: clampVolume(preferences.volume)
    })
  );
}

export function createNativeAudioPreferences(input: {
  muted: boolean;
  volume: number;
}): NativeAudioPreferences {
  return {
    schemaVersion: AUDIO_PREFERENCES_SCHEMA_VERSION,
    muted: input.muted,
    volume: clampVolume(input.volume)
  };
}
