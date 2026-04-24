import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { MOBILE_RUNTIME_ENV_VARS } from "../config/runtime";
import type { RuntimeBootstrapState } from "../hooks/useRuntimeBootstrap";
import {
  getRuntimeStoryTitle,
  resolvePreviewChapterId
} from "../runtime/preview";
import type { MobilePlayer } from "../api/playerSessionTypes";
import type { PlayerProgress } from "@ocnoer/story-core";

type BootstrapScreenProps = {
  state: RuntimeBootstrapState;
  player: MobilePlayer;
  isSigningOut: boolean;
  isUpdatingCatName: boolean;
  isLoadingProgress: boolean;
  isResettingProgress: boolean;
  catNameError: string | null;
  savedProgress: PlayerProgress | null;
  onContinueReading: () => void;
  onRetry: () => void;
  onRestartReading: () => void;
  onResetProgress: () => void;
  onSignOut: () => void;
  onUpdateCatName: (catName: string) => void;
  onOpenPreview: (chapterId: string) => void;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{props.label}</Text>
      <Text style={styles.infoValue}>{props.value}</Text>
    </View>
  );
}

function PrimaryButton(props: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        props.disabled ? styles.primaryButtonDisabled : null,
        pressed && !props.disabled ? styles.primaryButtonPressed : null
      ]}
    >
      <Text style={styles.primaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function SecondaryButton(props: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        props.disabled ? styles.secondaryButtonDisabled : null,
        pressed && !props.disabled ? styles.secondaryButtonPressed : null
      ]}
    >
      <Text style={styles.secondaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

export function BootstrapScreen(props: BootstrapScreenProps) {
  const [catNameInput, setCatNameInput] = useState(props.player.catName ?? "");
  const canSubmitCatName =
    !props.player.catNameLocked &&
    catNameInput.trim().length > 0 &&
    !props.isUpdatingCatName;

  if (props.state.status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#67e8f9" size="large" />
          <Text style={styles.loadingText}>Loading published runtime</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (props.state.status === "error") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>Ocnoer iOS</Text>
          <Text style={styles.title}>Runtime load failed</Text>
          <View style={styles.panel}>
            <InfoRow label="Signed in as" value={props.player.firstName} />
            <InfoRow
              label="Cat name"
              value={props.player.catName ?? "Not set"}
            />
          </View>
          <Text style={styles.body}>{props.state.message}</Text>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Required public config</Text>
            {MOBILE_RUNTIME_ENV_VARS.map((name) => (
              <Text key={name} style={styles.codeText}>
                {name}
              </Text>
            ))}
          </View>
          <PrimaryButton label="Retry" onPress={props.onRetry} />
          <View style={styles.buttonSpacer}>
            <SecondaryButton
              disabled={props.isSigningOut}
              label={props.isSigningOut ? "Signing Out" : "Sign Out"}
              onPress={props.onSignOut}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { bootstrap, config } = props.state;
  const manifest = bootstrap.initialManifest;
  const previewChapterId = resolvePreviewChapterId({
    manifest,
    initialBundle: bootstrap.initialBundle
  });
  const manifestChapter = previewChapterId
    ? (manifest.chapters.find((chapter) => chapter.id === previewChapterId) ??
      null)
    : null;
  const initialChapter = bootstrap.initialBundle?.chapter ?? null;
  const storyTitle = getRuntimeStoryTitle(manifest) ?? "Ocnoer";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Ocnoer iOS</Text>
        <Text style={styles.title}>{storyTitle}</Text>
        <Text style={styles.body}>
          Published runtime data is ready for native reading.
        </Text>

        <View style={styles.panel}>
          <InfoRow label="Signed in as" value={props.player.firstName} />
          <InfoRow label="Player id" value={props.player.id} />
          <InfoRow label="Cat name" value={props.player.catName ?? "Not set"} />
          <InfoRow
            label="Cat name status"
            value={props.player.catNameLocked ? "Locked" : "Available"}
          />
          {!props.player.catNameLocked ? (
            <View style={styles.catNameForm}>
              <TextInput
                autoCapitalize="words"
                editable={!props.isUpdatingCatName}
                onChangeText={setCatNameInput}
                placeholder="Set cat name"
                placeholderTextColor="#64748b"
                style={styles.input}
                value={catNameInput}
              />
              {props.catNameError ? (
                <Text style={styles.error}>{props.catNameError}</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={!canSubmitCatName}
                onPress={() => props.onUpdateCatName(catNameInput)}
                style={({ pressed }) => [
                  styles.inlineButton,
                  !canSubmitCatName ? styles.inlineButtonDisabled : null,
                  pressed && canSubmitCatName
                    ? styles.inlineButtonPressed
                    : null
                ]}
              >
                {props.isUpdatingCatName ? (
                  <ActivityIndicator color="#021617" />
                ) : (
                  <Text style={styles.inlineButtonText}>Save Cat Name</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Reading</Text>
          {props.isLoadingProgress ? (
            <Text style={styles.body}>Checking local progress...</Text>
          ) : props.savedProgress ? (
            <>
              <InfoRow
                label="Saved chapter"
                value={props.savedProgress.chapterId}
              />
              <InfoRow
                label="Saved scene"
                value={props.savedProgress.sceneId}
              />
              <InfoRow
                label="Saved entry"
                value={props.savedProgress.dialogueEntryId}
              />
              <InfoRow
                label="Saved"
                value={formatDate(props.savedProgress.updatedAt)}
              />
            </>
          ) : (
            <Text style={styles.body}>No local reading progress yet.</Text>
          )}

          <PrimaryButton
            disabled={props.isLoadingProgress}
            label={props.savedProgress ? "Continue Reading" : "Start Reading"}
            onPress={props.onContinueReading}
          />
          {props.savedProgress ? (
            <>
              <View style={styles.buttonSpacer}>
                <SecondaryButton
                  disabled={
                    props.isLoadingProgress || props.isResettingProgress
                  }
                  label="Restart From Beginning"
                  onPress={props.onRestartReading}
                />
              </View>
              <View style={styles.buttonSpacer}>
                <SecondaryButton
                  disabled={
                    props.isLoadingProgress || props.isResettingProgress
                  }
                  label={
                    props.isResettingProgress
                      ? "Clearing Progress"
                      : "Clear Local Progress"
                  }
                  onPress={props.onResetProgress}
                />
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Runtime</Text>
          <InfoRow
            label="Manifest version"
            value={String(manifest.schemaVersion)}
          />
          <InfoRow label="Generated" value={formatDate(manifest.generatedAt)} />
          <InfoRow
            label="Chapter count"
            value={String(manifest.chapters.length)}
          />
          <InfoRow
            label="Initial chapter"
            value={
              initialChapter?.title ??
              manifestChapter?.title ??
              previewChapterId ??
              "Unavailable"
            }
          />
          <InfoRow
            label="Initial chapter id"
            value={previewChapterId ?? "Unavailable"}
          />
        </View>

        <View style={styles.panel}>
          <InfoRow label="Runtime host" value={config.supabaseUrl} />
          <InfoRow label="Manifest path" value={config.manifestPath} />
        </View>

        <SecondaryButton
          disabled={!previewChapterId}
          label="Open Chapter Preview"
          onPress={() => {
            if (previewChapterId) {
              props.onOpenPreview(previewChapterId);
            }
          }}
        />
        <View style={styles.buttonSpacer}>
          <SecondaryButton
            disabled={props.isSigningOut}
            label={props.isSigningOut ? "Signing Out" : "Sign Out"}
            onPress={props.onSignOut}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#071014"
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28
  },
  content: {
    padding: 24,
    paddingBottom: 40
  },
  eyebrow: {
    color: "#67e8f9",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase"
  },
  title: {
    color: "#f8fafc",
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40,
    marginBottom: 12
  },
  body: {
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 18
  },
  loadingText: {
    color: "#dbeafe",
    fontSize: 17,
    marginTop: 18
  },
  panel: {
    backgroundColor: "#102027",
    borderColor: "#284450",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  panelTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10
  },
  infoRow: {
    borderBottomColor: "#20343d",
    borderBottomWidth: 1,
    paddingVertical: 10
  },
  infoLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    marginBottom: 4,
    textTransform: "uppercase"
  },
  infoValue: {
    color: "#f8fafc",
    fontSize: 16,
    lineHeight: 23
  },
  codeText: {
    color: "#bae6fd",
    fontFamily: "Courier",
    fontSize: 13,
    marginTop: 8
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#14b8a6",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18
  },
  primaryButtonDisabled: {
    backgroundColor: "#334155"
  },
  primaryButtonPressed: {
    opacity: 0.82
  },
  primaryButtonText: {
    color: "#021617",
    fontSize: 16,
    fontWeight: "800"
  },
  buttonSpacer: {
    marginTop: 12
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#475569",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 18
  },
  secondaryButtonDisabled: {
    opacity: 0.6
  },
  secondaryButtonPressed: {
    opacity: 0.75
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "700"
  },
  catNameForm: {
    marginTop: 14
  },
  input: {
    backgroundColor: "#071014",
    borderColor: "#284450",
    borderRadius: 8,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12
  },
  error: {
    color: "#fca5a5",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10
  },
  inlineButton: {
    alignItems: "center",
    backgroundColor: "#14b8a6",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 16
  },
  inlineButtonDisabled: {
    backgroundColor: "#334155"
  },
  inlineButtonPressed: {
    opacity: 0.82
  },
  inlineButtonText: {
    color: "#021617",
    fontSize: 15,
    fontWeight: "800"
  }
});
