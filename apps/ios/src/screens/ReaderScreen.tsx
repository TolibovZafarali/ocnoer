import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";

import {
  validateCatNameInput,
  type PlayerRuntimeBootstrap
} from "@ocnoer/story-core";

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
  OcnoerSurface
} from "../ui/primitives";
import { ocnoerTheme, ocnoerWebPlayer } from "../ui/theme";

const worldMapImage = require("../../../../lore/world-map.jpg") as number;

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

function waitForDuration(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function ReaderChrome(props: {
  audioPreferences: NativeAudioPreferences;
  audioStatus: ReturnType<typeof useNativeBackgroundMusic>;
  canRetreat: boolean;
  onBackHome: () => void;
  onOpenMap: () => void;
  onRetreat: () => void;
  onToggleAudioMuted: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.chrome}>
      <OcnoerIconButton
        accessibilityLabel="Previous dialogue"
        disabled={!props.canRetreat}
        label="←"
        onPress={props.onRetreat}
        style={styles.chromeIcon}
      />
      <View pointerEvents="box-none" style={styles.chromeRight}>
        <OcnoerIconButton
          accessibilityLabel="Open world map"
          label="⌖"
          onPress={props.onOpenMap}
          style={styles.chromeIcon}
        />
        <AudioStatusPanel
          compact
          preferences={props.audioPreferences}
          status={props.audioStatus}
          onToggleMuted={props.onToggleAudioMuted}
        />
        <OcnoerIconButton
          accessibilityLabel="Return home"
          label="⌂"
          onPress={props.onBackHome}
          style={styles.chromeIcon}
          textStyle={styles.chromeHomeText}
        />
      </View>
    </View>
  );
}

function WorldMapOverlay(props: { onClose: () => void }) {
  return (
    <View accessibilityViewIsModal style={styles.mapOverlay}>
      <View style={styles.mapStage}>
        <Pressable
          accessibilityLabel="Close world map"
          accessibilityRole="button"
          onPress={props.onClose}
          style={styles.mapCloseButton}
        >
          <Text style={styles.mapCloseText}>×</Text>
        </Pressable>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="Ocnoer world map"
          resizeMode="contain"
          source={worldMapImage}
          style={styles.mapImage}
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
      <View style={styles.messageScreen}>
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
      </View>
    </SafeAreaView>
  );
}

export function ReaderScreen(props: ReaderScreenProps) {
  const dimensions = useWindowDimensions();
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const [isLineExiting, setIsLineExiting] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
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
  const hasBoundaryPresentation = Boolean(boundaryPresentation);
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
  const stageWidth = Math.min(
    dimensions.width,
    dimensions.height * ocnoerTheme.stage.preferredAspectRatio
  );
  const revealChrome = useCallback(() => {
    setIsChromeVisible(true);
  }, []);
  const runWithLineExit = useCallback(
    async (action: () => Promise<void> | void) => {
      if (isLineExiting) {
        return;
      }

      const shouldAnimateExit =
        !hasBoundaryPresentation && reader.state.status === "ready";

      if (shouldAnimateExit) {
        setIsLineExiting(true);
        await waitForDuration(ocnoerTheme.motion.lineExitMs);
      }

      try {
        await action();
      } finally {
        if (shouldAnimateExit) {
          setIsLineExiting(false);
        }
      }
    },
    [hasBoundaryPresentation, isLineExiting, reader.state.status]
  );
  const handleAdvance = useCallback(() => {
    setIsChromeVisible(false);
    void runWithLineExit(reader.advance);
  }, [reader.advance, runWithLineExit]);
  const handleRetreat = useCallback(() => {
    setIsChromeVisible(false);
    void runWithLineExit(reader.retreat);
  }, [reader.retreat, runWithLineExit]);
  const handleSelectDressOption = useCallback(
    (optionKey: string) => {
      setIsChromeVisible(false);
      void runWithLineExit(() => reader.selectDressOption(optionKey));
    },
    [reader.selectDressOption, runWithLineExit]
  );
  const handleSubmitCatName = useCallback(() => {
    setIsChromeVisible(false);
    if (validateCatNameInput(reader.catNameInputValue)) {
      void reader.submitCatName();
      return;
    }

    void runWithLineExit(reader.submitCatName);
  }, [reader.catNameInputValue, reader.submitCatName, runWithLineExit]);
  const handleBackHome = useCallback(() => {
    setIsChromeVisible(false);
    props.onBackHome();
  }, [props]);
  const handleOpenMap = useCallback(() => {
    setIsChromeVisible(false);
    setIsMapOpen(true);
  }, []);

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

  const showTransitionBlackout =
    boundaryPresentation?.type === "scene-transition" || reader.isMoving;

  return (
    <View style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.readerRoot}
      >
        <View style={styles.stageOuter}>
          <View
            style={[
              styles.stageFrame,
              {
                width: stageWidth
              }
            ]}
          >
            <NativeReaderStage
              isLineExiting={isLineExiting}
              presentation={presentation}
            />
            <BlackoutOverlay
              opacity={
                boundaryPresentation?.type === "scene-transition" ? 0.72 : 0.08
              }
              visible={showTransitionBlackout}
            />
            <Pressable
              accessibilityLabel="Show navigation header"
              accessibilityRole="button"
              onPress={revealChrome}
              style={styles.stageTapLayer}
            />
            {isChromeVisible ? (
              <FadeInView
                animationKey="reader-chrome-visible"
                durationMs={ocnoerTheme.motion.lineExitMs}
                pointerEvents="box-none"
                style={styles.chromeWrap}
              >
                <ReaderChrome
                  audioPreferences={props.audioPreferences}
                  audioStatus={audioStatus}
                  canRetreat={
                    reader.canRetreat && !reader.isMoving && !isLineExiting
                  }
                  onBackHome={handleBackHome}
                  onOpenMap={handleOpenMap}
                  onRetreat={handleRetreat}
                  onToggleAudioMuted={props.onToggleAudioMuted}
                />
              </FadeInView>
            ) : null}

            {boundaryPresentation ? (
              <NativeReaderBoundaryCard
                actionError={reader.actionError}
                boundary={boundaryPresentation}
                isMoving={reader.isMoving}
                persistenceError={reader.persistenceError}
                onAdvance={handleAdvance}
                onRevealChrome={revealChrome}
              />
            ) : reader.state.status === "finished" ? (
              <Pressable
                accessibilityLabel="Story finished"
                accessibilityRole="button"
                onPress={revealChrome}
                style={styles.finishedCard}
              />
            ) : (
              <View pointerEvents="box-none" style={styles.dialogueLayer}>
                <NativeReaderDialogue
                  actionError={reader.actionError}
                  catNameInputError={reader.catNameInputError}
                  catNameInputValue={reader.catNameInputValue}
                  isExiting={isLineExiting}
                  isMoving={reader.isMoving}
                  isSavingCatName={reader.isSavingCatName}
                  persistenceError={reader.persistenceError}
                  presentation={presentation}
                  onAdvance={handleAdvance}
                  onCatNameInputChange={reader.setCatNameInputValue}
                  onSelectDressOption={handleSelectDressOption}
                  onSubmitCatName={handleSubmitCatName}
                />
              </View>
            )}
          </View>
        </View>
        {isMapOpen ? (
          <WorldMapOverlay
            onClose={() => {
              setIsMapOpen(false);
            }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </View>
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
  messageScreen: {
    backgroundColor: ocnoerTheme.colors.black,
    flex: 1
  },
  stageOuter: {
    alignItems: "center",
    backgroundColor: ocnoerTheme.colors.black,
    flex: 1,
    justifyContent: "center"
  },
  stageFrame: {
    alignSelf: "center",
    backgroundColor: ocnoerTheme.colors.slate950,
    height: "100%",
    overflow: "hidden"
  },
  stageTapLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 15
  },
  chromeWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40
  },
  chrome: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: ocnoerWebPlayer.chrome.inset,
    paddingTop: ocnoerWebPlayer.chrome.inset,
    position: "absolute",
    right: 0,
    top: 0
  },
  chromeIcon: {
    backgroundColor: "transparent"
  },
  chromeHomeText: {
    fontSize: 22
  },
  chromeRight: {
    alignItems: "center",
    backgroundColor: ocnoerWebPlayer.chrome.panelBackground,
    borderColor: ocnoerWebPlayer.chrome.panelBorder,
    borderRadius: ocnoerTheme.radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: ocnoerTheme.spacing.xs,
    maxWidth: "78%",
    paddingHorizontal: ocnoerTheme.spacing.xs,
    paddingVertical: ocnoerTheme.spacing.xs
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    padding: ocnoerTheme.spacing.md,
    zIndex: 70
  },
  mapStage: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  mapCloseButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderColor: "rgba(255, 255, 255, 0.20)",
    borderRadius: ocnoerTheme.radii.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    left: ocnoerTheme.spacing.md,
    position: "absolute",
    top: ocnoerTheme.spacing.md,
    width: 48,
    zIndex: 2
  },
  mapCloseText: {
    color: ocnoerTheme.colors.text,
    fontSize: 30,
    lineHeight: 34
  },
  mapImage: {
    height: "100%",
    width: "100%"
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black,
    zIndex: 22
  }
});
