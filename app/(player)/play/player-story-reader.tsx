"use client";

import {
  type CSSProperties,
  useActionState,
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
import type { ReaderChapter } from "@/lib/story/repository";
import {
  advanceReaderProgress,
  canAdvanceFromEntry,
  createInitialReaderProgress,
  getCurrentEntry,
  getCurrentScene,
  resolveEntryPresentation,
  toPublicMediaUrl
} from "@/lib/story/reader";

type PlayerStoryReaderProps = {
  chapter: ReaderChapter;
  supabaseUrl: string;
};

export function PlayerStoryReader({ chapter, supabaseUrl }: PlayerStoryReaderProps) {
  const [progress, setProgress] = useState(createInitialReaderProgress);
  const [needsManualMusicStart, setNeedsManualMusicStart] = useState(false);
  const [submittedPromptEntryIds, setSubmittedPromptEntryIds] = useState(
    () => new Set<string>()
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [submitState, submitAction, isSubmittingPrompt] = useActionState(
    submitPlayerPromptResponseAction,
    initialSubmitPlayerPromptResponseState
  );

  const scene = getCurrentScene(chapter, progress);
  const entry = getCurrentEntry(chapter, progress);
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

  const sceneKey = scene?.id ?? "no-scene";
  const entryKey = entry?.id ?? `${sceneKey}-no-entry`;
  const sceneBackgroundStyle: CSSProperties = backgroundImageUrl
    ? { backgroundImage: `url("${backgroundImageUrl}")` }
    : {};

  const onAdvance = () => {
    setProgress((current) => advanceReaderProgress(chapter, current));
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

  if (chapter.scenes.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white/90 p-6 text-slate-900 shadow-sm">
        <h2 className="text-xl font-semibold">No scenes in this chapter yet</h2>
        <p className="mt-2 text-sm text-slate-700">
          The first published chapter has no authored scenes.
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
              {chapter.title}
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
            {entry?.character?.defaultPortraitPath &&
            resolveEntryPresentation(entry).portraitSide === "left" ? (
              <img
                alt={entry.character.name}
                className="h-56 w-40 rounded-lg object-cover object-top shadow-md"
                src={toPublicMediaUrl(supabaseUrl, entry.character.defaultPortraitPath) ?? ""}
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
                    You reached the end of this published chapter.
                  </p>
                </>
              ) : !entry ? (
                <>
                  <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">
                    Empty scene
                  </p>
                  <p className="mt-3 text-lg leading-relaxed text-slate-100">
                    This scene has no dialogue entries yet.
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
                      <input name="dialogueEntryId" type="hidden" value={entry.id} />
                      <input name="sceneId" type="hidden" value={scene?.id ?? ""} />
                      <input name="chapterId" type="hidden" value={chapter.id} />
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
            {entry?.character?.defaultPortraitPath &&
            resolveEntryPresentation(entry).portraitSide === "right" ? (
              <img
                alt={entry.character.name}
                className="ml-auto h-56 w-40 rounded-lg object-cover object-top shadow-md"
                src={toPublicMediaUrl(supabaseUrl, entry.character.defaultPortraitPath) ?? ""}
              />
            ) : null}
          </div>
        </div>

        {!progress.isChapterComplete && canAdvance ? (
          <div className="flex justify-end">
            <Button onClick={onAdvance} type="button">
              {entry ? "Next" : progress.sceneIndex + 1 < chapter.scenes.length ? "Next scene" : "Finish chapter"}
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
