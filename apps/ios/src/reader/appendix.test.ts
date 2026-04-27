import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APPENDIX_MARKDOWN,
  parseAppendixInlineText,
  parseAppendixMarkdown
} from "./appendix";

describe("native reader appendix", () => {
  it("keeps the iOS appendix copy in sync with lore/appendix.md", () => {
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const appendixMarkdown = readFileSync(
      resolve(testDirectory, "../../../../lore/appendix.md"),
      "utf8"
    );

    expect(APPENDIX_MARKDOWN).toBe(appendixMarkdown);
  });

  it("parses the appendix title and house headings", () => {
    const appendix = parseAppendixMarkdown(APPENDIX_MARKDOWN);

    expect(appendix.title).toBe("Appendix");
    expect(appendix.sections).toHaveLength(5);
    expect(appendix.sections.map((section) => section.title)).toEqual([
      "HOUSE VALAMERE in VALESTRIA",
      "HOUSE VELYR in MIRATH",
      "HOUSE SAFFRYN in AZDARA",
      "HOUSE MONTCLERE in AURELION",
      "HOUSE VAARGARD in FROSTGARD"
    ]);
  });

  it("parses paragraphs and marks principal-house summaries as quiet", () => {
    const appendix = parseAppendixMarkdown(APPENDIX_MARKDOWN);
    const valamere = appendix.sections[0];
    const openingBlock = valamere?.blocks[0];
    const summaryBlock = valamere?.blocks.at(-1);

    expect(openingBlock).toMatchObject({
      kind: "paragraph",
      quiet: false
    });
    expect(summaryBlock).toMatchObject({
      kind: "paragraph",
      quiet: true
    });
  });

  it("parses list depth from indented markdown bullets", () => {
    const appendix = parseAppendixMarkdown(APPENDIX_MARKDOWN);
    const valamereListItems =
      appendix.sections[0]?.blocks.filter(
        (block) => block.kind === "listItem"
      ) ?? [];
    const zareenItem = valamereListItems.find((block) =>
      block.segments.some((segment) => segment.text.includes("QUEEN ZAREEN"))
    );
    const corvinItem = valamereListItems.find((block) =>
      block.segments.some((segment) => segment.text.includes("SER CORVIN"))
    );

    expect(zareenItem).toMatchObject({
      depth: 1,
      kind: "listItem"
    });
    expect(corvinItem).toMatchObject({
      depth: 2,
      kind: "listItem"
    });
  });

  it("strips bold markers and extracts highlighted brace tokens", () => {
    expect(parseAppendixInlineText("**House** {KING AEDRIC}")).toEqual([
      {
        highlight: false,
        text: "House "
      },
      {
        highlight: true,
        text: "KING AEDRIC"
      }
    ]);
  });
});
