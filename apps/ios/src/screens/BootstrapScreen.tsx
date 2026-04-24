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
import { ocnoerTheme } from "../ui/theme";

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
        <ScrollView contentContainerStyle={styles.content}>
          <SectionHeader
            eyebrow="Ocnoer"
            title={storyTitle}
            body="Continue the published story in the native reader."
          />

          <OcnoerSurface style={styles.card} variant="glass">
            <Text style={styles.cardTitle}>Profile</Text>
            <OcnoerInfoRow
              label="Signed in as"
              value={props.player.firstName}
            />
            <OcnoerInfoRow
              label="Cat name"
              value={props.player.catName ?? "Not set"}
            />
            <OcnoerInfoRow
              label="Cat name status"
              value={props.player.catNameLocked ? "Locked" : "Available"}
            />
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
          </OcnoerSurface>

          <OcnoerSurface style={styles.card} variant="glass">
            <Text style={styles.cardTitle}>Reading</Text>
            {props.isLoadingProgress ? (
              <Text style={styles.body}>Checking synced progress...</Text>
            ) : props.savedProgress ? (
              <>
                <OcnoerInfoRow
                  label="Saved chapter"
                  value={props.savedProgress.chapterId}
                />
                <OcnoerInfoRow
                  label="Saved scene"
                  value={props.savedProgress.sceneId}
                />
                <OcnoerInfoRow
                  label="Saved entry"
                  value={props.savedProgress.dialogueEntryId}
                />
                <OcnoerInfoRow
                  label="Saved"
                  value={formatDate(props.savedProgress.updatedAt)}
                />
              </>
            ) : (
              <Text style={styles.body}>No saved reading progress yet.</Text>
            )}
            {props.progressSyncError ? (
              <Text style={styles.warning}>{props.progressSyncError}</Text>
            ) : null}

            <OcnoerButton
              disabled={props.isLoadingProgress}
              label={props.savedProgress ? "Continue Reading" : "Start Reading"}
              onPress={props.onContinueReading}
              style={styles.primaryAction}
            />
            {props.savedProgress ? (
              <>
                <OcnoerButton
                  disabled={
                    props.isLoadingProgress || props.isResettingProgress
                  }
                  label="Restart From Beginning"
                  onPress={props.onRestartReading}
                  style={styles.stackedButton}
                  variant="secondary"
                />
                <OcnoerButton
                  disabled={
                    props.isLoadingProgress || props.isResettingProgress
                  }
                  label={
                    props.isResettingProgress
                      ? "Clearing Progress"
                      : "Clear Progress"
                  }
                  onPress={props.onResetProgress}
                  style={styles.stackedButton}
                  variant="danger"
                />
              </>
            ) : null}
          </OcnoerSurface>

          <OcnoerSurface style={styles.card} variant="glass">
            <AudioStatusPanel
              error={props.audioPreferenceError}
              isLoading={props.isLoadingAudioPreferences}
              preferences={props.audioPreferences}
              onToggleMuted={props.onToggleAudioMuted}
            />
          </OcnoerSurface>

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
