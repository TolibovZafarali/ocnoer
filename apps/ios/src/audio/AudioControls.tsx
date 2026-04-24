import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NativeAudioPreferences } from "../storage/audioPreferenceStorage";
import type { NativeBackgroundMusicStatus } from "./useNativeBackgroundMusic";

export function AudioToggleButton(props: {
  preferences: NativeAudioPreferences;
  onToggleMuted: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={
        props.preferences.muted
          ? "Unmute background music"
          : "Mute background music"
      }
      accessibilityRole="button"
      onPress={props.onToggleMuted}
      style={({ pressed }) => [
        styles.toggleButton,
        props.preferences.muted ? styles.toggleButtonMuted : null,
        pressed ? styles.buttonPressed : null
      ]}
    >
      <Text style={styles.toggleButtonText}>
        {props.preferences.muted ? "Unmute" : "Mute"}
      </Text>
    </Pressable>
  );
}

export function AudioStatusPanel(props: {
  preferences: NativeAudioPreferences;
  status?: NativeBackgroundMusicStatus | null;
  isLoading?: boolean;
  error?: string | null;
  onToggleMuted: () => void;
}) {
  const statusLabel = props.status?.label ?? "Audio ready";
  const statusDetail =
    props.error ??
    props.status?.detail ??
    (props.isLoading
      ? "Loading preference"
      : props.preferences.muted
        ? "Music is off"
        : `Volume ${Math.round(props.preferences.volume * 100)}%`);

  return (
    <View style={styles.panel}>
      <View style={styles.panelText}>
        <Text style={styles.panelTitle}>Audio</Text>
        <Text numberOfLines={1} style={styles.statusLabel}>
          {statusLabel}
        </Text>
        {statusDetail ? (
          <Text numberOfLines={2} style={styles.statusDetail}>
            {statusDetail}
          </Text>
        ) : null}
      </View>
      <AudioToggleButton
        preferences={props.preferences}
        onToggleMuted={props.onToggleMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  panelText: {
    flex: 1,
    paddingRight: 12
  },
  panelTitle: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  statusLabel: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22
  },
  statusDetail: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2
  },
  toggleButton: {
    alignItems: "center",
    borderColor: "#67e8f9",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 76,
    paddingHorizontal: 12
  },
  toggleButtonMuted: {
    borderColor: "#64748b"
  },
  toggleButtonText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "900"
  },
  buttonPressed: {
    opacity: 0.72
  }
});
