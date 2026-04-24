import type { PlayerBoundaryState } from "@ocnoer/story-core";

import type { NativeReaderPresentation } from "./readerPresentation";

export type NativeReaderBoundaryPresentation = {
  type: PlayerBoundaryState["type"];
  eyebrow: string;
  title: string;
  body: string;
  meta: string | null;
  primaryActionLabel: string | null;
};

export function createNativeReaderBoundaryPresentation(input: {
  boundaryState: PlayerBoundaryState | null;
  presentation: NativeReaderPresentation | null;
}): NativeReaderBoundaryPresentation | null {
  const { boundaryState, presentation } = input;

  if (!boundaryState) {
    return null;
  }

  switch (boundaryState.type) {
    case "chapter-opening-card":
      return {
        type: boundaryState.type,
        eyebrow: "Chapter Opening",
        title: boundaryState.chapterTitle,
        body: boundaryState.text,
        meta: null,
        primaryActionLabel: "Begin"
      };
    case "chapter-ending-card":
      return {
        type: boundaryState.type,
        eyebrow: "Chapter Ending",
        title: boundaryState.chapterTitle,
        body: boundaryState.text,
        meta:
          boundaryState.nextState.type === "story-finished"
            ? "End of published story"
            : "Chapter complete",
        primaryActionLabel:
          boundaryState.nextState.type === "story-finished"
            ? "Finish"
            : "Continue"
      };
    case "chapter-break":
      return {
        type: boundaryState.type,
        eyebrow: "Chapter Break",
        title: boundaryState.chapterTitle,
        body: "The previous chapter is complete. Continue when you are ready to begin the next chapter.",
        meta: `Chapter ${boundaryState.chapterIndex} of ${boundaryState.chapterCount}`,
        primaryActionLabel: "Begin Chapter"
      };
    case "scene-transition":
      return {
        type: boundaryState.type,
        eyebrow: "Scene Change",
        title: presentation?.sceneTitle ?? "New Scene",
        body: "A new scene begins.",
        meta: presentation
          ? `Scene ${presentation.sceneIndex + 1} of ${presentation.sceneCount}`
          : null,
        primaryActionLabel: "Continue"
      };
    case "story-finished":
      return {
        type: boundaryState.type,
        eyebrow: "Story Complete",
        title: "Story Finished",
        body: "You have reached the end of the currently published story.",
        meta: `Chapter ${boundaryState.chapterIndex} of ${boundaryState.chapterCount}`,
        primaryActionLabel: null
      };
  }
}
