import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CAT_NAME_BRANCH_FLAG_KEY,
  CAT_NAME_LOCKED_BRANCH_FLAG_KEY,
  advanceRuntimePosition,
  applySceneDressCarrySelection,
  createBoundaryStateForAdvance,
  createStoredProgress,
  decidePlayerResumeAction,
  findPreviousPlayableReaderState,
  getCurrentDialogue,
  getCurrentScene,
  getChapterOpeningBoundaryState,
  getDressBranchFlagKey,
  getPlayerRuntimeChapterAssetRefs,
  normalizeCatNameInput,
  reconcileCatNameBranchFlags,
  resolveBoundaryAdvance,
  resolveInitialCatNameState,
  retreatRuntimePosition,
  validateCatNameInput,
  type PlayerBoundaryState,
  type PlayerProgress,
  type PlayerRuntimeBootstrap,
  type ReaderState,
  type RuntimeChapterBundle,
  type RuntimeManifest
} from "@ocnoer/story-core";

import type { MobilePlayer } from "../api/playerSessionTypes";
import type { MobileRuntimeConfig } from "../config/runtime";
import { createMobileRuntimeRepository } from "../runtime/runtimeRepository";
import { loadProgressByPlayerId } from "../storage/playerProgressStorage";
import { saveSyncedPlayerProgress } from "../sync/playerProgressSync";
import { createNativeReaderBoundaryPresentation } from "./boundaryPresentation";
import {
  READER_ASSET_RENDER_CACHE_VERSION,
  dumpReaderAssetRenderModes,
  ensureChapterAssetsReady,
  ensureSceneAssetsReady,
  getAssetCacheErrorMessage,
  getSelectedReaderAssetDerivativeMetadata,
  isReaderPerfDiagnosticsEnabled,
  verifyReaderPortraitDerivativeUrls,
  warmNextSceneAssets
} from "./imagePreload";
import { NATIVE_READER_DIALOGUE_ADVANCE_COMMIT_DELAY_MS } from "./nativeReaderDialogueMotion";
import {
  createNativeReaderPresentation,
  getNativeReaderChapterPortraitAuditEntries,
  type NativeReaderPresentation
} from "./readerPresentation";

type NativeReaderRuntimeState =
  | {
      status: "loading";
    }
  | {
      status: "error";
      message: string;
    }
  | {
      status: "unavailable";
      message: string;
      manifest: RuntimeManifest;
    }
  | {
      status: "ready";
      manifest: RuntimeManifest;
      bundle: RuntimeChapterBundle;
      readerState: ReaderState;
    }
  | {
      status: "finished";
      manifest: RuntimeManifest;
      bundle: RuntimeChapterBundle;
      readerState: ReaderState;
    };

type ActiveNativeReaderRuntimeState = Extract<
  NativeReaderRuntimeState,
  { status: "ready" | "finished" }
>;

type RuntimeAdvanceResult = Awaited<ReturnType<typeof advanceRuntimePosition>>;

type NativeReaderAdvanceTarget = {
  result: RuntimeAdvanceResult;
  targetBundle: RuntimeChapterBundle | null;
  targetKey: string | null;
  targetPresentation: NativeReaderPresentation | null;
  targetState: ReaderState | null;
};

type PreparedNativeReaderPresentation = {
  key: string;
  presentation: NativeReaderPresentation;
  readyAt: number;
};

type NativeReaderAdvanceReadiness =
  | {
      status: "idle";
      sourceKey: string | null;
      targetKey: string | null;
      reason?: string;
    }
  | {
      status: "pending";
      sourceKey: string;
      targetKey: string | null;
      startedAt: number;
    }
  | {
      status: "ready";
      sourceKey: string;
      targetKey: string | null;
      readyAt: number;
    }
  | {
      status: "error";
      sourceKey: string;
      targetKey: string | null;
      message: string;
    };

export type NativeReaderSceneTransitionPhase =
  | "idle"
  | "covering"
  | "blackout"
  | "revealing";

type UseNativeReaderControllerInput = {
  bootstrap: PlayerRuntimeBootstrap;
  config: MobileRuntimeConfig;
  player: MobilePlayer;
  sessionToken: string;
  onProgressSaved?: () => void;
  waitForSceneTransitionAudioStart?: (input: {
    boundaryState: PlayerBoundaryState | null;
    bundle: RuntimeChapterBundle | null;
    readerState: ReaderState | null;
  }) => Promise<void>;
  onUpdateCatName: (catName: string) => Promise<MobilePlayer>;
};

type NativeReaderPresentationUsage = {
  dialogueEntryId: string;
  presentationKey: string;
  sceneId: string;
};

type InFlightCatNameCommit = {
  catName: string;
  promise: Promise<MobilePlayer>;
};

const PRESENTATION_READY_CACHE_LIMIT = 6;
const PRESENTATION_LOOKAHEAD_DEPTH = 2;
export const NATIVE_SCENE_TRANSITION_COVER_MS = 900;
export const NATIVE_SCENE_TRANSITION_MIN_BLACKOUT_MS = 2000;
export const NATIVE_SCENE_TRANSITION_POST_COMMIT_HOLD_MS = 380;
export const NATIVE_SCENE_TRANSITION_REVEAL_MS = 880;

function waitForDuration(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function logReaderTiming(message: string, details?: Record<string, unknown>) {
  if (!isReaderPerfDiagnosticsEnabled()) {
    return;
  }

  if (details) {
    console.info(`[reader-timing] ${message}`, details);
    return;
  }

  console.info(`[reader-timing] ${message}`);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function createNativeReaderPresentationReadinessKey(
  presentation: NativeReaderPresentation
) {
  return stableJson({
    version: 1,
    assetRenderVersion: READER_ASSET_RENDER_CACHE_VERSION,
    backgroundImageUrl: presentation.backgroundImageUrl,
    blockingAssets: presentation.blockingAssetRefs.map((assetRef) => ({
      assetId: assetRef.assetId ?? null,
      cacheKey: assetRef.cacheKey,
      contentType:
        "contentType" in assetRef ? (assetRef.contentType ?? null) : null,
      derivatives:
        "derivatives" in assetRef ? (assetRef.derivatives ?? []) : [],
      renderKind:
        "renderKind" in assetRef ? (assetRef.renderKind ?? null) : null,
      role: assetRef.role,
      selectedDerivative:
        assetRef.role === "portrait"
          ? getSelectedReaderAssetDerivativeMetadata(assetRef)
          : null,
      stagePlacement:
        "stagePlacement" in assetRef ? (assetRef.stagePlacement ?? null) : null,
      storagePath: assetRef.storagePath,
      url: assetRef.url
    })),
    branchFlags: presentation.effectiveBranchFlags,
    chapterId: presentation.chapterId,
    dialogueCardPlacement: presentation.dialogueCardPlacement,
    dialogueEntryId: presentation.dialogueEntryId,
    dialogueIndex: presentation.dialogueIndex,
    dressOptions:
      presentation.status === "supported"
        ? presentation.dressOptions.map((option) => ({
            key: option.key,
            previewImageUrl: option.previewImageUrl
          }))
        : [],
    entryType: presentation.entryType,
    leftPortrait: presentation.leftPortrait
      ? {
          imageUrl: presentation.leftPortrait.imageUrl,
          key: presentation.leftPortrait.key,
          side: presentation.leftPortrait.side
        }
      : null,
    renderModeVersion: READER_ASSET_RENDER_CACHE_VERSION,
    rightPortrait: presentation.rightPortrait
      ? {
          imageUrl: presentation.rightPortrait.imageUrl,
          key: presentation.rightPortrait.key,
          side: presentation.rightPortrait.side
        }
      : null,
    sceneId: presentation.sceneId,
    speakerId: presentation.speakerId,
    speakerName:
      presentation.status === "supported" ? presentation.speakerName : null,
    speakerStatus: presentation.speakerStatus,
    status: presentation.status
  });
}

function getAdvanceTargetBundleAndState(input: {
  currentRuntimeState: ActiveNativeReaderRuntimeState;
  result: RuntimeAdvanceResult;
}) {
  if (input.result.type === "story-finished") {
    return {
      bundle: null,
      state: null
    };
  }

  return {
    bundle:
      input.result.type === "chapter-break"
        ? input.result.bundle
        : input.currentRuntimeState.bundle,
    state: input.result.state
  };
}

export async function computeNativeReaderNextAdvanceTarget(input: {
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
  currentRuntimeState: ActiveNativeReaderRuntimeState;
  loadChapter: Parameters<typeof advanceRuntimePosition>[0]["loadChapter"];
  supabaseUrl: string;
}): Promise<NativeReaderAdvanceTarget> {
  const result = await advanceRuntimePosition({
    manifest: input.currentRuntimeState.manifest,
    bundle: input.currentRuntimeState.bundle,
    state: input.currentRuntimeState.readerState,
    loadChapter: input.loadChapter
  });
  const target = getAdvanceTargetBundleAndState({
    currentRuntimeState: input.currentRuntimeState,
    result
  });
  const targetPresentation =
    target.bundle && target.state
      ? createNativeReaderPresentation({
          supabaseUrl: input.supabaseUrl,
          bundle: target.bundle,
          readerState: target.state,
          branchFlags: input.branchFlags,
          catName: input.catName
        })
      : null;

  return {
    result,
    targetBundle: target.bundle,
    targetKey: targetPresentation
      ? createNativeReaderPresentationReadinessKey(targetPresentation)
      : null,
    targetPresentation,
    targetState: target.state
  };
}

export async function computeNativeReaderAdvanceTargets(input: {
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
  currentRuntimeState: ActiveNativeReaderRuntimeState;
  depth?: number;
  loadChapter: Parameters<typeof advanceRuntimePosition>[0]["loadChapter"];
  supabaseUrl: string;
}) {
  const targets: NativeReaderAdvanceTarget[] = [];
  let currentRuntimeState = input.currentRuntimeState;

  for (
    let index = 0;
    index < (input.depth ?? PRESENTATION_LOOKAHEAD_DEPTH);
    index += 1
  ) {
    const target = await computeNativeReaderNextAdvanceTarget({
      branchFlags: input.branchFlags,
      catName: input.catName,
      currentRuntimeState,
      loadChapter: input.loadChapter,
      supabaseUrl: input.supabaseUrl
    });

    targets.push(target);

    if (!target.targetBundle || !target.targetState) {
      break;
    }

    currentRuntimeState = {
      status: "ready",
      manifest: currentRuntimeState.manifest,
      bundle: target.targetBundle,
      readerState: target.targetState
    };
  }

  return targets;
}

export function resolveNativeReaderAdvanceCommitPlan(input: {
  targetKey: string | null;
  targetRenderReady: boolean;
}) {
  if (!input.targetKey || input.targetRenderReady) {
    return {
      type: "commit-instant" as const
    };
  }

  return {
    reason: "target-presentation-not-render-ready" as const,
    type: "blocked-until-render-ready" as const
  };
}

export function getNativeReaderProgressBranchFlags(input: {
  branchFlags: PlayerProgress["branchFlags"];
  pendingCatNameCommit: string | null;
}) {
  if (!input.pendingCatNameCommit) {
    return input.branchFlags;
  }

  const nextBranchFlags = { ...input.branchFlags };

  delete nextBranchFlags[CAT_NAME_BRANCH_FLAG_KEY];
  delete nextBranchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY];

  return nextBranchFlags;
}

function shouldPersistPendingCatNameForAdvanceResult(
  result: RuntimeAdvanceResult
) {
  return result.type === "chapter-break" || result.type === "story-finished";
}

export async function commitNativeReaderAdvanceAfterPresentationGate(input: {
  commit: () => void;
  commitDelayMs?: number;
  ensureRenderReady: () => Promise<void>;
  now?: () => number;
  targetKey: string | null;
  targetRenderReady: boolean;
  wait?: (durationMs: number) => Promise<void>;
}) {
  const plan = resolveNativeReaderAdvanceCommitPlan({
    targetKey: input.targetKey,
    targetRenderReady: input.targetRenderReady
  });

  if (plan.type === "commit-instant") {
    const waitDurationMs = Math.max(0, input.commitDelayMs ?? 0);

    if (waitDurationMs > 0) {
      await (input.wait ?? waitForDuration)(waitDurationMs);
    }

    input.commit();
    return {
      commitMode: "instant" as const,
      waitDurationMs
    };
  }

  return {
    commitMode: "blocked" as const,
    reason: plan.reason,
    waitDurationMs: 0
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createUnavailableState(
  manifest: RuntimeManifest
): NativeReaderRuntimeState {
  if (!manifest.firstChapterId) {
    return {
      status: "unavailable",
      manifest,
      message: "The opening chapter has not been published yet."
    };
  }

  return {
    status: "unavailable",
    manifest,
    message: "No playable dialogue is available in the published runtime."
  };
}

function createReadyState(input: {
  manifest: RuntimeManifest;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
}): NativeReaderRuntimeState {
  if (!input.bundle || !input.readerState) {
    return createUnavailableState(input.manifest);
  }

  return {
    status: "ready",
    manifest: input.manifest,
    bundle: input.bundle,
    readerState: input.readerState
  };
}

function getInitialBoundaryState(input: {
  bundle: RuntimeChapterBundle | null;
  storedProgress: PlayerProgress | null;
  resumeActionType: ReturnType<typeof decidePlayerResumeAction>["type"];
}) {
  if (!input.bundle) {
    return null;
  }

  return getChapterOpeningBoundaryState({
    chapter: input.bundle.chapter,
    reason:
      input.resumeActionType === "use-initial-state" && !input.storedProgress
        ? "initial-entry"
        : "resume"
  });
}

function getChapterIndex(manifest: RuntimeManifest, chapterId: string) {
  return manifest.chapters.findIndex((chapter) => chapter.id === chapterId);
}

async function ensureNativeReaderPresentationAssets(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle;
  readerState: ReaderState;
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
}) {
  const presentation = createNativeReaderPresentation(input);

  if (!presentation) {
    return;
  }

  const result = await ensureSceneAssetsReady(
    presentation.sceneId,
    presentation.blockingAssetRefs
  );
  const errorMessage = getAssetCacheErrorMessage(result);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  void warmNextSceneAssets(presentation.sceneId, presentation.preloadAssetRefs);
}

export async function ensureNativeReaderPresentationRenderReady(input: {
  presentation: NativeReaderPresentation;
  priority?: "high" | "medium" | "low";
  reason: "initial" | "lookahead" | "tap-wait";
}) {
  const startedAt = Date.now();
  const readinessKey = createNativeReaderPresentationReadinessKey(
    input.presentation
  );

  logReaderTiming("next presentation warm started", {
    dialogueEntryId: input.presentation.dialogueEntryId,
    key: readinessKey,
    reason: input.reason,
    sceneId: input.presentation.sceneId
  });

  const result = await ensureSceneAssetsReady(
    input.presentation.dialogueEntryId,
    input.presentation.blockingAssetRefs,
    input.priority ?? "high"
  );
  const errorMessage = getAssetCacheErrorMessage(result);

  logReaderTiming("next presentation file ready", {
    assetCount: result.assets.length,
    dialogueEntryId: input.presentation.dialogueEntryId,
    durationMs: result.durationMs,
    key: readinessKey,
    reason: input.reason,
    status: result.status
  });

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  logReaderTiming("next presentation render-ready", {
    dialogueEntryId: input.presentation.dialogueEntryId,
    durationMs: Date.now() - startedAt,
    key: readinessKey,
    reason: input.reason
  });
}

function getNativeReaderChapterPresentationUsage(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle;
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
}) {
  const usageByAssetUrl = new Map<string, NativeReaderPresentationUsage[]>();

  input.bundle.chapter.scenes.forEach((scene, sceneIndex) => {
    scene.dialogue.forEach((dialogueEntry, dialogueIndex) => {
      const presentation = createNativeReaderPresentation({
        supabaseUrl: input.supabaseUrl,
        bundle: input.bundle,
        readerState: {
          sceneIndex,
          dialogueIndex,
          isChapterComplete: false
        },
        branchFlags: input.branchFlags,
        catName: input.catName
      });

      if (!presentation) {
        return;
      }

      const presentationKey =
        createNativeReaderPresentationReadinessKey(presentation);

      presentation.blockingAssetRefs
        .filter((assetRef) => assetRef.role === "portrait")
        .forEach((assetRef) => {
          const existing = usageByAssetUrl.get(assetRef.url) ?? [];

          existing.push({
            dialogueEntryId: dialogueEntry.id,
            presentationKey,
            sceneId: scene.id
          });
          usageByAssetUrl.set(assetRef.url, existing);
        });
    });
  });

  return usageByAssetUrl;
}

function getPresentationReadinessStatus(input: {
  advanceReadiness: NativeReaderAdvanceReadiness;
  key: string;
  preparedPresentations: Map<string, PreparedNativeReaderPresentation>;
}) {
  if (input.preparedPresentations.has(input.key)) {
    return "ready" as const;
  }

  if (input.advanceReadiness.targetKey === input.key) {
    return input.advanceReadiness.status;
  }

  return "unknown" as const;
}

async function ensureReadyRuntimeStateAssets(input: {
  supabaseUrl: string;
  runtimeState: NativeReaderRuntimeState;
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
}) {
  if (
    input.runtimeState.status !== "ready" &&
    input.runtimeState.status !== "finished"
  ) {
    return;
  }

  await ensureNativeReaderPresentationAssets({
    supabaseUrl: input.supabaseUrl,
    bundle: input.runtimeState.bundle,
    readerState: input.runtimeState.readerState,
    branchFlags: input.branchFlags,
    catName: input.catName
  });

  void ensureChapterAssetsReady(
    input.runtimeState.bundle.chapter.id,
    getPlayerRuntimeChapterAssetRefs({
      supabaseUrl: input.supabaseUrl,
      bundle: input.runtimeState.bundle,
      branchFlags: input.branchFlags
    })
  );
}

async function ensureAdvanceResultAssets(input: {
  supabaseUrl: string;
  currentRuntimeState: ActiveNativeReaderRuntimeState;
  result: RuntimeAdvanceResult;
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
}) {
  if (input.result.type === "story-finished") {
    return;
  }

  await ensureNativeReaderPresentationAssets({
    supabaseUrl: input.supabaseUrl,
    bundle:
      input.result.type === "chapter-break"
        ? input.result.bundle
        : input.currentRuntimeState.bundle,
    readerState: input.result.state,
    branchFlags: input.branchFlags,
    catName: input.catName
  });
}

async function ensureRetreatResultAssets(input: {
  supabaseUrl: string;
  currentRuntimeState: ActiveNativeReaderRuntimeState;
  result: Awaited<ReturnType<typeof retreatRuntimePosition>>;
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
}) {
  if (input.result.type === "story-start") {
    return;
  }

  await ensureNativeReaderPresentationAssets({
    supabaseUrl: input.supabaseUrl,
    bundle:
      input.result.type === "chapter-return"
        ? input.result.bundle
        : input.currentRuntimeState.bundle,
    readerState: input.result.state,
    branchFlags: input.branchFlags,
    catName: input.catName
  });
}

export async function commitNativeReaderStateAfterAssetGate(input: {
  ensureAssets: () => Promise<void>;
  commit: () => void;
}) {
  await input.ensureAssets();
  input.commit();
}

export async function runNativeReaderSceneTransition(input: {
  afterCommit?: () => Promise<void>;
  commit: () => void;
  coverDurationMs?: number;
  minimumBlackoutMs?: number;
  postCommitHoldMs?: number;
  prepare: () => Promise<void>;
  revealDurationMs?: number;
  setPhase: (phase: NativeReaderSceneTransitionPhase) => void;
  wait?: (durationMs: number) => Promise<void>;
}) {
  const wait = input.wait ?? waitForDuration;
  const revealDurationMs =
    input.revealDurationMs ?? NATIVE_SCENE_TRANSITION_REVEAL_MS;

  input.setPhase("covering");
  await wait(input.coverDurationMs ?? NATIVE_SCENE_TRANSITION_COVER_MS);
  input.setPhase("blackout");

  try {
    await Promise.all([
      input.prepare(),
      wait(input.minimumBlackoutMs ?? NATIVE_SCENE_TRANSITION_MIN_BLACKOUT_MS)
    ]);
    input.commit();
    await Promise.all([
      wait(
        input.postCommitHoldMs ?? NATIVE_SCENE_TRANSITION_POST_COMMIT_HOLD_MS
      ),
      input.afterCommit?.() ?? Promise.resolve()
    ]);
    input.setPhase("revealing");
    await wait(revealDurationMs);
    input.setPhase("idle");
  } catch (error) {
    input.setPhase("revealing");
    await wait(revealDurationMs);
    input.setPhase("idle");
    throw error;
  }
}

export function canNativeReaderAdvanceWithReadiness(input: {
  advanceResultType: RuntimeAdvanceResult["type"] | null;
  presentationRenderKey: string | null;
  readinessSourceKey: string | null;
  readinessStatus: NativeReaderAdvanceReadiness["status"];
}) {
  if (!input.presentationRenderKey) {
    return false;
  }

  if (
    input.readinessStatus === "ready" &&
    input.readinessSourceKey === input.presentationRenderKey
  ) {
    return true;
  }

  return (
    (input.advanceResultType === "scene-transition" ||
      input.advanceResultType === "chapter-break") &&
    input.readinessStatus === "pending" &&
    input.readinessSourceKey === input.presentationRenderKey
  );
}

export function useNativeReaderController(
  input: UseNativeReaderControllerInput
) {
  const {
    bootstrap,
    config,
    onProgressSaved,
    onUpdateCatName,
    player,
    waitForSceneTransitionAudioStart
  } = input;
  const sessionToken = input.sessionToken;
  const repository = useMemo(
    () => createMobileRuntimeRepository(config),
    [config]
  );
  const initialCatNameStateRef = useRef(
    resolveInitialCatNameState({
      catName: player.catName,
      catNameLocked: player.catNameLocked
    })
  );
  const initialCatNameState = initialCatNameStateRef.current;
  const [runtimeState, setRuntimeState] = useState<NativeReaderRuntimeState>({
    status: "loading"
  });
  const [boundaryState, setBoundaryState] =
    useState<PlayerBoundaryState | null>(null);
  const [branchFlags, setBranchFlags] = useState<PlayerProgress["branchFlags"]>(
    {}
  );
  const [catName, setCatName] = useState<string | null>(
    initialCatNameState.catName
  );
  const [catNameInputValue, setCatNameInputValue] = useState(
    initialCatNameState.catName ?? ""
  );
  const [catNameInputError, setCatNameInputError] = useState<string | null>(
    null
  );
  const [pendingCatNameCommit, setPendingCatNameCommitState] = useState<
    string | null
  >(null);
  const [isSavingCatName, setIsSavingCatName] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [sceneTransitionPhase, setSceneTransitionPhase] =
    useState<NativeReaderSceneTransitionPhase>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [loadRequestId, setLoadRequestId] = useState(0);
  const [advanceReadiness, setAdvanceReadiness] =
    useState<NativeReaderAdvanceReadiness>({
      status: "idle",
      sourceKey: null,
      targetKey: null
    });
  const [advanceTargetPresentation, setAdvanceTargetPresentation] =
    useState<NativeReaderPresentation | null>(null);
  const preparedPresentationsRef = useRef(
    new Map<string, PreparedNativeReaderPresentation>()
  );
  const preparedAdvanceTargetsRef = useRef(
    new Map<string, NativeReaderAdvanceTarget>()
  );
  const inFlightPresentationWarmupsRef = useRef(
    new Map<string, Promise<PreparedNativeReaderPresentation>>()
  );
  const isAdvanceInFlightRef = useRef(false);
  const persistedCatNameRef = useRef(initialCatNameState.catName);
  const pendingCatNameCommitRef = useRef<string | null>(null);
  const inFlightCatNameCommitRef = useRef<InFlightCatNameCommit | null>(null);

  const setPendingCatNameCommit = useCallback((value: string | null) => {
    pendingCatNameCommitRef.current = value;
    setPendingCatNameCommitState(value);
  }, []);

  const reload = useCallback(() => {
    setLoadRequestId((currentValue) => currentValue + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadReader() {
      setRuntimeState({
        status: "loading"
      });
      setBoundaryState(null);
      setActionError(null);

      try {
        const storedProgress = await loadProgressByPlayerId(player.id);

        if (cancelled) {
          return;
        }

        const resumeAction = decidePlayerResumeAction({
          initialBundle: bootstrap.initialBundle,
          storedProgress
        });
        const nextBranchFlags = reconcileCatNameBranchFlags({
          branchFlags: resumeAction.branchFlags,
          catName: initialCatNameState.catName,
          catNameLocked: initialCatNameState.catNameLocked
        });

        setBranchFlags(nextBranchFlags);
        setCatName(initialCatNameState.catName);
        setCatNameInputValue(initialCatNameState.catName ?? "");
        setCatNameInputError(null);
        persistedCatNameRef.current = initialCatNameState.catName;
        setPendingCatNameCommit(null);
        inFlightCatNameCommitRef.current = null;

        if (resumeAction.type === "load-from-progress") {
          const loadedRuntime = await repository.loadSession({
            progress: storedProgress,
            initialManifest: bootstrap.initialManifest
          });

          if (cancelled) {
            return;
          }

          const nextRuntimeState = createReadyState({
            manifest: loadedRuntime.manifest,
            bundle: loadedRuntime.bundle,
            readerState: loadedRuntime.readerState
          });

          await ensureReadyRuntimeStateAssets({
            supabaseUrl: config.supabaseUrl,
            runtimeState: nextRuntimeState,
            branchFlags: nextBranchFlags,
            catName: initialCatNameState.catName
          });

          if (cancelled) {
            return;
          }

          setRuntimeState(nextRuntimeState);
          setBoundaryState(
            getInitialBoundaryState({
              bundle:
                nextRuntimeState.status === "ready"
                  ? nextRuntimeState.bundle
                  : loadedRuntime.bundle,
              storedProgress,
              resumeActionType: resumeAction.type
            })
          );
          return;
        }

        const nextRuntimeState = createReadyState({
          manifest: bootstrap.initialManifest,
          bundle: bootstrap.initialBundle,
          readerState:
            resumeAction.type === "resume-from-initial-bundle"
              ? resumeAction.readerState
              : bootstrap.initialReaderState
        });

        await ensureReadyRuntimeStateAssets({
          supabaseUrl: config.supabaseUrl,
          runtimeState: nextRuntimeState,
          branchFlags: nextBranchFlags,
          catName: initialCatNameState.catName
        });

        if (cancelled) {
          return;
        }

        setRuntimeState(nextRuntimeState);
        setBoundaryState(
          getInitialBoundaryState({
            bundle:
              nextRuntimeState.status === "ready"
                ? nextRuntimeState.bundle
                : bootstrap.initialBundle,
            storedProgress,
            resumeActionType: resumeAction.type
          })
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRuntimeState({
          status: "error",
          message: getErrorMessage(error, "Unable to load the native reader.")
        });
      }
    }

    void loadReader();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrap,
    config.supabaseUrl,
    initialCatNameState,
    player.id,
    loadRequestId,
    repository,
    setPendingCatNameCommit
  ]);

  const currentScene = useMemo(() => {
    if (runtimeState.status !== "ready" && runtimeState.status !== "finished") {
      return null;
    }

    return getCurrentScene(
      runtimeState.bundle.chapter,
      runtimeState.readerState
    );
  }, [runtimeState]);

  useEffect(() => {
    if (!currentScene) {
      return;
    }

    setBranchFlags((currentValue) =>
      applySceneDressCarrySelection({
        scene: currentScene,
        branchFlags: currentValue
      })
    );
  }, [currentScene?.id]);

  useEffect(() => {
    if (runtimeState.status !== "ready" && runtimeState.status !== "finished") {
      return;
    }

    const progressBranchFlags = getNativeReaderProgressBranchFlags({
      branchFlags,
      pendingCatNameCommit
    });
    const progress = createStoredProgress({
      chapter: runtimeState.bundle.chapter,
      state: runtimeState.readerState,
      branchFlags: progressBranchFlags
    });

    if (!progress) {
      return;
    }

    let cancelled = false;

    void saveSyncedPlayerProgress({
      playerId: player.id,
      token: sessionToken,
      progress
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setPersistenceError(result.warning);
        onProgressSaved?.();
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setPersistenceError(
          getErrorMessage(error, "Unable to save local progress.")
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    branchFlags,
    onProgressSaved,
    pendingCatNameCommit,
    player.id,
    runtimeState,
    sessionToken
  ]);

  const presentation = useMemo(() => {
    if (runtimeState.status !== "ready" && runtimeState.status !== "finished") {
      return null;
    }

    return createNativeReaderPresentation({
      supabaseUrl: config.supabaseUrl,
      bundle: runtimeState.bundle,
      readerState: runtimeState.readerState,
      branchFlags,
      catName
    });
  }, [branchFlags, catName, config.supabaseUrl, runtimeState]);

  const boundaryPresentation = useMemo(
    () =>
      createNativeReaderBoundaryPresentation({
        boundaryState,
        presentation
      }),
    [boundaryState, presentation]
  );

  const preloadImageUrls = useMemo(
    () => presentation?.preloadImageUrls ?? [],
    [presentation]
  );
  const preloadAssetRefs = useMemo(
    () => presentation?.preloadAssetRefs ?? [],
    [presentation]
  );
  const presentationRenderKey = useMemo(
    () =>
      presentation
        ? createNativeReaderPresentationReadinessKey(presentation)
        : null,
    [presentation]
  );

  useEffect(() => {
    if (!isReaderPerfDiagnosticsEnabled()) {
      return;
    }

    if (runtimeState.status !== "ready" && runtimeState.status !== "finished") {
      globalThis.__OCNOER_READER_DUMP_ASSET_RENDER_MODES = undefined;
      return;
    }

    globalThis.__OCNOER_READER_DUMP_ASSET_RENDER_MODES = async () => {
      const usageByAssetUrl = getNativeReaderChapterPresentationUsage({
        supabaseUrl: config.supabaseUrl,
        bundle: runtimeState.bundle,
        branchFlags,
        catName
      });
      const preparedPresentations = preparedPresentationsRef.current;
      const auditEntries = getNativeReaderChapterPortraitAuditEntries({
        supabaseUrl: config.supabaseUrl,
        bundle: runtimeState.bundle
      }).map((entry) => {
        const usages = usageByAssetUrl.get(entry.assetRef.url) ?? [];

        return {
          ...entry,
          presentationKeys: usages.map((usage) => usage.presentationKey),
          readinessByPresentationKey: usages.map((usage) => ({
            presentationKey: usage.presentationKey,
            dialogueEntryId: usage.dialogueEntryId,
            sceneId: usage.sceneId,
            status: getPresentationReadinessStatus({
              advanceReadiness,
              key: usage.presentationKey,
              preparedPresentations
            }),
            isImmediateNext:
              advanceReadiness.targetKey === usage.presentationKey,
            message:
              advanceReadiness.status === "error" &&
              advanceReadiness.targetKey === usage.presentationKey
                ? advanceReadiness.message
                : null
          }))
        };
      });
      const fallbackAssetRefs = getPlayerRuntimeChapterAssetRefs({
        supabaseUrl: config.supabaseUrl,
        bundle: runtimeState.bundle,
        branchFlags
      });
      const auditUrls = new Set(
        auditEntries.map((entry) => entry.assetRef.url)
      );
      const dump = dumpReaderAssetRenderModes(
        [
          ...auditEntries,
          ...fallbackAssetRefs.filter(
            (assetRef) => !auditUrls.has(assetRef.url)
          )
        ],
        {
          manifestPath: config.manifestPath,
          manifestGeneratedAt: runtimeState.manifest.generatedAt,
          chapterId: runtimeState.bundle.chapter.id,
          chapterGeneratedAt: runtimeState.bundle.generatedAt,
          staleRuntimeJson:
            runtimeState.manifest.generatedAt !==
            runtimeState.bundle.generatedAt
        }
      );

      return verifyReaderPortraitDerivativeUrls(dump);
    };

    return () => {
      globalThis.__OCNOER_READER_DUMP_ASSET_RENDER_MODES = undefined;
    };
  }, [
    advanceReadiness,
    branchFlags,
    catName,
    config.manifestPath,
    config.supabaseUrl,
    runtimeState
  ]);

  const rememberPreparedPresentation = useCallback(
    (preparedPresentation: PreparedNativeReaderPresentation) => {
      const cache = preparedPresentationsRef.current;

      cache.set(preparedPresentation.key, preparedPresentation);

      while (cache.size > PRESENTATION_READY_CACHE_LIMIT) {
        const oldestKey = cache.keys().next().value as string | undefined;

        if (!oldestKey) {
          break;
        }

        cache.delete(oldestKey);
      }
    },
    []
  );

  const getPreparedPresentation = useCallback((key: string | null) => {
    return key ? (preparedPresentationsRef.current.get(key) ?? null) : null;
  }, []);

  const rememberPreparedAdvanceTarget = useCallback(
    (sourceKey: string, target: NativeReaderAdvanceTarget | null) => {
      if (!target) {
        preparedAdvanceTargetsRef.current.delete(sourceKey);
        return;
      }

      const cache = preparedAdvanceTargetsRef.current;

      cache.set(sourceKey, target);

      while (cache.size > PRESENTATION_READY_CACHE_LIMIT) {
        const oldestKey = cache.keys().next().value as string | undefined;

        if (!oldestKey) {
          break;
        }

        cache.delete(oldestKey);
      }
    },
    []
  );

  const getPreparedAdvanceTarget = useCallback((sourceKey: string | null) => {
    return sourceKey
      ? (preparedAdvanceTargetsRef.current.get(sourceKey) ?? null)
      : null;
  }, []);

  const warmPresentation = useCallback(
    (
      targetPresentation: NativeReaderPresentation,
      reason: "initial" | "lookahead" | "tap-wait",
      priority: "high" | "medium" | "low" = "high"
    ) => {
      const key =
        createNativeReaderPresentationReadinessKey(targetPresentation);
      const preparedPresentation = getPreparedPresentation(key);

      if (preparedPresentation) {
        logReaderTiming("render/prewarm ready", {
          dialogueEntryId: targetPresentation.dialogueEntryId,
          key,
          reason,
          readyFromCache: true
        });
        return Promise.resolve(preparedPresentation);
      }

      const existingWarmup = inFlightPresentationWarmupsRef.current.get(key);

      if (existingWarmup) {
        return existingWarmup;
      }

      const warmup = ensureNativeReaderPresentationRenderReady({
        presentation: targetPresentation,
        priority,
        reason
      })
        .then(() => {
          const prepared: PreparedNativeReaderPresentation = {
            key,
            presentation: targetPresentation,
            readyAt: Date.now()
          };

          rememberPreparedPresentation(prepared);
          logReaderTiming("render/prewarm ready", {
            dialogueEntryId: targetPresentation.dialogueEntryId,
            key,
            reason,
            readyFromCache: false
          });
          return prepared;
        })
        .finally(() => {
          inFlightPresentationWarmupsRef.current.delete(key);
        });

      inFlightPresentationWarmupsRef.current.set(key, warmup);
      return warmup;
    },
    [getPreparedPresentation, rememberPreparedPresentation]
  );

  const warmAdvanceTargetsFromState = useCallback(
    async (input: {
      currentRuntimeState: ActiveNativeReaderRuntimeState;
      sourceKey: string;
    }) => {
      if (
        presentation?.status === "supported" &&
        (presentation.needsCatNameInput || presentation.needsDressSelection)
      ) {
        logReaderTiming("next presentation warm skipped", {
          reason: presentation.needsCatNameInput
            ? "cat-name-required"
            : "dress-selection-required",
          sourceKey: input.sourceKey
        });
        return [];
      }

      const targets = await computeNativeReaderAdvanceTargets({
        branchFlags,
        catName,
        currentRuntimeState: input.currentRuntimeState,
        depth: PRESENTATION_LOOKAHEAD_DEPTH,
        loadChapter: repository.loadChapter,
        supabaseUrl: config.supabaseUrl
      });

      return targets;
    },
    [
      branchFlags,
      catName,
      config.supabaseUrl,
      presentation,
      repository.loadChapter,
      warmPresentation
    ]
  );

  useEffect(() => {
    if (!presentation || !presentationRenderKey) {
      return;
    }

    rememberPreparedPresentation({
      key: presentationRenderKey,
      presentation,
      readyAt: Date.now()
    });
    logReaderTiming("current presentation committed", {
      dialogueEntryId: presentation.dialogueEntryId,
      key: presentationRenderKey,
      sceneId: presentation.sceneId
    });
  }, [presentation, presentationRenderKey, rememberPreparedPresentation]);

  useEffect(() => {
    if (
      !presentationRenderKey ||
      (runtimeState.status !== "ready" && runtimeState.status !== "finished")
    ) {
      setAdvanceTargetPresentation(null);
      return;
    }

    let cancelled = false;

    setAdvanceTargetPresentation(null);
    setAdvanceReadiness({
      status: "pending",
      sourceKey: presentationRenderKey,
      targetKey: null,
      startedAt: Date.now()
    });

    void warmAdvanceTargetsFromState({
      currentRuntimeState: runtimeState,
      sourceKey: presentationRenderKey
    })
      .then((targets) => {
        if (cancelled) {
          return;
        }

        const immediateTarget = targets[0] ?? null;
        const targetKey = immediateTarget?.targetKey ?? null;

        rememberPreparedAdvanceTarget(presentationRenderKey, immediateTarget);
        setAdvanceTargetPresentation(
          immediateTarget?.targetPresentation ?? null
        );

        setAdvanceReadiness({
          status: "pending",
          sourceKey: presentationRenderKey,
          targetKey,
          startedAt: Date.now()
        });

        if (!immediateTarget?.targetPresentation) {
          setAdvanceReadiness({
            status: "ready",
            sourceKey: presentationRenderKey,
            targetKey,
            readyAt: Date.now()
          });
          logReaderTiming("next arrow enabled", {
            key: presentationRenderKey,
            targetKey
          });
          return;
        }

        const warmups = targets.map((target) =>
          target.targetPresentation
            ? warmPresentation(
                target.targetPresentation,
                "lookahead",
                target === immediateTarget ? "high" : "medium"
              )
            : Promise.resolve(null)
        );

        void Promise.allSettled(warmups.slice(1));

        void warmups[0]
          ?.then(() => {
            if (cancelled) {
              return;
            }

            setAdvanceReadiness({
              status: "ready",
              sourceKey: presentationRenderKey,
              targetKey,
              readyAt: Date.now()
            });
            logReaderTiming("next arrow enabled", {
              key: presentationRenderKey,
              targetKey
            });
          })
          .catch((error) => {
            if (cancelled) {
              return;
            }

            setAdvanceReadiness({
              status: "error",
              sourceKey: presentationRenderKey,
              targetKey,
              message: getErrorMessage(
                error,
                "Unable to warm next presentation."
              )
            });
            logReaderTiming("next presentation warm failed", {
              message: getErrorMessage(
                error,
                "Unable to warm next presentation."
              ),
              sourceKey: presentationRenderKey,
              targetKey
            });
          });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setAdvanceReadiness({
          status: "error",
          sourceKey: presentationRenderKey,
          targetKey: null,
          message: getErrorMessage(error, "Unable to warm next presentation.")
        });
        logReaderTiming("next presentation warm failed", {
          message: getErrorMessage(error, "Unable to warm next presentation."),
          sourceKey: presentationRenderKey
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    presentationRenderKey,
    rememberPreparedAdvanceTarget,
    runtimeState,
    warmAdvanceTargetsFromState
  ]);

  const canRetreat = useMemo(() => {
    if (runtimeState.status === "finished") {
      return true;
    }

    if (runtimeState.status !== "ready") {
      return false;
    }

    if (
      findPreviousPlayableReaderState(
        runtimeState.bundle.chapter,
        runtimeState.readerState
      )
    ) {
      return true;
    }

    return (
      getChapterIndex(runtimeState.manifest, runtimeState.bundle.chapter.id) > 0
    );
  }, [runtimeState]);

  const canAdvance = useMemo(() => {
    if (!presentation || boundaryState || runtimeState.status === "finished") {
      return false;
    }

    if (presentation.status !== "supported") {
      return false;
    }

    if (presentation.needsCatNameInput || presentation.needsDressSelection) {
      return false;
    }

    if (!presentationRenderKey) {
      return false;
    }

    const advanceTarget = getPreparedAdvanceTarget(presentationRenderKey);
    return canNativeReaderAdvanceWithReadiness({
      advanceResultType: advanceTarget?.result.type ?? null,
      presentationRenderKey,
      readinessSourceKey: advanceReadiness.sourceKey,
      readinessStatus: advanceReadiness.status
    });
  }, [
    advanceReadiness,
    boundaryState,
    getPreparedAdvanceTarget,
    presentation,
    presentationRenderKey,
    runtimeState.status
  ]);

  const commitAdvanceResult = useCallback(
    (
      currentRuntimeState: ActiveNativeReaderRuntimeState,
      result: RuntimeAdvanceResult,
      options?: {
        showSceneTransitionBoundary?: boolean;
      }
    ) => {
      if (result.type === "story-finished") {
        const nextBoundaryState = createBoundaryStateForAdvance({
          manifest: currentRuntimeState.manifest,
          currentChapter: currentRuntimeState.bundle.chapter,
          action: {
            type: "story-finished"
          }
        });

        setRuntimeState({
          status: "finished",
          manifest: currentRuntimeState.manifest,
          bundle: currentRuntimeState.bundle,
          readerState: {
            ...currentRuntimeState.readerState,
            isChapterComplete: true
          }
        });
        setBoundaryState(nextBoundaryState);
        return;
      }

      if (result.type === "chapter-break") {
        const nextBoundaryState = createBoundaryStateForAdvance({
          manifest: currentRuntimeState.manifest,
          currentChapter: currentRuntimeState.bundle.chapter,
          action: {
            type: "chapter-break",
            nextChapter: result.bundle.chapter
          }
        });

        setRuntimeState({
          status: "ready",
          manifest: currentRuntimeState.manifest,
          bundle: result.bundle,
          readerState: result.state
        });
        setBoundaryState(nextBoundaryState);
        return;
      }

      if (result.type === "scene-transition") {
        setRuntimeState({
          status: "ready",
          manifest: currentRuntimeState.manifest,
          bundle: currentRuntimeState.bundle,
          readerState: result.state
        });
        setBoundaryState(
          options?.showSceneTransitionBoundary === false
            ? null
            : createBoundaryStateForAdvance({
                manifest: currentRuntimeState.manifest,
                currentChapter: currentRuntimeState.bundle.chapter,
                action: {
                  type: "scene-transition"
                }
              })
        );
        return;
      }

      setRuntimeState({
        status: "ready",
        manifest: currentRuntimeState.manifest,
        bundle: currentRuntimeState.bundle,
        readerState: result.state
      });
      setBoundaryState(null);
    },
    []
  );

  const persistPendingCatNameForChapterBoundary = useCallback(
    async (input: {
      branchFlags: PlayerProgress["branchFlags"];
      catName: string | null;
    }) => {
      const pendingCatName = pendingCatNameCommitRef.current;

      if (!pendingCatName) {
        return input;
      }

      if (pendingCatName === persistedCatNameRef.current) {
        const nextBranchFlags = reconcileCatNameBranchFlags({
          branchFlags: input.branchFlags,
          catName: pendingCatName,
          catNameLocked: true
        });

        setBranchFlags(nextBranchFlags);
        setPendingCatNameCommit(null);
        return {
          catName: pendingCatName,
          branchFlags: nextBranchFlags
        };
      }

      setIsSavingCatName(true);

      try {
        const existingCommit = inFlightCatNameCommitRef.current;
        const commit =
          existingCommit?.catName === pendingCatName
            ? existingCommit
            : {
                catName: pendingCatName,
                promise: onUpdateCatName(pendingCatName)
              };

        inFlightCatNameCommitRef.current = commit;

        const savedPlayer = await commit.promise;
        const savedCatNameState = resolveInitialCatNameState({
          catName: savedPlayer.catName,
          catNameLocked: savedPlayer.catNameLocked
        });

        if (!savedCatNameState.catName || !savedCatNameState.catNameLocked) {
          throw new Error("Unable to confirm the saved cat name.");
        }

        const nextBranchFlags = reconcileCatNameBranchFlags({
          branchFlags: input.branchFlags,
          catName: savedCatNameState.catName,
          catNameLocked: true
        });

        persistedCatNameRef.current = savedCatNameState.catName;
        setCatName(savedCatNameState.catName);
        setCatNameInputValue(savedCatNameState.catName);
        setBranchFlags(nextBranchFlags);
        setPendingCatNameCommit(null);

        return {
          catName: savedCatNameState.catName,
          branchFlags: nextBranchFlags
        };
      } finally {
        if (inFlightCatNameCommitRef.current?.catName === pendingCatName) {
          inFlightCatNameCommitRef.current = null;
        }

        setIsSavingCatName(false);
      }
    },
    [onUpdateCatName, setPendingCatNameCommit]
  );

  const advanceFromRuntimeState = useCallback(
    async (
      currentRuntimeState: ActiveNativeReaderRuntimeState,
      options?: {
        allowUnreadyTargetWait?: boolean;
        branchFlags?: PlayerProgress["branchFlags"];
        catName?: string | null;
      }
    ) => {
      const resolvedBranchFlags = options?.branchFlags ?? branchFlags;
      const resolvedCatName = options?.catName ?? catName;
      const tappedAt = Date.now();

      logReaderTiming("user tapped advance", {
        chapterId: currentRuntimeState.bundle.chapter.id,
        dialogueIndex: currentRuntimeState.readerState.dialogueIndex,
        sceneIndex: currentRuntimeState.readerState.sceneIndex
      });

      const target =
        (!options?.allowUnreadyTargetWait
          ? getPreparedAdvanceTarget(presentationRenderKey)
          : null) ??
        (await computeNativeReaderNextAdvanceTarget({
          branchFlags: resolvedBranchFlags,
          catName: resolvedCatName,
          currentRuntimeState,
          loadChapter: repository.loadChapter,
          supabaseUrl: config.supabaseUrl
        }));
      const targetRenderReady = Boolean(
        !target.targetKey || getPreparedPresentation(target.targetKey)
      );
      const plan = resolveNativeReaderAdvanceCommitPlan({
        targetKey: target.targetKey,
        targetRenderReady
      });
      const isSceneTransition = target.result.type === "scene-transition";
      const shouldUseBlackTransition =
        isSceneTransition ||
        target.result.type === "chapter-break" ||
        (target.result.type === "story-finished" &&
          Boolean(pendingCatNameCommitRef.current));

      if (
        plan.type === "blocked-until-render-ready" &&
        !options?.allowUnreadyTargetWait &&
        !shouldUseBlackTransition
      ) {
        logReaderTiming("advance blocked before target ready", {
          COLD_RENDER_ON_VISIBLE_PATH: false,
          INSTANT_COMMIT: false,
          TAP_WAIT_MS: Date.now() - tappedAt,
          reason: plan.reason,
          targetKey: target.targetKey
        });
        return;
      }

      if (shouldUseBlackTransition) {
        setIsMoving(true);
        let transitionBranchFlags = resolvedBranchFlags;
        let transitionCatName = resolvedCatName;
        logReaderTiming("scene transition blackout started", {
          resultType: target.result.type,
          targetKey: target.targetKey,
          targetRenderReady
        });
        try {
          await runNativeReaderSceneTransition({
            prepare: async () => {
              if (shouldPersistPendingCatNameForAdvanceResult(target.result)) {
                const persistedCatName =
                  await persistPendingCatNameForChapterBoundary({
                    branchFlags: transitionBranchFlags,
                    catName: transitionCatName
                  });

                transitionBranchFlags = persistedCatName.branchFlags;
                transitionCatName = persistedCatName.catName;
              }

              if (
                target.targetPresentation &&
                transitionBranchFlags === resolvedBranchFlags &&
                transitionCatName === resolvedCatName
              ) {
                await warmPresentation(target.targetPresentation, "tap-wait");
                return;
              }

              await ensureAdvanceResultAssets({
                supabaseUrl: config.supabaseUrl,
                currentRuntimeState,
                result: target.result,
                branchFlags: transitionBranchFlags,
                catName: transitionCatName
              });
            },
            commit: () => {
              if (transitionCatName !== catName) {
                setCatName(transitionCatName);
                setCatNameInputValue(transitionCatName ?? "");
              }

              if (transitionBranchFlags !== branchFlags) {
                setBranchFlags(transitionBranchFlags);
              }

              commitAdvanceResult(currentRuntimeState, target.result, {
                showSceneTransitionBoundary: false
              });
            },
            afterCommit: async () => {
              await waitForSceneTransitionAudioStart?.({
                boundaryState: null,
                bundle: target.targetBundle,
                readerState: target.targetState
              });
            },
            setPhase: setSceneTransitionPhase
          });
          logReaderTiming("scene transition blackout completed", {
            COLD_RENDER_ON_VISIBLE_PATH: !targetRenderReady,
            INSTANT_COMMIT: targetRenderReady,
            resultType: target.result.type,
            targetKey: target.targetKey,
            TAP_WAIT_MS: Date.now() - tappedAt
          });
        } finally {
          setIsMoving(false);
        }
        return;
      }

      if (plan.type === "blocked-until-render-ready") {
        setIsMoving(true);
        logReaderTiming("advance waiting for render-ready target", {
          reason: plan.reason,
          targetKey: target.targetKey
        });
      }

      try {
        if (plan.type === "blocked-until-render-ready") {
          if (target.targetPresentation) {
            await warmPresentation(target.targetPresentation, "tap-wait");
          } else {
            await ensureAdvanceResultAssets({
              supabaseUrl: config.supabaseUrl,
              currentRuntimeState,
              result: target.result,
              branchFlags: resolvedBranchFlags,
              catName: resolvedCatName
            });
          }
        }

        const commitResult =
          await commitNativeReaderAdvanceAfterPresentationGate({
            commitDelayMs:
              target.result.type === "line"
                ? NATIVE_READER_DIALOGUE_ADVANCE_COMMIT_DELAY_MS
                : 0,
            targetKey: target.targetKey,
            targetRenderReady:
              targetRenderReady || plan.type === "blocked-until-render-ready",
            ensureRenderReady: async () => undefined,
            commit: () => {
              commitAdvanceResult(currentRuntimeState, target.result);
            }
          });

        logReaderTiming("target committed", {
          COLD_RENDER_ON_VISIBLE_PATH: commitResult.commitMode !== "instant",
          commitMode: commitResult.commitMode,
          INSTANT_COMMIT: commitResult.commitMode === "instant",
          targetKey: target.targetKey,
          TAP_WAIT_MS: Date.now() - tappedAt,
          waitDurationMs: commitResult.waitDurationMs,
          waitSinceTapMs: Date.now() - tappedAt,
          ...("reason" in commitResult
            ? {
                reason: commitResult.reason
              }
            : {})
        });
      } finally {
        if (plan.type === "blocked-until-render-ready") {
          setIsMoving(false);
        }
      }
    },
    [
      branchFlags,
      catName,
      commitAdvanceResult,
      config.supabaseUrl,
      getPreparedAdvanceTarget,
      getPreparedPresentation,
      persistPendingCatNameForChapterBoundary,
      presentationRenderKey,
      repository.loadChapter,
      waitForSceneTransitionAudioStart,
      warmPresentation
    ]
  );

  const selectDressOption = useCallback(
    async (optionKey: string) => {
      if (
        (runtimeState.status !== "ready" &&
          runtimeState.status !== "finished") ||
        isMoving
      ) {
        return;
      }

      const entry = getCurrentDialogue(
        runtimeState.bundle.chapter,
        runtimeState.readerState
      );
      const speaker = entry?.speaker;

      if (!speaker || speaker.type !== "dress_prompt") {
        return;
      }

      setActionError(null);
      setIsMoving(true);
      const nextBranchFlags = {
        ...branchFlags,
        [getDressBranchFlagKey(speaker.characterId)]: optionKey
      };

      setBranchFlags(nextBranchFlags);

      try {
        await advanceFromRuntimeState(runtimeState, {
          allowUnreadyTargetWait: true,
          branchFlags: nextBranchFlags
        });
      } catch (error) {
        setActionError(getErrorMessage(error, "Unable to advance the story."));
      } finally {
        setIsMoving(false);
      }
    },
    [advanceFromRuntimeState, branchFlags, isMoving, runtimeState]
  );

  const submitCatName = useCallback(async () => {
    const validationMessage = validateCatNameInput(catNameInputValue);

    if (validationMessage) {
      setCatNameInputError(validationMessage);
      return;
    }

    const normalizedCatName = normalizeCatNameInput(catNameInputValue);

    setCatNameInputError(null);
    setActionError(null);

    try {
      const nextBranchFlags = reconcileCatNameBranchFlags({
        branchFlags,
        catName: normalizedCatName,
        catNameLocked: true
      });

      setCatName(normalizedCatName);
      setCatNameInputValue(normalizedCatName);
      setPendingCatNameCommit(
        normalizedCatName === persistedCatNameRef.current
          ? null
          : normalizedCatName
      );
      setBranchFlags(nextBranchFlags);

      if (
        runtimeState.status === "ready" ||
        runtimeState.status === "finished"
      ) {
        setIsMoving(true);
        await advanceFromRuntimeState(runtimeState, {
          allowUnreadyTargetWait: true,
          branchFlags: nextBranchFlags,
          catName: normalizedCatName
        });
      }
    } catch (error) {
      setCatNameInputError(
        getErrorMessage(error, "Unable to continue with that cat name.")
      );
    } finally {
      setIsMoving(false);
    }
  }, [
    advanceFromRuntimeState,
    branchFlags,
    catNameInputValue,
    runtimeState,
    setPendingCatNameCommit
  ]);

  const advance = useCallback(async () => {
    if (
      (runtimeState.status !== "ready" && runtimeState.status !== "finished") ||
      isMoving ||
      isAdvanceInFlightRef.current
    ) {
      return;
    }

    if (boundaryState) {
      setActionError(null);

      if (
        boundaryState.type === "chapter-ending-card" &&
        boundaryState.nextState.type === "story-finished"
      ) {
        setBoundaryState(boundaryState.nextState);
        setRuntimeState({
          status: "finished",
          manifest: runtimeState.manifest,
          bundle: runtimeState.bundle,
          readerState: {
            ...runtimeState.readerState,
            isChapterComplete: true
          }
        });
        return;
      }

      const nextBoundaryState = resolveBoundaryAdvance({
        boundaryState,
        currentChapter: runtimeState.bundle.chapter
      });

      if (nextBoundaryState !== boundaryState) {
        setBoundaryState(nextBoundaryState);
      }

      return;
    }

    if (!presentation) {
      setActionError("This story position is not playable.");
      return;
    }

    if (presentation.status === "unsupported") {
      setActionError(presentation.message);
      return;
    }

    if (presentation.needsCatNameInput) {
      setActionError("Save a cat name before continuing.");
      return;
    }

    if (presentation.needsDressSelection) {
      setActionError("Choose an outfit before continuing.");
      return;
    }

    if (!canAdvance) {
      logReaderTiming("advance ignored until next presentation ready", {
        currentKey: presentationRenderKey,
        readinessStatus: advanceReadiness.status,
        targetKey: advanceReadiness.targetKey
      });
      return;
    }

    setActionError(null);
    isAdvanceInFlightRef.current = true;

    try {
      await advanceFromRuntimeState(runtimeState);
    } catch (error) {
      setActionError(getErrorMessage(error, "Unable to advance the story."));
    } finally {
      isAdvanceInFlightRef.current = false;
    }
  }, [
    boundaryState,
    advanceReadiness,
    advanceFromRuntimeState,
    canAdvance,
    isMoving,
    presentation,
    presentationRenderKey,
    runtimeState
  ]);

  const retreat = useCallback(async () => {
    if (
      (runtimeState.status !== "ready" && runtimeState.status !== "finished") ||
      isMoving
    ) {
      return;
    }

    setIsMoving(true);
    setActionError(null);

    try {
      if (
        boundaryState?.type === "chapter-opening-card" ||
        boundaryState?.type === "scene-transition"
      ) {
        setBoundaryState(null);
        return;
      }

      const result = await retreatRuntimePosition({
        manifest: runtimeState.manifest,
        bundle: runtimeState.bundle,
        state: runtimeState.readerState,
        loadChapter: repository.loadChapter
      });

      if (result.type === "story-start") {
        setActionError("Already at the beginning of the story.");
        return;
      }

      if (result.type === "scene-transition") {
        await runNativeReaderSceneTransition({
          prepare: async () => {
            await ensureRetreatResultAssets({
              supabaseUrl: config.supabaseUrl,
              currentRuntimeState: runtimeState,
              result,
              branchFlags,
              catName
            });
          },
          commit: () => {
            setBoundaryState(null);
            setRuntimeState({
              status: "ready",
              manifest: runtimeState.manifest,
              bundle: runtimeState.bundle,
              readerState: result.state
            });
          },
          afterCommit: async () => {
            await waitForSceneTransitionAudioStart?.({
              boundaryState: null,
              bundle: runtimeState.bundle,
              readerState: result.state
            });
          },
          setPhase: setSceneTransitionPhase
        });
        return;
      }

      await ensureRetreatResultAssets({
        supabaseUrl: config.supabaseUrl,
        currentRuntimeState: runtimeState,
        result,
        branchFlags,
        catName
      });

      setBoundaryState(null);

      if (result.type === "chapter-return") {
        setRuntimeState({
          status: "ready",
          manifest: runtimeState.manifest,
          bundle: result.bundle,
          readerState: result.state
        });
        return;
      }

      setRuntimeState({
        status: "ready",
        manifest: runtimeState.manifest,
        bundle: runtimeState.bundle,
        readerState: result.state
      });
    } catch (error) {
      setActionError(getErrorMessage(error, "Unable to go back."));
    } finally {
      setIsMoving(false);
    }
  }, [
    boundaryState,
    branchFlags,
    catName,
    config.supabaseUrl,
    isMoving,
    repository.loadChapter,
    runtimeState,
    waitForSceneTransitionAudioStart
  ]);

  return {
    state: runtimeState,
    presentation,
    advanceTargetPresentation,
    boundaryState,
    boundaryPresentation,
    preloadImageUrls,
    preloadAssetRefs,
    isMoving,
    sceneTransitionPhase,
    actionError,
    persistenceError,
    catNameInputValue,
    catNameInputError,
    isSavingCatName,
    canAdvance,
    canRetreat,
    reload,
    advance,
    retreat,
    selectDressOption,
    setCatNameInputValue,
    submitCatName
  };
}
