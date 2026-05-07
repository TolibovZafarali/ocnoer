import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlurView } from "expo-blur";
import { Image as ExpoImage } from "expo-image";
import {
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
  isReaderPerfDiagnosticsEnabled,
  setReaderDecodeSchedulerInteractionState,
  usePreloadedReaderImageRef,
  usePreloadedReaderSvgAst,
  warmNextSceneAssets
} from "../imagePreload";
import {
  createNativeReaderDressOptionImageKey,
  getNativeReaderDressOptionAtIndex,
  getNativeReaderDressOptionPreviewImageUrl,
  isNativeReaderDressPreviewReady,
  isResolvedNativeReaderDressOption
} from "../dressChoice";
import {
  createNativeReaderDialogueAnimationKey,
  getNativeReaderTextUpdateCadenceMs,
  getNativeReaderTypingExpectedDurationMs,
  getNativeReaderVisibleTextLengthAtElapsedMs,
  shouldApplyNativeReaderForceCompleteRequest,
  shouldDeferNativeReaderTextReveal,
  shouldStartDeferredNativeReaderTextReveal,
  type NativeReaderForceCompleteRequest
} from "../nativeReaderDialogueMotion";
import {
  NATIVE_READER_DRESS_PREVIEW_FALLBACK_BACKGROUND,
  NATIVE_READER_DRESS_PREVIEW_LOADING_OVERLAY_BACKGROUND,
  NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND
} from "../nativeReaderStageStyle";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
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
  keyboardBottomInset: number;
  onAdvance: () => void;
  onSelectDressOption: (optionKey: string) => void;
  onSubmitCatName: () => void;
  onCatNameInputChange: (value: string) => void;
};

const DIALOGUE_BACKDROP_BLUR_INTENSITY = 30;
const DIALOGUE_BACKDROP_BLUR_TINT = "dark";
const TEXT_FRAME_STALL_WARNING_MS = 100;

declare global {
  // Development probe for separating presentation commit/render delay from
  // typewriter cost.
  // eslint-disable-next-line no-var
  var __OCNOER_READER_INSTANT_DIALOGUE_TEXT: boolean | undefined;
}

function shouldUseInstantDialogueText() {
  return (
    isReaderPerfDiagnosticsEnabled() &&
    Boolean(globalThis.__OCNOER_READER_INSTANT_DIALOGUE_TEXT)
  );
}

function logDialogueTiming(message: string, details?: Record<string, unknown>) {
  if (!isReaderPerfDiagnosticsEnabled()) {
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

const VisibleDialogueText = memo(function VisibleDialogueText(props: {
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
});

const BatchedTypedDialogueText = memo(function BatchedTypedDialogueText(props: {
  characterPortraitCount: number;
  characters: string[];
  dialogueEntryId: string;
  forceCompleteRequest: NativeReaderForceCompleteRequest | null;
  isExiting: boolean;
  onCompleteChange: (isComplete: boolean) => void;
  renderModeCount: Record<string, number>;
  speakerId: string | null;
  style: StyleProp<TextStyle>;
  textExpectedDurationMs: number;
  typingKey: string;
}) {
  const textRenderCountRef = useRef(0);
  const textStateUpdateCountRef = useRef(0);
  const textFrameStallsOver16MsRef = useRef(0);
  const textFrameStallsOver50MsRef = useRef(0);
  const textFrameStallsOver100MsRef = useRef(0);
  const textCompletionLoggedKeyRef = useRef<string | null>(null);
  const deferredTypingKeyRef = useRef<string | null>(null);
  const isExitingRef = useRef(props.isExiting);
  const [typingState, setTypingState] = useState({
    key: props.typingKey,
    startedAt: Date.now(),
    visibleTextLength: 0
  });
  const visibleTextLength =
    typingState.key === props.typingKey ? typingState.visibleTextLength : 0;
  const typingStartedAt =
    typingState.key === props.typingKey ? typingState.startedAt : Date.now();
  const isTextComplete = visibleTextLength >= props.characters.length;

  textRenderCountRef.current += 1;

  const logCompletion = useCallback(
    (actualMs: number, instantTextProbe = false) => {
      if (textCompletionLoggedKeyRef.current === props.typingKey) {
        return;
      }

      textCompletionLoggedKeyRef.current = props.typingKey;
      setReaderDecodeSchedulerInteractionState({
        textRevealing: false
      });
      props.onCompleteChange(true);
      logDialogueTiming("text animation completed", {
        dialogueEntryId: props.dialogueEntryId,
        instantTextProbe,
        lineId: props.dialogueEntryId,
        speakerId: props.speakerId,
        characterPortraitCount: props.characterPortraitCount,
        renderModeCount: props.renderModeCount,
        JS_FRAME_STALLS_OVER_16MS: textFrameStallsOver16MsRef.current,
        JS_FRAME_STALLS_OVER_50MS: textFrameStallsOver50MsRef.current,
        JS_FRAME_STALLS_OVER_100MS: textFrameStallsOver100MsRef.current,
        TEXT_ACTUAL_MS: actualMs,
        TEXT_EXPECTED_MS: props.textExpectedDurationMs,
        TEXT_RENDER_COUNT: textRenderCountRef.current,
        TEXT_STATE_UPDATES: textStateUpdateCountRef.current,
        typingKey: props.typingKey
      });
    },
    [
      props.characterPortraitCount,
      props.dialogueEntryId,
      props.onCompleteChange,
      props.renderModeCount,
      props.speakerId,
      props.textExpectedDurationMs,
      props.typingKey
    ]
  );

  useEffect(() => {
    isExitingRef.current = props.isExiting;
  }, [props.isExiting]);

  useEffect(() => {
    const startedAt = Date.now();
    const usesInstantDialogueText = shouldUseInstantDialogueText();

    textRenderCountRef.current = 0;
    textStateUpdateCountRef.current = 0;
    textFrameStallsOver16MsRef.current = 0;
    textFrameStallsOver50MsRef.current = 0;
    textFrameStallsOver100MsRef.current = 0;
    textCompletionLoggedKeyRef.current = null;
    deferredTypingKeyRef.current = null;
    props.onCompleteChange(props.characters.length === 0);
    setTypingState({
      key: props.typingKey,
      startedAt,
      visibleTextLength: usesInstantDialogueText ? props.characters.length : 0
    });

    if (props.characters.length === 0) {
      setReaderDecodeSchedulerInteractionState({
        textRevealing: false
      });
      return;
    }

    if (usesInstantDialogueText) {
      logDialogueTiming("text animation started", {
        dialogueEntryId: props.dialogueEntryId,
        lineId: props.dialogueEntryId,
        speakerId: props.speakerId,
        characterPortraitCount: props.characterPortraitCount,
        renderModeCount: props.renderModeCount,
        TEXT_EXPECTED_MS: props.textExpectedDurationMs,
        typingKey: props.typingKey
      });
      logCompletion(0, true);
      return;
    }

    // New lines can mount while a transition still holds the card hidden.
    // Keep the typewriter clock stopped until the card is allowed to enter.
    if (
      shouldDeferNativeReaderTextReveal({
        characterCount: props.characters.length,
        isExiting: isExitingRef.current
      })
    ) {
      deferredTypingKeyRef.current = props.typingKey;
      setReaderDecodeSchedulerInteractionState({
        textRevealing: false
      });
      logDialogueTiming("text animation deferred until card enter", {
        dialogueEntryId: props.dialogueEntryId,
        lineId: props.dialogueEntryId,
        speakerId: props.speakerId,
        typingKey: props.typingKey
      });
      return;
    }

    logDialogueTiming("text animation started", {
      dialogueEntryId: props.dialogueEntryId,
      lineId: props.dialogueEntryId,
      speakerId: props.speakerId,
      characterPortraitCount: props.characterPortraitCount,
      renderModeCount: props.renderModeCount,
      TEXT_EXPECTED_MS: props.textExpectedDurationMs,
      typingKey: props.typingKey
    });

    setReaderDecodeSchedulerInteractionState({
      textRevealing: true
    });
  }, [
    logCompletion,
    props.characterPortraitCount,
    props.characters.length,
    props.dialogueEntryId,
    props.onCompleteChange,
    props.renderModeCount,
    props.speakerId,
    props.textExpectedDurationMs,
    props.typingKey
  ]);

  useEffect(() => {
    if (
      !shouldStartDeferredNativeReaderTextReveal({
        deferredTypingKey: deferredTypingKeyRef.current,
        isExiting: props.isExiting,
        typingKey: props.typingKey
      })
    ) {
      return;
    }

    const startedAt = Date.now();
    deferredTypingKeyRef.current = null;
    textRenderCountRef.current = 0;
    textStateUpdateCountRef.current = 0;
    textFrameStallsOver16MsRef.current = 0;
    textFrameStallsOver50MsRef.current = 0;
    textFrameStallsOver100MsRef.current = 0;
    textCompletionLoggedKeyRef.current = null;
    props.onCompleteChange(false);
    setTypingState({
      key: props.typingKey,
      startedAt,
      visibleTextLength: 0
    });
    setReaderDecodeSchedulerInteractionState({
      textRevealing: true
    });
    logDialogueTiming("text animation started", {
      dialogueEntryId: props.dialogueEntryId,
      lineId: props.dialogueEntryId,
      speakerId: props.speakerId,
      characterPortraitCount: props.characterPortraitCount,
      renderModeCount: props.renderModeCount,
      TEXT_EXPECTED_MS: props.textExpectedDurationMs,
      typingKey: props.typingKey
    });
  }, [
    props.characterPortraitCount,
    props.dialogueEntryId,
    props.isExiting,
    props.onCompleteChange,
    props.renderModeCount,
    props.speakerId,
    props.textExpectedDurationMs,
    props.typingKey
  ]);

  useEffect(() => {
    if (
      !shouldApplyNativeReaderForceCompleteRequest({
        isTextComplete,
        request: props.forceCompleteRequest,
        typingKey: props.typingKey
      })
    ) {
      return;
    }

    setTypingState((currentState) => {
      if (currentState.key !== props.typingKey) {
        return currentState;
      }

      textStateUpdateCountRef.current += 1;
      return {
        key: props.typingKey,
        startedAt: currentState.startedAt,
        visibleTextLength: props.characters.length
      };
    });
    logCompletion(Date.now() - typingStartedAt);
  }, [
    isTextComplete,
    logCompletion,
    props.characters.length,
    props.forceCompleteRequest,
    props.typingKey,
    typingStartedAt
  ]);

  useEffect(() => {
    if (
      props.characters.length === 0 ||
      props.isExiting ||
      shouldUseInstantDialogueText() ||
      isTextComplete
    ) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastTickAt = Date.now();
    const cadenceMs = getNativeReaderTextUpdateCadenceMs();

    const tick = () => {
      if (cancelled) {
        return;
      }

      const now = Date.now();
      const frameDeltaMs = now - lastTickAt;
      const frameDelayBeyondCadenceMs = frameDeltaMs - cadenceMs;

      if (frameDelayBeyondCadenceMs > 16) {
        textFrameStallsOver16MsRef.current += 1;
      }

      if (frameDelayBeyondCadenceMs > 50) {
        textFrameStallsOver50MsRef.current += 1;
      }

      if (frameDelayBeyondCadenceMs > TEXT_FRAME_STALL_WARNING_MS) {
        textFrameStallsOver100MsRef.current += 1;
        logDialogueTiming("JS frame stall during text animation", {
          dialogueEntryId: props.dialogueEntryId,
          lineId: props.dialogueEntryId,
          speakerId: props.speakerId,
          frameDelayBeyondCadenceMs,
          frameDeltaMs,
          characterPortraitCount: props.characterPortraitCount,
          renderModeCount: props.renderModeCount
        });
      }

      lastTickAt = now;

      const nextVisibleTextLength = getNativeReaderVisibleTextLengthAtElapsedMs(
        {
          characters: props.characters,
          elapsedMs: now - typingStartedAt,
          initialDelayMs: ocnoerTheme.motion.normalMs
        }
      );

      setTypingState((currentState) => {
        if (currentState.key !== props.typingKey) {
          return currentState;
        }

        const boundedVisibleTextLength = Math.min(
          nextVisibleTextLength,
          props.characters.length
        );

        if (currentState.visibleTextLength === boundedVisibleTextLength) {
          return currentState;
        }

        textStateUpdateCountRef.current += 1;
        return {
          key: props.typingKey,
          startedAt: currentState.startedAt,
          visibleTextLength: boundedVisibleTextLength
        };
      });

      if (nextVisibleTextLength >= props.characters.length) {
        logCompletion(now - typingStartedAt);
        return;
      }

      timeoutId = setTimeout(tick, cadenceMs);
    };

    timeoutId = setTimeout(tick, cadenceMs);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setReaderDecodeSchedulerInteractionState({
        textRevealing: false
      });
    };
  }, [
    isTextComplete,
    logCompletion,
    props.characterPortraitCount,
    props.characters,
    props.dialogueEntryId,
    props.isExiting,
    props.renderModeCount,
    props.speakerId,
    props.typingKey,
    typingStartedAt
  ]);

  return (
    <VisibleDialogueText
      characters={props.characters}
      style={props.style}
      visibleTextLength={visibleTextLength}
    />
  );
});

function DressOptionCard(props: {
  option: NativeReaderDressOption;
  disabled: boolean;
  onPress: () => void;
  warmupVersion: number;
}) {
  const selectedPreviewKey = createNativeReaderDressOptionImageKey(
    props.option
  );
  const [visibleOption, setVisibleOption] =
    useState<NativeReaderDressOption | null>(null);
  const [failedPreviewKey, setFailedPreviewKey] = useState<string | null>(null);
  const visiblePreviewKey =
    createNativeReaderDressOptionImageKey(visibleOption);
  const selectedPreviewFailed =
    Boolean(selectedPreviewKey) && failedPreviewKey === selectedPreviewKey;
  const isSelectedPreviewReady = isNativeReaderDressPreviewReady({
    option: props.option,
    visibleOption,
    failedPreviewKey
  });
  const pendingOption =
    selectedPreviewKey &&
    selectedPreviewKey !== visiblePreviewKey &&
    !selectedPreviewFailed
      ? props.option
      : null;
  const showLoadingFallback = Boolean(pendingOption);
  const showUnavailableFallback =
    selectedPreviewFailed ||
    (!isResolvedNativeReaderDressOption(props.option) && !visibleOption);
  const isPressDisabled =
    props.disabled || showUnavailableFallback || !isSelectedPreviewReady;

  useEffect(() => {
    setFailedPreviewKey(null);

    if (!selectedPreviewKey) {
      setVisibleOption(null);
    }
  }, [props.warmupVersion, selectedPreviewKey]);

  const handleLayerReady = useCallback(
    (readyKey: string) => {
      if (readyKey !== selectedPreviewKey) {
        return;
      }

      setVisibleOption(props.option);
      setFailedPreviewKey(null);
    },
    [props.option, selectedPreviewKey]
  );
  const handleLayerError = useCallback(
    (failedKey: string) => {
      if (failedKey !== selectedPreviewKey) {
        return;
      }

      setFailedPreviewKey(failedKey);
      if (!visibleOption) {
        setVisibleOption(null);
      }
    },
    [selectedPreviewKey, visibleOption]
  );

  return (
    <Pressable
      accessibilityLabel={`Choose ${props.option.label}`}
      accessibilityRole="button"
      disabled={isPressDisabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.dressPreviewButton,
        isPressDisabled ? styles.disabled : null,
        pressed && !isPressDisabled ? styles.pressed : null
      ]}
    >
      <View pointerEvents="none" style={styles.dressPreviewMedia}>
        {!visibleOption ? (
          <DressPreviewFallback
            label={showUnavailableFallback ? "unavailable" : "loading"}
            loading={showLoadingFallback && !showUnavailableFallback}
          />
        ) : null}
        {visibleOption ? (
          <DressPreviewImageLayer
            key={`visible:${visiblePreviewKey}`}
            isVisible
            option={visibleOption}
            warmupVersion={props.warmupVersion}
            onError={handleLayerError}
            onReady={handleLayerReady}
          />
        ) : null}
        {pendingOption ? (
          <DressPreviewImageLayer
            key={`pending:${selectedPreviewKey}`}
            isVisible={false}
            option={pendingOption}
            warmupVersion={props.warmupVersion}
            onError={handleLayerError}
            onReady={handleLayerReady}
          />
        ) : null}
        {showLoadingFallback && visibleOption ? (
          <DressPreviewLoadingOverlay />
        ) : null}
        {showUnavailableFallback && visibleOption ? (
          <DressPreviewFallback label="unavailable" loading={false} />
        ) : null}
      </View>
    </Pressable>
  );
}

function DressPreviewImageLayer(props: {
  isVisible: boolean;
  option: NativeReaderDressOption;
  warmupVersion: number;
  onError: (previewKey: string) => void;
  onReady: (previewKey: string) => void;
}) {
  const { onError, onReady } = props;
  const previewImageUrl = getNativeReaderDressOptionPreviewImageUrl(
    props.option
  );
  const previewKey = createNativeReaderDressOptionImageKey(props.option);
  const renderMode = previewImageUrl
    ? getAssetRenderMode(previewImageUrl)
    : "unknown";
  const isSvgRenderMode =
    renderMode === "original-svg" || renderMode === "true-vector-svg";
  const svgAst = usePreloadedReaderSvgAst(
    isSvgRenderMode ? previewImageUrl : null
  );
  const previewImageRef = usePreloadedReaderImageRef(previewImageUrl);
  const previewImageSource = useMemo(
    () =>
      previewImageUrl ? createCachedReaderImageSource(previewImageUrl) : null,
    [previewImageUrl, props.warmupVersion]
  );
  const resolvedPreviewImageSource = previewImageRef ?? previewImageSource;
  const layerStyle = [
    styles.dressPreviewLayer,
    props.isVisible ? null : styles.dressPreviewPendingLayer
  ];

  useEffect(() => {
    if (!previewKey) {
      return;
    }

    if (!previewImageUrl) {
      onError(previewKey);
      return;
    }

    if (isSvgRenderMode && svgAst) {
      onReady(previewKey);
      return;
    }

    if (!isSvgRenderMode && previewImageRef) {
      onReady(previewKey);
      return;
    }

    if (props.warmupVersion > 0) {
      if (isSvgRenderMode || !resolvedPreviewImageSource) {
        onError(previewKey);
      }
    }
  }, [
    isSvgRenderMode,
    onError,
    onReady,
    previewImageRef,
    previewImageSource,
    previewImageUrl,
    previewKey,
    props.warmupVersion,
    resolvedPreviewImageSource,
    svgAst
  ]);

  if (!previewImageUrl || !previewKey) {
    return null;
  }

  if (isSvgRenderMode) {
    return (
      <View pointerEvents="none" style={layerStyle}>
        <View style={styles.dressPreviewSvg}>
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
      </View>
    );
  }

  if (!resolvedPreviewImageSource) {
    return null;
  }

  return (
    <View pointerEvents="none" style={layerStyle}>
      <ExpoImage
        cachePolicy="memory-disk"
        contentFit="contain"
        onDisplay={() => onReady(previewKey)}
        onError={() => onError(previewKey)}
        onLoad={() => onReady(previewKey)}
        priority="high"
        recyclingKey={previewKey}
        source={resolvedPreviewImageSource}
        style={styles.dressPreviewImage}
        transition={0}
      />
    </View>
  );
}

function DressPreviewFallback(props: {
  label: "loading" | "unavailable";
  loading: boolean;
}) {
  return (
    <View style={styles.dressPreviewFallback}>
      {props.loading ? (
        <LoadingSpinner
          accessibilityLabel="Loading dress preview"
          size={18}
          tintColor={ocnoerTheme.colors.textSubtle}
        />
      ) : (
        <Text style={styles.emptyDressPreviewText}>
          {props.label === "unavailable" ? "Preview unavailable" : " "}
        </Text>
      )}
    </View>
  );
}

function DressPreviewLoadingOverlay() {
  return (
    <View style={styles.dressPreviewLoadingOverlay}>
      <LoadingSpinner
        accessibilityLabel="Loading dress preview"
        size={18}
        tintColor={ocnoerTheme.colors.text}
      />
    </View>
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
            <LoadingSpinner
              accessibilityLabel="Loading next line"
              size={18}
              tintColor={ocnoerTheme.colors.text}
            />
          ) : (
            <Text style={styles.continueText}>{"\u2192"}</Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const NativeReaderDialogue = memo(function NativeReaderDialogue(
  props: ReaderDialogueProps
) {
  const dialogueRenderCountRef = useRef(0);
  const dialogueRemountCountRef = useRef(0);
  const cardPosition = getDialogueCardPositionStyle(props.presentation);
  const cardBottom =
    ocnoerWebPlayer.dialogueCard.bottomInset + props.keyboardBottomInset;
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
  const textExpectedDurationMs = useMemo(
    () =>
      getNativeReaderTypingExpectedDurationMs({
        characters: textCharacters,
        initialDelayMs: ocnoerTheme.motion.normalMs
      }),
    [textCharacters]
  );
  const [dressIndex, setDressIndex] = useState(0);
  const [dressAssetWarmupVersion, setDressAssetWarmupVersion] = useState(0);
  const isImmediatelyComplete =
    props.presentation.status !== "supported" || dialogueText.length === 0;
  const [forceCompleteRequest, setForceCompleteRequest] =
    useState<NativeReaderForceCompleteRequest | null>(null);
  const [textCompletionState, setTextCompletionState] = useState({
    isComplete: isImmediatelyComplete,
    typingKey
  });
  const isTextComplete =
    textCompletionState.typingKey === typingKey
      ? textCompletionState.isComplete
      : isImmediatelyComplete;
  const portraitRenderModeSummary = useMemo(
    () => getPortraitRenderModeSummary(props.presentation),
    [props.presentation.stageCharacters]
  );
  const characterPortraitCount = props.presentation.stageCharacters.length;
  const dressPromptAssetRefs = useMemo(
    () =>
      props.presentation.entryType === "dress_prompt"
        ? props.presentation.blockingAssetRefs.filter(
            (assetRef) => assetRef.role === "dress-preview"
          )
        : [],
    [props.presentation]
  );
  useEffect(() => {
    if (dressPromptAssetRefs.length === 0) {
      return;
    }

    let cancelled = false;

    void warmNextSceneAssets(
      props.presentation.dialogueEntryId,
      dressPromptAssetRefs,
      "high"
    ).finally(() => {
      if (!cancelled) {
        setDressAssetWarmupVersion((currentVersion) => currentVersion + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dressPromptAssetRefs, props.presentation.dialogueEntryId]);
  const dressChoice = useMemo(() => {
    if (props.presentation.status !== "supported") {
      return {
        index: -1,
        option: null
      };
    }

    return getNativeReaderDressOptionAtIndex(
      props.presentation.dressOptions,
      dressIndex
    );
  }, [dressIndex, props.presentation]);
  const selectedDressOption = dressChoice.option;
  const selectedDressIndex = dressChoice.index;
  const supportedDressOptions =
    props.presentation.status === "supported"
      ? props.presentation.dressOptions
      : [];
  const supportedDressOptionCount = supportedDressOptions.length;

  dialogueRenderCountRef.current += 1;

  useEffect(() => {
    dialogueRemountCountRef.current += 1;
    if (!isReaderPerfDiagnosticsEnabled()) {
      return;
    }

    console.info("[reader-perf] DIALOGUE_REMOUNT_COUNT", {
      count: dialogueRemountCountRef.current,
      dialogueEntryId: props.presentation.dialogueEntryId
    });
  }, []);

  useEffect(() => {
    if (!isReaderPerfDiagnosticsEnabled()) {
      return;
    }

    console.info("[reader-perf] DIALOGUE_RENDER_COUNT", {
      count: dialogueRenderCountRef.current,
      dialogueEntryId: props.presentation.dialogueEntryId
    });
  });

  useEffect(() => {
    setDressIndex(0);
  }, [props.presentation.dialogueEntryId]);

  useEffect(() => {
    if (props.presentation.status !== "supported") {
      return;
    }

    setDressIndex((currentIndex) => {
      const normalizedIndex = getNativeReaderDressOptionAtIndex(
        supportedDressOptions,
        currentIndex
      ).index;

      return normalizedIndex >= 0 ? normalizedIndex : 0;
    });
  }, [
    props.presentation.status,
    supportedDressOptionCount,
    supportedDressOptions
  ]);

  useEffect(() => {
    setTextCompletionState({
      isComplete: isImmediatelyComplete,
      typingKey
    });
    setForceCompleteRequest(null);
  }, [isImmediatelyComplete, typingKey]);

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
  const canCompleteTyping =
    hasTypeableDialogueText && !isTextComplete && !props.isExiting;
  const handleTextCompleteChange = useCallback(
    (nextIsComplete: boolean) => {
      setTextCompletionState((currentState) => {
        if (
          currentState.typingKey === typingKey &&
          currentState.isComplete === nextIsComplete
        ) {
          return currentState;
        }

        return {
          isComplete: nextIsComplete,
          typingKey
        };
      });
    },
    [typingKey]
  );
  const handleCompleteTyping = useCallback(() => {
    if (!canCompleteTyping) {
      return;
    }

    handleTextCompleteChange(true);
    setForceCompleteRequest((currentRequest) => ({
      requestId: (currentRequest?.requestId ?? 0) + 1,
      typingKey
    }));
  }, [canCompleteTyping, handleTextCompleteChange, typingKey]);

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
        style={[styles.dialogueCard, { bottom: cardBottom }, cardPosition]}
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
      style={[styles.dialogueCard, { bottom: cardBottom }, cardPosition]}
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
            <BatchedTypedDialogueText
              characterPortraitCount={characterPortraitCount}
              characters={textCharacters}
              dialogueEntryId={supportedPresentation.dialogueEntryId}
              forceCompleteRequest={forceCompleteRequest}
              isExiting={props.isExiting}
              renderModeCount={portraitRenderModeSummary}
              speakerId={supportedPresentation.speakerId}
              style={
                isDressPrompt ? styles.dressPromptText : styles.dialogueText
              }
              textExpectedDurationMs={textExpectedDurationMs}
              typingKey={typingKey}
              onCompleteChange={handleTextCompleteChange}
            />
          ) : null}

          {shouldShowCatNameInput ? (
            <View style={styles.promptBlock}>
              <OcnoerTextInput
                autoCapitalize="words"
                editable={!props.isSavingCatName}
                onChangeText={props.onCatNameInputChange}
                onSubmitEditing={props.onSubmitCatName}
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
                    disabled={
                      props.isMoving ||
                      !isResolvedNativeReaderDressOption(selectedDressOption)
                    }
                    option={selectedDressOption}
                    warmupVersion={dressAssetWarmupVersion}
                    onPress={() => {
                      if (
                        !isResolvedNativeReaderDressOption(selectedDressOption)
                      ) {
                        return;
                      }

                      props.onSelectDressOption(selectedDressOption.key);
                    }}
                  />
                  <Text style={styles.dressCounter}>
                    {selectedDressIndex + 1} of{" "}
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
});

const styles = StyleSheet.create({
  dialogueCard: {
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
    fontSize: 34,
    lineHeight: 38,
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
  dressPreviewMedia: {
    alignItems: "center",
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
    height: "100%",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  dressPreviewLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  dressPreviewPendingLayer: {
    opacity: 0
  },
  dressPreviewFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: NATIVE_READER_DRESS_PREVIEW_FALLBACK_BACKGROUND,
    justifyContent: "center"
  },
  dressPreviewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: NATIVE_READER_DRESS_PREVIEW_LOADING_OVERLAY_BACKGROUND,
    justifyContent: "center"
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
