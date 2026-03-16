"use client";

import {
  type CSSProperties,
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { DialogueKind } from "@prisma/client";
import { AnimatePresence, motion } from "framer-motion";

import {
  initialSubmitPlayerPromptResponseState,
  submitPlayerPromptResponseAction
} from "@/app/(player)/play/actions";
import { Button } from "@/components/ui/button";
import {
  fetchPublishedJson,
  getManifestChapterById,
  type PublishedChapterBundle,
  type PublishedStoryManifest
} from "@/lib/story/published";
import {
  advanceReaderProgress,
  canAdvanceFromEntry,
  createInitialReaderProgress,
  createReaderCheckpoint,
  createReaderProgressFromCheckpoint,
  getCurrentEntry,
  getCurrentScene,
  isCheckpointValidForChapter,
  resolveEntryPresentation,
  toPublicMediaUrl,
  type ReaderCheckpoint
} from "@/lib/story/reader";

type PlayerStoryReaderProps = {
  initialBundle: PublishedChapterBundle;
  initialServerCheckpoint: ReaderCheckpoint | null;
  manifest: PublishedStoryManifest;
  progressStorageKey: string;
  publishedVersionId: string;
  supabaseUrl: string;
};

function readStoredCheckpoint(storageKey: string): ReaderCheckpoint | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ReaderCheckpoint;
  } catch {
    return null;
  }
}

function persistCheckpoint(storageKey: string, checkpoint: ReaderCheckpoint | null) {
  if (typeof window === "undefined" || !checkpoint) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(checkpoint));
}

function checkpointTimestamp(checkpoint: ReaderCheckpoint | null) {
  if (!checkpoint) {
    return 0;
  }

  const value = Date.parse(checkpoint.lastReadAt);
  return Number.isNaN(value) ? 0 : value;
}

export function PlayerStoryReader({
  initialBundle,
  initialServerCheckpoint,
  manifest,
  progressStorageKey,
  publishedVersionId,
  supabaseUrl
}: PlayerStoryReaderProps) {
  const cacheRef = useRef(
    new Map<string, PublishedChapterBundle>([[initialBundle.chapter.id, initialBundle]])
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const hydratedLocalCheckpointRef = useRef(false);
  const latestCheckpointRef = useRef<ReaderCheckpoint | null>(null);
  const previousSceneIdRef = useRef<string | null>(null);
  const previousChapterIdRef = useRef<string | null>(null);
  const previousCompletionStateRef = useRef(false);
  const [currentBundle, setCurrentBundle] = useState(initialBundle);
  const [progress, setProgress] = useState(() =>
    createReaderProgressFromCheckpoint(initialBundle.chapter, initialServerCheckpoint)
  );
  const [needsManualMusicStart, setNeedsManualMusicStart] = useState(false);
  const [submittedPromptEntryIds, setSubmittedPromptEntryIds] = useState(
    () => new Set<string>()
  );
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [submitState, submitAction, isSubmittingPrompt] = useActionState(
    submitPlayerPromptResponseAction,
    initialSubmitPlayerPromptResponseState
  );

  const loadChapterBundle = useCallback(
    async (chapterPublicId: string) => {
      const cachedBundle = cacheRef.current.get(chapterPublicId);

      if (cachedBundle) {
        return cachedBundle;
      }

      const manifestChapter = getManifestChapterById(manifest, chapterPublicId);

      if (!manifestChapter) {
        throw new Error("Published chapter is no longer available.");
      }

      const bundle = await fetchPublishedJson<PublishedChapterBundle>(
        supabaseUrl,
        manifestChapter.bundleStoragePath
      );

      cacheRef.current.set(chapterPublicId, bundle);
      return bundle;
    },
    [manifest, supabaseUrl]
  );

  const applyCheckpoint = useCallback(
    async (checkpoint: ReaderCheckpoint) => {
      if (checkpoint.publishedVersionId !== publishedVersionId) {
        return false;
      }

      const bundle =
        checkpoint.chapterPublicId === currentBundle.chapter.id
          ? currentBundle
          : await loadChapterBundle(checkpoint.chapterPublicId);

      if (!isCheckpointValidForChapter(bundle.chapter, checkpoint)) {
        return false;
      }

      setCurrentBundle(bundle);
      setProgress(createReaderProgressFromCheckpoint(bundle.chapter, checkpoint));

      return true;
    },
    [currentBundle, loadChapterBundle, publishedVersionId]
  );

  const scene = getCurrentScene(currentBundle.chapter, progress);
  const entry = getCurrentEntry(currentBundle.chapter, progress);
  const canAdvance = canAdvanceFromEntry(entry, submittedPromptEntryIds);
  const activePromptFeedback =
    entry && submitState.dialogueEntryId === entry.id ? submitState : null;

  const backgroundImageUrl = useMemo(
    () => toPublicMediaUrl(supabaseUrl, scene?.media.backgroundImagePath ?? null),
    [scene?.media.backgroundImagePath, supabaseUrl]
  );
  const backgroundMusicUrl = useMemo(
    () => toPublicMediaUrl(supabaseUrl, scene?.media.backgroundMusicPath ?? null),
    [scene?.media.backgroundMusicPath, supabaseUrl]
  );
  const currentCheckpoint = useMemo(
    () =>
      createReaderCheckpoint({
        chapter: currentBundle.chapter,
        publishedVersionId,
        state: progress
      }),
    [currentBundle.chapter, progress, publishedVersionId]
  );

  const syncCheckpoint = useCallback(
    async (checkpoint: ReaderCheckpoint, keepalive = false) => {
      try {
        await fetch("/api/player/progress", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(checkpoint),
          keepalive
        });
      } catch {
        // Local state is authoritative until the next sync opportunity.
      }
    },
    []
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !backgroundMusicUrl) {
      setNeedsManualMusicStart(false);
      return;
    }

    audio.currentTime = 0;
    setNeedsManualMusicStart(false);

    void audio.play().catch(() => {
      setNeedsManualMusicStart(true);
    });
  }, [backgroundMusicUrl]);

  useEffect(() => {
    if (submitState.status !== "success" || !submitState.dialogueEntryId) {
      return;
    }

    setSubmittedPromptEntryIds((current) => {
      const next = new Set(current);
      next.add(submitState.dialogueEntryId as string);
      return next;
    });
  }, [submitState.dialogueEntryId, submitState.status]);

  useEffect(() => {
    if (submitState.status !== "success" || !currentCheckpoint) {
      return;
    }

    void syncCheckpoint(currentCheckpoint);
  }, [currentCheckpoint, submitState.status, syncCheckpoint]);

  useEffect(() => {
    latestCheckpointRef.current = currentCheckpoint;
    persistCheckpoint(progressStorageKey, currentCheckpoint);
  }, [currentCheckpoint, progressStorageKey]);

  useEffect(() => {
    if (!currentCheckpoint) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void syncCheckpoint(currentCheckpoint);
    }, 750);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [currentCheckpoint, syncCheckpoint]);

  useEffect(() => {
    const currentSceneId = scene?.id ?? null;
    const currentChapterId = currentBundle.chapter.id;
    const shouldForceSync =
      Boolean(currentCheckpoint) &&
      (previousSceneIdRef.current !== currentSceneId ||
        previousChapterIdRef.current !== currentChapterId ||
        (!previousCompletionStateRef.current && progress.isChapterComplete));

    previousSceneIdRef.current = currentSceneId;
    previousChapterIdRef.current = currentChapterId;
    previousCompletionStateRef.current = progress.isChapterComplete;

    if (shouldForceSync && currentCheckpoint) {
      void syncCheckpoint(currentCheckpoint);
    }
  }, [currentBundle.chapter.id, currentCheckpoint, progress.isChapterComplete, scene?.id, syncCheckpoint]);

  useEffect(() => {
    const flushCheckpoint = () => {
      if (document.visibilityState === "hidden" && latestCheckpointRef.current) {
        void syncCheckpoint(latestCheckpointRef.current, true);
      }
    };

    const flushOnPageHide = () => {
      if (latestCheckpointRef.current) {
        void syncCheckpoint(latestCheckpointRef.current, true);
      }
    };

    document.addEventListener("visibilitychange", flushCheckpoint);
    window.addEventListener("pagehide", flushOnPageHide);

    return () => {
      document.removeEventListener("visibilitychange", flushCheckpoint);
      window.removeEventListener("pagehide", flushOnPageHide);
    };
  }, [syncCheckpoint]);

  useEffect(() => {
    if (!currentBundle.nextChapterId || cacheRef.current.has(currentBundle.nextChapterId)) {
      return;
    }

    void loadChapterBundle(currentBundle.nextChapterId).catch(() => undefined);
  }, [currentBundle.nextChapterId, loadChapterBundle]);

  useEffect(() => {
    if (hydratedLocalCheckpointRef.current) {
      return;
    }

    hydratedLocalCheckpointRef.current = true;

    const localCheckpoint = readStoredCheckpoint(progressStorageKey);

    if (!localCheckpoint || localCheckpoint.publishedVersionId !== publishedVersionId) {
      return;
    }

    if (checkpointTimestamp(localCheckpoint) <= checkpointTimestamp(initialServerCheckpoint)) {
      return;
    }

    void applyCheckpoint(localCheckpoint);
  }, [applyCheckpoint, initialServerCheckpoint, progressStorageKey, publishedVersionId]);

  const sceneKey = scene?.id ?? "no-scene";
  const entryKey = entry?.id ?? `${sceneKey}-no-entry`;
  const sceneBackgroundStyle: CSSProperties = backgroundImageUrl
    ? { backgroundImage: `url("${backgroundImageUrl}")` }
    : {};

  const onAdvance = () => {
    setProgress((current) => advanceReaderProgress(currentBundle.chapter, current));
  };

  const onAdvanceToNextChapter = async () => {
    if (!currentBundle.nextChapterId) {
      return;
    }

    setIsLoadingChapter(true);

    try {
      const nextBundle = await loadChapterBundle(currentBundle.nextChapterId);
      setCurrentBundle(nextBundle);
      setProgress(createInitialReaderProgress());
    } finally {
      setIsLoadingChapter(false);
    }
  };

  const onStartMusic = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      await audio.play();
      setNeedsManualMusicStart(false);
    } catch {
      setNeedsManualMusicStart(true);
    }
  };

  if (currentBundle.chapter.scenes.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white/90 p-6 text-slate-900 shadow-sm">
        <h2 className="text-xl font-semibold">This published chapter is empty</h2>
        <p className="mt-2 text-sm text-slate-700">
          Publish a version that includes at least one authored scene.
        </p>
      </section>
    );
  }

  return (
    <section className="relative min-h-[540px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-xl">
      <audio
        key={scene?.id ?? "no-audio"}
        autoPlay
        loop
        preload="auto"
        ref={audioRef}
        src={backgroundMusicUrl ?? undefined}
      />

      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-cover bg-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          key={sceneKey}
          style={sceneBackgroundStyle}
          transition={{ duration: 0.4 }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-slate-950/60" />

      <div className="relative flex min-h-[540px] flex-col justify-between p-6 md:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              {currentBundle.chapter.title}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {scene?.title ?? `Scene ${scene?.orderIndex ?? 0}`}
            </h2>
          </div>
          {needsManualMusicStart && backgroundMusicUrl ? (
            <Button onClick={onStartMusic} size="sm" variant="outline">
              Play music
            </Button>
          ) : null}
        </header>

        <div className="flex flex-1 items-end justify-between gap-4 py-6">
          <div className="hidden w-40 md:block">
            {entry?.character?.portraitPath &&
            resolveEntryPresentation(entry).portraitSide === "left" ? (
              <img
                alt={entry.character.name}
                className="h-56 w-40 rounded-lg object-cover object-top shadow-md"
                src={toPublicMediaUrl(supabaseUrl, entry.character.portraitPath) ?? ""}
              />
            ) : null}
          </div>

          <AnimatePresence mode="wait">
            <motion.article
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-3xl rounded-xl border border-white/20 bg-slate-900/80 p-5 text-white backdrop-blur"
              exit={{ opacity: 0, y: 6 }}
              initial={{ opacity: 0, y: 6 }}
              key={entryKey}
              transition={{ duration: 0.22 }}
            >
              {progress.isChapterComplete ? (
                <>
                  <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                    Chapter complete
                  </p>
                  <p className="mt-3 text-lg leading-relaxed text-slate-100">
                    {currentBundle.nextChapterId
                      ? "You reached the end of this chapter."
                      : "You reached the end of the published story."}
                  </p>
                </>
              ) : !entry ? (
                <>
                  <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">
                    Empty scene
                  </p>
                  <p className="mt-3 text-lg leading-relaxed text-slate-100">
                    This published scene has no dialogue entries.
                  </p>
                </>
              ) : (
                <>
                  {entry.kind === DialogueKind.player_prompt ? (
                    <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
                      {entry.promptLabel ?? "Player prompt"}
                    </p>
                  ) : entry.kind === DialogueKind.narrator ? (
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                      Narrator
                    </p>
                  ) : (
                    <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">
                      {entry.character?.name ?? "Unassigned character"}
                    </p>
                  )}
                  <p
                    className={[
                      "mt-3 text-lg leading-relaxed text-slate-100",
                      resolveEntryPresentation(entry).alignment === "center"
                        ? "text-center"
                        : "text-left"
                    ].join(" ")}
                  >
                    {entry.text}
                  </p>
                  {entry.kind === DialogueKind.player_prompt ? (
                    <form action={submitAction} className="mt-4 space-y-3">
                      <input name="publishedVersionId" type="hidden" value={publishedVersionId} />
                      <input name="dialogueEntryId" type="hidden" value={entry.id} />
                      <input name="sceneId" type="hidden" value={scene?.id ?? ""} />
                      <input
                        name="chapterId"
                        type="hidden"
                        value={currentBundle.chapter.id}
                      />
                      <label
                        className="block text-xs font-medium uppercase tracking-wide text-slate-300"
                        htmlFor={`player-response-${entry.id}`}
                      >
                        Your response
                      </label>
                      <textarea
                        className="w-full rounded-md border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
                        id={`player-response-${entry.id}`}
                        name="responseText"
                        placeholder="Write your response..."
                        required
                        rows={4}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <Button
                          disabled={isSubmittingPrompt}
                          type="submit"
                          variant="outline"
                        >
                          {isSubmittingPrompt ? "Saving..." : "Submit response"}
                        </Button>
                        {activePromptFeedback?.status === "success" ? (
                          <p className="text-sm text-emerald-300">
                            {activePromptFeedback.message}
                          </p>
                        ) : null}
                      </div>
                      {activePromptFeedback?.status === "error" ? (
                        <p className="text-sm text-rose-300">
                          {activePromptFeedback.message}
                        </p>
                      ) : null}
                    </form>
                  ) : null}
                </>
              )}
            </motion.article>
          </AnimatePresence>

          <div className="hidden w-40 md:block">
            {entry?.character?.portraitPath &&
            resolveEntryPresentation(entry).portraitSide === "right" ? (
              <img
                alt={entry.character.name}
                className="ml-auto h-56 w-40 rounded-lg object-cover object-top shadow-md"
                src={toPublicMediaUrl(supabaseUrl, entry.character.portraitPath) ?? ""}
              />
            ) : null}
          </div>
        </div>

        {!progress.isChapterComplete && canAdvance ? (
          <div className="flex justify-end">
            <Button onClick={onAdvance} type="button">
              {entry
                ? "Next"
                : progress.sceneIndex + 1 < currentBundle.chapter.scenes.length
                ? "Next scene"
                : "Finish chapter"}
            </Button>
          </div>
        ) : progress.isChapterComplete && currentBundle.nextChapterId ? (
          <div className="flex justify-end">
            <Button disabled={isLoadingChapter} onClick={onAdvanceToNextChapter} type="button">
              {isLoadingChapter ? "Loading chapter..." : "Next chapter"}
            </Button>
          </div>
        ) : !progress.isChapterComplete ? (
          <p className="text-right text-sm text-cyan-200">
            Submit your response to continue.
          </p>
        ) : null}
      </div>
    </section>
  );
}
