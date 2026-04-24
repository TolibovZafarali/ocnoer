import type {
  RuntimeChapterBundle,
  RuntimeDialogueEntry,
  RuntimeManifest,
  RuntimeScene
} from "@ocnoer/story-core";

type RuntimeManifestWithOptionalTitle = RuntimeManifest & {
  title?: unknown;
  storyTitle?: unknown;
  story?: {
    title?: unknown;
  } | null;
};

export type ChapterPreviewLine = {
  id: string;
  speaker: string;
  text: string;
};

export type ChapterPreview = {
  chapterId: string;
  chapterTitle: string;
  sceneId: string | null;
  sceneTitle: string | null;
  lines: ChapterPreviewLine[];
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function getRuntimeStoryTitle(manifest: RuntimeManifest) {
  const manifestWithTitle = manifest as RuntimeManifestWithOptionalTitle;

  return (
    readString(manifestWithTitle.story?.title) ??
    readString(manifestWithTitle.storyTitle) ??
    readString(manifestWithTitle.title)
  );
}

export function resolvePreviewChapterId(input: {
  manifest: RuntimeManifest;
  initialBundle: RuntimeChapterBundle | null;
}) {
  return (
    input.initialBundle?.chapter.id ??
    input.manifest.firstChapterId ??
    input.manifest.chapters[0]?.id ??
    null
  );
}

export function getDialogueSpeakerName(entry: RuntimeDialogueEntry) {
  switch (entry.speaker.type) {
    case "character":
    case "dress_prompt":
    case "cat_name_prompt":
      return entry.speaker.characterName;
    case "narrator":
      return "Narrator";
  }
}

function findPreviewScene(bundle: RuntimeChapterBundle): RuntimeScene | null {
  return (
    bundle.chapter.scenes.find((scene) => scene.dialogue.length > 0) ??
    bundle.chapter.scenes[0] ??
    null
  );
}

export function createChapterPreview(
  bundle: RuntimeChapterBundle,
  maxLines = 8
): ChapterPreview {
  const scene = findPreviewScene(bundle);

  return {
    chapterId: bundle.chapter.id,
    chapterTitle: bundle.chapter.title,
    sceneId: scene?.id ?? null,
    sceneTitle: scene?.title ?? null,
    lines:
      scene?.dialogue.slice(0, maxLines).map((entry) => ({
        id: entry.id,
        speaker: getDialogueSpeakerName(entry),
        text: entry.text
      })) ?? []
  };
}
