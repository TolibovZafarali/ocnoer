import { useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
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
import { AudioStatusPanel } from "../audio/AudioControls";
import type { NativeAudioPreferences } from "../storage/audioPreferenceStorage";
import {
  OcnoerButton,
  OcnoerInfoRow,
  OcnoerScreenBackground,
  OcnoerSurface,
  OcnoerTextInput
} from "../ui/primitives";
import { ocnoerTheme, ocnoerWebPlayer } from "../ui/theme";

type BootstrapScreenProps = {
  state: RuntimeBootstrapState;
  player: MobilePlayer;
  isSigningOut: boolean;
  audioPreferences: NativeAudioPreferences;
  audioPreferenceError: string | null;
  isLoadingAudioPreferences: boolean;
  isUpdatingCatName: boolean;
  isLoadingProgress: boolean;
  isResettingProgress: boolean;
  catNameError: string | null;
  progressSyncError: string | null;
  savedProgress: PlayerProgress | null;
  onContinueReading: () => void;
  onRetry: () => void;
  onRestartReading: () => void;
  onResetProgress: () => void;
  onSignOut: () => void;
  onToggleAudioMuted: () => void;
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

function SectionHeader(props: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      {props.eyebrow ? (
        <Text style={styles.eyebrow}>{props.eyebrow}</Text>
      ) : null}
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.body ? <Text style={styles.body}>{props.body}</Text> : null}
    </View>
  );
}

function LoadingState() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <OcnoerScreenBackground>
        <View style={styles.centered}>
          <OcnoerSurface style={styles.centerPanel} variant="glass">
            <ActivityIndicator color={ocnoerTheme.colors.text} size="large" />
            <Text style={styles.loadingText}>Loading published runtime</Text>
          </OcnoerSurface>
        </View>
      </OcnoerScreenBackground>
    </SafeAreaView>
  );
}

function getProgressSummary(input: {
  savedProgress: PlayerProgress | null;
  isLoadingProgress: boolean;
}) {
  if (input.isLoadingProgress) {
    return "Checking synced progress...";
  }

  if (!input.savedProgress) {
    return "Start the published story from the beginning.";
  }

  return `Saved ${formatDate(input.savedProgress.updatedAt)}`;
}

export function BootstrapScreen(props: BootstrapScreenProps) {
  const [catNameInput, setCatNameInput] = useState(props.player.catName ?? "");
  const canSubmitCatName =
    !props.player.catNameLocked &&
    catNameInput.trim().length > 0 &&
    !props.isUpdatingCatName;

  if (props.state.status === "loading") {
    return <LoadingState />;
  }

  if (props.state.status === "error") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <OcnoerScreenBackground>
          <ScrollView contentContainerStyle={styles.content}>
            <SectionHeader
              eyebrow="Ocnoer"
              title="Runtime load failed"
              body={props.state.message}
            />
            <OcnoerSurface style={styles.card} variant="glass">
              <OcnoerInfoRow
                label="Signed in as"
                value={props.player.firstName}
              />
              <OcnoerInfoRow
                label="Cat name"
                value={props.player.catName ?? "Not set"}
              />
            </OcnoerSurface>
            <OcnoerSurface style={styles.card} variant="quiet">
              <Text style={styles.cardTitle}>Required public config</Text>
              {MOBILE_RUNTIME_ENV_VARS.map((name) => (
                <Text key={name} style={styles.codeText}>
                  {name}
                </Text>
              ))}
            </OcnoerSurface>
            <OcnoerButton label="Retry" onPress={props.onRetry} />
            <OcnoerButton
              disabled={props.isSigningOut}
              label={props.isSigningOut ? "Signing Out" : "Sign Out"}
              onPress={props.onSignOut}
              style={styles.stackedButton}
              variant="secondary"
            />
          </ScrollView>
        </OcnoerScreenBackground>
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
      <OcnoerScreenBackground>
        <ScrollView contentContainerStyle={styles.homeContent}>
          <View style={styles.homeStage}>
            <View style={styles.homeChrome}>
              <View style={styles.homeAudio}>
                <AudioStatusPanel
                  compact
                  error={props.audioPreferenceError}
                  isLoading={props.isLoadingAudioPreferences}
                  preferences={props.audioPreferences}
                  onToggleMuted={props.onToggleAudioMuted}
                />
              </View>
              <OcnoerButton
                disabled={props.isSigningOut}
                label={props.isSigningOut ? "Signing Out" : "Sign Out"}
                onPress={props.onSignOut}
                style={styles.homeChromeButton}
                variant="ghost"
              />
            </View>

            <OcnoerSurface style={styles.homePanel} variant="glass">
              <Text style={styles.eyebrow}>Ocnoer</Text>
              <Text style={styles.homeTitle}>{storyTitle}</Text>
              <Text style={styles.homeBody}>
                {getProgressSummary({
                  savedProgress: props.savedProgress,
                  isLoadingProgress: props.isLoadingProgress
                })}
              </Text>

              <View style={styles.homeMeta}>
                <OcnoerInfoRow
                  label="Signed in as"
                  value={props.player.firstName}
                />
                <OcnoerInfoRow
                  label="Cat name"
                  value={props.player.catName ?? "Not set"}
                />
                {props.savedProgress ? (
                  <OcnoerInfoRow
                    label="Saved line"
                    value={props.savedProgress.dialogueEntryId}
                  />
                ) : null}
              </View>

              {!props.player.catNameLocked ? (
                <View style={styles.catNameForm}>
                  <OcnoerTextInput
                    autoCapitalize="words"
                    editable={!props.isUpdatingCatName}
                    onChangeText={setCatNameInput}
                    placeholder="Set cat name"
                    value={catNameInput}
                  />
                  {props.catNameError ? (
                    <Text style={styles.error}>{props.catNameError}</Text>
                  ) : null}
                  <OcnoerButton
                    disabled={!canSubmitCatName}
                    label={props.isUpdatingCatName ? "Saving" : "Save Cat Name"}
                    loading={props.isUpdatingCatName}
                    onPress={() => props.onUpdateCatName(catNameInput)}
                    style={styles.inlineButton}
                  />
                </View>
              ) : null}

              {props.progressSyncError ? (
                <Text style={styles.warning}>{props.progressSyncError}</Text>
              ) : null}

              <View style={styles.homeActions}>
                <OcnoerButton
                  disabled={props.isLoadingProgress}
                  label={
                    props.savedProgress ? "Continue Reading" : "Start Reading"
                  }
                  onPress={props.onContinueReading}
                  style={styles.homePrimaryAction}
                />
                {props.savedProgress ? (
                  <>
                    <OcnoerButton
                      disabled={
                        props.isLoadingProgress || props.isResettingProgress
                      }
                      label="Restart"
                      onPress={props.onRestartReading}
                      style={styles.homeSecondaryAction}
                      variant="secondary"
                    />
                    <OcnoerButton
                      disabled={
                        props.isLoadingProgress || props.isResettingProgress
                      }
                      label={props.isResettingProgress ? "Clearing" : "Clear"}
                      onPress={props.onResetProgress}
                      style={styles.homeSecondaryAction}
                      variant="danger"
                    />
                  </>
                ) : null}
              </View>
            </OcnoerSurface>
          </View>

          <OcnoerSurface style={styles.card} variant="quiet">
            <Text style={styles.cardTitle}>Runtime</Text>
            <OcnoerInfoRow
              label="Manifest version"
              value={String(manifest.schemaVersion)}
            />
            <OcnoerInfoRow
              label="Generated"
              value={formatDate(manifest.generatedAt)}
            />
            <OcnoerInfoRow
              label="Chapter count"
              value={String(manifest.chapters.length)}
            />
            <OcnoerInfoRow
              label="Initial chapter"
              value={
                initialChapter?.title ??
                manifestChapter?.title ??
                previewChapterId ??
                "Unavailable"
              }
            />
            <OcnoerInfoRow
              label="Initial chapter id"
              value={previewChapterId ?? "Unavailable"}
            />
            <OcnoerInfoRow label="Runtime host" value={config.supabaseUrl} />
            <OcnoerInfoRow label="Manifest path" value={config.manifestPath} />
          </OcnoerSurface>

          <OcnoerButton
            disabled={!previewChapterId}
            label="Open Chapter Preview"
            onPress={() => {
              if (previewChapterId) {
                props.onOpenPreview(previewChapterId);
              }
            }}
            variant="secondary"
          />
        </ScrollView>
      </OcnoerScreenBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: ocnoerTheme.colors.night,
    flex: 1
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: ocnoerTheme.spacing.xxl
  },
  centerPanel: {
    alignItems: "center",
    width: "100%"
  },
  content: {
    padding: ocnoerTheme.spacing.xl,
    paddingBottom: 44
  },
  homeContent: {
    padding: ocnoerTheme.spacing.md,
    paddingBottom: 44
  },
  homeStage: {
    backgroundColor: ocnoerTheme.colors.slate950,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: ocnoerTheme.spacing.lg,
    minHeight: 610,
    overflow: "hidden",
    paddingBottom: ocnoerWebPlayer.dialogueCard.bottomInset,
    position: "relative"
  },
  homeChrome: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: ocnoerWebPlayer.chrome.inset,
    paddingTop: ocnoerWebPlayer.chrome.inset,
    zIndex: 2
  },
  homeAudio: {
    backgroundColor: ocnoerWebPlayer.chrome.panelBackground,
    borderColor: ocnoerWebPlayer.chrome.panelBorder,
    borderRadius: ocnoerTheme.radii.lg,
    borderWidth: 1,
    maxWidth: 184,
    paddingHorizontal: ocnoerTheme.spacing.sm,
    paddingVertical: ocnoerTheme.spacing.xs
  },
  homeChromeButton: {
    minHeight: 40,
    paddingHorizontal: ocnoerTheme.spacing.md
  },
  homePanel: {
    bottom: ocnoerWebPlayer.dialogueCard.bottomInset,
    left: ocnoerWebPlayer.dialogueCard.sideInset,
    position: "absolute",
    right: ocnoerWebPlayer.dialogueCard.sideInset
  },
  homeTitle: {
    color: ocnoerTheme.colors.text,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 32,
    marginBottom: ocnoerTheme.spacing.sm
  },
  homeBody: {
    ...ocnoerTheme.text.body,
    color: ocnoerTheme.colors.textMuted
  },
  homeMeta: {
    borderTopColor: ocnoerTheme.colors.border,
    borderTopWidth: 1,
    marginTop: ocnoerTheme.spacing.lg,
    paddingTop: ocnoerTheme.spacing.md
  },
  homeActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ocnoerTheme.spacing.sm,
    justifyContent: "flex-end",
    marginTop: ocnoerTheme.spacing.xl
  },
  homePrimaryAction: {
    minWidth: 170
  },
  homeSecondaryAction: {
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: ocnoerTheme.spacing.lg
  },
  sectionHeader: {
    marginBottom: ocnoerTheme.spacing.xl,
    paddingTop: ocnoerTheme.spacing.lg
  },
  eyebrow: {
    ...ocnoerTheme.text.eyebrow,
    color: ocnoerTheme.colors.cyan,
    marginBottom: ocnoerTheme.spacing.sm
  },
  sectionTitle: {
    color: ocnoerTheme.colors.text,
    fontSize: ocnoerTheme.typography.size.title,
    fontWeight: "800",
    lineHeight: ocnoerTheme.typography.lineHeight.title,
    marginBottom: ocnoerTheme.spacing.sm
  },
  body: {
    ...ocnoerTheme.text.body
  },
  loadingText: {
    color: ocnoerTheme.colors.textMuted,
    fontSize: 17,
    marginTop: ocnoerTheme.spacing.lg
  },
  card: {
    marginBottom: ocnoerTheme.spacing.lg
  },
  cardTitle: {
    color: ocnoerTheme.colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: ocnoerTheme.spacing.sm
  },
  catNameForm: {
    marginTop: ocnoerTheme.spacing.lg
  },
  inlineButton: {
    marginTop: ocnoerTheme.spacing.md
  },
  primaryAction: {
    marginTop: ocnoerTheme.spacing.xl
  },
  stackedButton: {
    marginTop: ocnoerTheme.spacing.md
  },
  codeText: {
    color: ocnoerTheme.colors.cyan,
    fontFamily: ocnoerTheme.typography.family.monospace,
    fontSize: 13,
    marginTop: ocnoerTheme.spacing.sm
  },
  error: {
    color: ocnoerTheme.colors.rose,
    fontSize: 14,
    lineHeight: 20,
    marginTop: ocnoerTheme.spacing.md
  },
  warning: {
    color: ocnoerTheme.colors.warning,
    fontSize: 14,
    lineHeight: 20,
    marginTop: ocnoerTheme.spacing.md
  }
});
