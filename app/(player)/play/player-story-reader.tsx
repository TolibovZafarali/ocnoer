"use client";
/* eslint-disable @next/next/no-img-element */

import {
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import worldMapImage from "@/lore/world-map.jpg";

import { Button } from "@/components/ui/button";
import {
  CONTINUE_BUTTON_ENTER_DURATION_MS,
  DEFAULT_LINE_ENTER_DURATION_MS,
  DEFAULT_LINE_EXIT_DURATION_MS,
  REDUCED_MOTION_DURATION_MS,
  TYPING_BASE_DELAY_MS,
  type MotionDirection,
  type PresentationPhase,
  getDialogueCardPlacement,
  getLineEnterDelayMs,
  getLineMotionConfig,
  getMotionOffset,
  getTypingCharacterDelayMs
} from "@/app/(player)/play/player-story-reader-motion";
import {
  analyzeSceneLightingFromImageData,
  buildSceneOverlayBackground,
  buildStageCharacterFilter,
  createDefaultSceneLightingProfile,
  type SceneLightingProfile,
  type StageCharacterLighting
} from "@/app/(player)/play/player-scene-lighting";
import {
  advanceRuntimePosition,
  retreatRuntimePosition,
  getCurrentDialogue,
  getCurrentScene,
  createStoredProgress,
  type PlayerProgress,
  type ReaderState
} from "@/lib/story/reader";
import type {
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeStageCharacter
} from "@/lib/story/types";
import {
  createRuntimeChapterLoader,
  decidePlayerResumeAction,
  getPlayerRuntimeAssetUrls,
  loadPlayerRuntimeSession,
  toPublicStorageUrl
} from "@/lib/story/runtime";
import {
  getDressBranchFlagKey,
  BASE_DRESS_OPTION_KEY
} from "@/lib/story/wardrobe";

type PlayerStoryReaderProps = {
  manifestPath: string;
  progressStorageKey: string;
  supabaseUrl: string;
  initialManifest?: RuntimeManifest | null;
  initialBundle?: RuntimeChapterBundle | null;
  initialReaderState?: ReaderState | null;
};

type PlayerBoundaryState =
  | {
      type: "scene-transition";
    }
  | {
      type: "chapter-break";
      chapterTitle: string;
      chapterIndex: number;
      chapterCount: number;
    }
  | {
      type: "story-finished";
      chapterTitle: string;
      chapterIndex: number;
      chapterCount: number;
    };

type VisibleStagePortrait = {
  key: string;
  imageUrl: string;
  alt: string;
  direction: MotionDirection;
};

type ResolvedAdvanceAction =
  | {
      type: "line";
      state: ReaderState;
    }
  | {
      type: "scene-transition";
      state: ReaderState;
      boundaryState: PlayerBoundaryState;
    }
  | {
      type: "chapter-break";
      bundle: RuntimeChapterBundle;
      state: ReaderState;
      boundaryState: PlayerBoundaryState;
    }
  | {
      type: "story-finished";
      boundaryState: PlayerBoundaryState;
    };

const DEFAULT_STAGE_ASPECT_RATIO = 9 / 16;
const MOTION_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const MOTION_EASE_IN = [0.4, 0, 1, 1] as const;
const MOTION_EASE_LINEAR = [0, 0, 1, 1] as const;
const SCENE_TRANSITION_DURATION_MS = 3000;
const SCENE_TRANSITION_HOLD_START = 0.42;
const SCENE_TRANSITION_HOLD_END = 0.58;
const SCENE_TRANSITION_SWAP_PROGRESS = 0.5;
const SCENE_TRANSITION_MAX_OPACITY = 1;
const MAP_OVERLAY_DURATION_MS = 340;
const DESKTOP_SCENE_NAV_MIN_GUTTER_WIDTH_PX = 220;
const DESKTOP_SCENE_NAV_HORIZONTAL_PADDING_PX = 12;

function readStoredProgress(storageKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PlayerProgress;

    if (
      typeof parsed.chapterId !== "string" ||
      typeof parsed.sceneId !== "string" ||
      typeof parsed.dialogueEntryId !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function persistProgress(storageKey: string, progress: PlayerProgress | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!progress) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(progress));
}

function getRuntimeAvailability(input: {
  manifest: RuntimeManifest | null;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
  scene: RuntimeChapterBundle["chapter"]["scenes"][number] | null;
  entry:
    | RuntimeChapterBundle["chapter"]["scenes"][number]["dialogue"][number]
    | null;
}) {
  if (!input.manifest?.firstChapterId) {
    return {
      title: "No story available yet",
      description: "The opening chapter has not been published yet."
    };
  }

  if (!input.bundle || !input.readerState || !input.scene || !input.entry) {
    return {
      title: "This story is not ready to play",
      description:
        "Some chapters or scenes are still missing playable dialogue."
    };
  }

  return null;
}

function getDialogueCardPositionClassName(
  placement: ReturnType<typeof getDialogueCardPlacement>
) {
  if (placement === "speaker-left") {
    return "left-[calc(min(52%,22rem)-clamp(0.85rem,2vw,1.5rem))] right-[clamp(0.75rem,2vw,1.25rem)] md:left-[calc(46%-clamp(1rem,2vw,1.75rem))]";
  }

  if (placement === "speaker-right") {
    return "left-[clamp(0.75rem,2vw,1.25rem)] right-[calc(min(52%,22rem)-clamp(0.85rem,2vw,1.5rem))] md:right-[calc(46%-clamp(1rem,2vw,1.75rem))]";
  }

  return "left-[clamp(0.75rem,2vw,1.25rem)] right-[clamp(0.75rem,2vw,1.25rem)]";
}

export function PlayerStoryReader({
  manifestPath,
  progressStorageKey,
  supabaseUrl,
  initialManifest = null,
  initialBundle = null,
  initialReaderState = null
}: PlayerStoryReaderProps) {
  const cacheRef = useRef(
    new Map<string, RuntimeChapterBundle>(
      initialBundle ? [[initialBundle.chapter.id, initialBundle]] : []
    )
  );
  const initialResumeResolvedRef = useRef(false);
  const previousNormalEntryRef = useRef<RuntimeDialogueEntry | null>(null);
  const previousShowDialogueCardRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [manifest, setManifest] = useState<RuntimeManifest | null>(
    initialManifest
  );
  const [bundle, setBundle] = useState<RuntimeChapterBundle | null>(
    initialBundle
  );
  const [readerState, setReaderState] = useState<ReaderState | null>(
    initialReaderState
  );
  const [branchFlags, setBranchFlags] = useState<
    Record<string, boolean | number | string>
  >({});
  const [boundaryState, setBoundaryState] =
    useState<PlayerBoundaryState | null>(null);
  const [pendingSceneState, setPendingSceneState] =
    useState<ReaderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialManifest);
  const [isResolvingResume, setIsResolvingResume] = useState(false);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [stageAspectRatio, setStageAspectRatio] = useState(
    DEFAULT_STAGE_ASPECT_RATIO
  );
  const [sceneLighting, setSceneLighting] = useState<SceneLightingProfile>(() =>
    createDefaultSceneLightingProfile()
  );
  const [presentationPhase, setPresentationPhase] =
    useState<PresentationPhase>("entering");
  const [visibleTextLength, setVisibleTextLength] = useState(0);
  const [lineEnterDelayMs, setLineEnterDelayMs] = useState(0);
  const [isTapHeaderVisible, setIsTapHeaderVisible] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isMapImageReady, setIsMapImageReady] = useState(false);
  const [desktopNavGutterWidth, setDesktopNavGutterWidth] = useState(0);
  const [dressPromptIndex, setDressPromptIndex] = useState(0);
  const [dressPromptMotionDirection, setDressPromptMotionDirection] = useState<
    -1 | 1
  >(1);

  const lineEnterDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : DEFAULT_LINE_ENTER_DURATION_MS;
  const lineExitDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : DEFAULT_LINE_EXIT_DURATION_MS;
  const tapHeaderMotionDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : 240;
  const mapOverlayMotionDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : MAP_OVERLAY_DURATION_MS;

  const loadBundle = useMemo(
    () =>
      createRuntimeChapterLoader({
        supabaseUrl,
        cache: cacheRef.current
      }),
    [supabaseUrl]
  );

  useEffect(() => {
    if (initialManifest) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      setError(null);

      try {
        const storedProgress = readStoredProgress(progressStorageKey);
        const loadedRuntime = await loadPlayerRuntimeSession({
          manifestPath,
          supabaseUrl,
          progress: storedProgress,
          loadChapter: loadBundle
        });

        if (cancelled) {
          return;
        }

        previousNormalEntryRef.current = null;
        setManifest(loadedRuntime.manifest);
        setBundle(loadedRuntime.bundle);
        setReaderState(loadedRuntime.readerState);
        setPendingSceneState(null);
        setBoundaryState(null);
        setBranchFlags(storedProgress?.branchFlags ?? {});
        setIsLoading(false);
        setIsPersistenceReady(true);
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load the story runtime."
        );
        setIsLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    initialManifest,
    loadBundle,
    manifestPath,
    progressStorageKey,
    supabaseUrl
  ]);

  useLayoutEffect(() => {
    if (!initialManifest || initialResumeResolvedRef.current) {
      return;
    }

    initialResumeResolvedRef.current = true;

    if (!initialManifest.firstChapterId) {
      setIsPersistenceReady(true);
      return;
    }

    const storedProgress = readStoredProgress(progressStorageKey);
    const resumeAction = decidePlayerResumeAction({
      initialBundle,
      storedProgress
    });

    setBranchFlags(resumeAction.branchFlags);

    if (resumeAction.type === "use-initial-state") {
      setIsPersistenceReady(true);
      return;
    }

    if (resumeAction.type === "resume-from-initial-bundle") {
      previousNormalEntryRef.current = null;
      setReaderState(resumeAction.readerState);
      setPendingSceneState(null);
      setBoundaryState(null);
      setIsPersistenceReady(true);
      return;
    }

    let cancelled = false;

    setIsResolvingResume(true);
    setError(null);

    void loadPlayerRuntimeSession({
      manifestPath,
      supabaseUrl,
      progress: storedProgress,
      initialManifest,
      loadChapter: loadBundle
    })
      .then((loadedRuntime) => {
        if (cancelled) {
          return;
        }

        previousNormalEntryRef.current = null;
        setManifest(loadedRuntime.manifest);
        setBundle(loadedRuntime.bundle);
        setReaderState(loadedRuntime.readerState);
        setPendingSceneState(null);
        setBoundaryState(null);
        setIsPersistenceReady(true);
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load the story runtime."
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsResolvingResume(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    initialBundle,
    initialManifest,
    loadBundle,
    manifestPath,
    progressStorageKey,
    supabaseUrl
  ]);

  const scene =
    bundle && readerState ? getCurrentScene(bundle.chapter, readerState) : null;
  const entry =
    bundle && readerState
      ? getCurrentDialogue(bundle.chapter, readerState)
      : null;
  const runtimeAvailability = getRuntimeAvailability({
    manifest,
    bundle,
    readerState,
    scene,
    entry
  });
  const activeAssetUrls = useMemo(
    () =>
      getPlayerRuntimeAssetUrls({
        supabaseUrl,
        bundle,
        readerState,
        branchFlags
      }),
    [branchFlags, bundle, readerState, supabaseUrl]
  );
  const backgroundImageUrl = activeAssetUrls.backgroundImageUrl;
  const backgroundMusicUrl = useMemo(
    () =>
      toPublicStorageUrl(supabaseUrl, scene?.backgroundMusic?.filePath ?? null),
    [scene?.backgroundMusic?.filePath, supabaseUrl]
  );
  const stageSizeStyle = useMemo(
    () => ({
      maxWidth: `calc(100dvh * ${stageAspectRatio})`
    }),
    [stageAspectRatio]
  );
  const storedProgress = useMemo(() => {
    if (!bundle || !readerState) {
      return null;
    }

    return createStoredProgress({
      chapter: bundle.chapter,
      state: readerState,
      branchFlags
    });
  }, [branchFlags, bundle, readerState]);

  useEffect(() => {
    if (!isPersistenceReady) {
      return;
    }

    persistProgress(progressStorageKey, storedProgress);
  }, [isPersistenceReady, progressStorageKey, storedProgress]);

  useEffect(() => {
    if (!bundle?.nextChapterId || !manifest) {
      return;
    }

    void loadBundle(manifest, bundle.nextChapterId).catch(() => undefined);
  }, [bundle?.nextChapterId, loadBundle, manifest]);

  useEffect(() => {
    if (!backgroundImageUrl || typeof window === "undefined") {
      setStageAspectRatio(DEFAULT_STAGE_ASPECT_RATIO);
      setSceneLighting(createDefaultSceneLightingProfile());
      return;
    }

    let cancelled = false;
    const backgroundImage = new window.Image();
    backgroundImage.crossOrigin = "anonymous";

    backgroundImage.onload = () => {
      if (
        cancelled ||
        !backgroundImage.naturalWidth ||
        !backgroundImage.naturalHeight
      ) {
        return;
      }

      setStageAspectRatio(
        backgroundImage.naturalWidth / backgroundImage.naturalHeight
      );

      try {
        const sampleMaxDimension = 96;
        const sampleScale = Math.min(
          1,
          sampleMaxDimension /
            Math.max(
              backgroundImage.naturalWidth,
              backgroundImage.naturalHeight
            )
        );
        const sampleWidth = Math.max(
          1,
          Math.round(backgroundImage.naturalWidth * sampleScale)
        );
        const sampleHeight = Math.max(
          1,
          Math.round(backgroundImage.naturalHeight * sampleScale)
        );
        const canvas = document.createElement("canvas");
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const context = canvas.getContext("2d", {
          willReadFrequently: true
        });

        if (!context) {
          setSceneLighting(createDefaultSceneLightingProfile());
          return;
        }

        context.drawImage(backgroundImage, 0, 0, sampleWidth, sampleHeight);

        const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);

        setSceneLighting(
          analyzeSceneLightingFromImageData({
            pixels: imageData.data,
            width: sampleWidth,
            height: sampleHeight,
            sampleStep: 2
          })
        );
      } catch {
        setSceneLighting(createDefaultSceneLightingProfile());
      }
    };

    backgroundImage.onerror = () => {
      if (!cancelled) {
        setStageAspectRatio(DEFAULT_STAGE_ASPECT_RATIO);
        setSceneLighting(createDefaultSceneLightingProfile());
      }
    };

    backgroundImage.src = backgroundImageUrl;

    return () => {
      cancelled = true;
    };
  }, [backgroundImageUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const stageWidth = Math.min(
        viewportWidth,
        viewportHeight * stageAspectRatio
      );
      const gutterWidth = Math.max(0, (viewportWidth - stageWidth) / 2);

      setDesktopNavGutterWidth(gutterWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [stageAspectRatio]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !backgroundMusicUrl || isResolvingResume) {
      return;
    }

    audio.currentTime = 0;

    void audio.play().catch(() => undefined);
  }, [backgroundMusicUrl, isResolvingResume]);

  const activeScene = scene;
  const activeEntry = entry;
  const textCharacters = useMemo(
    () => Array.from(activeEntry?.text ?? ""),
    [activeEntry?.text]
  );
  const dressPromptOptions = useMemo(() => {
    if (activeEntry?.speaker.type !== "dress_prompt") {
      return [];
    }

    return activeEntry.speaker.dressOptions.map((option) => ({
      ...option,
      previewUrl: toPublicStorageUrl(supabaseUrl, option.previewImagePath)
    }));
  }, [activeEntry, supabaseUrl]);
  const selectedDressPromptOption =
    dressPromptOptions.length > 0
      ? dressPromptOptions[
          Math.min(dressPromptIndex, dressPromptOptions.length - 1)
        ] ?? null
      : null;
  const leftCharacterImageUrl = activeAssetUrls.leftCharacterImageUrl;
  const rightCharacterImageUrl = activeAssetUrls.rightCharacterImageUrl;
  const isSceneTransition = boundaryState?.type === "scene-transition";
  const chapterBreakState =
    boundaryState?.type === "chapter-break" ? boundaryState : null;
  const storyFinishedState =
    boundaryState?.type === "story-finished" ? boundaryState : null;
  const isTransitionCard = Boolean(isSceneTransition);
  const isChapterBreakCard = Boolean(chapterBreakState);
  const isStoryFinishedCard = Boolean(storyFinishedState);
  const sceneTransitionDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : SCENE_TRANSITION_DURATION_MS;
  const sceneTransitionLeadOutMs = prefersReducedMotion
    ? 0
    : lineExitDurationMs;
  const sceneTransitionTotalDurationMs =
    sceneTransitionLeadOutMs + sceneTransitionDurationMs;
  const sceneTransitionOpacityKeyframes = prefersReducedMotion
    ? [0, 0.75, 0]
    : [0, SCENE_TRANSITION_MAX_OPACITY, SCENE_TRANSITION_MAX_OPACITY, 0];
  const sceneTransitionTimeKeyframes = prefersReducedMotion
    ? [0, 0.5, 1]
    : [0, SCENE_TRANSITION_HOLD_START, SCENE_TRANSITION_HOLD_END, 1];
  const sceneTransitionEase = prefersReducedMotion
    ? "easeInOut"
    : [MOTION_EASE_OUT, MOTION_EASE_LINEAR, MOTION_EASE_IN];
  const showDialogueCard =
    Boolean(activeEntry) &&
    !isTransitionCard &&
    !isChapterBreakCard &&
    !isStoryFinishedCard;
  const lineMotionConfig = activeEntry
    ? getLineMotionConfig(activeEntry)
    : null;
  const dialogueCardPlacement = activeEntry
    ? getDialogueCardPlacement(activeEntry)
    : "center";
  const dialogueCardPositionClassName = getDialogueCardPositionClassName(
    dialogueCardPlacement
  );
  const dialogueCardVariants = lineMotionConfig
    ? createDirectionalVariants({
        direction: lineMotionConfig.cardDirection,
        reducedMotion: prefersReducedMotion,
        enterDurationMs: lineEnterDurationMs,
        exitDurationMs: lineExitDurationMs,
        enterDelayMs: lineEnterDelayMs
      })
    : null;
  const hideStagePortraits = isSceneTransition;
  const leftStagePortrait =
    activeEntry && !hideStagePortraits
      ? createVisibleStagePortrait({
          stageCharacter: activeEntry.stage.left,
          imageUrl: leftCharacterImageUrl,
          direction: "from-left"
        })
      : null;
  const rightStagePortrait =
    activeEntry && !hideStagePortraits
      ? createVisibleStagePortrait({
          stageCharacter: activeEntry.stage.right,
          imageUrl: rightCharacterImageUrl,
          direction: "from-right"
        })
      : null;
  const dialogueTextNodes = useMemo(() => {
    if (!activeEntry) {
      return null;
    }

    if (prefersReducedMotion) {
      return activeEntry.text;
    }

    const resolvedVisibleTextLength =
      presentationPhase === "ready" || presentationPhase === "exiting"
        ? textCharacters.length
        : visibleTextLength;

    return textCharacters.map((character, index) => {
      return (
        <span
          key={`${activeEntry.id}:${index}`}
          className={
            index < resolvedVisibleTextLength ? undefined : "text-transparent"
          }
        >
          {character}
        </span>
      );
    });
  }, [
    activeEntry,
    prefersReducedMotion,
    presentationPhase,
    textCharacters,
    visibleTextLength
  ]);
  const canCompleteTyping =
    showDialogueCard && !prefersReducedMotion && presentationPhase === "typing";
  const showDressPromptOptions =
    showDialogueCard &&
    presentationPhase === "ready" &&
    activeEntry?.speaker.type === "dress_prompt";
  const showContinueButtonSlot =
    showDialogueCard && activeEntry?.speaker.type !== "dress_prompt";
  const showContinueButton =
    showContinueButtonSlot &&
    presentationPhase === "ready" &&
    Boolean(activeEntry);
  const activeChapterIndex =
    manifest?.chapters.findIndex(
      (chapter) => chapter.id === bundle?.chapter.id
    ) ?? -1;
  const desktopSceneNavPanelWidth = Math.max(
    0,
    desktopNavGutterWidth - DESKTOP_SCENE_NAV_HORIZONTAL_PADDING_PX * 2
  );
  const showDesktopSceneNavigation =
    desktopSceneNavPanelWidth >= DESKTOP_SCENE_NAV_MIN_GUTTER_WIDTH_PX;
  const dressPromptCardVariants = useMemo(
    () => ({
      enter: (direction: -1 | 1) =>
        prefersReducedMotion
          ? { opacity: 1, x: 0, scale: 1 }
          : { opacity: 0, x: direction * 22, scale: 0.985 },
      center: { opacity: 1, x: 0, scale: 1 },
      exit: (direction: -1 | 1) =>
        prefersReducedMotion
          ? { opacity: 0, x: 0, scale: 1 }
          : { opacity: 0, x: direction * -22, scale: 0.985 }
    }),
    [prefersReducedMotion]
  );

  useEffect(() => {
    setDressPromptIndex(0);
    setDressPromptMotionDirection(1);
  }, [activeEntry?.id]);

  useEffect(() => {
    if (!isSceneTransition || !pendingSceneState) {
      return;
    }

    const swapDelayMs = prefersReducedMotion
      ? 0
      : sceneTransitionLeadOutMs +
        Math.round(sceneTransitionDurationMs * SCENE_TRANSITION_SWAP_PROGRESS);
    const swapTimer = window.setTimeout(() => {
      setReaderState(pendingSceneState);
    }, swapDelayMs);
    const finishTimer = window.setTimeout(() => {
      setPendingSceneState(null);
      setBoundaryState((current) =>
        current?.type === "scene-transition" ? null : current
      );
    }, sceneTransitionTotalDurationMs);

    return () => {
      window.clearTimeout(swapTimer);
      window.clearTimeout(finishTimer);
    };
  }, [
    isSceneTransition,
    pendingSceneState,
    prefersReducedMotion,
    sceneTransitionDurationMs,
    sceneTransitionLeadOutMs,
    sceneTransitionTotalDurationMs
  ]);

  useLayoutEffect(() => {
    if (!showDialogueCard || !activeEntry) {
      return;
    }

    setLineEnterDelayMs(
      previousShowDialogueCardRef.current
        ? getLineEnterDelayMs({
            currentEntry: activeEntry,
            previousEntry: previousNormalEntryRef.current,
            reducedMotion: prefersReducedMotion
          })
        : 0
    );
    setVisibleTextLength(prefersReducedMotion ? textCharacters.length : 0);
    setPresentationPhase(prefersReducedMotion ? "ready" : "entering");
    previousNormalEntryRef.current = activeEntry;
  }, [
    activeEntry,
    prefersReducedMotion,
    showDialogueCard,
    textCharacters.length
  ]);

  useEffect(() => {
    previousShowDialogueCardRef.current = showDialogueCard;
  }, [showDialogueCard]);

  useEffect(() => {
    if (
      !showDialogueCard ||
      prefersReducedMotion ||
      presentationPhase !== "entering"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPresentationPhase("typing");
    }, lineEnterDelayMs + lineEnterDurationMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    lineEnterDelayMs,
    lineEnterDurationMs,
    prefersReducedMotion,
    presentationPhase,
    showDialogueCard
  ]);

  useEffect(() => {
    if (
      !showDialogueCard ||
      prefersReducedMotion ||
      presentationPhase !== "typing" ||
      visibleTextLength >= textCharacters.length
    ) {
      return;
    }

    const previousCharacter = textCharacters[visibleTextLength - 1] ?? null;
    const typingDelayMs = previousCharacter
      ? getTypingCharacterDelayMs(previousCharacter)
      : TYPING_BASE_DELAY_MS;
    const timer = window.setTimeout(() => {
      setVisibleTextLength((currentLength) => {
        return Math.min(currentLength + 1, textCharacters.length);
      });
    }, typingDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    prefersReducedMotion,
    presentationPhase,
    showDialogueCard,
    textCharacters,
    visibleTextLength
  ]);

  useEffect(() => {
    if (
      !showDialogueCard ||
      prefersReducedMotion ||
      presentationPhase !== "typing" ||
      visibleTextLength < textCharacters.length
    ) {
      return;
    }

    setPresentationPhase("ready");
  }, [
    prefersReducedMotion,
    presentationPhase,
    showDialogueCard,
    textCharacters.length,
    visibleTextLength
  ]);

  const handleShowTapHeader = useCallback(() => {
    setIsTapHeaderVisible(true);
  }, []);

  const handleCompleteTyping = useCallback(() => {
    if (!canCompleteTyping) {
      return;
    }

    setVisibleTextLength(textCharacters.length);
    setPresentationPhase("ready");
  }, [canCompleteTyping, textCharacters.length]);

  const handleOpenMap = useCallback(() => {
    setIsTapHeaderVisible(false);
    setIsMapOpen(true);
  }, []);

  const handleCloseMap = useCallback(() => {
    setIsMapOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const preloadedMapImage = new window.Image();
    let settled = false;
    const markReady = () => {
      if (cancelled || settled) {
        return;
      }

      settled = true;
      setIsMapImageReady(true);
    };
    const markFallbackReady = () => {
      if (cancelled || settled) {
        return;
      }

      settled = true;
      setIsMapImageReady(true);
    };

    preloadedMapImage.loading = "eager";
    preloadedMapImage.decoding = "async";

    if ("fetchPriority" in preloadedMapImage) {
      preloadedMapImage.fetchPriority = "high";
    }

    preloadedMapImage.src = worldMapImage.src;

    if (preloadedMapImage.complete && preloadedMapImage.naturalWidth > 0) {
      markReady();

      return () => {
        cancelled = true;
      };
    }

    preloadedMapImage.addEventListener("load", markReady, { once: true });
    preloadedMapImage.addEventListener("error", markFallbackReady, {
      once: true
    });

    if (typeof preloadedMapImage.decode === "function") {
      void preloadedMapImage
        .decode()
        .then(markReady)
        .catch(() => {
          // Keep waiting for the load event if decode fails or is unsupported.
        });
    }

    return () => {
      cancelled = true;
      preloadedMapImage.removeEventListener("load", markReady);
      preloadedMapImage.removeEventListener("error", markFallbackReady);
    };
  }, []);

  useEffect(() => {
    if (!isMapOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMapOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMapOpen]);

  const handleBack = useCallback(async () => {
    if (isLoadingChapter || !bundle || !readerState || !manifest) {
      return;
    }

    setIsLoadingChapter(true);

    try {
      const resolvedRetreat = await retreatRuntimePosition({
        manifest,
        bundle,
        state: readerState,
        loadChapter: loadBundle
      });

      startTransition(() => {
        setPendingSceneState(null);
        setBoundaryState(null);

        if (
          resolvedRetreat.type === "line" ||
          resolvedRetreat.type === "scene-transition"
        ) {
          setReaderState(resolvedRetreat.state);
          return;
        }

        if (resolvedRetreat.type === "chapter-return") {
          setBundle(resolvedRetreat.bundle);
          setReaderState(resolvedRetreat.state);
        }
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load the previous dialogue."
      );
    } finally {
      setIsLoadingChapter(false);
    }
  }, [bundle, isLoadingChapter, loadBundle, manifest, readerState]);

  const commitJumpToScene = useCallback(
    (targetBundle: RuntimeChapterBundle, sceneIndex: number) => {
      setPendingSceneState(null);
      setBoundaryState(null);
      setBundle(targetBundle);
      setReaderState({
        sceneIndex,
        dialogueIndex: 0,
        isChapterComplete: false
      });
    },
    []
  );

  const handleJumpToScene = useCallback(
    async (input: { chapterId: string; sceneIndex: number }) => {
      if (isLoadingChapter || !manifest) {
        return;
      }

      setIsLoadingChapter(true);
      setIsTapHeaderVisible(false);

      try {
        const targetBundle =
          bundle?.chapter.id === input.chapterId
            ? bundle
            : await loadBundle(manifest, input.chapterId);

        const targetScene = targetBundle?.chapter.scenes[input.sceneIndex];

        if (!targetScene || targetScene.dialogue.length === 0) {
          return;
        }

        startTransition(() => {
          commitJumpToScene(targetBundle, input.sceneIndex);
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to jump to the requested scene."
        );
      } finally {
        setIsLoadingChapter(false);
      }
    },
    [bundle, commitJumpToScene, isLoadingChapter, loadBundle, manifest]
  );

  const handleJumpToChapter = useCallback(
    async (chapterId: string) => {
      if (isLoadingChapter || !manifest) {
        return;
      }

      setIsLoadingChapter(true);
      setIsTapHeaderVisible(false);

      try {
        const targetBundle =
          bundle?.chapter.id === chapterId
            ? bundle
            : await loadBundle(manifest, chapterId);
        const firstPlayableSceneIndex = targetBundle.chapter.scenes.findIndex(
          (sceneCandidate) => sceneCandidate.dialogue.length > 0
        );

        if (firstPlayableSceneIndex < 0) {
          return;
        }

        startTransition(() => {
          commitJumpToScene(targetBundle, firstPlayableSceneIndex);
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to jump to the requested chapter."
        );
      } finally {
        setIsLoadingChapter(false);
      }
    },
    [bundle, commitJumpToScene, isLoadingChapter, loadBundle, manifest]
  );

  const handleAdvance = useCallback(async () => {
    if (boundaryState) {
      setIsTapHeaderVisible(false);

      if (boundaryState.type !== "story-finished") {
        setPendingSceneState(null);
        setBoundaryState(null);
      }

      return;
    }

    if (
      isLoadingChapter ||
      presentationPhase !== "ready" ||
      !bundle ||
      !readerState ||
      !manifest
    ) {
      return;
    }

    setIsTapHeaderVisible(false);
    setIsLoadingChapter(true);
    setPresentationPhase("exiting");

    try {
      const [resolvedAdvance] = await Promise.all([
        resolveAdvanceAction({
          manifest,
          bundle,
          state: readerState,
          loadChapter: loadBundle
        }),
        waitForDuration(lineExitDurationMs)
      ]);

      startTransition(() => {
        if (resolvedAdvance.type === "line") {
          setPendingSceneState(null);
          setBoundaryState(null);
          setReaderState(resolvedAdvance.state);
          return;
        }

        if (resolvedAdvance.type === "scene-transition") {
          setPendingSceneState(resolvedAdvance.state);
          setBoundaryState(resolvedAdvance.boundaryState);
          return;
        }

        if (resolvedAdvance.type === "chapter-break") {
          setPendingSceneState(null);
          setBundle(resolvedAdvance.bundle);
          setReaderState(resolvedAdvance.state);
          setBoundaryState(resolvedAdvance.boundaryState);
          return;
        }

        setPendingSceneState(null);
        setBoundaryState(resolvedAdvance.boundaryState);
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load the next chapter."
      );
    } finally {
      setIsLoadingChapter(false);
    }
  }, [
    boundaryState,
    bundle,
    isLoadingChapter,
    lineExitDurationMs,
    loadBundle,
    manifest,
    presentationPhase,
    readerState
  ]);

  const handleDressSelect = useCallback(
    async (dressKey: string) => {
      if (
        isLoadingChapter ||
        presentationPhase !== "ready" ||
        !entry ||
        entry.speaker.type !== "dress_prompt"
      ) {
        return;
      }

      const promptSpeaker = entry.speaker;

      setBranchFlags((currentValue) => ({
        ...currentValue,
        [getDressBranchFlagKey(promptSpeaker.characterId)]:
          dressKey || BASE_DRESS_OPTION_KEY
      }));

      await handleAdvance();
    },
    [entry, handleAdvance, isLoadingChapter, presentationPhase]
  );

  const handlePreviousDressPromptOption = useCallback(() => {
    if (dressPromptOptions.length <= 1) {
      return;
    }

    setDressPromptMotionDirection(-1);
    setDressPromptIndex((currentIndex) => {
      if (currentIndex <= 0) {
        return dressPromptOptions.length - 1;
      }

      return currentIndex - 1;
    });
  }, [dressPromptOptions.length]);

  const handleNextDressPromptOption = useCallback(() => {
    if (dressPromptOptions.length <= 1) {
      return;
    }

    setDressPromptMotionDirection(1);
    setDressPromptIndex((currentIndex) => {
      if (currentIndex >= dressPromptOptions.length - 1) {
        return 0;
      }

      return currentIndex + 1;
    });
  }, [dressPromptOptions.length]);

  const handleRestart = useCallback(async () => {
    if (!manifest?.firstChapterId) {
      return;
    }

    try {
      const resolvedRuntime = await loadPlayerRuntimeSession({
        manifestPath,
        supabaseUrl,
        progress: null,
        initialManifest: manifest,
        loadChapter: loadBundle
      });

      previousNormalEntryRef.current = null;
      setPendingSceneState(null);
      setBoundaryState(null);
      setBranchFlags({});
      setIsPersistenceReady(true);

      if (!resolvedRuntime.bundle || !resolvedRuntime.readerState) {
        setBundle(null);
        setReaderState(null);
        return;
      }

      setManifest(resolvedRuntime.manifest);
      setBundle(resolvedRuntime.bundle);
      setReaderState(resolvedRuntime.readerState);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to restart the story."
      );
    }
  }, [loadBundle, manifest, manifestPath, supabaseUrl]);

  if (isLoading || isResolvingResume) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center px-6 py-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-200 backdrop-blur">
          {isResolvingResume
            ? "Resuming saved progress..."
            : "Loading story runtime..."}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center px-6 py-6">
        <div className="w-full rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6 text-rose-100">
          <h2 className="text-xl font-semibold">Runtime unavailable</h2>
          <p className="mt-2 text-sm text-rose-100/80">{error}</p>
        </div>
      </div>
    );
  }

  if (runtimeAvailability) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center px-6 py-6">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-200">
          <h2 className="text-xl font-semibold">{runtimeAvailability.title}</h2>
          <p className="mt-2 text-sm text-slate-300">
            {runtimeAvailability.description}
          </p>
        </div>
      </div>
    );
  }

  const resolvedScene = activeScene!;
  const resolvedEntry = activeEntry!;
  const resolvedDialogueCardVariants = dialogueCardVariants!;

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
      {showDesktopSceneNavigation ? (
        <aside
          className="absolute left-0 top-0 z-30 hidden h-full items-start px-3 py-3 lg:flex"
          style={{
            width: desktopSceneNavPanelWidth
          }}
        >
          <div className="pointer-events-auto flex h-full w-full flex-col rounded-2xl border border-white/10 bg-black/35 p-3 text-slate-100 backdrop-blur">
            <div className="border-b border-white/10 pb-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Temporary Nav
              </p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                Chapter / Scene
              </p>
            </div>

            <div className="mt-3 space-y-2 overflow-y-auto">
              {manifest?.chapters.map((chapterItem, chapterIndex) => {
                const isChapterActive = chapterItem.id === bundle?.chapter.id;
                return (
                  <button
                    key={chapterItem.id}
                    onClick={() => void handleJumpToChapter(chapterItem.id)}
                    type="button"
                    disabled={isLoadingChapter}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      isChapterActive
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100"
                    } disabled:cursor-default disabled:opacity-45`}
                  >
                    <span className="mr-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      Ch {chapterIndex + 1}
                    </span>
                    {chapterItem.title}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                {activeChapterIndex >= 0
                  ? `Scenes in Chapter ${activeChapterIndex + 1}`
                  : "Scenes"}
              </p>
              <div className="mt-2 space-y-2 overflow-y-auto">
                {bundle?.chapter.scenes.map((sceneItem, sceneIndex) => {
                  const isSceneActive =
                    sceneIndex === readerState?.sceneIndex &&
                    activeChapterIndex >= 0;
                  const isScenePlayable = sceneItem.dialogue.length > 0;
                  return (
                    <button
                      key={sceneItem.id}
                      onClick={() =>
                        void handleJumpToScene({
                          chapterId: bundle.chapter.id,
                          sceneIndex
                        })
                      }
                      type="button"
                      disabled={isLoadingChapter || !isScenePlayable}
                      className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                        isSceneActive
                          ? "bg-white/20 text-white"
                          : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100"
                      } disabled:cursor-default disabled:opacity-45`}
                    >
                      <span className="mr-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                        S {sceneIndex + 1}
                      </span>
                      {sceneItem.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      <div
        className="relative h-[100dvh] w-screen shrink-0 overflow-hidden bg-slate-950"
        style={stageSizeStyle}
      >
        {backgroundImageUrl ? (
          <img
            src={backgroundImageUrl}
            alt={
              resolvedScene.backgroundImage.altText ??
              resolvedScene.backgroundImage.label
            }
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: buildSceneOverlayBackground(
              sceneLighting.overlayStrength
            )
          }}
        />

        <div className="relative z-10 h-full">
          <AnimatePresence initial={false}>
            {isTransitionCard ? (
              <motion.div
                key={`scene-transition-${pendingSceneState?.sceneIndex ?? "none"}-${pendingSceneState?.dialogueIndex ?? "none"}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: sceneTransitionOpacityKeyframes }}
                exit={{ opacity: 0 }}
                transition={{
                  delay: sceneTransitionLeadOutMs / 1000,
                  duration: sceneTransitionDurationMs / 1000,
                  times: sceneTransitionTimeKeyframes,
                  ease: sceneTransitionEase
                }}
                className="pointer-events-none absolute inset-0 z-30 bg-black will-change-opacity"
              />
            ) : null}
          </AnimatePresence>

          <button
            onClick={handleShowTapHeader}
            type="button"
            aria-label="Show navigation header"
            className="absolute inset-0 z-[15] bg-transparent"
          />

          <AnimatePresence initial={false}>
            {isTapHeaderVisible ? (
              <motion.div
                initial={
                  prefersReducedMotion
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: -32 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={
                  prefersReducedMotion
                    ? { opacity: 0, y: 0 }
                    : { opacity: 0, y: -32 }
                }
                transition={{
                  duration: tapHeaderMotionDurationMs / 1000,
                  ease: MOTION_EASE_OUT
                }}
                className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-3 py-3 md:px-5 md:py-4"
              >
                <button
                  onClick={handleBack}
                  type="button"
                  aria-label="Previous dialogue"
                  disabled={isLoadingChapter}
                  className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center bg-transparent text-slate-100 transition-colors hover:text-white disabled:cursor-default disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <span aria-hidden className="material-symbols-outlined">
                    arrow_back
                  </span>
                </button>
                <button
                  onClick={handleOpenMap}
                  type="button"
                  aria-label="Open world map"
                  className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center bg-transparent text-slate-100 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <span aria-hidden className="material-symbols-outlined">
                    map
                  </span>
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {isChapterBreakCard || isStoryFinishedCard ? (
            <div className="absolute inset-x-0 top-0 z-20 p-3 md:p-5">
              <div className="rounded-[28px] border border-white/10 bg-slate-950/82 p-5 backdrop-blur">
                {isChapterBreakCard ? (
                  <div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                          Chapter Break
                        </p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
                          {chapterBreakState?.chapterTitle}
                        </h2>
                      </div>
                      <PillLike>
                        Chapter {chapterBreakState?.chapterIndex} of{" "}
                        {chapterBreakState?.chapterCount}
                      </PillLike>
                    </div>

                    <p className="max-w-3xl text-base leading-7 text-slate-300">
                      The previous chapter is complete. Continue when you are
                      ready to begin the next chapter.
                    </p>

                    <div className="mt-6 flex justify-end">
                      <Button
                        onClick={() => void handleAdvance()}
                        disabled={isLoadingChapter}
                      >
                        Begin Chapter
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                          Story Complete
                        </p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
                          You reached the end of the current story.
                        </h2>
                      </div>
                      <PillLike>
                        Chapter {storyFinishedState?.chapterIndex} of{" "}
                        {storyFinishedState?.chapterCount}
                      </PillLike>
                    </div>

                    <p className="max-w-3xl text-base leading-7 text-slate-300">
                      {storyFinishedState?.chapterTitle} is the current ending
                      point. Restart to read from the beginning again.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-slate-400">
                        The published story ends here for now.
                      </div>
                      <Button onClick={handleRestart}>Restart Story</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {showDialogueCard ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={resolvedEntry.id}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={resolvedDialogueCardVariants}
                  onClick={handleCompleteTyping}
                  className={`pointer-events-auto absolute bottom-[clamp(0.75rem,2vw,1.25rem)] rounded-[28px] border border-white/10 bg-slate-950/82 p-5 backdrop-blur ${dialogueCardPositionClassName} ${canCompleteTyping ? "cursor-pointer" : ""}`}
                >
                  {resolvedEntry.speaker.type === "character" ? (
                    <div className="mb-4">
                      <p
                        className={
                          resolvedEntry.speaker.characterName
                            .trim()
                            .toLowerCase() === "ocnoer"
                            ? "font-character-name text-4xl leading-none text-slate-300"
                            : "text-sm uppercase tracking-[0.2em] text-slate-400"
                        }
                      >
                        {resolvedEntry.speaker.characterName}
                      </p>
                    </div>
                  ) : null}

                  <p
                    className={`min-h-[3.5rem] text-slate-100 ${
                      resolvedEntry.speaker.type === "dress_prompt"
                        ? "font-dress-prompt text-center text-[2.4rem] leading-[1.15] md:text-[2.8rem]"
                        : "font-dialogue text-base leading-7 md:text-lg md:leading-8"
                    }`}
                  >
                    {dialogueTextNodes}
                  </p>

                  {showDressPromptOptions && selectedDressPromptOption ? (
                    <div className="mt-6">
                      <div className="flex items-center justify-center gap-2 md:gap-3">
                        <button
                          onClick={handlePreviousDressPromptOption}
                          disabled={
                            isLoadingChapter || dressPromptOptions.length <= 1
                          }
                          type="button"
                          aria-label="Previous dress option"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/25 text-slate-100 transition-colors hover:border-white/30 hover:text-white disabled:cursor-default disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        >
                          <span
                            aria-hidden
                            className="material-symbols-outlined text-[20px]"
                          >
                            arrow_back
                          </span>
                        </button>

                        <div className="relative w-[min(58vw,13.5rem)] shrink-0">
                          <div className="relative aspect-[4/5] w-full">
                            <AnimatePresence
                              initial={false}
                              mode="wait"
                              custom={dressPromptMotionDirection}
                            >
                              <motion.button
                                key={selectedDressPromptOption.key}
                                custom={dressPromptMotionDirection}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                variants={dressPromptCardVariants}
                                transition={{
                                  duration: prefersReducedMotion ? 0 : 0.28,
                                  ease: MOTION_EASE_OUT
                                }}
                                onClick={() =>
                                  void handleDressSelect(selectedDressPromptOption.key)
                                }
                                disabled={isLoadingChapter}
                                type="button"
                                className="absolute inset-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-white/25 hover:bg-white/10 disabled:cursor-default disabled:opacity-45"
                              >
                                {selectedDressPromptOption.previewUrl ? (
                                  <img
                                    src={selectedDressPromptOption.previewUrl}
                                    alt={selectedDressPromptOption.label}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-black/20 text-sm text-slate-400">
                                    No preview
                                  </div>
                                )}
                              </motion.button>
                            </AnimatePresence>
                          </div>

                          <div className="mt-2 text-center text-xs text-slate-400">
                            {dressPromptIndex + 1} of {dressPromptOptions.length}
                          </div>
                        </div>

                        <button
                          onClick={handleNextDressPromptOption}
                          disabled={
                            isLoadingChapter || dressPromptOptions.length <= 1
                          }
                          type="button"
                          aria-label="Next dress option"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/25 text-slate-100 transition-colors hover:border-white/30 hover:text-white disabled:cursor-default disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                        >
                          <span
                            aria-hidden
                            className="material-symbols-outlined text-[20px]"
                          >
                            arrow_forward
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {showContinueButtonSlot ? (
                    <div className="mt-6 flex h-9 items-center justify-end">
                      <motion.div
                        initial={false}
                        animate={
                          showContinueButton
                            ? { opacity: 1, y: 0 }
                            : prefersReducedMotion
                              ? { opacity: 0, y: 0 }
                              : { opacity: 0, y: 8 }
                        }
                        transition={{
                          duration: prefersReducedMotion
                            ? 0
                            : CONTINUE_BUTTON_ENTER_DURATION_MS / 1000,
                          ease: MOTION_EASE_OUT
                        }}
                        className={showContinueButton ? undefined : "pointer-events-none"}
                      >
                        <button
                          onClick={() => void handleAdvance()}
                          disabled={isLoadingChapter || !showContinueButton}
                          tabIndex={showContinueButton ? 0 : -1}
                          type="button"
                          aria-label={
                            isLoadingChapter ? "Loading next line" : "Continue"
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-slate-100 transition-opacity hover:text-white disabled:cursor-default disabled:opacity-45"
                        >
                          <span aria-hidden className="material-symbols-outlined">
                            arrow_forward
                          </span>
                        </button>
                      </motion.div>
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-10 h-[72%] md:h-[78%]">
            <StageCharacter
              alignment="left"
              portrait={leftStagePortrait}
              lighting={sceneLighting.left}
              shouldAnimate={showDialogueCard}
              prefersReducedMotion={prefersReducedMotion}
              enterDurationMs={lineEnterDurationMs}
              exitDurationMs={lineExitDurationMs}
            />
            <StageCharacter
              alignment="right"
              portrait={rightStagePortrait}
              lighting={sceneLighting.right}
              shouldAnimate={showDialogueCard}
              prefersReducedMotion={prefersReducedMotion}
              enterDurationMs={lineEnterDurationMs}
              exitDurationMs={lineExitDurationMs}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isMapOpen ? (
          <motion.div
            key="player-world-map"
            role="dialog"
            aria-modal="true"
            aria-label="World map"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={{
              duration: mapOverlayMotionDurationMs / 1000,
              ease: MOTION_EASE_OUT
            }}
            className="absolute inset-0 z-[70] bg-black/95 backdrop-blur-sm"
          >
            <div className="absolute inset-0 flex items-center justify-center p-3 md:p-6">
              <motion.div
                initial={
                  prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.98 }
                }
                transition={{
                  duration: mapOverlayMotionDurationMs / 1000,
                  ease: MOTION_EASE_OUT
                }}
                className="relative inline-flex h-fit w-fit origin-center"
              >
                <button
                  onClick={handleCloseMap}
                  type="button"
                  aria-label="Close world map"
                  className="absolute left-2 top-2 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/35 text-slate-100 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:left-3 md:top-3"
                >
                  <span aria-hidden className="material-symbols-outlined">
                    close
                  </span>
                </button>

                {isMapImageReady ? (
                  <img
                    src={worldMapImage.src}
                    alt="Ocnoer world map"
                    width={worldMapImage.width}
                    height={worldMapImage.height}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="block max-h-[calc(100dvh-1.5rem)] max-w-[calc(100dvw-1.5rem)] object-contain md:max-h-[calc(100dvh-3rem)] md:max-w-[calc(100dvw-3rem)]"
                  />
                ) : (
                  <div className="flex h-[70dvh] w-[min(92dvw,72rem)] items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-sm text-slate-300">
                    Preparing map...
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {backgroundMusicUrl ? (
        <audio ref={audioRef} src={backgroundMusicUrl} loop />
      ) : null}
    </div>
  );
}

function PillLike(props: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur">
      {props.children}
    </span>
  );
}

function StageCharacter(props: {
  alignment: "left" | "right";
  portrait: VisibleStagePortrait | null;
  lighting: StageCharacterLighting;
  shouldAnimate: boolean;
  prefersReducedMotion: boolean;
  enterDurationMs: number;
  exitDurationMs: number;
}) {
  const isLeft = props.alignment === "left";
  const direction =
    props.portrait?.direction ?? (isLeft ? "from-left" : "from-right");
  const variants = createDirectionalVariants({
    direction,
    reducedMotion: props.prefersReducedMotion,
    enterDurationMs: props.shouldAnimate ? props.enterDurationMs : 0,
    exitDurationMs: props.shouldAnimate ? props.exitDurationMs : 0
  });

  return (
    <div
      className={`absolute bottom-0 flex h-full w-[52%] max-w-[22rem] items-end overflow-hidden md:w-[46%] md:max-w-none ${
        isLeft ? "left-0 justify-start" : "right-0 justify-end"
      }`}
    >
      <AnimatePresence initial={false} mode="wait">
        {props.portrait ? (
          <motion.img
            key={props.portrait.key}
            src={props.portrait.imageUrl}
            alt={props.portrait.alt}
            initial={props.shouldAnimate ? "hidden" : false}
            animate="visible"
            exit="exit"
            variants={variants}
            className={`h-full w-full object-contain ${
              isLeft ? "object-left-bottom" : "object-right-bottom"
            }`}
            style={{
              filter: buildStageCharacterFilter(props.lighting)
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function createVisibleStagePortrait(input: {
  stageCharacter: RuntimeStageCharacter | null;
  imageUrl: string | null;
  direction: MotionDirection;
}): VisibleStagePortrait | null {
  if (!input.stageCharacter || !input.imageUrl) {
    return null;
  }

  return {
    key: `${input.stageCharacter.characterId}:${input.stageCharacter.emotionKey}:${input.imageUrl}`,
    imageUrl: input.imageUrl,
    alt: input.stageCharacter.characterName,
    direction: input.direction
  };
}

function createDirectionalVariants(input: {
  direction: MotionDirection;
  reducedMotion: boolean;
  enterDurationMs: number;
  exitDurationMs: number;
  enterDelayMs?: number;
}) {
  const offset = getMotionOffset({
    direction: input.direction,
    reducedMotion: input.reducedMotion
  });

  return {
    hidden: {
      x: offset.x,
      y: offset.y,
      opacity: 0
    },
    visible: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        duration: input.enterDurationMs / 1000,
        delay: (input.enterDelayMs ?? 0) / 1000,
        ease: MOTION_EASE_OUT
      }
    },
    exit: {
      x: offset.x,
      y: offset.y,
      opacity: 0,
      transition: {
        duration: input.exitDurationMs / 1000,
        ease: MOTION_EASE_IN
      }
    }
  };
}

function waitForDuration(durationMs: number) {
  if (durationMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function resolveAdvanceAction(input: {
  manifest: RuntimeManifest;
  bundle: RuntimeChapterBundle;
  state: ReaderState;
  loadChapter: ReturnType<typeof createRuntimeChapterLoader>;
}): Promise<ResolvedAdvanceAction> {
  const result = await advanceRuntimePosition({
    manifest: input.manifest,
    bundle: input.bundle,
    state: input.state,
    loadChapter: input.loadChapter
  });

  if (result.type === "line") {
    return result;
  }

  if (result.type === "scene-transition") {
    return {
      type: "scene-transition",
      state: result.state,
      boundaryState: {
        type: "scene-transition"
      }
    };
  }

  if (result.type === "chapter-break") {
    const chapterIndex = input.manifest.chapters.findIndex(
      (chapter) => chapter.id === result.bundle.chapter.id
    );

    return {
      type: "chapter-break",
      bundle: result.bundle,
      state: result.state,
      boundaryState: {
        type: "chapter-break",
        chapterTitle: result.bundle.chapter.title,
        chapterIndex: chapterIndex + 1,
        chapterCount: input.manifest.chapters.length
      }
    };
  }

  const chapterIndex = input.manifest.chapters.findIndex(
    (chapter) => chapter.id === input.bundle.chapter.id
  );

  return {
    type: "story-finished",
    boundaryState: {
      type: "story-finished",
      chapterTitle: input.bundle.chapter.title,
      chapterIndex: chapterIndex + 1,
      chapterCount: input.manifest.chapters.length
    }
  };
}
