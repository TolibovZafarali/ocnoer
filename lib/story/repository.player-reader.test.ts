import { DialogueKind } from "@prisma/client";
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

  it("queries the first chapter with scene media assets and character portraits", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const { getFirstPlayableChapter } = await import("@/lib/story/repository");

    await getFirstPlayableChapter();

    expect(findFirstMock).toHaveBeenCalledWith({
      orderBy: {
        orderIndex: "asc"
      },
      include: {
        imageAsset: {
          select: {
            storagePath: true
          }
        },
        scenes: {
          orderBy: { orderIndex: "asc" },
          include: {
            backgroundImageAsset: {
              select: {
                storagePath: true
              }
            },
            backgroundMusicAsset: {
              select: {
                storagePath: true
              }
            },
            characterAppearances: {
              include: {
                portrait: {
                  select: {
                    storagePath: true
                  }
                }
              }
            },
            dialogueEntries: {
              orderBy: { orderIndex: "asc" },
              include: {
                character: {
                  select: {
                    id: true,
                    publicId: true,
                    name: true,
                    slug: true,
                    portraits: {
                      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                      take: 1,
                      select: {
                        storagePath: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  it("returns null when no chapter exists", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    const { getFirstPlayableChapter } = await import("@/lib/story/repository");

    await expect(getFirstPlayableChapter()).resolves.toBeNull();
  });

  it("resolves scene media and scene-bound character portrait using runtime ids", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "chapter-db-1",
      publicId: "chapter-public-1",
      title: "Chapter 1",
      slug: "chapter-1",
      orderIndex: 1,
      imageAsset: {
        storagePath: "chapters/ch1.jpg"
      },
      scenes: [
        {
          id: "scene-db-1",
          publicId: "scene-public-1",
          title: "Scene 1",
          orderIndex: 1,
          backgroundImageAsset: {
            storagePath: "scenes/ch1/primary.jpg"
          },
          backgroundMusicAsset: {
            storagePath: "music/ch1/theme.mp3"
          },
          characterAppearances: [
            {
              characterId: "char-db-1",
              portrait: {
                storagePath: "portraits/ocnoer/angry.png"
              }
            }
          ],
          dialogueEntries: [
            {
              id: "entry-db-1",
              publicId: "entry-public-1",
              kind: DialogueKind.speech,
              orderIndex: 1,
              text: "Line",
              promptLabel: null,
              character: {
                id: "char-db-1",
                publicId: "character-public-1",
                name: "Ocnoer",
                slug: "ocnoer",
                portraits: [
                  {
                    storagePath: "portraits/ocnoer/default.png"
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    const { getFirstPlayableChapter } = await import("@/lib/story/repository");

    await expect(getFirstPlayableChapter()).resolves.toEqual({
      id: "chapter-public-1",
      title: "Chapter 1",
      slug: "chapter-1",
      orderIndex: 1,
      imagePath: "chapters/ch1.jpg",
      scenes: [
        {
          id: "scene-public-1",
          title: "Scene 1",
          orderIndex: 1,
          media: {
            backgroundImagePath: "scenes/ch1/primary.jpg",
            backgroundMusicPath: "music/ch1/theme.mp3"
          },
          entries: [
            {
              id: "entry-public-1",
              kind: DialogueKind.speech,
              orderIndex: 1,
              text: "Line",
              promptLabel: null,
              character: {
                id: "character-public-1",
                name: "Ocnoer",
                slug: "ocnoer",
                portraitPath: "portraits/ocnoer/angry.png"
              }
            }
          ]
        }
      ]
    });
  });
});
