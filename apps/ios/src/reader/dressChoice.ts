import type { RuntimeDialogueEntry } from "@ocnoer/story-core";

import type { NativeReaderDressOption } from "./readerPresentation";

export type ResolvedNativeReaderDressOption = NativeReaderDressOption & {
  previewImageUrl: string;
};

export function getNativeReaderDressOptionPreviewImageUrl(
  option: NativeReaderDressOption | null | undefined
) {
  const previewImageUrl = option?.previewImageUrl?.trim() ?? "";

  return previewImageUrl.length > 0 ? previewImageUrl : null;
}

export function isResolvedNativeReaderDressOption(
  option: NativeReaderDressOption | null | undefined
): option is ResolvedNativeReaderDressOption {
  return Boolean(getNativeReaderDressOptionPreviewImageUrl(option));
}

export function createNativeReaderDressOptionImageKey(
  option: NativeReaderDressOption | null | undefined
) {
  if (!option) {
    return null;
  }

  return `${option.key}:${getNativeReaderDressOptionPreviewImageUrl(option) ?? "__missing__"}`;
}

export function isNativeReaderDressPreviewReady(input: {
  option: NativeReaderDressOption | null | undefined;
  visibleOption: NativeReaderDressOption | null | undefined;
  failedPreviewKey?: string | null;
}) {
  const selectedPreviewKey = createNativeReaderDressOptionImageKey(
    input.option
  );
  const visiblePreviewKey = createNativeReaderDressOptionImageKey(
    input.visibleOption
  );

  return (
    isResolvedNativeReaderDressOption(input.option) &&
    Boolean(selectedPreviewKey) &&
    selectedPreviewKey === visiblePreviewKey &&
    input.failedPreviewKey !== selectedPreviewKey
  );
}

export function normalizeNativeReaderDressIndex(
  index: number,
  optionCount: number
) {
  if (optionCount <= 0) {
    return -1;
  }

  const integerIndex = Number.isFinite(index) ? Math.trunc(index) : 0;

  return ((integerIndex % optionCount) + optionCount) % optionCount;
}

export function getNativeReaderDressOptionAtIndex(
  options: NativeReaderDressOption[],
  index: number
) {
  const normalizedIndex = normalizeNativeReaderDressIndex(
    index,
    options.length
  );

  return {
    index: normalizedIndex,
    option: normalizedIndex >= 0 ? (options[normalizedIndex] ?? null) : null
  };
}

export function getNativeReaderDressOptionImageUrls(
  options: NativeReaderDressOption[]
) {
  return options
    .map(getNativeReaderDressOptionPreviewImageUrl)
    .filter((url): url is string => Boolean(url));
}

export function isSelectableRuntimeDressOptionKey(
  speaker: RuntimeDialogueEntry["speaker"],
  optionKey: string
) {
  if (speaker.type !== "dress_prompt") {
    return false;
  }

  return speaker.dressOptions.some(
    (option) =>
      option.key === optionKey &&
      typeof option.previewImagePath === "string" &&
      option.previewImagePath.trim().length > 0
  );
}
