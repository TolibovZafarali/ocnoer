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

import { signOutPlayerAction } from "@/app/(player)/play/actions";
import { Button } from "@/components/ui/button";
import { ChapterCardHandwriting } from "@/app/(player)/play/chapter-card-handwriting";
import {
  loadPlayerProgressForReader,
  persistCachedPlayerProgress,
  saveServerPlayerProgress
} from "@/app/(player)/play/player-progress-client";
import {
  createChapterCardRevealPlan,
  CONTINUE_BUTTON_ENTER_DURATION_MS,
  DEFAULT_LINE_ENTER_DURATION_MS,
  DEFAULT_LINE_EXIT_DURATION_MS,
  REDUCED_MOTION_DURATION_MS,
  TYPING_BASE_DELAY_MS,
  type MotionDirection,
  type PresentationPhase,
  getChapterCardRevealProgress,
  getDialogueCardPlacement,
  getLineEnterDelayMs,
  getLineMotionConfig,
  getMotionOffset,
  getTypingCharacterDelayMs
} from "@/app/(player)/play/player-story-reader-motion";
import {
  createBoundaryStateForAdvance,
  getChapterOpeningBoundaryState,
  resolveBoundaryAdvance,
  type PlayerBoundaryState
} from "@/app/(player)/play/player-story-reader-boundary";
import {
  fadeBackgroundMusicTo,
  fadeOutBackgroundMusic,
  restartBackgroundMusic,
  resumePausedBackgroundMusic
} from "@/app/(player)/play/player-story-reader-audio";
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
  createStoredProgress,
  findFirstPlayableReaderState,
  findSceneBackgroundMusicById,
  getCurrentDialogue,
  getCurrentScene,
  type ReaderState,
  resolveReaderStateSceneBackgroundMusicTrackId,
  resolveSceneBackgroundMusicTrackId,
  retreatRuntimePosition
} from "@ocnoer/story-core";
import type {
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeStageCharacter
} from "@ocnoer/story-core";
import {
  createRuntimeChapterLoader,
  decidePlayerResumeAction,
  getPlayerRuntimeAssetUrls,
  getPlayerRuntimeSceneAssetUrls,
  loadPlayerRuntimeSession,
  toPublicStorageUrl
} from "@/lib/story/runtime";
import {
  applySceneDressCarrySelection,
  getDressBranchFlagKey,
  BASE_DRESS_OPTION_KEY
} from "@ocnoer/story-core";

type PlayerStoryReaderProps = {
  manifestPath: string;
  progressStorageKey: string;
  supabaseUrl: string;
  initialCatName: string | null;
  initialCatNameLocked: boolean;
  initialManifest?: RuntimeManifest | null;
  initialBundle?: RuntimeChapterBundle | null;
  initialReaderState?: ReaderState | null;
};

type VisibleStagePortrait = {
  key: string;
  imageUrl: string;
  alt: string;
  direction: MotionDirection;
};

type OpeningSceneFadePhase =
  | "pending"
  | "covering-chapter-card"
  | "revealing"
  | "hidden";

type SceneTransitionOverlayPhase = "hidden" | "covering" | "revealing";
type SceneTransitionOverlayProfile = "scene" | "inline-music" | "ending-card";

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

type PendingEndingCardTransition = {
  bundle: RuntimeChapterBundle;
  state: ReaderState;
  boundaryState: Extract<PlayerBoundaryState, { type: "chapter-ending-card" }>;
};

type PendingInSceneMusicTransition = {
  state: ReaderState;
  sceneBackgroundMusicTrackId: string | null;
};

const DEFAULT_STAGE_ASPECT_RATIO = 9 / 16;
const MOTION_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const MOTION_EASE_IN = [0.4, 0, 1, 1] as const;
const SCENE_TRANSITION_COVER_DURATION_MS = 900;
const SCENE_TRANSITION_MIN_BLACKOUT_MS = 1400;
const SCENE_TRANSITION_POST_SWAP_HOLD_MS = 380;
const SCENE_TRANSITION_REVEAL_DURATION_MS = 880;
const SCENE_TRANSITION_ASSET_TIMEOUT_MS = 6000;
const ENDING_CARD_TRANSITION_COVER_DURATION_MS = 1600;
const ENDING_CARD_TRANSITION_MIN_BLACKOUT_MS = 400;
const ENDING_CARD_TRANSITION_POST_SWAP_HOLD_MS = 220;
const ENDING_CARD_BACKGROUND_MUSIC_DELAY_MS = 3000;
const ENDING_CARD_BACKGROUND_MUSIC_FADE_IN_MS = 2200;
const ENDING_CARD_BACKGROUND_MUSIC_START_VOLUME = 0.2;
const INLINE_MUSIC_TRANSITION_LEAD_OUT_MS = 120;
const INLINE_MUSIC_TRANSITION_COVER_DURATION_MS = 180;
const INLINE_MUSIC_TRANSITION_MIN_BLACKOUT_MS = 180;
const INLINE_MUSIC_TRANSITION_POST_SWAP_HOLD_MS = 90;
const INLINE_MUSIC_TRANSITION_REVEAL_DURATION_MS = 180;
const OPENING_SCENE_FADE_DURATION_MS = 1200;
const CHAPTER_CARD_TYPING_DURATION_MULTIPLIER = 2;
const CHAPTER_CARD_TEXT_APPEAR_DELAY_MS = 2000;
const MAP_OVERLAY_DURATION_MS = 340;
const DESKTOP_SCENE_NAV_MIN_GUTTER_WIDTH_PX = 220;
const DESKTOP_SCENE_NAV_HORIZONTAL_PADDING_PX = 12;
const CAT_NAME_BRANCH_FLAG_KEY = "cat_name";
const CAT_NAME_LOCKED_BRANCH_FLAG_KEY = "cat_name_locked";
const CAT_NAME_TEMPLATE_PATTERN = /\{\{\s*cat_name\s*\}\}/gi;
const MIN_CAT_NAME_LENGTH = 1;
const MAX_CAT_NAME_LENGTH = 80;
const CAT_NAME_PATTERN = /^[a-zA-Z0-9 .,'_-]+$/;

function normalizeCatNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function resolveDialogueTextTemplate(text: string, catName: string | null) {
  if (!catName) {
    return text;
  }

  return text.replace(CAT_NAME_TEMPLATE_PATTERN, catName);
}

function resolveInitialCatNameState(input: {
  catName: string | null;
  catNameLocked: boolean;
}) {
  const normalizedCatName = normalizeCatNameInput(input.catName ?? "");

  if (normalizedCatName.length === 0) {
    return {
      catName: null,
      catNameLocked: false
    };
  }

  return {
    catName: normalizedCatName,
    catNameLocked: input.catNameLocked
  };
}

function reconcileCatNameBranchFlags(input: {
  branchFlags: Record<string, boolean | number | string>;
  catName: string | null;
  catNameLocked: boolean;
}) {
  const nextBranchFlags = { ...input.branchFlags };

  if (!input.catName) {
    delete nextBranchFlags[CAT_NAME_BRANCH_FLAG_KEY];
    delete nextBranchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY];
    return nextBranchFlags;
  }

  nextBranchFlags[CAT_NAME_BRANCH_FLAG_KEY] = input.catName;

  if (input.catNameLocked) {
    nextBranchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY] = true;
    return nextBranchFlags;
  }

  delete nextBranchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY];
  return nextBranchFlags;
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

function getDialogueCardPositionClassName(input: {
  placement: ReturnType<typeof getDialogueCardPlacement>;
  isCatNamePrompt: boolean;
}) {
  if (input.isCatNamePrompt) {
    return "left-[clamp(0.75rem,2vw,1.25rem)] right-auto w-[min(22rem,calc(100%-1.5rem))] md:w-[min(24rem,46%)]";
  }

  if (input.placement === "speaker-left") {
    return "left-[calc(min(52%,22rem)-clamp(0.85rem,2vw,1.5rem))] right-[clamp(0.75rem,2vw,1.25rem)] md:left-[calc(46%-clamp(1rem,2vw,1.75rem))]";
  }

  if (input.placement === "speaker-right") {
    return "left-[clamp(0.75rem,2vw,1.25rem)] right-[calc(min(52%,22rem)-clamp(0.85rem,2vw,1.5rem))] md:right-[calc(46%-clamp(1rem,2vw,1.75rem))]";
  }

  return "left-[clamp(0.75rem,2vw,1.25rem)] right-[clamp(0.75rem,2vw,1.25rem)]";
}

function getDialogueNavSpeakerLabel(
  entry: RuntimeDialogueEntry,
  catName: string | null
) {
  if (entry.speaker.type === "character") {
    return resolveDialogueTextTemplate(entry.speaker.characterName, catName);
  }

  if (entry.speaker.type === "dress_prompt") {
    return "Dress Prompt";
  }

  if (entry.speaker.type === "cat_name_prompt") {
    return "Cat Name Prompt";
  }

  return "Narrator";
}

function getCatNamePromptRightStageCharacter(entry: RuntimeDialogueEntry) {
  if (entry.speaker.type !== "cat_name_prompt") {
    return entry.stage.right;
  }

  if (entry.stage.right?.characterId === entry.speaker.characterId) {
    return entry.stage.right;
  }

  if (entry.stage.left?.characterId === entry.speaker.characterId) {
    return entry.stage.left;
  }

  return {
    characterId: entry.speaker.characterId,
    characterName: entry.speaker.characterName,
    characterSlug: entry.speaker.characterSlug,
    emotionKey: "default",
    emotionLabel: "Default",
    imagePath: ""
  };
}

export function PlayerStoryReader({
  manifestPath,
  progressStorageKey,
  supabaseUrl,
  initialCatName,
  initialCatNameLocked,
  initialManifest = null,
  initialBundle = null,
  initialReaderState = null
}: PlayerStoryReaderProps) {
  const cacheRef = useRef(
    new Map<string, RuntimeChapterBundle>(
      initialBundle ? [[initialBundle.chapter.id, initialBundle]] : []
    )
  );
  const hasPlayedOpeningSceneFadeRef = useRef(false);
  const initialResumeResolvedRef = useRef(false);
  const previousNormalEntryRef = useRef<RuntimeDialogueEntry | null>(null);
  const previousShowDialogueCardRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const initialCatNameState = useMemo(
    () =>
      resolveInitialCatNameState({
        catName: initialCatName,
        catNameLocked: initialCatNameLocked
      }),
    [initialCatName, initialCatNameLocked]
  );
  const [manifest, setManifest] = useState<RuntimeManifest | null>(
    initialManifest
  );
  const [bundle, setBundle] = useState<RuntimeChapterBundle | null>(
    initialBundle
  );
  const [readerState, setReaderState] = useState<ReaderState | null>(
    initialReaderState
  );
  const [sceneBackgroundMusicTrackId, setSceneBackgroundMusicTrackId] =
    useState<string | null>(() =>
      resolveReaderStateSceneBackgroundMusicTrackId({
        bundle: initialBundle,
        state: initialReaderState
      })
    );
  const [branchFlags, setBranchFlags] = useState<
    Record<string, boolean | number | string>
  >({});
  const [boundaryState, setBoundaryState] =
    useState<PlayerBoundaryState | null>(null);
  const [pendingSceneState, setPendingSceneState] =
    useState<ReaderState | null>(null);
  const [pendingInSceneMusicTransition, setPendingInSceneMusicTransition] =
    useState<PendingInSceneMusicTransition | null>(null);
  const [pendingEndingCardTransition, setPendingEndingCardTransition] =
    useState<PendingEndingCardTransition | null>(null);
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
  const [chapterCardRevealProgress, setChapterCardRevealProgress] = useState(0);
  const [lineEnterDelayMs, setLineEnterDelayMs] = useState(0);
  const [isTapHeaderVisible, setIsTapHeaderVisible] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isMapImageReady, setIsMapImageReady] = useState(false);
  const [openingSceneFadePhase, setOpeningSceneFadePhase] =
    useState<OpeningSceneFadePhase>("pending");
  const [sceneTransitionOverlayPhase, setSceneTransitionOverlayPhase] =
    useState<SceneTransitionOverlayPhase>("hidden");
  const [sceneTransitionOverlayProfile, setSceneTransitionOverlayProfile] =
    useState<SceneTransitionOverlayProfile>("scene");
  const [desktopNavGutterWidth, setDesktopNavGutterWidth] = useState(0);
  const [dressPromptIndex, setDressPromptIndex] = useState(0);
  const [dressPromptMotionDirection, setDressPromptMotionDirection] = useState<
    -1 | 1
  >(1);
  const [catName, setCatName] = useState<string | null>(
    initialCatNameState.catName
  );
  const [isCatNameLocked, setIsCatNameLocked] = useState(
    initialCatNameState.catNameLocked
  );
  const [catNameInputValue, setCatNameInputValue] = useState(
    initialCatNameState.catName ?? ""
  );
  const [catNameInputError, setCatNameInputError] = useState<string | null>(
    null
  );
  const [pendingCatNameSync, setPendingCatNameSync] = useState<string | null>(
    null
  );
  const [isSavingCatName, setIsSavingCatName] = useState(false);

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
  const openingSceneFadeDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : OPENING_SCENE_FADE_DURATION_MS;
  const sceneTransitionCoverDurationMs = prefersReducedMotion
    ? 0
    : SCENE_TRANSITION_COVER_DURATION_MS;
  const sceneTransitionMinimumBlackoutMs = prefersReducedMotion
    ? 0
    : SCENE_TRANSITION_MIN_BLACKOUT_MS;
  const sceneTransitionPostSwapHoldMs = prefersReducedMotion
    ? 0
    : SCENE_TRANSITION_POST_SWAP_HOLD_MS;
  const sceneTransitionRevealDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : SCENE_TRANSITION_REVEAL_DURATION_MS;
  const endingCardTransitionCoverDurationMs = prefersReducedMotion
    ? 0
    : ENDING_CARD_TRANSITION_COVER_DURATION_MS;
  const endingCardTransitionMinimumBlackoutMs = prefersReducedMotion
    ? 0
    : ENDING_CARD_TRANSITION_MIN_BLACKOUT_MS;
  const endingCardTransitionPostSwapHoldMs = prefersReducedMotion
    ? 0
    : ENDING_CARD_TRANSITION_POST_SWAP_HOLD_MS;
  const endingCardBackgroundMusicDelayMs = prefersReducedMotion
    ? 0
    : ENDING_CARD_BACKGROUND_MUSIC_DELAY_MS;
  const endingCardBackgroundMusicFadeInMs = prefersReducedMotion
    ? 0
    : ENDING_CARD_BACKGROUND_MUSIC_FADE_IN_MS;
  const inlineMusicTransitionLeadOutMs = prefersReducedMotion
    ? 0
    : Math.min(lineExitDurationMs, INLINE_MUSIC_TRANSITION_LEAD_OUT_MS);
  const inlineMusicTransitionCoverDurationMs = prefersReducedMotion
    ? 0
    : INLINE_MUSIC_TRANSITION_COVER_DURATION_MS;
  const inlineMusicTransitionMinimumBlackoutMs = prefersReducedMotion
    ? 0
    : INLINE_MUSIC_TRANSITION_MIN_BLACKOUT_MS;
  const inlineMusicTransitionPostSwapHoldMs = prefersReducedMotion
    ? 0
    : INLINE_MUSIC_TRANSITION_POST_SWAP_HOLD_MS;
  const inlineMusicTransitionRevealDurationMs = prefersReducedMotion
    ? REDUCED_MOTION_DURATION_MS
    : INLINE_MUSIC_TRANSITION_REVEAL_DURATION_MS;

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
        const progressLoadResult =
          await loadPlayerProgressForReader(progressStorageKey);
        const storedProgress = progressLoadResult.progress;

        if (progressLoadResult.warning) {
          console.warn(progressLoadResult.warning);
        }

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
        const initialBoundaryState = loadedRuntime.bundle
          ? getChapterOpeningBoundaryState({
              chapter: loadedRuntime.bundle.chapter,
              reason: storedProgress ? "resume" : "initial-entry"
            })
          : null;
        setManifest(loadedRuntime.manifest);
        setBundle(loadedRuntime.bundle);
        setReaderState(loadedRuntime.readerState);
        setSceneBackgroundMusicTrackId(
          resolveReaderStateSceneBackgroundMusicTrackId({
            bundle: loadedRuntime.bundle,
            state: loadedRuntime.readerState
          })
        );
        setPendingSceneState(null);
        setPendingInSceneMusicTransition(null);
        setBoundaryState(initialBoundaryState);
        setBranchFlags(
          reconcileCatNameBranchFlags({
            branchFlags: storedProgress?.branchFlags ?? {},
            catName: initialCatNameState.catName,
            catNameLocked: initialCatNameState.catNameLocked
          })
        );
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
    initialCatNameState.catName,
    initialCatNameState.catNameLocked,
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
    const manifestForResume = initialManifest;
    let cancelled = false;

    async function resolveInitialResume() {
      if (!manifestForResume.firstChapterId) {
        setIsPersistenceReady(true);
        return;
      }

      setIsResolvingResume(true);
      setError(null);

      try {
        const progressLoadResult =
          await loadPlayerProgressForReader(progressStorageKey);

        if (cancelled) {
          return;
        }

        if (progressLoadResult.warning) {
          console.warn(progressLoadResult.warning);
        }

        const storedProgress = progressLoadResult.progress;
        const resumeAction = decidePlayerResumeAction({
          initialBundle,
          storedProgress
        });

        setBranchFlags(
          reconcileCatNameBranchFlags({
            branchFlags: resumeAction.branchFlags,
            catName: initialCatNameState.catName,
            catNameLocked: initialCatNameState.catNameLocked
          })
        );

        if (resumeAction.type === "use-initial-state") {
          setBoundaryState(
            initialBundle
              ? getChapterOpeningBoundaryState({
                  chapter: initialBundle.chapter,
                  reason: "initial-entry"
                })
              : null
          );
          setIsPersistenceReady(true);
          return;
        }

        if (resumeAction.type === "resume-from-initial-bundle") {
          previousNormalEntryRef.current = null;
          setReaderState(resumeAction.readerState);
          setSceneBackgroundMusicTrackId(
            resolveReaderStateSceneBackgroundMusicTrackId({
              bundle: initialBundle,
              state: resumeAction.readerState
            })
          );
          setPendingSceneState(null);
          setPendingInSceneMusicTransition(null);
          setBoundaryState(null);
          setIsPersistenceReady(true);
          return;
        }

        const loadedRuntime = await loadPlayerRuntimeSession({
          manifestPath,
          supabaseUrl,
          progress: storedProgress,
          initialManifest: manifestForResume,
          loadChapter: loadBundle
        });

        if (cancelled) {
          return;
        }

        previousNormalEntryRef.current = null;
        const resumedBoundaryState = loadedRuntime.bundle
          ? getChapterOpeningBoundaryState({
              chapter: loadedRuntime.bundle.chapter,
              reason: "resume"
            })
          : null;
        setManifest(loadedRuntime.manifest);
        setBundle(loadedRuntime.bundle);
        setReaderState(loadedRuntime.readerState);
        setSceneBackgroundMusicTrackId(
          resolveReaderStateSceneBackgroundMusicTrackId({
            bundle: loadedRuntime.bundle,
            state: loadedRuntime.readerState
          })
        );
        setPendingSceneState(null);
        setPendingInSceneMusicTransition(null);
        setBoundaryState(resumedBoundaryState);
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
      } finally {
        if (cancelled) {
          return;
        }

        setIsResolvingResume(false);
      }
    }

    void resolveInitialResume();

    return () => {
      cancelled = true;
    };
  }, [
    initialCatNameState.catName,
    initialCatNameState.catNameLocked,
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
  const hasPlayableSceneReady = Boolean(scene && entry);
  const resolvedSceneBackgroundMusicTrackId = useMemo(
    () =>
      resolveSceneBackgroundMusicTrackId({
        scene,
        dialogueIndex: readerState?.dialogueIndex ?? null
      }),
    [readerState?.dialogueIndex, scene]
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    setBranchFlags((currentValue) => {
      return applySceneDressCarrySelection({
        scene,
        branchFlags: currentValue
      });
    });
  }, [scene]);

  useEffect(() => {
    if (pendingInSceneMusicTransition) {
      return;
    }

    setSceneBackgroundMusicTrackId((currentValue) =>
      currentValue === resolvedSceneBackgroundMusicTrackId
        ? currentValue
        : resolvedSceneBackgroundMusicTrackId
    );
  }, [pendingInSceneMusicTransition, resolvedSceneBackgroundMusicTrackId]);

  useEffect(() => {
    const storedCatName =
      typeof branchFlags[CAT_NAME_BRANCH_FLAG_KEY] === "string"
        ? normalizeCatNameInput(String(branchFlags[CAT_NAME_BRANCH_FLAG_KEY]))
        : null;
    const storedCatNameLocked =
      branchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY] === true;

    if (!storedCatName || storedCatName.length === 0) {
      return;
    }

    setCatName((currentValue) =>
      currentValue && currentValue.length > 0 ? currentValue : storedCatName
    );
    setCatNameInputValue((currentValue) =>
      currentValue && currentValue.length > 0 ? currentValue : storedCatName
    );

    if (storedCatNameLocked) {
      setIsCatNameLocked(true);
    }
  }, [branchFlags]);

  const runtimeAvailability = getRuntimeAvailability({
    manifest,
    bundle,
    readerState,
    scene,
    entry
  });
  const effectiveActiveSceneBranchFlags = useMemo(
    () =>
      applySceneDressCarrySelection({
        scene,
        branchFlags
      }),
    [branchFlags, scene]
  );
  const pendingScene = useMemo(
    () =>
      bundle && pendingSceneState
        ? getCurrentScene(bundle.chapter, pendingSceneState)
        : null,
    [bundle, pendingSceneState]
  );
  const effectivePendingSceneBranchFlags = useMemo(
    () =>
      applySceneDressCarrySelection({
        scene: pendingScene,
        branchFlags
      }),
    [branchFlags, pendingScene]
  );
  const activeAssetUrls = useMemo(
    () =>
      getPlayerRuntimeAssetUrls({
        supabaseUrl,
        bundle,
        readerState,
        branchFlags: effectiveActiveSceneBranchFlags
      }),
    [bundle, effectiveActiveSceneBranchFlags, readerState, supabaseUrl]
  );
  const activeSceneAssetUrls = useMemo(
    () =>
      getPlayerRuntimeSceneAssetUrls({
        supabaseUrl,
        bundle,
        readerState,
        branchFlags: effectiveActiveSceneBranchFlags
      }),
    [bundle, effectiveActiveSceneBranchFlags, readerState, supabaseUrl]
  );
  const pendingSceneAssetUrls = useMemo(
    () =>
      getPlayerRuntimeSceneAssetUrls({
        supabaseUrl,
        bundle,
        readerState: pendingSceneState,
        branchFlags: effectivePendingSceneBranchFlags
      }),
    [bundle, effectivePendingSceneBranchFlags, pendingSceneState, supabaseUrl]
  );
  const resolvedSceneBackgroundMusic = useMemo(
    () => findSceneBackgroundMusicById(scene, sceneBackgroundMusicTrackId),
    [scene, sceneBackgroundMusicTrackId]
  );
  const backgroundImageUrl = activeAssetUrls.backgroundImageUrl;
  const chapterOpeningCardState =
    boundaryState?.type === "chapter-opening-card" ? boundaryState : null;
  const chapterEndingCardState =
    boundaryState?.type === "chapter-ending-card" ? boundaryState : null;
  const pendingSceneBackgroundMusicUrl = useMemo(() => {
    const pendingSceneBackgroundMusicTrackId =
      pendingSceneState && bundle
        ? resolveReaderStateSceneBackgroundMusicTrackId({
            bundle,
            state: pendingSceneState
          })
        : null;
    const pendingSceneBackgroundMusic = findSceneBackgroundMusicById(
      pendingScene,
      pendingSceneBackgroundMusicTrackId
    );

    return toPublicStorageUrl(
      supabaseUrl,
      pendingSceneBackgroundMusic?.filePath ?? null
    );
  }, [bundle, pendingScene, pendingSceneState, supabaseUrl]);
  const backgroundMusicUrl = useMemo(() => {
    if (chapterEndingCardState) {
      return toPublicStorageUrl(
        supabaseUrl,
        chapterEndingCardState.backgroundMusicFilePath
      );
    }

    return toPublicStorageUrl(
      supabaseUrl,
      resolvedSceneBackgroundMusic?.filePath ?? null
    );
  }, [
    chapterEndingCardState,
    resolvedSceneBackgroundMusic?.filePath,
    supabaseUrl
  ]);
  const hasDelayedEndingCardBackgroundMusicIntro = Boolean(
    chapterEndingCardState?.backgroundMusicFilePath && backgroundMusicUrl
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
  const queueInSceneMusicTransition = useCallback(
    (
      nextState: ReaderState,
      nextBundle: RuntimeChapterBundle | null = bundle
    ) => {
      if (!bundle || !readerState || !nextBundle) {
        return false;
      }

      if (nextBundle.chapter.id !== bundle.chapter.id) {
        return false;
      }

      if (nextState.sceneIndex !== readerState.sceneIndex) {
        return false;
      }

      const currentScene =
        bundle.chapter.scenes[readerState.sceneIndex] ?? null;
      const nextScene = nextBundle.chapter.scenes[nextState.sceneIndex] ?? null;

      if (!currentScene || !nextScene || currentScene.id !== nextScene.id) {
        return false;
      }

      const currentTrackId = resolveSceneBackgroundMusicTrackId({
        scene: currentScene,
        dialogueIndex: readerState.dialogueIndex
      });
      const nextTrackId = resolveSceneBackgroundMusicTrackId({
        scene: nextScene,
        dialogueIndex: nextState.dialogueIndex
      });

      if (currentTrackId === nextTrackId) {
        return false;
      }

      setPendingSceneState(null);
      setPendingEndingCardTransition(null);
      setPendingInSceneMusicTransition({
        state: nextState,
        sceneBackgroundMusicTrackId: nextTrackId
      });
      setBoundaryState(null);
      return true;
    },
    [bundle, readerState]
  );

  useEffect(() => {
    if (!isPersistenceReady) {
      return;
    }

    persistCachedPlayerProgress(progressStorageKey, storedProgress);

    if (!storedProgress) {
      return;
    }

    void saveServerPlayerProgress(storedProgress).catch((caughtError) => {
      console.warn(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save backend player progress."
      );
    });
  }, [isPersistenceReady, progressStorageKey, storedProgress]);

  useEffect(() => {
    if (!bundle?.nextChapterId || !manifest) {
      return;
    }

    void loadBundle(manifest, bundle.nextChapterId).catch(() => undefined);
  }, [bundle?.nextChapterId, loadBundle, manifest]);

  useEffect(() => {
    if (typeof window === "undefined" || activeSceneAssetUrls.length === 0) {
      return;
    }

    void preloadSceneImageUrls(activeSceneAssetUrls);
  }, [activeSceneAssetUrls]);

  useEffect(() => {
    if (boundaryState?.type !== "chapter-opening-card") {
      return;
    }

    hasPlayedOpeningSceneFadeRef.current = false;
    setOpeningSceneFadePhase("pending");
  }, [boundaryState]);

  useEffect(() => {
    if (
      boundaryState?.type !== "chapter-opening-card" ||
      openingSceneFadePhase !== "covering-chapter-card"
    ) {
      return;
    }

    let cancelled = false;

    const runChapterOpeningCover = async () => {
      await waitForDuration(sceneTransitionCoverDurationMs);

      if (cancelled) {
        return;
      }

      setBoundaryState((current) =>
        current?.type === "chapter-opening-card" ? null : current
      );
      setOpeningSceneFadePhase("pending");
    };

    void runChapterOpeningCover();

    return () => {
      cancelled = true;
    };
  }, [boundaryState, openingSceneFadePhase, sceneTransitionCoverDurationMs]);

  useEffect(() => {
    if (
      hasPlayedOpeningSceneFadeRef.current ||
      openingSceneFadePhase !== "pending" ||
      !hasPlayableSceneReady ||
      isLoading ||
      isResolvingResume ||
      boundaryState
    ) {
      return;
    }

    let cancelled = false;

    const preloadPromise = Promise.race([
      preloadSceneImageUrls(activeSceneAssetUrls),
      waitForDuration(SCENE_TRANSITION_ASSET_TIMEOUT_MS)
    ]);

    const runOpeningSceneFade = async () => {
      await Promise.all([
        preloadPromise,
        waitForDuration(sceneTransitionMinimumBlackoutMs)
      ]);

      if (cancelled) {
        return;
      }

      setOpeningSceneFadePhase("revealing");
    };

    void runOpeningSceneFade();

    return () => {
      cancelled = true;
    };
  }, [
    activeSceneAssetUrls,
    boundaryState,
    hasPlayableSceneReady,
    isLoading,
    isResolvingResume,
    sceneTransitionMinimumBlackoutMs,
    openingSceneFadePhase
  ]);

  useEffect(() => {
    if (openingSceneFadePhase !== "revealing") {
      return;
    }

    let cancelled = false;

    const finishOpeningSceneFade = async () => {
      await waitForDuration(openingSceneFadeDurationMs);

      if (cancelled) {
        return;
      }

      hasPlayedOpeningSceneFadeRef.current = true;
      setOpeningSceneFadePhase("hidden");
    };

    void finishOpeningSceneFade();

    return () => {
      cancelled = true;
    };
  }, [openingSceneFadeDurationMs, openingSceneFadePhase]);

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

    if (
      !audio ||
      !backgroundMusicUrl ||
      isResolvingResume ||
      hasDelayedEndingCardBackgroundMusicIntro
    ) {
      return;
    }

    restartBackgroundMusic(audio);
  }, [
    backgroundMusicUrl,
    hasDelayedEndingCardBackgroundMusicIntro,
    isResolvingResume
  ]);

  useEffect(() => {
    const audio = audioRef.current;

    if (
      !audio ||
      !backgroundMusicUrl ||
      !hasDelayedEndingCardBackgroundMusicIntro ||
      isResolvingResume
    ) {
      return;
    }

    let cancelled = false;

    audio.pause();
    audio.currentTime = 0;
    audio.volume = ENDING_CARD_BACKGROUND_MUSIC_START_VOLUME;

    const runIntro = async () => {
      await waitForDuration(endingCardBackgroundMusicDelayMs);

      if (cancelled) {
        return;
      }

      audio.currentTime = 0;
      void audio.play().catch(() => undefined);

      await fadeBackgroundMusicTo(audio, 1, endingCardBackgroundMusicFadeInMs);
    };

    void runIntro();

    return () => {
      cancelled = true;
    };
  }, [
    backgroundMusicUrl,
    endingCardBackgroundMusicDelayMs,
    endingCardBackgroundMusicFadeInMs,
    hasDelayedEndingCardBackgroundMusicIntro,
    isResolvingResume
  ]);

  const activeScene = scene;
  const activeEntry = entry;
  const activeChapterCard = chapterOpeningCardState ?? chapterEndingCardState;
  const isTerminalChapterEndingCard =
    chapterEndingCardState?.nextState.type === "story-finished";
  const chapterCardRevealPlan = useMemo(
    () =>
      createChapterCardRevealPlan({
        text: activeChapterCard?.text ?? "",
        reducedMotion: prefersReducedMotion,
        enablePauseMarker: activeChapterCard?.type === "chapter-ending-card",
        minimumTypingDurationMs: 520,
        typingDurationMultiplier: CHAPTER_CARD_TYPING_DURATION_MULTIPLIER
      }),
    [activeChapterCard, prefersReducedMotion]
  );
  const chapterCardText = chapterCardRevealPlan.displayText;
  const resolvedDialogueText = useMemo(
    () => resolveDialogueTextTemplate(activeEntry?.text ?? "", catName),
    [activeEntry?.text, catName]
  );
  const textCharacters = useMemo(
    () => Array.from(resolvedDialogueText),
    [resolvedDialogueText]
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
      ? (dressPromptOptions[
          Math.min(dressPromptIndex, dressPromptOptions.length - 1)
        ] ?? null)
      : null;
  const leftCharacterImageUrl = activeAssetUrls.leftCharacterImageUrl;
  const rightCharacterImageUrl = activeAssetUrls.rightCharacterImageUrl;
  const isSceneTransition = boundaryState?.type === "scene-transition";
  const isEndingCardTransition = Boolean(pendingEndingCardTransition);
  const chapterBreakState =
    boundaryState?.type === "chapter-break" ? boundaryState : null;
  const storyFinishedState =
    boundaryState?.type === "story-finished" ? boundaryState : null;
  const isTransitionCard = Boolean(isSceneTransition || isEndingCardTransition);
  const isChapterCard = Boolean(activeChapterCard);
  const isChapterBreakCard = Boolean(chapterBreakState);
  const isStoryFinishedCard = Boolean(storyFinishedState);
  const isInteractiveChapterCard =
    Boolean(activeChapterCard) && !isTerminalChapterEndingCard;
  const chapterCardAriaLabel = chapterOpeningCardState
    ? `Chapter opening for ${chapterOpeningCardState.chapterTitle}`
    : chapterEndingCardState
      ? `Chapter ending for ${chapterEndingCardState.chapterTitle}`
      : "Chapter card";
  const showOpeningSceneFade =
    openingSceneFadePhase !== "hidden" &&
    (!isChapterCard || openingSceneFadePhase === "covering-chapter-card");
  const isOpeningSceneRevealActive = showOpeningSceneFade && !isChapterCard;
  const sceneTransitionLeadOutMs = prefersReducedMotion
    ? 0
    : lineExitDurationMs;
  const sceneTransitionBackgroundMusicFadeOutMs = prefersReducedMotion
    ? 0
    : sceneTransitionLeadOutMs + sceneTransitionCoverDurationMs;
  const endingCardTransitionBackgroundMusicFadeOutMs = prefersReducedMotion
    ? 0
    : sceneTransitionLeadOutMs + endingCardTransitionCoverDurationMs;
  const showSceneTransitionOverlay = sceneTransitionOverlayPhase !== "hidden";
  const sceneTransitionOverlayKey = pendingInSceneMusicTransition
    ? `inline-music-transition-${pendingInSceneMusicTransition.state.sceneIndex}-${pendingInSceneMusicTransition.state.dialogueIndex}-${pendingInSceneMusicTransition.sceneBackgroundMusicTrackId ?? "silence"}`
    : pendingSceneState
      ? `scene-transition-${pendingSceneState.sceneIndex}-${pendingSceneState.dialogueIndex}`
      : pendingEndingCardTransition
        ? `ending-card-transition-${pendingEndingCardTransition.boundaryState.chapterId}`
        : "scene-transition-overlay";
  const sceneTransitionOverlayOpacity =
    sceneTransitionOverlayPhase === "revealing" ? 0 : 1;
  const sceneTransitionOverlayDurationMs =
    sceneTransitionOverlayPhase === "revealing"
      ? sceneTransitionOverlayProfile === "inline-music"
        ? inlineMusicTransitionRevealDurationMs
        : sceneTransitionRevealDurationMs
      : sceneTransitionOverlayProfile === "inline-music"
        ? inlineMusicTransitionCoverDurationMs
        : sceneTransitionOverlayProfile === "ending-card"
          ? endingCardTransitionCoverDurationMs
          : sceneTransitionCoverDurationMs;
  const sceneTransitionOverlayEase =
    sceneTransitionOverlayPhase === "revealing"
      ? MOTION_EASE_IN
      : MOTION_EASE_OUT;
  const showDialogueCard =
    Boolean(activeEntry) &&
    !isTransitionCard &&
    !isChapterCard &&
    !isChapterBreakCard &&
    !isStoryFinishedCard &&
    !isOpeningSceneRevealActive;
  const activeTypedSurfaceId = activeChapterCard
    ? `${activeChapterCard.type}:${activeChapterCard.chapterId}`
    : showDialogueCard && activeEntry
      ? activeEntry.id
      : null;
  const lineMotionConfig = activeEntry
    ? getLineMotionConfig(activeEntry)
    : null;
  const dialogueCardPlacement = activeEntry
    ? getDialogueCardPlacement(activeEntry)
    : "center";
  const dialogueCardPositionClassName = getDialogueCardPositionClassName({
    placement: dialogueCardPlacement,
    isCatNamePrompt: activeEntry?.speaker.type === "cat_name_prompt"
  });
  const dialogueCardVariants = lineMotionConfig
    ? createDirectionalVariants({
        direction: lineMotionConfig.cardDirection,
        reducedMotion: prefersReducedMotion,
        enterDurationMs: lineEnterDurationMs,
        exitDurationMs: lineExitDurationMs,
        enterDelayMs: lineEnterDelayMs
      })
    : null;
  const hideStagePortraits =
    isTransitionCard || isChapterCard || isOpeningSceneRevealActive;
  const leftStagePortrait =
    activeEntry &&
    !hideStagePortraits &&
    activeEntry.speaker.type !== "cat_name_prompt"
      ? createVisibleStagePortrait({
          stageCharacter: activeEntry.stage.left,
          imageUrl: leftCharacterImageUrl,
          direction: "from-left"
        })
      : null;
  const rightStagePortrait =
    activeEntry && !hideStagePortraits
      ? createVisibleStagePortrait({
          stageCharacter:
            activeEntry.speaker.type === "cat_name_prompt"
              ? getCatNamePromptRightStageCharacter(activeEntry)
              : activeEntry.stage.right,
          imageUrl: rightCharacterImageUrl,
          direction: "from-right"
        })
      : null;
  const dialogueTextNodes = useMemo(() => {
    if (!activeEntry) {
      return null;
    }

    if (prefersReducedMotion) {
      return resolvedDialogueText;
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
    resolvedDialogueText,
    textCharacters,
    visibleTextLength
  ]);
  const canCompleteTyping =
    Boolean(activeTypedSurfaceId) &&
    !prefersReducedMotion &&
    presentationPhase === "typing";
  const showDressPromptOptions =
    showDialogueCard &&
    presentationPhase === "ready" &&
    activeEntry?.speaker.type === "dress_prompt";
  const showCatNamePromptInput =
    showDialogueCard &&
    presentationPhase === "ready" &&
    activeEntry?.speaker.type === "cat_name_prompt" &&
    !isCatNameLocked;
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
  const activeDialogueIndex = readerState?.dialogueIndex ?? -1;
  const activeSceneDialogues = activeScene?.dialogue ?? [];
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
    if (activeEntry?.speaker.type !== "cat_name_prompt") {
      setCatNameInputError(null);
      return;
    }

    setCatNameInputValue(catName ?? "");
    setCatNameInputError(null);
  }, [activeEntry?.id, activeEntry?.speaker.type, catName]);

  useEffect(() => {
    if (!boundaryState || !pendingCatNameSync || isSavingCatName) {
      return;
    }

    let cancelled = false;

    setIsSavingCatName(true);

    void fetch("/api/player/cat-name", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        catName: pendingCatNameSync
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to persist cat name.");
        }
      })
      .then(() => {
        if (cancelled) {
          return;
        }

        setPendingCatNameSync(null);
      })
      .catch(() => {
        // Keep pending sync queued for the next transition.
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsSavingCatName(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boundaryState, isSavingCatName, pendingCatNameSync]);

  useEffect(() => {
    if (!pendingInSceneMusicTransition) {
      return;
    }

    let cancelled = false;
    const backgroundMusicFadeOutPromise = fadeOutBackgroundMusic(
      audioRef.current,
      inlineMusicTransitionLeadOutMs + inlineMusicTransitionCoverDurationMs
    );

    const runTransition = async () => {
      await waitForDuration(inlineMusicTransitionLeadOutMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayProfile("inline-music");
      setSceneTransitionOverlayPhase("covering");

      await Promise.all([
        backgroundMusicFadeOutPromise,
        waitForDuration(inlineMusicTransitionCoverDurationMs)
      ]);

      if (cancelled) {
        return;
      }

      await waitForDuration(inlineMusicTransitionMinimumBlackoutMs);

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setSceneBackgroundMusicTrackId(
          pendingInSceneMusicTransition.sceneBackgroundMusicTrackId
        );
        setReaderState(pendingInSceneMusicTransition.state);
      });

      await waitForDuration(inlineMusicTransitionPostSwapHoldMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayPhase("revealing");

      await waitForDuration(inlineMusicTransitionRevealDurationMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayPhase("hidden");
      setPendingInSceneMusicTransition(null);
    };

    void runTransition();

    return () => {
      cancelled = true;
    };
  }, [
    inlineMusicTransitionCoverDurationMs,
    inlineMusicTransitionLeadOutMs,
    inlineMusicTransitionMinimumBlackoutMs,
    inlineMusicTransitionPostSwapHoldMs,
    inlineMusicTransitionRevealDurationMs,
    pendingInSceneMusicTransition
  ]);

  useEffect(() => {
    if (!isSceneTransition || !pendingSceneState) {
      return;
    }

    let cancelled = false;
    const shouldFadeOutBackgroundMusic =
      Boolean(backgroundMusicUrl) &&
      backgroundMusicUrl !== pendingSceneBackgroundMusicUrl;

    const preloadPromise = Promise.race([
      preloadSceneImageUrls(pendingSceneAssetUrls),
      waitForDuration(SCENE_TRANSITION_ASSET_TIMEOUT_MS)
    ]);
    const backgroundMusicFadeOutPromise = shouldFadeOutBackgroundMusic
      ? fadeOutBackgroundMusic(
          audioRef.current,
          sceneTransitionBackgroundMusicFadeOutMs
        )
      : Promise.resolve();

    const runTransition = async () => {
      await waitForDuration(sceneTransitionLeadOutMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayProfile("scene");
      setSceneTransitionOverlayPhase("covering");

      await Promise.all([
        backgroundMusicFadeOutPromise,
        waitForDuration(sceneTransitionCoverDurationMs)
      ]);

      if (cancelled) {
        return;
      }

      await Promise.all([
        preloadPromise,
        waitForDuration(sceneTransitionMinimumBlackoutMs)
      ]);

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setSceneBackgroundMusicTrackId(
          resolveReaderStateSceneBackgroundMusicTrackId({
            bundle,
            state: pendingSceneState
          })
        );
        setReaderState(pendingSceneState);
      });

      await waitForDuration(sceneTransitionPostSwapHoldMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayPhase("revealing");

      await waitForDuration(sceneTransitionRevealDurationMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayPhase("hidden");
      setPendingSceneState(null);
      setPendingInSceneMusicTransition(null);
      setBoundaryState((current) =>
        current?.type === "scene-transition" ? null : current
      );
    };

    void runTransition();

    return () => {
      cancelled = true;
    };
  }, [
    backgroundMusicUrl,
    bundle,
    isSceneTransition,
    pendingSceneState,
    sceneTransitionLeadOutMs,
    pendingSceneBackgroundMusicUrl,
    pendingSceneAssetUrls,
    sceneTransitionBackgroundMusicFadeOutMs,
    sceneTransitionCoverDurationMs,
    sceneTransitionMinimumBlackoutMs,
    sceneTransitionPostSwapHoldMs,
    sceneTransitionRevealDurationMs
  ]);

  useEffect(() => {
    if (!pendingEndingCardTransition) {
      return;
    }

    let cancelled = false;
    const backgroundMusicFadeOutPromise = fadeOutBackgroundMusic(
      audioRef.current,
      endingCardTransitionBackgroundMusicFadeOutMs
    );

    const runTransition = async () => {
      await waitForDuration(sceneTransitionLeadOutMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayProfile("ending-card");
      setSceneTransitionOverlayPhase("covering");

      await Promise.all([
        backgroundMusicFadeOutPromise,
        waitForDuration(endingCardTransitionCoverDurationMs)
      ]);

      if (cancelled) {
        return;
      }

      await waitForDuration(endingCardTransitionMinimumBlackoutMs);

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setBundle(pendingEndingCardTransition.bundle);
        setReaderState(pendingEndingCardTransition.state);
        setSceneBackgroundMusicTrackId(
          resolveReaderStateSceneBackgroundMusicTrackId({
            bundle: pendingEndingCardTransition.bundle,
            state: pendingEndingCardTransition.state
          })
        );
        setBoundaryState(pendingEndingCardTransition.boundaryState);
      });

      await waitForDuration(endingCardTransitionPostSwapHoldMs);

      if (cancelled) {
        return;
      }

      setSceneTransitionOverlayPhase("hidden");
      setPendingInSceneMusicTransition(null);
      setPendingEndingCardTransition(null);
    };

    void runTransition();

    return () => {
      cancelled = true;
    };
  }, [
    endingCardTransitionBackgroundMusicFadeOutMs,
    endingCardTransitionCoverDurationMs,
    endingCardTransitionMinimumBlackoutMs,
    endingCardTransitionPostSwapHoldMs,
    pendingEndingCardTransition,
    sceneTransitionLeadOutMs
  ]);

  useLayoutEffect(() => {
    if (!activeTypedSurfaceId) {
      setChapterCardRevealProgress(0);
      return;
    }

    setLineEnterDelayMs(
      activeChapterCard
        ? 0
        : showDialogueCard && activeEntry && previousShowDialogueCardRef.current
          ? getLineEnterDelayMs({
              currentEntry: activeEntry,
              previousEntry: previousNormalEntryRef.current,
              reducedMotion: prefersReducedMotion
            })
          : 0
    );

    if (activeChapterCard) {
      setVisibleTextLength(0);
      setChapterCardRevealProgress(prefersReducedMotion ? 1 : 0);
    } else {
      setVisibleTextLength(prefersReducedMotion ? textCharacters.length : 0);
      setChapterCardRevealProgress(0);
    }

    setPresentationPhase(prefersReducedMotion ? "ready" : "entering");

    if (showDialogueCard && activeEntry) {
      previousNormalEntryRef.current = activeEntry;
    }
  }, [
    activeChapterCard,
    activeEntry,
    activeTypedSurfaceId,
    prefersReducedMotion,
    showDialogueCard,
    textCharacters.length
  ]);

  useEffect(() => {
    previousShowDialogueCardRef.current = showDialogueCard;
  }, [showDialogueCard]);

  useEffect(() => {
    if (
      !activeTypedSurfaceId ||
      prefersReducedMotion ||
      presentationPhase !== "entering"
    ) {
      return;
    }

    const timer = window.setTimeout(
      () => {
        setPresentationPhase("typing");
      },
      activeChapterCard
        ? CHAPTER_CARD_TEXT_APPEAR_DELAY_MS
        : lineEnterDelayMs + lineEnterDurationMs
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeChapterCard,
    lineEnterDelayMs,
    lineEnterDurationMs,
    prefersReducedMotion,
    presentationPhase,
    activeTypedSurfaceId
  ]);

  useEffect(() => {
    if (
      activeChapterCard ||
      !activeTypedSurfaceId ||
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
    activeChapterCard,
    activeTypedSurfaceId,
    prefersReducedMotion,
    presentationPhase,
    textCharacters,
    visibleTextLength
  ]);

  useEffect(() => {
    if (
      activeChapterCard ||
      !activeTypedSurfaceId ||
      prefersReducedMotion ||
      presentationPhase !== "typing" ||
      visibleTextLength < textCharacters.length
    ) {
      return;
    }

    setPresentationPhase("ready");
  }, [
    activeChapterCard,
    activeTypedSurfaceId,
    prefersReducedMotion,
    presentationPhase,
    textCharacters.length,
    visibleTextLength
  ]);

  useEffect(() => {
    if (
      !activeChapterCard ||
      prefersReducedMotion ||
      presentationPhase !== "typing"
    ) {
      return;
    }

    let startTime: number | null = null;
    let frameId = 0;

    const tick = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const nextProgress = Math.min(
        1,
        getChapterCardRevealProgress({
          elapsedMs: timestamp - startTime,
          plan: chapterCardRevealPlan
        })
      );

      setChapterCardRevealProgress(nextProgress);

      if (nextProgress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    activeChapterCard,
    chapterCardRevealPlan,
    prefersReducedMotion,
    presentationPhase
  ]);

  useEffect(() => {
    if (
      !activeChapterCard ||
      prefersReducedMotion ||
      presentationPhase !== "typing" ||
      chapterCardRevealProgress < 1
    ) {
      return;
    }

    setPresentationPhase("ready");
  }, [
    activeChapterCard,
    chapterCardRevealProgress,
    prefersReducedMotion,
    presentationPhase
  ]);

  const handleShowTapHeader = useCallback(() => {
    setIsTapHeaderVisible(true);
  }, []);

  const handleCompleteTyping = useCallback(() => {
    if (!canCompleteTyping) {
      return;
    }

    if (activeChapterCard) {
      setChapterCardRevealProgress(1);
    } else {
      setVisibleTextLength(textCharacters.length);
    }

    setPresentationPhase("ready");
  }, [activeChapterCard, canCompleteTyping, textCharacters.length]);

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

    if (!boundaryState) {
      const firstPlayableState = findFirstPlayableReaderState(bundle.chapter);
      const openingBoundaryState =
        firstPlayableState &&
        firstPlayableState.sceneIndex === readerState.sceneIndex &&
        firstPlayableState.dialogueIndex === readerState.dialogueIndex
          ? getChapterOpeningBoundaryState({
              chapter: bundle.chapter,
              reason: "backtrack"
            })
          : null;

      if (openingBoundaryState) {
        setIsTapHeaderVisible(false);
        setPendingSceneState(null);
        setPendingInSceneMusicTransition(null);
        setBoundaryState(openingBoundaryState);
        return;
      }
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
        setPendingInSceneMusicTransition(null);
        setBoundaryState(null);

        if (
          resolvedRetreat.type === "line" ||
          resolvedRetreat.type === "scene-transition"
        ) {
          if (queueInSceneMusicTransition(resolvedRetreat.state)) {
            return;
          }

          setSceneBackgroundMusicTrackId(
            resolveReaderStateSceneBackgroundMusicTrackId({
              bundle,
              state: resolvedRetreat.state
            })
          );
          setReaderState(resolvedRetreat.state);
          return;
        }

        if (resolvedRetreat.type === "chapter-return") {
          setBundle(resolvedRetreat.bundle);
          setSceneBackgroundMusicTrackId(
            resolveReaderStateSceneBackgroundMusicTrackId({
              bundle: resolvedRetreat.bundle,
              state: resolvedRetreat.state
            })
          );
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
  }, [
    boundaryState,
    bundle,
    isLoadingChapter,
    loadBundle,
    manifest,
    queueInSceneMusicTransition,
    readerState
  ]);

  const commitJumpToScene = useCallback(
    (targetBundle: RuntimeChapterBundle, sceneIndex: number) => {
      setPendingSceneState(null);
      setPendingInSceneMusicTransition(null);
      setBoundaryState(null);
      setBundle(targetBundle);
      const nextState = {
        sceneIndex,
        dialogueIndex: 0,
        isChapterComplete: false
      };
      setSceneBackgroundMusicTrackId(
        resolveReaderStateSceneBackgroundMusicTrackId({
          bundle: targetBundle,
          state: nextState
        })
      );
      setReaderState(nextState);
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

  const handleJumpToDialogue = useCallback(
    (dialogueIndex: number) => {
      if (isLoadingChapter || !bundle || !readerState) {
        return;
      }

      const targetScene = bundle.chapter.scenes[readerState.sceneIndex];
      const targetDialogue = targetScene?.dialogue[dialogueIndex];

      if (!targetDialogue) {
        return;
      }

      setIsTapHeaderVisible(false);

      startTransition(() => {
        const nextState = {
          ...readerState,
          dialogueIndex,
          isChapterComplete: false
        };

        if (queueInSceneMusicTransition(nextState)) {
          return;
        }

        setPendingSceneState(null);
        setPendingInSceneMusicTransition(null);
        setBoundaryState(null);
        setSceneBackgroundMusicTrackId(
          resolveReaderStateSceneBackgroundMusicTrackId({
            bundle,
            state: nextState
          })
        );
        setReaderState(nextState);
      });
    },
    [bundle, isLoadingChapter, queueInSceneMusicTransition, readerState]
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
      const nextBoundaryState = resolveBoundaryAdvance({
        boundaryState,
        currentChapter: bundle?.chapter ?? null
      });

      if (nextBoundaryState !== boundaryState) {
        setPendingSceneState(null);
        setPendingInSceneMusicTransition(null);
        setBoundaryState(nextBoundaryState);
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
          if (queueInSceneMusicTransition(resolvedAdvance.state)) {
            return;
          }

          setPendingSceneState(null);
          setPendingInSceneMusicTransition(null);
          setBoundaryState(null);
          setSceneBackgroundMusicTrackId(
            resolveReaderStateSceneBackgroundMusicTrackId({
              bundle,
              state: resolvedAdvance.state
            })
          );
          setReaderState(resolvedAdvance.state);
          return;
        }

        if (resolvedAdvance.type === "scene-transition") {
          setPendingInSceneMusicTransition(null);
          setPendingSceneState(resolvedAdvance.state);
          setBoundaryState(resolvedAdvance.boundaryState);
          return;
        }

        if (resolvedAdvance.type === "chapter-break") {
          if (resolvedAdvance.boundaryState.type === "chapter-ending-card") {
            setPendingSceneState(null);
            setPendingInSceneMusicTransition(null);
            setPendingEndingCardTransition({
              bundle: resolvedAdvance.bundle,
              state: resolvedAdvance.state,
              boundaryState: resolvedAdvance.boundaryState
            });
            setBoundaryState(null);
            return;
          }

          setPendingSceneState(null);
          setPendingInSceneMusicTransition(null);
          setBundle(resolvedAdvance.bundle);
          setSceneBackgroundMusicTrackId(
            resolveReaderStateSceneBackgroundMusicTrackId({
              bundle: resolvedAdvance.bundle,
              state: resolvedAdvance.state
            })
          );
          setReaderState(resolvedAdvance.state);
          setBoundaryState(resolvedAdvance.boundaryState);
          return;
        }

        if (resolvedAdvance.boundaryState.type === "chapter-ending-card") {
          setPendingSceneState(null);
          setPendingInSceneMusicTransition(null);
          setPendingEndingCardTransition({
            bundle,
            state: readerState,
            boundaryState: resolvedAdvance.boundaryState
          });
          setBoundaryState(null);
          return;
        }

        setPendingSceneState(null);
        setPendingInSceneMusicTransition(null);
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
    queueInSceneMusicTransition,
    presentationPhase,
    readerState
  ]);

  const handleChapterCardClick = useCallback(() => {
    if (!activeChapterCard) {
      return;
    }

    if (canCompleteTyping) {
      handleCompleteTyping();
      return;
    }

    if (presentationPhase !== "ready") {
      return;
    }

    if (chapterOpeningCardState) {
      if (openingSceneFadePhase !== "pending") {
        return;
      }

      resumePausedBackgroundMusic(audioRef.current);
      setIsTapHeaderVisible(false);
      setOpeningSceneFadePhase("covering-chapter-card");
      return;
    }

    void handleAdvance();
  }, [
    activeChapterCard,
    canCompleteTyping,
    chapterOpeningCardState,
    handleAdvance,
    handleCompleteTyping,
    openingSceneFadePhase,
    presentationPhase
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

  const handleCatNameSubmit = useCallback(async () => {
    if (
      isLoadingChapter ||
      presentationPhase !== "ready" ||
      !entry ||
      entry.speaker.type !== "cat_name_prompt" ||
      isCatNameLocked
    ) {
      return;
    }

    const normalizedCatName = normalizeCatNameInput(catNameInputValue);

    if (
      normalizedCatName.length < MIN_CAT_NAME_LENGTH ||
      normalizedCatName.length > MAX_CAT_NAME_LENGTH
    ) {
      setCatNameInputError(
        `Cat name must be ${MIN_CAT_NAME_LENGTH}-${MAX_CAT_NAME_LENGTH} characters.`
      );
      return;
    }

    if (!CAT_NAME_PATTERN.test(normalizedCatName)) {
      setCatNameInputError(
        "Cat name may contain only letters, numbers, spaces, and . , ' _ - characters."
      );
      return;
    }

    setCatNameInputError(null);
    setCatName(normalizedCatName);
    setIsCatNameLocked(true);
    setPendingCatNameSync(normalizedCatName);
    setBranchFlags((currentValue) => ({
      ...currentValue,
      [CAT_NAME_BRANCH_FLAG_KEY]: normalizedCatName,
      [CAT_NAME_LOCKED_BRANCH_FLAG_KEY]: true
    }));

    await handleAdvance();
  }, [
    catNameInputValue,
    entry,
    handleAdvance,
    isCatNameLocked,
    isLoadingChapter,
    presentationPhase
  ]);

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
  const resolvedSpeakerName =
    resolvedEntry.speaker.type === "character"
      ? resolveDialogueTextTemplate(
          resolvedEntry.speaker.characterName,
          catName
        )
      : null;

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
      {showDesktopSceneNavigation ? (
        <aside
          className="absolute right-0 top-0 z-30 hidden h-full items-start px-3 py-3 lg:flex"
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
                Dialogues
              </p>
            </div>

            <div className="mt-3 border-b border-white/10 pb-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                {activeChapterIndex >= 0
                  ? `Scene ${readerState ? readerState.sceneIndex + 1 : 1}`
                  : "Active Scene"}
              </p>
              <p className="mt-1 truncate text-sm text-slate-200">
                {activeScene?.title ?? "Untitled scene"}
              </p>
            </div>

            <div className="mt-3 space-y-2 overflow-y-auto">
              {activeSceneDialogues.map((dialogueItem, dialogueIndex) => {
                const isDialogueActive = dialogueIndex === activeDialogueIndex;

                return (
                  <button
                    key={dialogueItem.id}
                    onClick={() => handleJumpToDialogue(dialogueIndex)}
                    type="button"
                    disabled={isLoadingChapter}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      isDialogueActive
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100"
                    } disabled:cursor-default disabled:opacity-45`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                        D {dialogueIndex + 1}
                      </span>
                      <span className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-400">
                        {getDialogueNavSpeakerLabel(dialogueItem, catName)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-100/90">
                      {dialogueItem.text}
                    </p>
                  </button>
                );
              })}
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
              resolvedScene.backgroundImage?.altText ??
              resolvedScene.backgroundImage?.label ??
              resolvedScene.title
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
            {showOpeningSceneFade ? (
              <motion.div
                key="opening-scene-fade"
                initial={{
                  opacity:
                    openingSceneFadePhase === "covering-chapter-card" ? 0 : 1
                }}
                animate={{
                  opacity: openingSceneFadePhase === "revealing" ? 0 : 1
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration:
                    openingSceneFadePhase === "covering-chapter-card"
                      ? sceneTransitionCoverDurationMs / 1000
                      : openingSceneFadePhase === "revealing"
                        ? openingSceneFadeDurationMs / 1000
                        : 0,
                  ease: MOTION_EASE_OUT
                }}
                className="pointer-events-none absolute inset-0 z-30 bg-black will-change-opacity"
              />
            ) : null}
            {showSceneTransitionOverlay ? (
              <motion.div
                key={sceneTransitionOverlayKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: sceneTransitionOverlayOpacity }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: sceneTransitionOverlayDurationMs / 1000,
                  ease: sceneTransitionOverlayEase
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
                <div className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    onClick={handleOpenMap}
                    type="button"
                    aria-label="Open world map"
                    className="inline-flex h-11 w-11 items-center justify-center bg-transparent text-slate-100 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <span aria-hidden className="material-symbols-outlined">
                      map
                    </span>
                  </button>
                  <form action={signOutPlayerAction}>
                    <button
                      type="submit"
                      aria-label="Sign out"
                      className="inline-flex h-11 w-11 items-center justify-center bg-transparent text-slate-100 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    >
                      <span aria-hidden className="material-symbols-outlined">
                        logout
                      </span>
                    </button>
                  </form>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {isChapterCard ? (
            <div className="absolute inset-0 z-20 bg-black">
              {isInteractiveChapterCard ? (
                <button
                  onClick={handleChapterCardClick}
                  type="button"
                  aria-label={chapterCardAriaLabel}
                  className="flex h-full w-full items-center justify-center px-6 py-10 text-center"
                >
                  <div className="mx-auto max-w-full">
                    <ChapterCardHandwriting
                      text={chapterCardText}
                      progress={
                        prefersReducedMotion ||
                        presentationPhase === "ready" ||
                        presentationPhase === "exiting"
                          ? 1
                          : chapterCardRevealProgress
                      }
                    />
                  </div>
                </button>
              ) : (
                <div
                  aria-label={chapterCardAriaLabel}
                  className="flex h-full w-full items-center justify-center px-6 py-10 text-center"
                >
                  <div className="mx-auto max-w-full">
                    <ChapterCardHandwriting
                      text={chapterCardText}
                      progress={
                        prefersReducedMotion ||
                        presentationPhase === "ready" ||
                        presentationPhase === "exiting"
                          ? 1
                          : chapterCardRevealProgress
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {isChapterBreakCard ? (
            <div className="absolute inset-x-0 top-0 z-20 p-3 md:p-5">
              <div className="rounded-[28px] border border-white/10 bg-slate-950/82 p-5 backdrop-blur">
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
              </div>
            </div>
          ) : null}

          {isStoryFinishedCard ? (
            <div className="absolute inset-0 z-20 bg-black" />
          ) : null}

          {showDialogueCard ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
              <AnimatePresence mode="wait">
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
                          resolvedSpeakerName?.trim().toLowerCase() === "ocnoer"
                            ? "font-character-name text-4xl leading-none text-slate-300"
                            : "text-sm uppercase tracking-[0.2em] text-slate-400"
                        }
                      >
                        {resolvedSpeakerName}
                      </p>
                    </div>
                  ) : resolvedEntry.speaker.type === "cat_name_prompt" ? (
                    <div className="mb-4">
                      <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                        Name your cat
                      </p>
                    </div>
                  ) : null}

                  {resolvedEntry.speaker.type === "cat_name_prompt" &&
                  (showCatNamePromptInput || isLoadingChapter) ? null : (
                    <p
                      className={`min-h-[3.5rem] text-slate-100 ${
                        resolvedEntry.speaker.type === "dress_prompt"
                          ? "font-dress-prompt text-center text-[2.4rem] leading-[1.15] md:text-[2.8rem]"
                          : "font-dialogue text-base leading-7 md:text-lg md:leading-8"
                      }`}
                    >
                      {dialogueTextNodes}
                    </p>
                  )}

                  {showCatNamePromptInput ? (
                    <div className="space-y-3">
                      <input
                        id={`cat-name-input-${resolvedEntry.id}`}
                        aria-label="Cat name"
                        value={catNameInputValue}
                        onChange={(event) => {
                          setCatNameInputValue(event.target.value);
                          setCatNameInputError(null);
                        }}
                        maxLength={MAX_CAT_NAME_LENGTH}
                        className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-slate-100 outline-none transition focus:border-white/35 focus:ring-2 focus:ring-white/20"
                      />

                      {catNameInputError ? (
                        <p className="text-sm text-rose-300">
                          {catNameInputError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

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
                                  void handleDressSelect(
                                    selectedDressPromptOption.key
                                  )
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
                            {dressPromptIndex + 1} of{" "}
                            {dressPromptOptions.length}
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
                        className={
                          showContinueButton ? undefined : "pointer-events-none"
                        }
                      >
                        <button
                          onClick={() => {
                            if (
                              activeEntry?.speaker.type === "cat_name_prompt" &&
                              !isCatNameLocked
                            ) {
                              void handleCatNameSubmit();
                              return;
                            }

                            void handleAdvance();
                          }}
                          disabled={isLoadingChapter || !showContinueButton}
                          tabIndex={showContinueButton ? 0 : -1}
                          type="button"
                          aria-label={
                            isLoadingChapter
                              ? "Loading next line"
                              : activeEntry?.speaker.type ===
                                    "cat_name_prompt" && !isCatNameLocked
                                ? "Set cat name"
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

function preloadSceneImageUrls(imageUrls: string[]) {
  return Promise.all(
    imageUrls.map((imageUrl) => preloadImageUrl(imageUrl))
  ).then(() => undefined);
}

function preloadImageUrl(imageUrl: string) {
  if (typeof window === "undefined" || imageUrl.length === 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const preloadedImage = new window.Image();
    let settled = false;

    const settle = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };
    const handleLoad = () => {
      if (typeof preloadedImage.decode === "function") {
        void preloadedImage.decode().then(settle).catch(settle);
        return;
      }

      settle();
    };

    preloadedImage.loading = "eager";
    preloadedImage.decoding = "async";

    if ("fetchPriority" in preloadedImage) {
      preloadedImage.fetchPriority = "high";
    }

    preloadedImage.addEventListener("load", handleLoad, { once: true });
    preloadedImage.addEventListener("error", settle, { once: true });
    preloadedImage.src = imageUrl;

    if (preloadedImage.complete) {
      if (preloadedImage.naturalWidth > 0) {
        handleLoad();
      } else {
        settle();
      }
    }
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
      boundaryState: createBoundaryStateForAdvance({
        manifest: input.manifest,
        currentChapter: input.bundle.chapter,
        action: {
          type: "scene-transition"
        }
      })
    };
  }

  if (result.type === "chapter-break") {
    return {
      type: "chapter-break",
      bundle: result.bundle,
      state: result.state,
      boundaryState: createBoundaryStateForAdvance({
        manifest: input.manifest,
        currentChapter: input.bundle.chapter,
        action: {
          type: "chapter-break",
          nextChapter: result.bundle.chapter
        }
      })
    };
  }

  return {
    type: "story-finished",
    boundaryState: createBoundaryStateForAdvance({
      manifest: input.manifest,
      currentChapter: input.bundle.chapter,
      action: {
        type: "story-finished"
      }
    })
  };
}
