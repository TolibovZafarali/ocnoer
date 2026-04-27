import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BlurView } from "expo-blur";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type KeyboardEvent,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
  View
} from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  validateCatNameInput,
  type PlayerBoundaryState,
  type PlayerRuntimeBootstrap,
  type ReaderState,
  type RuntimeChapterBundle
} from "@ocnoer/story-core";

import type { MobilePlayer } from "../api/playerSessionTypes";
import { resolveNativeReaderBackgroundMusicCue } from "../audio/nativeBackgroundMusicCue";
import { useNativeBackgroundMusic } from "../audio/useNativeBackgroundMusic";
import { getNativeBackgroundMusicAudioManager } from "../audio/backgroundMusicAudioManager";
import type { MobileRuntimeConfig } from "../config/runtime";
import { NativeReaderBoundaryCard } from "../reader/components/NativeReaderBoundaryCard";
import { BlackoutOverlay } from "../reader/components/NativeCinematic";
import { NativeReaderDialogue } from "../reader/components/NativeReaderDialogue";
import { NativeReaderStage } from "../reader/components/NativeReaderStage";
import {
  APPENDIX_MARKDOWN,
  parseAppendixMarkdown,
  type AppendixBlock,
  type AppendixInlineSegment
} from "../reader/appendix";
import {
  setReaderDecodeSchedulerInteractionState,
  useReaderAssetWarmup
} from "../reader/imagePreload";
import {
  NATIVE_SCENE_TRANSITION_COVER_MS,
  NATIVE_SCENE_TRANSITION_REVEAL_MS,
  type NativeReaderSceneTransitionPhase,
  useNativeReaderController
} from "../reader/useNativeReaderController";
import { getNativeReaderPortraitTransitionContinuity } from "../reader/readerPresentation";
import type { NativeAudioPreferences } from "../storage/audioPreferenceStorage";
import { OcnoerButton, OcnoerSurface } from "../ui/primitives";
import { ocnoerTheme, ocnoerWebPlayer } from "../ui/theme";

const worldMapImage = require("../../../../lore/Thaloraz.webp") as number;
const MAP_MIN_ZOOM_SCALE = 1;
const MAP_MAX_ZOOM_SCALE = 3;
const MAP_OVERLAY_PADDING = ocnoerTheme.spacing.md;
const APPENDIX_DOCUMENT = parseAppendixMarkdown(APPENDIX_MARKDOWN);
const APPENDIX_FONT_FAMILY = Platform.select({
  ios: "Palatino",
  default: "serif"
});

type ReaderScreenProps = {
  bootstrap: PlayerRuntimeBootstrap;
  config: MobileRuntimeConfig;
  player: MobilePlayer;
  readerRunId: number;
  sessionToken: string;
  audioPreferences: NativeAudioPreferences;
  isSigningOut: boolean;
  onBackHome: () => void;
  onProgressSaved: () => void;
  onSignOut: () => void;
  onToggleAudioMuted: () => void;
  onUpdateCatName: (catName: string) => Promise<MobilePlayer>;
};

type PortraitExitState = {
  left: boolean;
  right: boolean;
};

const NO_EXITING_PORTRAITS: PortraitExitState = {
  left: false,
  right: false
};

function waitForDuration(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function getKeyboardFrameBottomInset(input: {
  event: KeyboardEvent;
  windowHeight: number;
}) {
  const keyboardTopY = input.event.endCoordinates.screenY;
  const keyboardHeight = input.event.endCoordinates.height;
  if (!Number.isFinite(keyboardTopY)) {
    return Math.max(keyboardHeight, 0);
  }

  if (keyboardTopY >= input.windowHeight) {
    return 0;
  }

  return Math.max(input.windowHeight - keyboardTopY, keyboardHeight, 0);
}

function PreviousDialogueIcon() {
  return (
    <Svg fill="none" height={26} viewBox="0 0 24 24" width={26}>
      <Path
        d="M19 12H5"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Path
        d="m12 19-7-7 7-7"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
    </Svg>
  );
}

function MapIcon() {
  return (
    <Svg fill="none" height={26} viewBox="0 0 24 24" width={26}>
      <Path
        d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M9 3v15"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M15 6v15"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function AppendixIcon() {
  return (
    <Svg fill="none" height={26} viewBox="0 0 24 24" width={26}>
      <Path
        d="M5 4.75A2.75 2.75 0 0 1 7.75 2H19v18H7.75A2.75 2.75 0 0 0 5 22V4.75Z"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M8.75 7H15.5"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M8.75 11H15.5"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M8.75 15H13"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function SignOutIcon() {
  return (
    <Svg fill="none" height={26} viewBox="0 0 24 24" width={26}>
      <Path
        d="M10 17l5-5-5-5"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Path
        d="M15 12H3"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Path
        d="M21 5v14a2 2 0 0 1-2 2h-6"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M13 3h6a2 2 0 0 1 2 2"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

function AudioIcon(props: { muted: boolean }) {
  return (
    <Svg fill="none" height={26} viewBox="0 0 24 24" width={26}>
      <Path
        d="M11 5 6 9H3v6h3l5 4V5Z"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      {props.muted ? (
        <>
          <Path
            d="m19 9-5 5"
            stroke={ocnoerWebPlayer.chrome.iconColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.2}
          />
          <Path
            d="m14 9 5 5"
            stroke={ocnoerWebPlayer.chrome.iconColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.2}
          />
        </>
      ) : (
        <>
          <Path
            d="M15 9.5a4 4 0 0 1 0 5"
            stroke={ocnoerWebPlayer.chrome.iconColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <Path
            d="M18 7a8 8 0 0 1 0 10"
            stroke={ocnoerWebPlayer.chrome.iconColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </>
      )}
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg fill="none" height={30} viewBox="0 0 24 24" width={30}>
      <Path
        d="m18 6-12 12"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.3}
      />
      <Path
        d="m6 6 12 12"
        stroke={ocnoerWebPlayer.chrome.iconColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.3}
      />
    </Svg>
  );
}

function ReaderIconButton(props: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      disabled={props.disabled}
      hitSlop={8}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.chromeIcon,
        props.disabled ? styles.chromeIconDisabled : null,
        pressed && !props.disabled ? styles.chromeIconPressed : null,
        props.style
      ]}
    >
      {props.icon}
    </Pressable>
  );
}

function ReaderChrome(props: {
  audioPreferences: NativeAudioPreferences;
  canRetreat: boolean;
  isSigningOut: boolean;
  onOpenAppendix: () => void;
  onOpenMap: () => void;
  onRetreat: () => void;
  onSignOut: () => void;
  onToggleAudioMuted: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.chrome}>
      <ReaderIconButton
        accessibilityLabel="Previous dialogue"
        disabled={!props.canRetreat}
        icon={<PreviousDialogueIcon />}
        onPress={props.onRetreat}
      />
      <View pointerEvents="box-none" style={styles.chromeRight}>
        <ReaderIconButton
          accessibilityLabel="Open appendix"
          icon={<AppendixIcon />}
          onPress={props.onOpenAppendix}
        />
        <ReaderIconButton
          accessibilityLabel="Open world map"
          icon={<MapIcon />}
          onPress={props.onOpenMap}
        />
        <ReaderIconButton
          accessibilityLabel={
            props.audioPreferences.muted
              ? "Unmute background music"
              : "Mute background music"
          }
          icon={<AudioIcon muted={props.audioPreferences.muted} />}
          onPress={props.onToggleAudioMuted}
        />
        <ReaderIconButton
          accessibilityLabel="Sign out"
          disabled={props.isSigningOut}
          icon={<SignOutIcon />}
          onPress={props.onSignOut}
        />
      </View>
    </View>
  );
}

function ReaderChromeLayer(props: {
  audioPreferences: NativeAudioPreferences;
  canRetreat: boolean;
  isSigningOut: boolean;
  visible: boolean;
  onOpenAppendix: () => void;
  onOpenMap: () => void;
  onRetreat: () => void;
  onSignOut: () => void;
  onToggleAudioMuted: () => void;
}) {
  const progress = useRef(new Animated.Value(props.visible ? 1 : 0)).current;
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-32, 0]
  });

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: props.visible ? 1 : 0,
      duration: ocnoerTheme.motion.lineExitMs,
      easing: props.visible
        ? Easing.out(Easing.cubic)
        : Easing.in(Easing.cubic),
      useNativeDriver: true
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [progress, props.visible]);

  return (
    <Animated.View
      pointerEvents={props.visible ? "box-none" : "none"}
      style={[
        styles.chromeWrap,
        {
          opacity: progress,
          transform: [{ translateY }]
        }
      ]}
    >
      <SafeAreaView pointerEvents="box-none" style={styles.chromeSafeArea}>
        <ReaderChrome
          audioPreferences={props.audioPreferences}
          canRetreat={props.canRetreat}
          isSigningOut={props.isSigningOut}
          onOpenAppendix={props.onOpenAppendix}
          onOpenMap={props.onOpenMap}
          onRetreat={props.onRetreat}
          onSignOut={props.onSignOut}
          onToggleAudioMuted={props.onToggleAudioMuted}
        />
      </SafeAreaView>
    </Animated.View>
  );
}

function SceneTransitionBlackoutOverlay(props: {
  phase: NativeReaderSceneTransitionPhase;
}) {
  const opacity = useRef(
    new Animated.Value(props.phase === "covering" ? 0 : 1)
  ).current;

  useEffect(() => {
    if (props.phase === "idle") {
      return;
    }

    if (props.phase === "blackout") {
      opacity.setValue(1);
      return;
    }

    if (props.phase === "covering") {
      opacity.setValue(0);
    }

    const animation = Animated.timing(opacity, {
      toValue: props.phase === "revealing" ? 0 : 1,
      duration:
        props.phase === "revealing"
          ? NATIVE_SCENE_TRANSITION_REVEAL_MS
          : NATIVE_SCENE_TRANSITION_COVER_MS,
      easing:
        props.phase === "revealing"
          ? Easing.out(Easing.cubic)
          : Easing.in(Easing.cubic),
      useNativeDriver: true
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity, props.phase]);

  if (props.phase === "idle") {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.sceneTransitionOverlay, { opacity }]}
    />
  );
}

function WorldMapOverlay(props: { onClose: () => void }) {
  const dimensions = useWindowDimensions();
  const mapViewportSize = {
    height: Math.max(dimensions.height - MAP_OVERLAY_PADDING * 2, 1),
    width: Math.max(dimensions.width - MAP_OVERLAY_PADDING * 2, 1)
  };

  return (
    <View accessibilityViewIsModal style={styles.mapOverlay}>
      <ScrollView
        bounces={false}
        bouncesZoom={false}
        centerContent
        contentContainerStyle={styles.mapZoomContentContainer}
        maximumZoomScale={MAP_MAX_ZOOM_SCALE}
        minimumZoomScale={MAP_MIN_ZOOM_SCALE}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.mapZoomScroll}
      >
        <View style={[styles.mapZoomContent, mapViewportSize]}>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="Ocnoer world map"
            resizeMode="contain"
            source={worldMapImage}
            style={styles.mapImage}
          />
        </View>
      </ScrollView>
      <SafeAreaView pointerEvents="box-none" style={styles.mapCloseSafeArea}>
        <Pressable
          accessibilityLabel="Close world map"
          accessibilityRole="button"
          hitSlop={8}
          onPress={props.onClose}
          style={styles.mapCloseButton}
        >
          <CloseIcon />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function AppendixInlineText(props: {
  segments: AppendixInlineSegment[];
  style: StyleProp<TextStyle>;
}) {
  return (
    <Text style={props.style}>
      {props.segments.map((segment, index) => (
        <Text
          key={`${segment.text}-${index}`}
          style={segment.highlight ? styles.appendixHighlightText : null}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

function AppendixBlockView(props: { block: AppendixBlock; index: number }) {
  if (props.block.kind === "paragraph") {
    return (
      <AppendixInlineText
        segments={props.block.segments}
        style={[
          styles.appendixParagraph,
          props.index === 0 ? styles.appendixFirstBlock : null,
          props.block.quiet ? styles.appendixQuietParagraph : null
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.appendixListItem,
        props.index === 0 ? styles.appendixFirstBlock : null,
        {
          marginLeft: props.block.depth * ocnoerTheme.spacing.lg
        }
      ]}
    >
      <Text
        style={[
          styles.appendixListBullet,
          props.block.depth > 0 ? styles.appendixNestedListBullet : null
        ]}
      >
        {props.block.depth > 0 ? "-" : "\u2022"}
      </Text>
      <AppendixInlineText
        segments={props.block.segments}
        style={[
          styles.appendixListText,
          props.block.depth > 0 ? styles.appendixNestedListText : null
        ]}
      />
    </View>
  );
}

function AppendixOverlay(props: { onClose: () => void }) {
  return (
    <View accessibilityViewIsModal style={styles.appendixOverlay}>
      <BlurView
        experimentalBlurMethod="dimezisBlurView"
        intensity={54}
        style={styles.appendixBackdropBlur}
        tint="dark"
      />
      <View pointerEvents="none" style={styles.appendixBackdropScrim} />
      <SafeAreaView style={styles.appendixContentSafeArea}>
        <ScrollView
          bounces
          contentContainerStyle={styles.appendixScrollContent}
          indicatorStyle="white"
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          style={styles.appendixScroll}
        >
          <View style={styles.appendixHeader}>
            <Text style={styles.appendixTitle}>{APPENDIX_DOCUMENT.title}</Text>
            <Text style={styles.appendixSubtitle}>Houses of Thaloraz</Text>
          </View>
          {APPENDIX_DOCUMENT.sections.map((section) => (
            <View key={section.title} style={styles.appendixSection}>
              <Text style={styles.appendixSectionTitle}>{section.title}</Text>
              <View style={styles.appendixSectionBody}>
                {section.blocks.map((block, index) => (
                  <AppendixBlockView
                    key={`${section.title}-${block.kind}-${index}`}
                    block={block}
                    index={index}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
      <SafeAreaView pointerEvents="box-none" style={styles.mapCloseSafeArea}>
        <Pressable
          accessibilityLabel="Close appendix"
          accessibilityRole="button"
          hitSlop={8}
          onPress={props.onClose}
          style={styles.mapCloseButton}
        >
          <CloseIcon />
        </Pressable>
      </SafeAreaView>
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
  const [portraitExitState, setPortraitExitState] =
    useState<PortraitExitState>(NO_EXITING_PORTRAITS);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isAppendixOpen, setIsAppendixOpen] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const backgroundMusicManager = useMemo(
    () => getNativeBackgroundMusicAudioManager(),
    []
  );
  const readerSessionId = `${props.player.id}:${props.sessionToken}:reader:${props.readerRunId}`;
  const waitForSceneTransitionAudioStart = useCallback(
    async (input: {
      boundaryState: PlayerBoundaryState | null;
      bundle: RuntimeChapterBundle | null;
      readerState: ReaderState | null;
    }) => {
      if (
        Platform.OS !== "ios" ||
        props.audioPreferences.muted ||
        props.isSigningOut
      ) {
        return;
      }

      const cue = resolveNativeReaderBackgroundMusicCue({
        supabaseUrl: props.config.supabaseUrl,
        bundle: input.bundle,
        readerState: input.readerState,
        boundaryState: input.boundaryState
      });

      if (cue.status !== "playable") {
        return;
      }

      await backgroundMusicManager.waitForTargetPlaybackStart({
        cue: {
          key: cue.key,
          label: cue.label,
          url: cue.url
        },
        sessionId: readerSessionId,
        shouldPlay: true
      });
    },
    [
      backgroundMusicManager,
      props.audioPreferences.muted,
      props.config.supabaseUrl,
      props.isSigningOut,
      readerSessionId
    ]
  );
  const reader = useNativeReaderController({
    bootstrap: props.bootstrap,
    config: props.config,
    player: props.player,
    sessionToken: props.sessionToken,
    onProgressSaved: props.onProgressSaved,
    waitForSceneTransitionAudioStart,
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
  useNativeBackgroundMusic({
    cue: backgroundMusicCue,
    isSessionActive: !props.isSigningOut,
    preferences: props.audioPreferences,
    sessionId: readerSessionId
  });
  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    const updateKeyboardInset = (event: KeyboardEvent) => {
      setKeyboardBottomInset(
        getKeyboardFrameBottomInset({
          event,
          windowHeight: dimensions.height
        })
      );
    };
    const keyboardWillShow = Keyboard.addListener(
      "keyboardWillShow",
      updateKeyboardInset
    );
    const keyboardWillChangeFrame = Keyboard.addListener(
      "keyboardWillChangeFrame",
      updateKeyboardInset
    );
    const keyboardWillHide = Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardBottomInset(0);
    });

    return () => {
      keyboardWillShow.remove();
      keyboardWillChangeFrame.remove();
      keyboardWillHide.remove();
    };
  }, [dimensions.height]);
  const stageWidth = Math.min(
    dimensions.width,
    dimensions.height * ocnoerTheme.stage.preferredAspectRatio
  );
  const advancePortraitContinuity = useMemo(
    () =>
      presentation
        ? getNativeReaderPortraitTransitionContinuity({
            current: presentation,
            next: reader.advanceTargetPresentation
          })
        : NO_EXITING_PORTRAITS,
    [presentation, reader.advanceTargetPresentation]
  );
  const revealChrome = useCallback(() => {
    setIsChromeVisible(true);
  }, []);
  const runWithLineExit = useCallback(
    async (
      action: () => Promise<void> | void,
      options?: {
        animatePortraitExit?: boolean;
        portraitContinuity?: PortraitExitState;
      }
    ) => {
      if (isLineExiting) {
        return;
      }

      const shouldAnimateExit =
        !hasBoundaryPresentation && reader.state.status === "ready";
      const shouldAnimatePortraitExit =
        shouldAnimateExit && (options?.animatePortraitExit ?? true);

      if (shouldAnimateExit) {
        const portraitContinuity =
          options?.portraitContinuity ?? NO_EXITING_PORTRAITS;

        setIsLineExiting(true);
        setPortraitExitState(
          shouldAnimatePortraitExit
            ? {
                left: !portraitContinuity.left,
                right: !portraitContinuity.right
              }
            : NO_EXITING_PORTRAITS
        );
        await waitForDuration(ocnoerTheme.motion.lineExitMs);
      }

      try {
        await action();
      } finally {
        if (shouldAnimateExit) {
          setIsLineExiting(false);
          setPortraitExitState(NO_EXITING_PORTRAITS);
        }
      }
    },
    [hasBoundaryPresentation, isLineExiting, reader.state.status]
  );
  const handleAdvance = useCallback(() => {
    setIsChromeVisible(false);
    void runWithLineExit(reader.advance, {
      portraitContinuity: advancePortraitContinuity
    });
  }, [advancePortraitContinuity, reader.advance, runWithLineExit]);
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
  const handleSignOut = useCallback(() => {
    setIsChromeVisible(false);
    props.onSignOut();
  }, [props.onSignOut]);
  const handleOpenMap = useCallback(() => {
    setIsChromeVisible(false);
    setIsAppendixOpen(false);
    setIsMapOpen(true);
  }, []);
  const handleOpenAppendix = useCallback(() => {
    setIsChromeVisible(false);
    setIsMapOpen(false);
    setIsAppendixOpen(true);
  }, []);

  useReaderAssetWarmup(reader.preloadAssetRefs);

  const showSceneTransitionOverlay =
    Platform.OS === "ios" && reader.sceneTransitionPhase !== "idle";
  const showTransitionBlackout =
    !showSceneTransitionOverlay &&
    (boundaryPresentation?.type === "scene-transition" || reader.isMoving);
  const dialogueKeyboardBottomInset =
    presentation?.status === "supported" && presentation.needsCatNameInput
      ? keyboardBottomInset
      : 0;

  useEffect(() => {
    setReaderDecodeSchedulerInteractionState({
      transitioning: showTransitionBlackout || showSceneTransitionOverlay
    });

    return () => {
      setReaderDecodeSchedulerInteractionState({
        transitioning: false
      });
    };
  }, [showSceneTransitionOverlay, showTransitionBlackout]);

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

  return (
    <View style={styles.safeArea}>
      <View style={styles.readerRoot}>
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
              portraitExitState={portraitExitState}
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
            <ReaderChromeLayer
              audioPreferences={props.audioPreferences}
              canRetreat={
                reader.canRetreat && !reader.isMoving && !isLineExiting
              }
              isSigningOut={props.isSigningOut}
              visible={isChromeVisible}
              onOpenAppendix={handleOpenAppendix}
              onOpenMap={handleOpenMap}
              onRetreat={handleRetreat}
              onSignOut={handleSignOut}
              onToggleAudioMuted={props.onToggleAudioMuted}
            />

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
                  canAdvance={reader.canAdvance}
                  catNameInputError={reader.catNameInputError}
                  catNameInputValue={reader.catNameInputValue}
                  isExiting={isLineExiting}
                  isMoving={reader.isMoving}
                  isSavingCatName={reader.isSavingCatName}
                  persistenceError={reader.persistenceError}
                  presentation={presentation}
                  keyboardBottomInset={dialogueKeyboardBottomInset}
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
        {isAppendixOpen ? (
          <AppendixOverlay
            onClose={() => {
              setIsAppendixOpen(false);
            }}
          />
        ) : null}
      </View>
      {showSceneTransitionOverlay ? (
        <SceneTransitionBlackoutOverlay phase={reader.sceneTransitionPhase} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: ocnoerTheme.colors.black,
    flex: 1,
    position: "relative"
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
  chromeSafeArea: {
    flex: 1
  },
  chrome: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: ocnoerWebPlayer.chrome.inset,
    paddingTop: ocnoerWebPlayer.chrome.inset,
    width: "100%"
  },
  chromeIcon: {
    alignItems: "center",
    backgroundColor: "transparent",
    height: ocnoerWebPlayer.chrome.iconSize,
    justifyContent: "center",
    width: ocnoerWebPlayer.chrome.iconSize
  },
  chromeIconDisabled: {
    opacity: 0.45
  },
  chromeIconPressed: {
    opacity: 0.76
  },
  chromeRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: ocnoerTheme.spacing.xs,
    maxWidth: "78%",
    justifyContent: "flex-end"
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    padding: MAP_OVERLAY_PADDING,
    zIndex: 70
  },
  mapZoomScroll: {
    flex: 1
  },
  mapZoomContentContainer: {
    flexGrow: 1
  },
  mapZoomContent: {
    alignItems: "center",
    justifyContent: "center"
  },
  mapCloseSafeArea: {
    left: 0,
    pointerEvents: "box-none",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2
  },
  mapCloseButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    height: ocnoerWebPlayer.chrome.iconSize,
    justifyContent: "center",
    marginLeft: ocnoerTheme.spacing.md,
    marginTop: ocnoerTheme.spacing.md,
    width: ocnoerWebPlayer.chrome.iconSize
  },
  mapImage: {
    height: "100%",
    width: "100%"
  },
  appendixOverlay: {
    ...StyleSheet.absoluteFillObject,
    elevation: 80,
    zIndex: 80
  },
  appendixBackdropBlur: {
    ...StyleSheet.absoluteFillObject
  },
  appendixBackdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.76)"
  },
  appendixContentSafeArea: {
    flex: 1
  },
  appendixScroll: {
    flex: 1
  },
  appendixScrollContent: {
    paddingBottom: ocnoerTheme.spacing.xxxl + ocnoerTheme.spacing.lg,
    paddingHorizontal: ocnoerTheme.spacing.lg,
    paddingTop:
      ocnoerWebPlayer.chrome.iconSize +
      ocnoerTheme.spacing.md +
      ocnoerTheme.spacing.xxl
  },
  appendixHeader: {
    marginBottom: ocnoerTheme.spacing.lg,
    paddingHorizontal: ocnoerTheme.spacing.xs
  },
  appendixTitle: {
    color: ocnoerTheme.colors.text,
    fontFamily: APPENDIX_FONT_FAMILY,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40
  },
  appendixSubtitle: {
    color: ocnoerTheme.colors.textMuted,
    fontFamily: APPENDIX_FONT_FAMILY,
    fontSize: 15,
    lineHeight: 22,
    marginTop: ocnoerTheme.spacing.xxs
  },
  appendixSection: {
    borderTopColor: "rgba(127, 29, 29, 0.72)",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: ocnoerTheme.spacing.lg,
    paddingHorizontal: ocnoerTheme.spacing.xs,
    paddingTop: ocnoerTheme.spacing.lg
  },
  appendixSectionTitle: {
    color: ocnoerTheme.colors.text,
    fontFamily: APPENDIX_FONT_FAMILY,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 24,
    marginBottom: ocnoerTheme.spacing.md
  },
  appendixSectionBody: {
    paddingTop: ocnoerTheme.spacing.xxs
  },
  appendixFirstBlock: {
    marginTop: 0
  },
  appendixParagraph: {
    color: ocnoerTheme.colors.text,
    fontFamily: APPENDIX_FONT_FAMILY,
    fontSize: 16,
    lineHeight: 24,
    marginTop: ocnoerTheme.spacing.sm
  },
  appendixQuietParagraph: {
    color: ocnoerTheme.colors.textSubtle,
    fontFamily: APPENDIX_FONT_FAMILY,
    fontSize: 14,
    lineHeight: 21,
    marginTop: ocnoerTheme.spacing.lg
  },
  appendixListItem: {
    alignItems: "flex-start",
    flexDirection: "row",
    marginTop: ocnoerTheme.spacing.sm
  },
  appendixListBullet: {
    color: "#991b1b",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
    width: 16
  },
  appendixNestedListBullet: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 14,
    lineHeight: 21
  },
  appendixListText: {
    color: ocnoerTheme.colors.textMuted,
    flex: 1,
    fontFamily: APPENDIX_FONT_FAMILY,
    fontSize: 15,
    lineHeight: 22
  },
  appendixNestedListText: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 14,
    lineHeight: 21
  },
  appendixHighlightText: {
    color: "#991b1b",
    fontWeight: "900"
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
  },
  sceneTransitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black,
    elevation: 100,
    zIndex: 100
  }
});
