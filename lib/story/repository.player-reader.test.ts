import { AssetType, DialogueKind } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chapter: {
      findFirst: findFirstMock
    }
  }
}));

describe("getFirstPlayableChapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries the first published chapter with ordered scenes and dialogue", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const { getFirstPlayableChapter } = await import("@/lib/story/repository");

    await getFirstPlayableChapter();

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        isPublished: true
      },
      orderBy: {
        orderIndex: "asc"
      },
      include: {
        scenes: {
          orderBy: { orderIndex: "asc" },
          include: {
            assets: {
              where: {
                type: {
                  in: [AssetType.background_image, AssetType.background_music]
                }
              },
              orderBy: { createdAt: "asc" }
            },
            dialogueEntries: {
              orderBy: { orderIndex: "asc" },
              include: {
                character: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    defaultPortraitPath: true
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  it("returns null when no published chapter exists", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const { getFirstPlayableChapter } = await import("@/lib/story/repository");

    await expect(getFirstPlayableChapter()).resolves.toBeNull();
  });

  it("prefers scene media fields and falls back to scene assets", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "chapter-1",
      title: "Chapter 1",
      slug: "chapter-1",
      orderIndex: 1,
      scenes: [
        {
          id: "scene-1",
          title: "Scene 1",
          orderIndex: 1,
          backgroundImagePath: "scenes/ch1/primary.jpg",
          backgroundMusicPath: null,
          assets: [
            {
              type: AssetType.background_image,
              storagePath: "scenes/ch1/fallback.jpg"
            },
            {
              type: AssetType.background_music,
              storagePath: "music/ch1/fallback.mp3"
            }
          ],
          dialogueEntries: [
            {
              id: "entry-1",
              kind: DialogueKind.speech,
              orderIndex: 1,
              text: "Line",
              promptLabel: null,
              character: {
                id: "char-1",
                name: "Ocnoer",
                slug: "ocnoer",
                defaultPortraitPath: "portraits/ocnoer/default.png"
              }
            }
          ]
        }
      ]
    });

    const { getFirstPlayableChapter } = await import("@/lib/story/repository");

    await expect(getFirstPlayableChapter()).resolves.toEqual({
      id: "chapter-1",
      title: "Chapter 1",
      slug: "chapter-1",
      orderIndex: 1,
      scenes: [
        {
          id: "scene-1",
          title: "Scene 1",
          orderIndex: 1,
          media: {
            backgroundImagePath: "scenes/ch1/primary.jpg",
            backgroundMusicPath: "music/ch1/fallback.mp3"
          },
          entries: [
            {
              id: "entry-1",
              kind: DialogueKind.speech,
              orderIndex: 1,
              text: "Line",
              promptLabel: null,
              character: {
                id: "char-1",
                name: "Ocnoer",
                slug: "ocnoer",
                defaultPortraitPath: "portraits/ocnoer/default.png"
              }
            }
          ]
        }
      ]
    });
  });
});
