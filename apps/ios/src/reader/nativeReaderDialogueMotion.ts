import type { NativeReaderPresentation } from "./readerPresentation";

export function createNativeReaderDialogueAnimationKey(
  presentation: Pick<NativeReaderPresentation, "dialogueEntryId" | "status">
) {
  return `${presentation.status}:${presentation.dialogueEntryId}`;
}
