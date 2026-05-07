import { describe, expect, it } from "vitest";

import {
  BASE_DRESS_OPTION_KEY,
  type RuntimeDialogueSpeaker
} from "@ocnoer/story-core";

import {
  createNativeReaderDressOptionImageKey,
  getNativeReaderDressOptionAtIndex,
  getNativeReaderDressOptionImageUrls,
  isNativeReaderDressPreviewReady,
  isResolvedNativeReaderDressOption,
  isSelectableRuntimeDressOptionKey,
  normalizeNativeReaderDressIndex,
  type ResolvedNativeReaderDressOption
} from "./dressChoice";
import type { NativeReaderDressOption } from "./readerPresentation";

const dressOptions: NativeReaderDressOption[] = [
  {
    key: BASE_DRESS_OPTION_KEY,
    label: "Default Dress",
    previewImageUrl:
      "https://example.supabase.co/storage/v1/object/public/runtime/media/ocnoer-default.png"
  },
  {
    key: "gala",
    label: "Gala",
    previewImageUrl:
      "https://example.supabase.co/storage/v1/object/public/runtime/media/ocnoer-gala.png"
  },
  {
    key: "celestial",
    label: "Celestial",
    previewImageUrl:
      "https://example.supabase.co/storage/v1/object/public/runtime/media/ocnoer-celestial.png"
  }
];

describe("native reader dress choice", () => {
  it("resolves all three carousel options to visible image URLs", () => {
    const urls = getNativeReaderDressOptionImageUrls(dressOptions);

    expect(urls).toHaveLength(3);
    expect(urls.every((url) => url.length > 0)).toBe(true);

    [0, 1, 2].forEach((index) => {
      const choice = getNativeReaderDressOptionAtIndex(dressOptions, index);

      expect(choice.index).toBe(index);
      expect(isResolvedNativeReaderDressOption(choice.option)).toBe(true);
      expect(
        (choice.option as ResolvedNativeReaderDressOption).previewImageUrl
      ).toBe(urls[index]);
    });
  });

  it("keeps rapid carousel switching inside valid option bounds", () => {
    const rapidSequence = [0, 1, 2, 1, 0];

    rapidSequence.forEach((index) => {
      const choice = getNativeReaderDressOptionAtIndex(dressOptions, index);

      expect(choice.option?.previewImageUrl).toBeTruthy();
    });

    expect(normalizeNativeReaderDressIndex(-1, dressOptions.length)).toBe(2);
    expect(normalizeNativeReaderDressIndex(3, dressOptions.length)).toBe(0);
  });

  it("uses stable image keys and treats pending previews as not selectable", () => {
    const firstOption = dressOptions[0]!;
    const secondOption = dressOptions[1]!;

    expect(createNativeReaderDressOptionImageKey(firstOption)).toBe(
      "__base__:https://example.supabase.co/storage/v1/object/public/runtime/media/ocnoer-default.png"
    );
    expect(
      isNativeReaderDressPreviewReady({
        option: firstOption,
        visibleOption: firstOption
      })
    ).toBe(true);
    expect(
      isNativeReaderDressPreviewReady({
        option: secondOption,
        visibleOption: firstOption
      })
    ).toBe(false);
    expect(
      isNativeReaderDressPreviewReady({
        option: secondOption,
        visibleOption: secondOption,
        failedPreviewKey: createNativeReaderDressOptionImageKey(secondOption)
      })
    ).toBe(false);
    expect(
      isNativeReaderDressPreviewReady({
        option: { key: "broken", label: "Broken", previewImageUrl: null },
        visibleOption: { key: "broken", label: "Broken", previewImageUrl: null }
      })
    ).toBe(false);
  });

  it("rejects selected dress keys without a resolved prompt image path", () => {
    const speaker: RuntimeDialogueSpeaker = {
      type: "dress_prompt",
      characterId: "character_ocnoer",
      characterName: "Ocnoer",
      characterSlug: "ocnoer",
      dressOptions: [
        {
          key: "gala",
          label: "Gala",
          previewImagePath: "runtime/media/ocnoer-gala.png"
        },
        {
          key: "broken",
          label: "Broken",
          previewImagePath: null
        }
      ]
    };

    expect(isSelectableRuntimeDressOptionKey(speaker, "gala")).toBe(true);
    expect(isSelectableRuntimeDressOptionKey(speaker, "broken")).toBe(false);
    expect(isSelectableRuntimeDressOptionKey(speaker, "missing")).toBe(false);
  });
});
