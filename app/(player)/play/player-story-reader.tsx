"use client";
/* eslint-disable @next/next/no-img-element */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  advanceReaderState,
  createInitialProgressForChapter,
  createReaderStateFromProgress,
  createStoredProgress,
  getCurrentDialogue,
  getCurrentScene,
  getManifestChapterById,
  type PlayerProgress,
  type ReaderState
} from "@/lib/story/reader";
import { fetchRuntimeJson, toPublicStorageUrl } from "@/lib/story/runtime";
import type {
  RuntimeChapterBundle,
  RuntimeManifest
} from "@/lib/story/types";

type PlayerStoryReaderProps = {
  manifestPath: string;
  progressStorageKey: string;
  supabaseUrl: string;
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
  if (typeof window === "undefined" || !progress) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(progress));
}

export function PlayerStoryReader({
  manifestPath,
  progressStorageKey,
  supabaseUrl
}: PlayerStoryReaderProps) {
  const cacheRef = useRef(new Map<string, RuntimeChapterBundle>());
  const audioRef = useRef<HTMLAudioElement>(null);
  const [manifest, setManifest] = useState<RuntimeManifest | null>(null);
  const [bundle, setBundle] = useState<RuntimeChapterBundle | null>(null);
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [branchFlags, setBranchFlags] = useState<Record<string, boolean | number | string>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [needsManualMusicStart, setNeedsManualMusicStart] = useState(false);

  const loadBundle = useCallback(
    async (currentManifest: RuntimeManifest, chapterId: string) => {
      const cached = cacheRef.current.get(chapterId);

      if (cached) {
        return cached;
      }

      const manifestChapter = getManifestChapterById(currentManifest, chapterId);

      if (!manifestChapter) {
        throw new Error("Requested chapter is not available in runtime manifest.");
      }

      const loadedBundle = await fetchRuntimeJson<RuntimeChapterBundle>(
        supabaseUrl,
        manifestChapter.bundlePath
      );

      cacheRef.current.set(chapterId, loadedBundle);
      return loadedBundle;
    },
    [supabaseUrl]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      setError(null);

      try {
        const loadedManifest = await fetchRuntimeJson<RuntimeManifest>(
          supabaseUrl,
          manifestPath
        );

        if (cancelled) {
          return;
        }

        if (!loadedManifest.firstChapterId) {
          setManifest(loadedManifest);
          setBundle(null);
          setReaderState(null);
          setBranchFlags({});
          setIsLoading(false);
          return;
        }

        const storedProgress = readStoredProgress(progressStorageKey);
        const targetChapterId =
          storedProgress &&
          loadedManifest.chapters.some((chapter) => chapter.id === storedProgress.chapterId)
            ? storedProgress.chapterId
            : loadedManifest.firstChapterId;
        const loadedBundle = await loadBundle(loadedManifest, targetChapterId);

        if (cancelled) {
          return;
        }

        const initialProgress =
          storedProgress && storedProgress.chapterId === loadedBundle.chapter.id
            ? storedProgress
            : createInitialProgressForChapter(loadedBundle.chapter);

        setManifest(loadedManifest);
        setBundle(loadedBundle);
        setReaderState(createReaderStateFromProgress(loadedBundle.chapter, initialProgress));
        setBranchFlags(storedProgress?.branchFlags ?? {});
        setIsLoading(false);
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
  }, [loadBundle, manifestPath, progressStorageKey, supabaseUrl]);

  const scene = bundle && readerState ? getCurrentScene(bundle.chapter, readerState) : null;
  const entry =
    bundle && readerState ? getCurrentDialogue(bundle.chapter, readerState) : null;
  const backgroundImageUrl = useMemo(
    () => toPublicStorageUrl(supabaseUrl, scene?.backgroundImage.filePath ?? null),
    [scene?.backgroundImage.filePath, supabaseUrl]
  );
  const backgroundMusicUrl = useMemo(
    () => toPublicStorageUrl(supabaseUrl, scene?.backgroundMusic?.filePath ?? null),
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
    persistProgress(progressStorageKey, storedProgress);
  }, [progressStorageKey, storedProgress]);

  useEffect(() => {
    if (!bundle?.nextChapterId || !manifest) {
      return;
    }

    void loadBundle(manifest, bundle.nextChapterId).catch(() => undefined);
  }, [bundle?.nextChapterId, loadBundle, manifest]);

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

  const handleAdvance = useCallback(async () => {
    if (!bundle || !readerState || !manifest) {
      return;
    }

    const nextState = advanceReaderState(bundle.chapter, readerState);

    if (!nextState.isChapterComplete) {
      setReaderState(nextState);
      return;
    }

    if (!bundle.nextChapterId) {
      setReaderState(nextState);
      return;
    }

    setIsLoadingChapter(true);

    try {
      const nextBundle = await loadBundle(manifest, bundle.nextChapterId);
      const initialProgress = createInitialProgressForChapter(nextBundle.chapter);

      setBundle(nextBundle);
      setReaderState(
        createReaderStateFromProgress(nextBundle.chapter, initialProgress)
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load the next chapter."
      );
    } finally {
      setIsLoadingChapter(false);
    }
  }, [bundle, loadBundle, manifest, readerState]);

  const handleRestart = useCallback(async () => {
    if (!manifest?.firstChapterId) {
      return;
    }

    try {
      const firstBundle = await loadBundle(manifest, manifest.firstChapterId);
      const initialProgress = createInitialProgressForChapter(firstBundle.chapter);

      setBundle(firstBundle);
      setReaderState(createReaderStateFromProgress(firstBundle.chapter, initialProgress));
      setBranchFlags({});
      persistProgress(progressStorageKey, initialProgress);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to restart the story."
      );
    }
  }, [loadBundle, manifest, progressStorageKey]);

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-6 pb-10">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-200 backdrop-blur">
          Loading story runtime...
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

  if (!manifest?.firstChapterId || !bundle || !readerState || !scene || !entry) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center justify-center px-6 pb-10">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-200">
          <h2 className="text-xl font-semibold">No story content published yet</h2>
          <p className="mt-2 text-sm text-slate-300">
            Open the admin authoring screens and create the first chapter, scene, and dialogue entries.
          </p>
        </div>
      </div>
    );
  }

  const leftCharacterImageUrl = toPublicStorageUrl(
    supabaseUrl,
    entry.stage.left?.imagePath ?? null
  );
  const rightCharacterImageUrl = toPublicStorageUrl(
    supabaseUrl,
    entry.stage.right?.imagePath ?? null
  );
  const manifestChapterIndex = manifest.chapters.findIndex(
    (chapter) => chapter.id === bundle.chapter.id
  );
  const isAtStoryEnd = readerState.isChapterComplete && !bundle.nextChapterId;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
        <div className="flex flex-wrap gap-3">
          <span>
            Chapter {manifestChapterIndex + 1} of {manifest.chapters.length}
          </span>
          <span>{bundle.chapter.title}</span>
          <span>{scene.title}</span>
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
              {scene.backgroundImage.label}
            </div>
            {scene.backgroundMusic ? (
              <div className="rounded-full border border-white/15 bg-black/20 px-4 py-2 text-xs text-slate-200 backdrop-blur">
                Music: {scene.backgroundMusic.label}
              </div>
            ) : null}
          </div>

          <div className="grid flex-1 items-end gap-6 pt-8 md:grid-cols-2">
            <div className="flex min-h-[320px] items-end justify-start">
              {leftCharacterImageUrl ? (
                <img
                  src={leftCharacterImageUrl}
                  alt={entry.stage.left?.characterName ?? "Left character"}
                  className="max-h-[62vh] w-auto rounded-[28px] object-contain object-bottom shadow-2xl"
                />
              ) : null}
            </div>
            <div className="flex min-h-[320px] items-end justify-end">
              {rightCharacterImageUrl ? (
                <img
                  src={rightCharacterImageUrl}
                  alt={entry.stage.right?.characterName ?? "Right character"}
                  className="max-h-[62vh] w-auto rounded-[28px] object-contain object-bottom shadow-2xl"
                />
              ) : null}
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-950/80 p-5 backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                  {entry.speaker.type === "narrator" ? "Narrator" : entry.speaker.characterName}
                </p>
                {entry.speaker.type === "character" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Emotion: {entry.speaker.emotionLabel}
                  </p>
                ) : null}
              </div>
              <PillLike>
                Scene {readerState.sceneIndex + 1}, line {readerState.dialogueIndex + 1}
              </PillLike>
            </div>

            <p className="max-w-4xl text-lg leading-8 text-slate-100">{entry.text}</p>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-400">
                Progress is saved in localStorage using stable dialogue IDs.
              </div>
              <Button onClick={() => void handleAdvance()} disabled={isLoadingChapter}>
                {isAtStoryEnd
                  ? "Story Complete"
                  : readerState.isChapterComplete
                    ? isLoadingChapter
                      ? "Loading Chapter..."
                      : "Next Chapter"
                    : "Next Line"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {backgroundMusicUrl ? <audio ref={audioRef} src={backgroundMusicUrl} loop /> : null}
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
