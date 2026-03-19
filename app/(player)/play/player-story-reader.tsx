"use client";
/* eslint-disable @next/next/no-img-element */

import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { Button } from "@/components/ui/button";
import {
  advanceRuntimePosition,
  getCurrentDialogue,
  getCurrentScene,
  createStoredProgress,
  type PlayerProgress,
  type ReaderState
} from "@/lib/story/reader";
import type { RuntimeChapterBundle, RuntimeManifest } from "@/lib/story/types";
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
      sceneTitle: string;
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

function isAdvanceGestureTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest("a, audio, button, input, select, summary, textarea")
    )
  );
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
  const audioRef = useRef<HTMLAudioElement>(null);
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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialManifest);
  const [isResolvingResume, setIsResolvingResume] = useState(false);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [needsManualMusicStart, setNeedsManualMusicStart] = useState(false);

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

        setManifest(loadedRuntime.manifest);
        setBundle(loadedRuntime.bundle);
        setReaderState(loadedRuntime.readerState);
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
      setReaderState(resumeAction.readerState);
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

        setManifest(loadedRuntime.manifest);
        setBundle(loadedRuntime.bundle);
        setReaderState(loadedRuntime.readerState);
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
    const audio = audioRef.current;

    if (!audio || !backgroundMusicUrl || isResolvingResume) {
      setNeedsManualMusicStart(false);
      return;
    }

    audio.currentTime = 0;
    setNeedsManualMusicStart(false);

    void audio.play().catch(() => {
      setNeedsManualMusicStart(true);
    });
  }, [backgroundMusicUrl, isResolvingResume]);

  const handleAdvance = useCallback(async () => {
    if (isLoadingChapter) {
      return;
    }

    if (boundaryState) {
      if (boundaryState.type !== "story-finished") {
        setBoundaryState(null);
      }

      return;
    }

    if (!bundle || !readerState || !manifest) {
      return;
    }

    setIsLoadingChapter(true);

    try {
      const result = await advanceRuntimePosition({
        manifest,
        bundle,
        state: readerState,
        loadChapter: loadBundle
      });

      if (result.type === "line") {
        setReaderState(result.state);
        return;
      }

      if (result.type === "scene-transition") {
        const nextScene = getCurrentScene(bundle.chapter, result.state);

        setReaderState(result.state);
        setBoundaryState({
          type: "scene-transition",
          sceneTitle: nextScene?.title ?? "Next Scene"
        });
        return;
      }

      if (result.type === "chapter-break") {
        const chapterIndex = manifest.chapters.findIndex(
          (chapter) => chapter.id === result.bundle.chapter.id
        );

        setBundle(result.bundle);
        setReaderState(result.state);
        setBoundaryState({
          type: "chapter-break",
          chapterTitle: result.bundle.chapter.title,
          chapterIndex: chapterIndex + 1,
          chapterCount: manifest.chapters.length
        });
        return;
      }

      const chapterIndex = manifest.chapters.findIndex(
        (chapter) => chapter.id === bundle.chapter.id
      );

      setBoundaryState({
        type: "story-finished",
        chapterTitle: bundle.chapter.title,
        chapterIndex: chapterIndex + 1,
        chapterCount: manifest.chapters.length
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
    loadBundle,
    manifest,
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

  const handleReaderCardClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (
        isLoadingChapter ||
        boundaryState?.type === "story-finished" ||
        isAdvanceGestureTarget(event.target)
      ) {
        return;
      }

      void handleAdvance();
    },
    [boundaryState?.type, handleAdvance, isLoadingChapter]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isLoadingChapter ||
        boundaryState?.type === "story-finished"
      ) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      if (isAdvanceGestureTarget(event.target)) {
        return;
      }

      event.preventDefault();
      void handleAdvance();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [boundaryState?.type, handleAdvance, isLoadingChapter]);

  if (isLoading || isResolvingResume) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-6 pb-10">
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
      <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center justify-center px-6 pb-10">
        <div className="w-full rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6 text-rose-100">
          <h2 className="text-xl font-semibold">Runtime unavailable</h2>
          <p className="mt-2 text-sm text-rose-100/80">{error}</p>
        </div>
      </div>
    );
  }

  if (runtimeAvailability) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center justify-center px-6 pb-10">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-200">
          <h2 className="text-xl font-semibold">{runtimeAvailability.title}</h2>
          <p className="mt-2 text-sm text-slate-300">
            {runtimeAvailability.description}
          </p>
        </div>
      </div>
    );
  }

  const activeManifest = manifest!;
  const activeBundle = bundle!;
  const activeReaderState = readerState!;
  const activeScene = scene!;
  const activeEntry = entry!;
  const leftCharacterImageUrl = activeAssetUrls.leftCharacterImageUrl;
  const rightCharacterImageUrl = activeAssetUrls.rightCharacterImageUrl;
  const manifestChapterIndex = activeManifest.chapters.findIndex(
    (chapter) => chapter.id === activeBundle.chapter.id
  );
  const continueHint = "Press Enter, Space, or click the panel to continue.";
  const sceneTransitionState =
    boundaryState?.type === "scene-transition" ? boundaryState : null;
  const chapterBreakState =
    boundaryState?.type === "chapter-break" ? boundaryState : null;
  const storyFinishedState =
    boundaryState?.type === "story-finished" ? boundaryState : null;
  const isTransitionCard = Boolean(sceneTransitionState);
  const isChapterBreakCard = Boolean(chapterBreakState);
  const isStoryFinishedCard = Boolean(storyFinishedState);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
        <div className="flex flex-wrap gap-3">
          <span>
            Chapter {manifestChapterIndex + 1} of{" "}
            {activeManifest.chapters.length}
          </span>
          <span>{activeBundle.chapter.title}</span>
          <span>{activeScene.title}</span>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleRestart}>
            Restart Story
          </Button>
          {needsManualMusicStart && backgroundMusicUrl ? (
            <Button
              onClick={() => {
                const audio = audioRef.current;

                if (!audio) {
                  return;
                }

                void audio.play().then(() => {
                  setNeedsManualMusicStart(false);
                });
              }}
            >
              Start Music
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-900 shadow-[0_40px_120px_-48px_rgba(0,0,0,0.8)]">
        {backgroundImageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundImageUrl})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#334155_0%,#0f172a_70%)]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.18)_0%,rgba(15,23,42,0.35)_44%,rgba(15,23,42,0.82)_100%)]" />

        <div className="relative flex min-h-[72vh] flex-col justify-between p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-slate-200 backdrop-blur">
              {activeScene.backgroundImage.label}
            </div>
            {activeScene.backgroundMusic ? (
              <div className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-xs text-slate-200 backdrop-blur">
                Music: {activeScene.backgroundMusic.label}
              </div>
            ) : null}
          </div>

          <div className="grid flex-1 items-end gap-6 pt-8 md:grid-cols-2">
            <div className="flex min-h-[320px] items-end justify-start">
              {leftCharacterImageUrl ? (
                <img
                  src={leftCharacterImageUrl}
                  alt={
                    activeEntry.stage.left?.characterName ?? "Left character"
                  }
                  className="max-h-[62vh] w-auto rounded-[28px] object-contain object-bottom shadow-2xl"
                />
              ) : null}
            </div>
            <div className="flex min-h-[320px] items-end justify-end">
              {rightCharacterImageUrl ? (
                <img
                  src={rightCharacterImageUrl}
                  alt={
                    activeEntry.stage.right?.characterName ?? "Right character"
                  }
                  className="max-h-[62vh] w-auto rounded-[28px] object-contain object-bottom shadow-2xl"
                />
              ) : null}
            </div>
          </div>

          <div
            className={`mt-8 rounded-[28px] border border-white/10 bg-slate-950/80 p-5 backdrop-blur ${
              isStoryFinishedCard ? "" : "cursor-pointer"
            }`}
            onClick={handleReaderCardClick}
          >
            {isTransitionCard ? (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                      Scene Transition
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
                      {sceneTransitionState?.sceneTitle}
                    </h2>
                  </div>
                  <PillLike>Scene {activeReaderState.sceneIndex + 1}</PillLike>
                </div>

                <p className="max-w-3xl text-base leading-7 text-slate-300">
                  The next scene is ready.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-400">{continueHint}</div>
                  <Button
                    onClick={() => void handleAdvance()}
                    disabled={isLoadingChapter}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : isChapterBreakCard ? (
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
                  The previous chapter is complete. Continue when you are ready
                  to begin the next chapter.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-400">{continueHint}</div>
                  <Button
                    onClick={() => void handleAdvance()}
                    disabled={isLoadingChapter}
                  >
                    Begin Chapter
                  </Button>
                </div>
              </div>
            ) : isStoryFinishedCard ? (
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
            ) : (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                      {activeEntry.speaker.type === "narrator"
                        ? "Narrator"
                        : activeEntry.speaker.characterName}
                    </p>
                    {activeEntry.speaker.type === "character" ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Emotion: {activeEntry.speaker.emotionLabel}
                      </p>
                    ) : null}
                  </div>
                  <PillLike>
                    Scene {activeReaderState.sceneIndex + 1}, line{" "}
                    {activeReaderState.dialogueIndex + 1}
                  </PillLike>
                </div>

                <p className="max-w-4xl text-lg leading-8 text-slate-100">
                  {activeEntry.text}
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-400">{continueHint}</div>
                  <Button
                    onClick={() => void handleAdvance()}
                    disabled={isLoadingChapter}
                  >
                    {isLoadingChapter ? "Loading..." : "Continue"}
                  </Button>
                </div>
              </div>
            )}
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
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
      {props.children}
    </span>
  );
}
