import {
  resolveReaderStateSceneBackgroundMusic,
  toPublicStorageUrl,
  type PlayerBoundaryState,
  type ReaderState,
  type RuntimeBackgroundMusic,
  type RuntimeChapterBundle
} from "@ocnoer/story-core";

export type NativeBackgroundMusicCue =
  | {
      status: "playable";
      key: string;
      source: "scene" | "scene-cue" | "chapter-ending-card";
      label: string;
      url: string;
      runtimeFilePath: string;
      trackId: string | null;
    }
  | {
      status: "silence";
      source: "scene" | "scene-cue" | "reader" | "story-finished";
      reason: string;
    }
  | {
      status: "unsupported";
      source: "scene" | "scene-cue" | "chapter-ending-card";
      label: string | null;
      runtimeFilePath: string | null;
      reason: string;
    };

function resolvePlayableCue(input: {
  supabaseUrl: string;
  source: "scene" | "scene-cue" | "chapter-ending-card";
  key: string;
  label: string;
  runtimeFilePath: string | null;
  trackId: string | null;
}): NativeBackgroundMusicCue {
  const url = toPublicStorageUrl(input.supabaseUrl, input.runtimeFilePath);

  if (!input.runtimeFilePath || !url) {
    return {
      status: "unsupported",
      source: input.source,
      label: input.label,
      runtimeFilePath: input.runtimeFilePath,
      reason:
        "The published runtime references a music cue without a valid public storage path."
    };
  }

  return {
    status: "playable",
    key: input.key,
    source: input.source === "scene-cue" ? "scene-cue" : input.source,
    label: input.label,
    url,
    runtimeFilePath: input.runtimeFilePath,
    trackId: input.trackId
  };
}

function createSceneMusicPlaybackKey(input: {
  backgroundMusic: RuntimeBackgroundMusic;
  bundle: RuntimeChapterBundle;
  readerState: ReaderState;
  source: "scene" | "scene-cue";
  cueAfterDialogueEntryId: string | null;
}) {
  const scene =
    input.bundle.chapter.scenes[input.readerState.sceneIndex] ?? null;
  const sceneIdentity = scene?.id ?? `index-${input.readerState.sceneIndex}`;
  const cueIdentity =
    input.source === "scene-cue"
      ? (input.cueAfterDialogueEntryId ?? "unknown-cue")
      : "scene-default";

  return [
    input.source,
    `chapter=${input.bundle.chapter.id}`,
    `scene=${sceneIdentity}`,
    `sceneIndex=${input.readerState.sceneIndex}`,
    `cue=${cueIdentity}`,
    `track=${input.backgroundMusic.id}`,
    `path=${input.backgroundMusic.filePath}`
  ].join("|");
}

export function resolveNativeReaderBackgroundMusicCue(input: {
  supabaseUrl: string;
  bundle: RuntimeChapterBundle | null;
  readerState: ReaderState | null;
  boundaryState: PlayerBoundaryState | null;
}): NativeBackgroundMusicCue {
  if (input.boundaryState?.type === "story-finished") {
    return {
      status: "silence",
      source: "story-finished",
      reason: "Story finished."
    };
  }

  if (!input.bundle || !input.readerState) {
    return {
      status: "silence",
      source: "reader",
      reason: "No active reader position."
    };
  }

  if (input.boundaryState?.type === "chapter-ending-card") {
    const endingCardMusic = input.bundle.chapter.endingCardBackgroundMusic;

    return resolvePlayableCue({
      supabaseUrl: input.supabaseUrl,
      source: "chapter-ending-card",
      key: `chapter-ending-card:${input.boundaryState.chapterId}:${input.boundaryState.backgroundMusicFilePath ?? "silence"}`,
      label: endingCardMusic?.label ?? "Chapter ending music",
      runtimeFilePath: input.boundaryState.backgroundMusicFilePath,
      trackId: endingCardMusic?.id ?? null
    });
  }

  if (input.readerState.isChapterComplete) {
    return {
      status: "silence",
      source: "story-finished",
      reason: "Chapter position is complete."
    };
  }

  const resolution = resolveReaderStateSceneBackgroundMusic({
    bundle: input.bundle,
    state: input.readerState
  });

  if (resolution.type === "silence") {
    return {
      status: "silence",
      source: resolution.source === "cue" ? "scene-cue" : "scene",
      reason:
        resolution.source === "cue"
          ? "The active runtime music cue explicitly switches to silence."
          : "The active scene has no background music."
    };
  }

  const source = resolution.source === "cue" ? "scene-cue" : "scene";

  return resolvePlayableCue({
    supabaseUrl: input.supabaseUrl,
    source,
    key: createSceneMusicPlaybackKey({
      backgroundMusic: resolution.backgroundMusic,
      bundle: input.bundle,
      readerState: input.readerState,
      source,
      cueAfterDialogueEntryId: resolution.cueAfterDialogueEntryId
    }),
    label: resolution.backgroundMusic.label,
    runtimeFilePath: resolution.backgroundMusic.filePath,
    trackId: resolution.backgroundMusic.id
  });
}
