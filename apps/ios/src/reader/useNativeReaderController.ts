import { useCallback, useEffect, useMemo, useState } from "react";

import {
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
import { createNativeReaderPresentation } from "./readerPresentation";

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

type UseNativeReaderControllerInput = {
  bootstrap: PlayerRuntimeBootstrap;
  config: MobileRuntimeConfig;
  player: MobilePlayer;
  sessionToken: string;
  onProgressSaved?: () => void;
  onUpdateCatName: (catName: string) => Promise<void>;
};

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

export function useNativeReaderController(
  input: UseNativeReaderControllerInput
) {
  const { bootstrap, config, onProgressSaved, onUpdateCatName, player } = input;
  const sessionToken = input.sessionToken;
  const repository = useMemo(
    () => createMobileRuntimeRepository(config),
    [config]
  );
  const initialCatNameState = useMemo(
    () =>
      resolveInitialCatNameState({
        catName: player.catName,
        catNameLocked: player.catNameLocked
      }),
    [player.catName, player.catNameLocked]
  );
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
  const [isSavingCatName, setIsSavingCatName] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [loadRequestId, setLoadRequestId] = useState(0);

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
  }, [bootstrap, player.id, loadRequestId, repository]);

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

    const progress = createStoredProgress({
      chapter: runtimeState.bundle.chapter,
      state: runtimeState.readerState,
      branchFlags
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
  }, [branchFlags, onProgressSaved, player.id, runtimeState, sessionToken]);

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

  const selectDressOption = useCallback(
    (optionKey: string) => {
      if (
        runtimeState.status !== "ready" &&
        runtimeState.status !== "finished"
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
      setBranchFlags((currentValue) => ({
        ...currentValue,
        [getDressBranchFlagKey(speaker.characterId)]: optionKey
      }));
    },
    [runtimeState]
  );

  const submitCatName = useCallback(async () => {
    const validationMessage = validateCatNameInput(catNameInputValue);

    if (validationMessage) {
      setCatNameInputError(validationMessage);
      return;
    }

    const normalizedCatName = normalizeCatNameInput(catNameInputValue);

    setIsSavingCatName(true);
    setCatNameInputError(null);
    setActionError(null);

    try {
      await onUpdateCatName(normalizedCatName);
      setCatName(normalizedCatName);
      setBranchFlags((currentValue) =>
        reconcileCatNameBranchFlags({
          branchFlags: currentValue,
          catName: normalizedCatName,
          catNameLocked: true
        })
      );
    } catch (error) {
      setCatNameInputError(
        getErrorMessage(error, "Unable to save the cat name.")
      );
    } finally {
      setIsSavingCatName(false);
    }
  }, [catNameInputValue, onUpdateCatName]);

  const advance = useCallback(async () => {
    if (
      (runtimeState.status !== "ready" && runtimeState.status !== "finished") ||
      isMoving
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

    setIsMoving(true);
    setActionError(null);

    try {
      const result = await advanceRuntimePosition({
        manifest: runtimeState.manifest,
        bundle: runtimeState.bundle,
        state: runtimeState.readerState,
        loadChapter: repository.loadChapter
      });

      if (result.type === "story-finished") {
        const nextBoundaryState = createBoundaryStateForAdvance({
          manifest: runtimeState.manifest,
          currentChapter: runtimeState.bundle.chapter,
          action: {
            type: "story-finished"
          }
        });

        setRuntimeState({
          status: "finished",
          manifest: runtimeState.manifest,
          bundle: runtimeState.bundle,
          readerState: {
            ...runtimeState.readerState,
            isChapterComplete: true
          }
        });
        setBoundaryState(nextBoundaryState);
        return;
      }

      if (result.type === "chapter-break") {
        const nextBoundaryState = createBoundaryStateForAdvance({
          manifest: runtimeState.manifest,
          currentChapter: runtimeState.bundle.chapter,
          action: {
            type: "chapter-break",
            nextChapter: result.bundle.chapter
          }
        });

        setRuntimeState({
          status: "ready",
          manifest: runtimeState.manifest,
          bundle: result.bundle,
          readerState: result.state
        });
        setBoundaryState(nextBoundaryState);
        return;
      }

      if (result.type === "scene-transition") {
        setRuntimeState({
          status: "ready",
          manifest: runtimeState.manifest,
          bundle: runtimeState.bundle,
          readerState: result.state
        });
        setBoundaryState(
          createBoundaryStateForAdvance({
            manifest: runtimeState.manifest,
            currentChapter: runtimeState.bundle.chapter,
            action: {
              type: "scene-transition"
            }
          })
        );
        return;
      }

      setRuntimeState({
        status: "ready",
        manifest: runtimeState.manifest,
        bundle: runtimeState.bundle,
        readerState: result.state
      });
      setBoundaryState(null);
    } catch (error) {
      setActionError(getErrorMessage(error, "Unable to advance the story."));
    } finally {
      setIsMoving(false);
    }
  }, [
    boundaryState,
    isMoving,
    presentation,
    repository.loadChapter,
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
  }, [boundaryState, isMoving, repository.loadChapter, runtimeState]);

  return {
    state: runtimeState,
    presentation,
    boundaryState,
    boundaryPresentation,
    preloadImageUrls,
    isMoving,
    actionError,
    persistenceError,
    catNameInputValue,
    catNameInputError,
    isSavingCatName,
    canRetreat,
    reload,
    advance,
    retreat,
    selectDressOption,
    setCatNameInputValue,
    submitCatName
  };
}
