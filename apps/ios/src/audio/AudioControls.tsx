import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";

import type { NativeAudioPreferences } from "../storage/audioPreferenceStorage";
import type { NativeBackgroundMusicStatus } from "./useNativeBackgroundMusic";
import { ocnoerTheme } from "../ui/theme";

export function AudioToggleButton(props: {
  preferences: NativeAudioPreferences;
  onToggleMuted: () => void;
  compact?: boolean;
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
        props.compact ? styles.toggleButtonCompact : null,
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
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
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
    <View
      style={[
        styles.panel,
        props.compact ? styles.panelCompact : null,
        props.style
      ]}
    >
      <View style={styles.panelText}>
        {props.compact ? null : <Text style={styles.panelTitle}>Audio</Text>}
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
        compact={props.compact}
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
  panelCompact: {
    gap: 8
  },
  panelText: {
    flex: 1,
    paddingRight: 12
  },
  panelTitle: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  statusLabel: {
    color: ocnoerTheme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22
  },
  statusDetail: {
    color: ocnoerTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2
  },
  toggleButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.22)",
    borderColor: ocnoerTheme.colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 76,
    paddingHorizontal: 12
  },
  toggleButtonCompact: {
    minHeight: 34,
    minWidth: 68
  },
  toggleButtonMuted: {
    borderColor: "rgba(148, 163, 184, 0.32)"
  },
  toggleButtonText: {
    color: ocnoerTheme.colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  buttonPressed: {
    opacity: 0.72
  }
});
