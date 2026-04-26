import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlurView } from "expo-blur";
import { Image as ExpoImage } from "expo-image";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { SvgAst } from "react-native-svg";

import type {
  NativeReaderDressOption,
  NativeReaderPresentation
} from "../readerPresentation";
import {
  createCachedReaderImageSource,
  getAssetRenderMode,
  usePreloadedReaderImageRef,
  usePreloadedReaderSvgAst
} from "../imagePreload";
import {
  createNativeReaderDialogueAnimationKey,
  getNativeReaderTypingExpectedDurationMs,
  getNativeReaderVisibleTextLengthAtElapsedMs
} from "../nativeReaderDialogueMotion";
import { NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND } from "../nativeReaderStageStyle";
import { OcnoerTextInput } from "../../ui/primitives";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import {
  DirectionalSlideView,
  type NativeMotionDirection
} from "./NativeCinematic";

type ReaderDialogueProps = {
  presentation: NativeReaderPresentation;
  actionError: string | null;
  canAdvance: boolean;
  persistenceError: string | null;
  catNameInputValue: string;
  catNameInputError: string | null;
  isSavingCatName: boolean;
  isExiting: boolean;
  isMoving: boolean;
  onAdvance: () => void;
  onSelectDressOption: (optionKey: string) => void;
  onSubmitCatName: () => void;
  onCatNameInputChange: (value: string) => void;
};

const DIALOGUE_BACKDROP_BLUR_INTENSITY = 100;
const DIALOGUE_BACKDROP_BLUR_TINT = "dark";
const TEXT_FRAME_STALL_WARNING_MS = 100;

declare global {
  // Development probe for separating presentation commit/render delay from
  // typewriter cost.
  // eslint-disable-next-line no-var
  var __OCNOER_READER_INSTANT_DIALOGUE_TEXT: boolean | undefined;
}

function isDevelopment() {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function shouldUseInstantDialogueText() {
  return (
    isDevelopment() && Boolean(globalThis.__OCNOER_READER_INSTANT_DIALOGUE_TEXT)
  );
}

function logDialogueTiming(message: string, details?: Record<string, unknown>) {
  if (!isDevelopment()) {
    return;
  }

  if (details) {
    console.info(`[reader-dialogue] ${message}`, details);
    return;
  }

  console.info(`[reader-dialogue] ${message}`);
}

function getPortraitRenderModeSummary(presentation: NativeReaderPresentation) {
  const renderModes = presentation.stageCharacters.map((portrait) =>
    getAssetRenderMode(portrait.imageUrl)
  );

  return renderModes.reduce<Record<string, number>>((counts, renderMode) => {
    counts[renderMode] = (counts[renderMode] ?? 0) + 1;
    return counts;
  }, {});
}

function getDialogueCardPositionStyle(
  presentation: NativeReaderPresentation
): ViewStyle {
  if (presentation.dialogueCardPlacement === "speaker-left") {
    return {
      left: "48%",
      right: ocnoerWebPlayer.dialogueCard.sideInset
    };
  }

  if (presentation.dialogueCardPlacement === "speaker-right") {
    return {
      left: ocnoerWebPlayer.dialogueCard.sideInset,
      right: "48%"
    };
  }

  if (presentation.dialogueCardPlacement === "cat-name") {
    return {
      left: ocnoerWebPlayer.dialogueCard.sideInset,
      maxWidth: ocnoerWebPlayer.dialogueCard.catNameMaxWidth,
      width: "92%"
    };
  }

  return {
    left: ocnoerWebPlayer.dialogueCard.sideInset,
    right: ocnoerWebPlayer.dialogueCard.sideInset
  };
}

function getDialogueMotionDirection(
  presentation: NativeReaderPresentation
): NativeMotionDirection {
  if (presentation.dialogueCardPlacement === "speaker-left") {
    return "from-right";
  }

  if (presentation.dialogueCardPlacement === "speaker-right") {
    return "from-left";
  }

  return "from-bottom";
}

function shouldShowSpeakerLabel(presentation: NativeReaderPresentation) {
  return (
    presentation.status === "supported" &&
    (presentation.entryType === "character" ||
      presentation.entryType === "cat_name_prompt")
  );
}

function SpeakerLabel(props: { presentation: NativeReaderPresentation }) {
  if (props.presentation.status !== "supported") {
    return null;
  }

  if (!shouldShowSpeakerLabel(props.presentation)) {
    return null;
  }

  if (props.presentation.entryType === "cat_name_prompt") {
    return <Text style={styles.promptEyebrow}>Name your cat</Text>;
  }

  const speakerName = props.presentation.speakerName.trim();
  const isOcnoer = speakerName.toLowerCase() === "ocnoer";

  return (
    <Text style={isOcnoer ? styles.ocnoerSpeaker : styles.speaker}>
      {props.presentation.speakerName}
    </Text>
  );
}

function TypedDialogueText(props: {
  characters: string[];
  style: StyleProp<TextStyle>;
  visibleTextLength: number;
}) {
  const visibleText = props.characters
    .slice(0, props.visibleTextLength)
    .join("");
  const hiddenText = props.characters.slice(props.visibleTextLength).join("");

  return (
    <Text style={props.style}>
      {visibleText}
      {hiddenText.length > 0 ? (
        <Text style={styles.hiddenText}>{hiddenText}</Text>
      ) : null}
    </Text>
  );
}

function DressOptionCard(props: {
  option: NativeReaderDressOption;
  onPress: () => void;
}) {
  const renderMode = props.option.previewImageUrl
    ? getAssetRenderMode(props.option.previewImageUrl)
    : "unknown";
  const svgAst = usePreloadedReaderSvgAst(
    renderMode === "original-svg" || renderMode === "true-vector-svg"
      ? props.option.previewImageUrl
      : null
  );
  const previewImageRef = usePreloadedReaderImageRef(
    props.option.previewImageUrl
  );
  const previewImageSource = props.option.previewImageUrl
    ? createCachedReaderImageSource(props.option.previewImageUrl)
    : null;

  return (
    <Pressable
      accessibilityLabel={`Choose ${props.option.label}`}
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.dressPreviewButton,
        pressed ? styles.pressed : null
      ]}
    >
      {props.option.previewImageUrl &&
      (renderMode === "original-svg" || renderMode === "true-vector-svg") ? (
        <View pointerEvents="none" style={styles.dressPreviewSvg}>
          {svgAst ? (
            <SvgAst
              ast={svgAst}
              override={{
                height: "100%",
                preserveAspectRatio: "xMidYMid meet",
                width: "100%"
              }}
            />
          ) : null}
        </View>
      ) : props.option.previewImageUrl && previewImageSource ? (
        <ExpoImage
          cachePolicy="memory-disk"
          contentFit="contain"
          priority="high"
          recyclingKey={props.option.previewImageUrl}
          source={previewImageRef ?? previewImageSource}
          style={styles.dressPreviewImage}
          transition={0}
        />
      ) : (
        <View style={styles.emptyDressPreview}>
          <Text style={styles.emptyDressPreviewText}>No preview</Text>
        </View>
      )}
    </Pressable>
  );
}

function ContinueArrow(props: {
  canAdvance: boolean;
  isVisible: boolean;
  isMoving: boolean;
  onAdvance: () => void;
}) {
  const revealProgress = useRef(
    new Animated.Value(props.isVisible ? 1 : 0)
  ).current;
  const translateY = revealProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0]
  });

  useEffect(() => {
    const animation = Animated.timing(revealProgress, {
      toValue: props.isVisible ? 1 : 0,
      duration: ocnoerTheme.motion.continueEnterMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [props.isVisible, revealProgress]);

  return (
    <View style={styles.continueSlot}>
      <Animated.View
        pointerEvents={props.isVisible ? "auto" : "none"}
        style={{
          opacity: revealProgress,
          transform: [{ translateY }]
        }}
      >
        <Pressable
          accessibilityLabel={props.isMoving ? "Loading next line" : "Continue"}
          accessibilityRole="button"
          disabled={!props.isVisible || !props.canAdvance || props.isMoving}
          onPress={props.onAdvance}
          style={({ pressed }) => [
            styles.continueButton,
            !props.isVisible || !props.canAdvance || props.isMoving
              ? styles.disabled
              : null,
            pressed && props.canAdvance && !props.isMoving
              ? styles.pressed
              : null
          ]}
        >
          {props.isMoving ? (
            <ActivityIndicator color={ocnoerTheme.colors.text} size="small" />
          ) : (
            <Text style={styles.continueText}>{"\u2192"}</Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function NativeReaderDialogue(props: ReaderDialogueProps) {
  const cardPosition = getDialogueCardPositionStyle(props.presentation);
  const motionDirection = getDialogueMotionDirection(props.presentation);
  const dialogueText =
    props.presentation.status === "supported"
      ? props.presentation.dialogueText
      : "";
  const typingKey = `${props.presentation.status}:${props.presentation.dialogueEntryId}:${dialogueText}`;
  const textCharacters = useMemo(
    () => Array.from(dialogueText),
    [dialogueText]
  );
  const [typingState, setTypingState] = useState({
    key: typingKey,
    startedAt: Date.now(),
    visibleTextLength: 0
  });
  const visibleTextLength =
    typingState.key === typingKey ? typingState.visibleTextLength : 0;
  const typingStartedAt =
    typingState.key === typingKey ? typingState.startedAt : Date.now();
  const textExpectedDurationMs = useMemo(
    () =>
      getNativeReaderTypingExpectedDurationMs({
        characters: textCharacters,
        initialDelayMs: ocnoerTheme.motion.normalMs
      }),
    [textCharacters]
  );
  const [dressIndex, setDressIndex] = useState(0);
  const textCompletionLoggedKeyRef = useRef<string | null>(null);
  const textFrameStallCountRef = useRef(0);
  const portraitRenderModeSummary = useMemo(
    () => getPortraitRenderModeSummary(props.presentation),
    [props.presentation.stageCharacters]
  );
  const portraitRenderModeSummaryKey = useMemo(
    () => JSON.stringify(portraitRenderModeSummary),
    [portraitRenderModeSummary]
  );
  const characterPortraitCount = props.presentation.stageCharacters.length;
  const selectedDressOption = useMemo(() => {
    if (props.presentation.status !== "supported") {
      return null;
    }

    return (
      props.presentation.dressOptions[
        Math.min(dressIndex, props.presentation.dressOptions.length - 1)
      ] ?? null
    );
  }, [dressIndex, props.presentation]);

  useEffect(() => {
    setDressIndex(0);
  }, [props.presentation.dialogueEntryId]);

  useEffect(() => {
    setTypingState({
      key: typingKey,
      startedAt: Date.now(),
      visibleTextLength: 0
    });
    textCompletionLoggedKeyRef.current = null;
    textFrameStallCountRef.current = 0;

    logDialogueTiming("text animation started", {
      dialogueEntryId: props.presentation.dialogueEntryId,
      entryType: props.presentation.entryType,
      lineId: props.presentation.dialogueEntryId,
      speakerId: props.presentation.speakerId,
      characterPortraitCount,
      renderModeCount: portraitRenderModeSummary,
      TEXT_EXPECTED_MS: textExpectedDurationMs,
      typingKey
    });
  }, [
    characterPortraitCount,
    portraitRenderModeSummary,
    props.presentation.dialogueEntryId,
    props.presentation.entryType,
    props.presentation.speakerId,
    textExpectedDurationMs,
    typingKey
  ]);

  useEffect(() => {
    logDialogueTiming("dialogue component mounted", {
      dialogueEntryId: props.presentation.dialogueEntryId,
      entryType: props.presentation.entryType,
      hasPortrait: Boolean(
        props.presentation.leftPortrait || props.presentation.rightPortrait
      )
    });
  }, [
    props.presentation.dialogueEntryId,
    props.presentation.entryType,
    props.presentation.leftPortrait,
    props.presentation.rightPortrait
  ]);

  const hasTypeableDialogueText =
    props.presentation.status === "supported" && dialogueText.length > 0;
  const isTextComplete =
    !hasTypeableDialogueText || visibleTextLength >= textCharacters.length;
  const canCompleteTyping =
    hasTypeableDialogueText && !isTextComplete && !props.isExiting;
  const handleCompleteTyping = useCallback(() => {
    if (!canCompleteTyping) {
      return;
    }

    setTypingState((currentState) => {
      if (currentState.key !== typingKey) {
        return currentState;
      }

      return {
        key: typingKey,
        startedAt: currentState.startedAt,
        visibleTextLength: textCharacters.length
      };
    });
  }, [canCompleteTyping, textCharacters.length, typingKey]);

  useEffect(() => {
    if (!hasTypeableDialogueText || props.isExiting) {
      return;
    }

    if (shouldUseInstantDialogueText()) {
      setTypingState((currentState) => {
        if (currentState.key !== typingKey) {
          return currentState;
        }

        return {
          key: typingKey,
          startedAt: currentState.startedAt,
          visibleTextLength: textCharacters.length
        };
      });
      logDialogueTiming("text animation completed", {
        dialogueEntryId: props.presentation.dialogueEntryId,
        instantTextProbe: true,
        lineId: props.presentation.dialogueEntryId,
        speakerId: props.presentation.speakerId,
        characterPortraitCount,
        renderModeCount: portraitRenderModeSummary,
        JS_FRAME_STALLS: 0,
        TEXT_ACTUAL_MS: 0,
        TEXT_EXPECTED_MS: textExpectedDurationMs,
        typingKey
      });
      return;
    }

    let cancelled = false;
    let frameId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastFrameAt = Date.now();

    const clearScheduledTick = () => {
      if (frameId != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameId);
      }

      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };

    const scheduleTick = () => {
      if (typeof requestAnimationFrame === "function") {
        frameId = requestAnimationFrame(tick);
        return;
      }

      timeoutId = setTimeout(tick, 16);
    };

    const tick = () => {
      if (cancelled) {
        return;
      }

      const now = Date.now();
      const frameDeltaMs = now - lastFrameAt;

      if (frameDeltaMs > TEXT_FRAME_STALL_WARNING_MS) {
        textFrameStallCountRef.current += 1;
        logDialogueTiming("JS frame stall during text animation", {
          dialogueEntryId: props.presentation.dialogueEntryId,
          lineId: props.presentation.dialogueEntryId,
          speakerId: props.presentation.speakerId,
          frameDeltaMs,
          characterPortraitCount,
          renderModeCount: portraitRenderModeSummary
        });
      }

      lastFrameAt = now;

      const nextVisibleTextLength = getNativeReaderVisibleTextLengthAtElapsedMs({
        characters: textCharacters,
        elapsedMs: now - typingStartedAt,
        initialDelayMs: ocnoerTheme.motion.normalMs
      });

      setTypingState((currentState) => {
        if (currentState.key !== typingKey) {
          return currentState;
        }

        if (currentState.visibleTextLength === nextVisibleTextLength) {
          return currentState;
        }

        return {
          key: typingKey,
          startedAt: currentState.startedAt,
          visibleTextLength: Math.min(
            nextVisibleTextLength,
            textCharacters.length
          )
        };
      });

      if (nextVisibleTextLength >= textCharacters.length) {
        if (textCompletionLoggedKeyRef.current !== typingKey) {
          textCompletionLoggedKeyRef.current = typingKey;
          logDialogueTiming("text animation completed", {
            dialogueEntryId: props.presentation.dialogueEntryId,
            lineId: props.presentation.dialogueEntryId,
            speakerId: props.presentation.speakerId,
            characterPortraitCount,
            renderModeCount: portraitRenderModeSummary,
            JS_FRAME_STALLS: textFrameStallCountRef.current,
            TEXT_ACTUAL_MS: now - typingStartedAt,
            TEXT_EXPECTED_MS: textExpectedDurationMs,
            typingKey
          });
        }
        return;
      }

      scheduleTick();
    };

    scheduleTick();

    return () => {
      cancelled = true;
      clearScheduledTick();
    };
  }, [
    hasTypeableDialogueText,
    characterPortraitCount,
    portraitRenderModeSummary,
    portraitRenderModeSummaryKey,
    props.isExiting,
    props.presentation.dialogueEntryId,
    props.presentation.speakerId,
    textCharacters,
    textExpectedDurationMs,
    typingKey,
    typingStartedAt
  ]);

  if (props.presentation.status === "unsupported") {
    const animationKey = createNativeReaderDialogueAnimationKey(
      props.presentation
    );

    return (
      <DirectionalSlideView
        key={animationKey}
        animationKey={animationKey}
        direction={motionDirection}
        isExiting={props.isExiting}
        pointerEvents={props.isExiting ? "none" : "auto"}
        style={[styles.dialogueCard, cardPosition]}
      >
        <Pressable
          accessible={false}
          onPress={handleCompleteTyping}
          style={styles.dialogueSurfacePressable}
        >
          <BlurView
            experimentalBlurMethod="dimezisBlurView"
            intensity={DIALOGUE_BACKDROP_BLUR_INTENSITY}
            style={styles.dialogueSurface}
            tint={DIALOGUE_BACKDROP_BLUR_TINT}
          >
            <Text style={styles.unsupportedTitle}>Unsupported Story Entry</Text>
            <Text style={styles.body}>{props.presentation.message}</Text>
            <Text style={styles.metaText}>
              Entry {props.presentation.dialogueEntryId}
            </Text>
            <ContinueArrow
              canAdvance={false}
              isVisible
              isMoving={props.isMoving}
              onAdvance={props.onAdvance}
            />
          </BlurView>
        </Pressable>
      </DirectionalSlideView>
    );
  }

  const supportedPresentation = props.presentation;
  const isDressPrompt = supportedPresentation.entryType === "dress_prompt";
  const shouldShowCatNameInput =
    supportedPresentation.needsCatNameInput && isTextComplete;
  const shouldShowDialogueText =
    supportedPresentation.dialogueText.length > 0 &&
    !(supportedPresentation.needsCatNameInput && isTextComplete);
  const shouldShowDressOptions =
    isDressPrompt && selectedDressOption && isTextComplete;
  const shouldShowContinueArrow = !isDressPrompt && isTextComplete;
  const animationKey = createNativeReaderDialogueAnimationKey(
    props.presentation
  );

  return (
    <DirectionalSlideView
      key={animationKey}
      animationKey={animationKey}
      direction={motionDirection}
      isExiting={props.isExiting}
      pointerEvents={props.isExiting ? "none" : "auto"}
      style={[styles.dialogueCard, cardPosition]}
    >
      <Pressable
        accessible={false}
        onPress={handleCompleteTyping}
        style={styles.dialogueSurfacePressable}
      >
        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={DIALOGUE_BACKDROP_BLUR_INTENSITY}
          style={styles.dialogueSurface}
          tint={DIALOGUE_BACKDROP_BLUR_TINT}
        >
          <SpeakerLabel presentation={props.presentation} />

          {shouldShowDialogueText ? (
            <TypedDialogueText
              characters={textCharacters}
              style={
                isDressPrompt ? styles.dressPromptText : styles.dialogueText
              }
              visibleTextLength={visibleTextLength}
            />
          ) : null}

          {shouldShowCatNameInput ? (
            <View style={styles.promptBlock}>
              <OcnoerTextInput
                autoCapitalize="words"
                editable={!props.isSavingCatName}
                onChangeText={props.onCatNameInputChange}
                onSubmitEditing={props.onSubmitCatName}
                placeholder="Enter cat name"
                returnKeyType="done"
                value={props.catNameInputValue}
              />
              {props.catNameInputError ? (
                <Text style={styles.errorText}>{props.catNameInputError}</Text>
              ) : null}
            </View>
          ) : null}

          {shouldShowDressOptions ? (
            <View style={styles.dressPromptBlock}>
              <View style={styles.dressCarousel}>
                <Pressable
                  accessibilityLabel="Previous dress option"
                  accessibilityRole="button"
                  disabled={supportedPresentation.dressOptions.length <= 1}
                  onPress={() => {
                    setDressIndex((currentIndex) =>
                      currentIndex <= 0
                        ? supportedPresentation.dressOptions.length - 1
                        : currentIndex - 1
                    );
                  }}
                  style={({ pressed }) => [
                    styles.dressArrow,
                    supportedPresentation.dressOptions.length <= 1
                      ? styles.disabled
                      : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text style={styles.dressArrowText}>{"\u2190"}</Text>
                </Pressable>

                <View style={styles.dressPreviewWrap}>
                  <DressOptionCard
                    option={selectedDressOption}
                    onPress={() =>
                      props.onSelectDressOption(selectedDressOption.key)
                    }
                  />
                  <Text style={styles.dressCounter}>
                    {dressIndex + 1} of{" "}
                    {supportedPresentation.dressOptions.length}
                  </Text>
                </View>

                <Pressable
                  accessibilityLabel="Next dress option"
                  accessibilityRole="button"
                  disabled={supportedPresentation.dressOptions.length <= 1}
                  onPress={() => {
                    setDressIndex((currentIndex) =>
                      currentIndex >=
                      supportedPresentation.dressOptions.length - 1
                        ? 0
                        : currentIndex + 1
                    );
                  }}
                  style={({ pressed }) => [
                    styles.dressArrow,
                    supportedPresentation.dressOptions.length <= 1
                      ? styles.disabled
                      : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text style={styles.dressArrowText}>{"\u2192"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {props.actionError ? (
            <Text style={styles.errorText}>{props.actionError}</Text>
          ) : null}
          {props.persistenceError ? (
            <Text style={styles.warningText}>{props.persistenceError}</Text>
          ) : null}

          {!isDressPrompt ? (
            <ContinueArrow
              key={typingKey}
              canAdvance={
                !props.isMoving &&
                isTextComplete &&
                (supportedPresentation.needsCatNameInput || props.canAdvance)
              }
              isMoving={
                props.isMoving ||
                props.isSavingCatName ||
                (isTextComplete &&
                  !supportedPresentation.needsCatNameInput &&
                  !props.canAdvance)
              }
              isVisible={shouldShowContinueArrow}
              onAdvance={() => {
                if (supportedPresentation.needsCatNameInput) {
                  props.onSubmitCatName();
                  return;
                }

                props.onAdvance();
              }}
            />
          ) : null}
        </BlurView>
      </Pressable>
    </DirectionalSlideView>
  );
}

const styles = StyleSheet.create({
  dialogueCard: {
    bottom: ocnoerWebPlayer.dialogueCard.bottomInset,
    maxHeight: "64%",
    position: "absolute",
    zIndex: 20
  },
  dialogueSurface: {
    maxHeight: "100%",
    backgroundColor: "transparent",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: ocnoerWebPlayer.dialogueCard.borderRadius,
    borderWidth: 1,
    elevation: 0,
    overflow: "hidden",
    padding: ocnoerWebPlayer.dialogueCard.padding,
    shadowColor: "transparent",
    shadowOffset: {
      width: 0,
      height: 0
    },
    shadowOpacity: 0,
    shadowRadius: 0
  },
  dialogueSurfacePressable: {
    maxHeight: "100%"
  },
  hiddenText: {
    color: "transparent"
  },
  speaker: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: ocnoerTheme.spacing.md,
    textTransform: "uppercase"
  },
  ocnoerSpeaker: {
    color: ocnoerTheme.colors.textMuted,
    fontFamily: ocnoerTheme.typography.family.script,
    fontSize: ocnoerTheme.typography.size.scriptName,
    lineHeight: 44,
    marginBottom: ocnoerTheme.spacing.sm
  },
  promptEyebrow: {
    ...ocnoerTheme.text.eyebrow,
    color: ocnoerTheme.colors.textMuted,
    marginBottom: ocnoerTheme.spacing.md
  },
  dialogueText: {
    ...ocnoerTheme.text.dialogue,
    minHeight: 56
  },
  dressPromptText: {
    color: ocnoerTheme.colors.text,
    fontFamily: ocnoerTheme.typography.family.script,
    fontSize: ocnoerTheme.typography.size.dressPrompt,
    lineHeight: ocnoerTheme.typography.lineHeight.dressPrompt,
    textAlign: "center"
  },
  promptBlock: {
    marginTop: ocnoerTheme.spacing.lg
  },
  dressPromptBlock: {
    marginTop: ocnoerTheme.spacing.xl
  },
  dressCarousel: {
    alignItems: "center",
    flexDirection: "row",
    gap: ocnoerTheme.spacing.sm,
    justifyContent: "center"
  },
  dressArrow: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: ocnoerTheme.radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  dressArrowText: {
    color: ocnoerTheme.colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22
  },
  dressPreviewWrap: {
    alignItems: "center",
    maxWidth: ocnoerWebPlayer.dialogueCard.promptPreviewMaxWidth,
    width: "58%"
  },
  dressPreviewButton: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: ocnoerTheme.colors.border,
    borderRadius: ocnoerTheme.radii.lg,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    padding: ocnoerTheme.spacing.sm,
    width: "100%"
  },
  dressPreviewImage: {
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
    height: "100%",
    width: "100%"
  },
  dressPreviewSvg: {
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
    height: "100%",
    width: "100%"
  },
  emptyDressPreview: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.24)",
    borderRadius: ocnoerTheme.radii.md,
    flex: 1,
    justifyContent: "center",
    width: "100%"
  },
  emptyDressPreviewText: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    fontWeight: "700"
  },
  dressCounter: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 16,
    marginTop: ocnoerTheme.spacing.sm,
    textAlign: "center"
  },
  continueSlot: {
    alignItems: "center",
    flexDirection: "row",
    height: 36,
    justifyContent: "flex-end",
    marginTop: ocnoerTheme.spacing.xl
  },
  continueButton: {
    alignItems: "center",
    borderRadius: ocnoerTheme.radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  continueText: {
    color: ocnoerTheme.colors.text,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28
  },
  body: {
    ...ocnoerTheme.text.body,
    marginBottom: ocnoerTheme.spacing.lg
  },
  metaText: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 18
  },
  unsupportedTitle: {
    color: ocnoerTheme.colors.rose,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: ocnoerTheme.spacing.sm
  },
  errorText: {
    color: ocnoerTheme.colors.rose,
    fontSize: 14,
    lineHeight: 20,
    marginTop: ocnoerTheme.spacing.md
  },
  warningText: {
    color: ocnoerTheme.colors.warning,
    fontSize: 13,
    lineHeight: 19,
    marginTop: ocnoerTheme.spacing.md
  },
  pressed: {
    opacity: ocnoerTheme.opacity.pressed
  },
  disabled: {
    opacity: ocnoerTheme.opacity.disabled
  }
});
