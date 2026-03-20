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
const SCENE_TRANSITION_DURATION_MS = 700;

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

  const lineEnterDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : DEFAULT_LINE_ENTER_DURATION_MS;
  const lineExitDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : DEFAULT_LINE_EXIT_DURATION_MS;

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
        readerState
      }),
    [bundle, readerState, supabaseUrl]
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
  const leftStagePortrait = activeEntry
    ? createVisibleStagePortrait({
        stageCharacter: activeEntry.stage.left,
        imageUrl: leftCharacterImageUrl,
        direction: "from-left"
      })
    : null;
  const rightStagePortrait = activeEntry
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

    if (
      prefersReducedMotion ||
      presentationPhase === "ready" ||
      presentationPhase === "exiting"
    ) {
      return activeEntry.text;
    }

    return textCharacters.map((character, index) => {
      return (
        <span
          key={`${activeEntry.id}:${index}`}
          className={index < visibleTextLength ? undefined : "text-transparent"}
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
  const showContinueButton = showDialogueCard && presentationPhase === "ready";

  useEffect(() => {
    if (!isSceneTransition || !pendingSceneState) {
      return;
    }

    const swapDelayMs = prefersReducedMotion
      ? 0
      : Math.round(sceneTransitionDurationMs / 2);
    const swapTimer = window.setTimeout(() => {
      setReaderState(pendingSceneState);
    }, swapDelayMs);
    const finishTimer = window.setTimeout(() => {
      setPendingSceneState(null);
      setBoundaryState((current) =>
        current?.type === "scene-transition" ? null : current
      );
    }, sceneTransitionDurationMs);

    return () => {
      window.clearTimeout(swapTimer);
      window.clearTimeout(finishTimer);
    };
  }, [
    isSceneTransition,
    pendingSceneState,
    prefersReducedMotion,
    sceneTransitionDurationMs
  ]);

  useEffect(() => {
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

  const handleAdvance = useCallback(async () => {
    if (boundaryState) {
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
    <div className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-black">
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
                animate={{
                  opacity: prefersReducedMotion ? [0, 0.75, 0] : [0, 0.92, 0]
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: sceneTransitionDurationMs / 1000,
                  times: [0, 0.5, 1],
                  ease: "easeInOut"
                }}
                className="pointer-events-none absolute inset-0 z-30 bg-black"
              />
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
                  className={`pointer-events-auto absolute bottom-[clamp(0.75rem,2vw,1.25rem)] rounded-[28px] border border-white/10 bg-slate-950/82 p-5 backdrop-blur ${dialogueCardPositionClassName}`}
                >
                  {resolvedEntry.speaker.type === "character" ? (
                    <div className="mb-4">
                      <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                        {resolvedEntry.speaker.characterName}
                      </p>
                    </div>
                  ) : null}

                  <p className="font-dialogue min-h-[3.5rem] text-base leading-7 text-slate-100 md:text-lg md:leading-8">
                    {dialogueTextNodes}
                  </p>

                  <div className="mt-6 flex min-h-9 justify-end">
                    <AnimatePresence initial={false}>
                      {showContinueButton ? (
                        <motion.div
                          initial={
                            prefersReducedMotion ? false : { opacity: 0, y: 10 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{
                            duration: prefersReducedMotion
                              ? 0
                              : CONTINUE_BUTTON_ENTER_DURATION_MS / 1000,
                            ease: MOTION_EASE_OUT
                          }}
                        >
                          <button
                            onClick={() => void handleAdvance()}
                            disabled={isLoadingChapter}
                            type="button"
                            aria-label={
                              isLoadingChapter
                                ? "Loading next line"
                                : "Continue"
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-slate-100 transition-opacity hover:text-white disabled:cursor-default disabled:opacity-45"
                          >
                            <span
                              aria-hidden
                              className="material-symbols-outlined"
                            >
                              arrow_forward
                            </span>
                          </button>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
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
