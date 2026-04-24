import { useMemo } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from "react-native";

import type { PlayerRuntimeBootstrap } from "@ocnoer/story-core";

import type { MobilePlayer } from "../api/playerSessionTypes";
import { AudioStatusPanel } from "../audio/AudioControls";
import { resolveNativeReaderBackgroundMusicCue } from "../audio/nativeBackgroundMusicCue";
import { useNativeBackgroundMusic } from "../audio/useNativeBackgroundMusic";
import type { MobileRuntimeConfig } from "../config/runtime";
import { NativeReaderBoundaryCard } from "../reader/components/NativeReaderBoundaryCard";
import {
  BlackoutOverlay,
  FadeInView
} from "../reader/components/NativeCinematic";
import { NativeReaderDialogue } from "../reader/components/NativeReaderDialogue";
import { NativeReaderStage } from "../reader/components/NativeReaderStage";
import { useReaderImagePreload } from "../reader/imagePreload";
import { useNativeReaderController } from "../reader/useNativeReaderController";
import type { NativeAudioPreferences } from "../storage/audioPreferenceStorage";
import {
  OcnoerButton,
  OcnoerIconButton,
  OcnoerScreenBackground,
  OcnoerSurface
} from "../ui/primitives";
import { ocnoerTheme } from "../ui/theme";

type ReaderScreenProps = {
  bootstrap: PlayerRuntimeBootstrap;
  config: MobileRuntimeConfig;
  player: MobilePlayer;
  sessionToken: string;
  audioPreferences: NativeAudioPreferences;
  onBackHome: () => void;
  onProgressSaved: () => void;
  onToggleAudioMuted: () => void;
  onUpdateCatName: (catName: string) => Promise<void>;
};

function ReaderChrome(props: {
  title: string;
  subtitle: string;
  audioPreferences: NativeAudioPreferences;
  audioStatus: ReturnType<typeof useNativeBackgroundMusic>;
  onBackHome: () => void;
  onToggleAudioMuted: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.chrome}>
      <OcnoerIconButton
        accessibilityLabel="Return to home"
        label="<"
        onPress={props.onBackHome}
        style={styles.chromeIcon}
      />
      <View pointerEvents="none" style={styles.chromeTitle}>
        <Text numberOfLines={1} style={styles.chromeTitleText}>
          {props.title}
        </Text>
        <Text numberOfLines={1} style={styles.chromeSubtitleText}>
          {props.subtitle}
        </Text>
      </View>
      <View style={styles.audioChrome}>
        <AudioStatusPanel
          compact
          preferences={props.audioPreferences}
          status={props.audioStatus}
          onToggleMuted={props.onToggleAudioMuted}
        />
      </View>
    </View>
  );
}

function ReaderMessageScreen(props: {
  title: string;
  body: string;
  loading?: boolean;
  onBackHome?: () => void;
  onRetry?: () => void;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <OcnoerScreenBackground>
        <View style={styles.centered}>
          <OcnoerSurface style={styles.messagePanel} variant="glass">
            {props.loading ? (
              <ActivityIndicator color={ocnoerTheme.colors.text} size="large" />
            ) : null}
            <Text style={styles.messageTitle}>{props.title}</Text>
            <Text style={styles.messageBody}>{props.body}</Text>
            {props.onRetry ? (
              <OcnoerButton label="Retry" onPress={props.onRetry} />
            ) : null}
            {props.onBackHome ? (
              <OcnoerButton
                label="Home"
                onPress={props.onBackHome}
                style={styles.messageButton}
                variant={props.onRetry ? "secondary" : "primary"}
              />
            ) : null}
          </OcnoerSurface>
        </View>
      </OcnoerScreenBackground>
    </SafeAreaView>
  );
}

export function ReaderScreen(props: ReaderScreenProps) {
  const reader = useNativeReaderController({
    bootstrap: props.bootstrap,
    config: props.config,
    player: props.player,
    sessionToken: props.sessionToken,
    onProgressSaved: props.onProgressSaved,
    onUpdateCatName: props.onUpdateCatName
  });
  const presentation = reader.presentation;
  const boundaryPresentation = reader.boundaryPresentation;
  const backgroundMusicCue = useMemo(() => {
    if (reader.state.status !== "ready" && reader.state.status !== "finished") {
      return resolveNativeReaderBackgroundMusicCue({
        supabaseUrl: props.config.supabaseUrl,
        bundle: null,
        readerState: null,
        boundaryState: reader.boundaryState
      });
    }

    return resolveNativeReaderBackgroundMusicCue({
      supabaseUrl: props.config.supabaseUrl,
      bundle: reader.state.bundle,
      readerState: reader.state.readerState,
      boundaryState: reader.boundaryState
    });
  }, [props.config.supabaseUrl, reader.boundaryState, reader.state]);
  const audioStatus = useNativeBackgroundMusic({
    cue: backgroundMusicCue,
    preferences: props.audioPreferences
  });

  useReaderImagePreload(reader.preloadImageUrls);

  if (reader.state.status === "loading") {
    return (
      <ReaderMessageScreen
        loading
        body="Loading story runtime and preparing the native reader."
        title="Loading reader"
      />
    );
  }

  if (reader.state.status === "error") {
    return (
      <ReaderMessageScreen
        body={reader.state.message}
        title="Reader load failed"
        onBackHome={props.onBackHome}
        onRetry={reader.reload}
      />
    );
  }

  if (reader.state.status === "unavailable") {
    return (
      <ReaderMessageScreen
        body={reader.state.message}
        title="No playable story"
        onBackHome={props.onBackHome}
      />
    );
  }

  if (!presentation) {
    return (
      <ReaderMessageScreen
        body="The current chapter or dialogue entry could not be resolved."
        title="Story position missing"
        onBackHome={props.onBackHome}
        onRetry={reader.reload}
      />
    );
  }

  const subtitle =
    reader.state.status === "finished"
      ? "Story complete"
      : `Scene ${presentation.sceneIndex + 1}/${presentation.sceneCount} - Line ${presentation.dialogueIndex + 1}/${presentation.dialogueCount}`;
  const showTransitionBlackout =
    boundaryPresentation?.type === "scene-transition" || reader.isMoving;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.readerRoot}
      >
        <View style={styles.stageFrame}>
          <NativeReaderStage presentation={presentation} />
          <BlackoutOverlay
            opacity={
              boundaryPresentation?.type === "scene-transition" ? 0.72 : 0.08
            }
            visible={showTransitionBlackout}
          />
          <ReaderChrome
            audioPreferences={props.audioPreferences}
            audioStatus={audioStatus}
            subtitle={subtitle}
            title={presentation.chapterTitle}
            onBackHome={props.onBackHome}
            onToggleAudioMuted={props.onToggleAudioMuted}
          />

          {boundaryPresentation ? (
            <NativeReaderBoundaryCard
              actionError={reader.actionError}
              boundary={boundaryPresentation}
              canRetreat={reader.canRetreat}
              isMoving={reader.isMoving}
              persistenceError={reader.persistenceError}
              onAdvance={reader.advance}
              onRetreat={reader.retreat}
            />
          ) : reader.state.status === "finished" ? (
            <OcnoerSurface style={styles.finishedCard} variant="glass">
              <Text style={styles.messageTitle}>Story Finished</Text>
              <Text style={styles.messageBody}>
                You have reached the end of the currently published story.
              </Text>
              <OcnoerButton
                disabled={reader.isMoving}
                label="Back"
                onPress={reader.retreat}
                variant="secondary"
              />
            </OcnoerSurface>
          ) : (
            <FadeInView
              animationKey={`${presentation.status}:${presentation.dialogueEntryId}`}
              durationMs={ocnoerTheme.motion.quickMs}
              style={styles.dialogueLayer}
            >
              <NativeReaderDialogue
                actionError={reader.actionError}
                canRetreat={reader.canRetreat}
                catNameInputError={reader.catNameInputError}
                catNameInputValue={reader.catNameInputValue}
                isMoving={reader.isMoving}
                isSavingCatName={reader.isSavingCatName}
                persistenceError={reader.persistenceError}
                presentation={presentation}
                onAdvance={reader.advance}
                onCatNameInputChange={reader.setCatNameInputValue}
                onRetreat={reader.retreat}
                onSelectDressOption={reader.selectDressOption}
                onSubmitCatName={reader.submitCatName}
              />
            </FadeInView>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: ocnoerTheme.colors.black,
    flex: 1
  },
  readerRoot: {
    backgroundColor: ocnoerTheme.colors.black,
    flex: 1
  },
  stageFrame: {
    backgroundColor: ocnoerTheme.colors.black,
    flex: 1,
    overflow: "hidden"
  },
  chrome: {
    alignItems: "center",
    flexDirection: "row",
    gap: ocnoerTheme.spacing.sm,
    left: 0,
    paddingHorizontal: ocnoerTheme.spacing.md,
    paddingTop: ocnoerTheme.spacing.sm,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 32
  },
  chromeIcon: {
    backgroundColor: "rgba(0, 0, 0, 0.22)",
    borderColor: ocnoerTheme.colors.border,
    borderWidth: 1
  },
  chromeTitle: {
    flex: 1,
    minWidth: 0
  },
  chromeTitleText: {
    color: ocnoerTheme.colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  chromeSubtitleText: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 2
  },
  audioChrome: {
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    borderColor: ocnoerTheme.colors.border,
    borderRadius: ocnoerTheme.radii.lg,
    borderWidth: 1,
    maxWidth: 168,
    minWidth: 136,
    paddingHorizontal: ocnoerTheme.spacing.sm,
    paddingVertical: ocnoerTheme.spacing.xs
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: ocnoerTheme.spacing.xxl
  },
  messagePanel: {
    width: "100%"
  },
  messageTitle: {
    color: ocnoerTheme.colors.text,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 32,
    marginBottom: ocnoerTheme.spacing.sm,
    textAlign: "center"
  },
  messageBody: {
    ...ocnoerTheme.text.body,
    marginBottom: ocnoerTheme.spacing.xl,
    textAlign: "center"
  },
  messageButton: {
    marginTop: ocnoerTheme.spacing.md
  },
  dialogueLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20
  },
  finishedCard: {
    bottom: ocnoerTheme.spacing.lg,
    left: ocnoerTheme.spacing.md,
    position: "absolute",
    right: ocnoerTheme.spacing.md,
    zIndex: 22
  }
});
