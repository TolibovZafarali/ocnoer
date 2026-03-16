import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const playerResponseCreateMock = vi.fn();
const playerResponseFindManyMock = vi.fn();
const readingProgressFindUniqueMock = vi.fn();
const readingProgressUpsertMock = vi.fn();
const publishedStoryVersionFindManyMock = vi.fn();
const publishedStoryVersionFindFirstMock = vi.fn();
const publishedStoryVersionFindUniqueMock = vi.fn();
const publishedStoryVersionUpdateManyMock = vi.fn();
const publishedStoryVersionUpdateMock = vi.fn();
const publishedStoryVersionCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
      create: userCreateMock
    },
    playerResponse: {
      create: playerResponseCreateMock,
      findMany: playerResponseFindManyMock
    },
    readingProgress: {
      findUnique: readingProgressFindUniqueMock,
      upsert: readingProgressUpsertMock
    },
    publishedStoryVersion: {
      findMany: publishedStoryVersionFindManyMock,
      findFirst: publishedStoryVersionFindFirstMock,
      findUnique: publishedStoryVersionFindUniqueMock,
      updateMany: publishedStoryVersionUpdateManyMock,
      update: publishedStoryVersionUpdateMock,
      create: publishedStoryVersionCreateMock
    },
    $transaction: transactionMock
  }
}));

describe("player response repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    type TransactionMockClient = {
      user: {
        findUnique: typeof userFindUniqueMock;
        create: typeof userCreateMock;
      };
      playerResponse: {
        create: typeof playerResponseCreateMock;
      };
      publishedStoryVersion: {
        updateMany: typeof publishedStoryVersionUpdateManyMock;
        update: typeof publishedStoryVersionUpdateMock;
        create: typeof publishedStoryVersionCreateMock;
      };
    };
    type TransactionCallback = (client: TransactionMockClient) => unknown;

    transactionMock.mockImplementation(async (callback: TransactionCallback) =>
      callback({
        user: {
          findUnique: userFindUniqueMock,
          create: userCreateMock
        },
        playerResponse: {
          create: playerResponseCreateMock
        },
        publishedStoryVersion: {
          updateMany: publishedStoryVersionUpdateManyMock,
          update: publishedStoryVersionUpdateMock,
          create: publishedStoryVersionCreateMock
        }
      })
    );
  });

  it("auto-creates player user when missing", async () => {
    userFindUniqueMock.mockResolvedValueOnce(null);
    userCreateMock.mockResolvedValueOnce({
      id: "user-1",
      email: "player@example.com",
      role: Role.player
    });
    const { resolveOrUpsertPlayerUserByEmail } = await import(
      "@/lib/story/repository"
    );

    await expect(
      resolveOrUpsertPlayerUserByEmail(" PLAYER@EXAMPLE.COM ")
    ).resolves.toEqual({
      id: "user-1",
      email: "player@example.com",
      role: Role.player
    });

    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "player@example.com" },
      select: { id: true, email: true, role: true }
    });
    expect(userCreateMock).toHaveBeenCalledWith({
      data: { email: "player@example.com", role: Role.player },
      select: { id: true, email: true, role: true }
    });
  });

  it("rejects existing non-player account mapping", async () => {
    userFindUniqueMock.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: Role.admin
    });
    const { resolveOrUpsertPlayerUserByEmail } = await import(
      "@/lib/story/repository"
    );

    await expect(
      resolveOrUpsertPlayerUserByEmail("admin@example.com")
    ).rejects.toThrow(
      "Signed-in account is not configured for player response capture."
    );
  });

  it("persists runtime-versioned prompt responses", async () => {
    userFindUniqueMock.mockResolvedValueOnce({
      id: "user-1",
      email: "player@example.com",
      role: Role.player
    });
    playerResponseCreateMock.mockResolvedValueOnce({
      id: "response-1"
    });

    const { createPlayerPromptResponse } = await import("@/lib/story/repository");

    await expect(
      createPlayerPromptResponse({
        publishedVersionId: "version-2",
        chapterPublicId: "chapter-public-1",
        chapterTitle: "Chapter 1",
        chapterSlug: "chapter-1",
        chapterOrderIndex: 1,
        scenePublicId: "scene-public-1",
        sceneTitle: "Scene 1",
        sceneOrderIndex: 1,
        dialogueEntryPublicId: "entry-public-1",
        promptLabel: "Ask",
        promptText: "  Who are you?  ",
        userEmail: "player@example.com",
        responseText: "  hello  "
      })
    ).resolves.toEqual({ id: "response-1" });

    expect(playerResponseCreateMock).toHaveBeenCalledWith({
      data: {
        publishedVersionId: "version-2",
        chapterPublicId: "chapter-public-1",
        chapterTitle: "Chapter 1",
        chapterSlug: "chapter-1",
        chapterOrderIndex: 1,
        scenePublicId: "scene-public-1",
        sceneTitle: "Scene 1",
        sceneOrderIndex: 1,
        dialogueEntryPublicId: "entry-public-1",
        promptLabel: "Ask",
        promptText: "  Who are you?  ",
        userId: "user-1",
        responseText: "hello"
      }
    });
  });

  it("rejects empty trimmed response text", async () => {
    const { createPlayerPromptResponse } = await import("@/lib/story/repository");

    await expect(
      createPlayerPromptResponse({
        publishedVersionId: "version-2",
        chapterPublicId: "chapter-public-1",
        chapterTitle: "Chapter 1",
        chapterSlug: "chapter-1",
        chapterOrderIndex: 1,
        scenePublicId: "scene-public-1",
        sceneTitle: "Scene 1",
        sceneOrderIndex: 1,
        dialogueEntryPublicId: "entry-public-1",
        promptLabel: null,
        promptText: "Prompt",
        userEmail: "player@example.com",
        responseText: "   "
      })
    ).rejects.toThrow("Response text cannot be empty.");
  });

  it("loads admin responses ordered by newest first", async () => {
    playerResponseFindManyMock.mockResolvedValueOnce([
      {
        id: "response-1",
        responseText: "One",
        createdAt: new Date("2026-03-12T10:00:00.000Z"),
        publishedVersion: {
          id: "version-2",
          version: 2,
          isActive: true
        },
        user: { email: "player@example.com" },
        chapterPublicId: "chapter-public-1",
        chapterSlug: "chapter-1",
        chapterTitle: "Chapter 1",
        chapterOrderIndex: 1,
        scenePublicId: "scene-public-1",
        sceneTitle: "Scene 1",
        sceneOrderIndex: 1,
        dialogueEntryPublicId: "entry-public-1",
        promptText: "Prompt text",
        promptLabel: "Ask"
      }
    ]);
    const { getAdminPlayerResponses } = await import("@/lib/story/repository");

    await expect(getAdminPlayerResponses()).resolves.toEqual([
      {
        id: "response-1",
        responseText: "One",
        createdAt: new Date("2026-03-12T10:00:00.000Z"),
        publishedVersion: {
          id: "version-2",
          version: 2,
          isActive: true
        },
        user: { email: "player@example.com" },
        chapter: {
          id: "chapter-public-1",
          slug: "chapter-1",
          title: "Chapter 1",
          orderIndex: 1
        },
        scene: {
          id: "scene-public-1",
          title: "Scene 1",
          orderIndex: 1
        },
        dialogueEntry: {
          id: "entry-public-1",
          text: "Prompt text",
          promptLabel: "Ask"
        }
      }
    ]);
    expect(playerResponseFindManyMock).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        publishedVersion: {
          select: {
            id: true,
            version: true,
            isActive: true
          }
        },
        user: { select: { email: true } }
      }
    });
  });

  it("loads reading progress by user id", async () => {
    const updatedAt = new Date("2026-03-13T10:00:00.000Z");
    const lastReadAt = new Date("2026-03-13T09:59:00.000Z");
    readingProgressFindUniqueMock.mockResolvedValueOnce({
      publishedVersionId: "version-2",
      chapterPublicId: "chapter-public-1",
      scenePublicId: "scene-public-1",
      dialogueEntryPublicId: "entry-public-1",
      lastReadAt,
      updatedAt
    });
    const { getReadingProgressForUserId } = await import(
      "@/lib/story/repository"
    );

    await expect(getReadingProgressForUserId("user-1")).resolves.toEqual({
      publishedVersionId: "version-2",
      chapterPublicId: "chapter-public-1",
      scenePublicId: "scene-public-1",
      dialogueEntryPublicId: "entry-public-1",
      lastReadAt,
      updatedAt
    });

    expect(readingProgressFindUniqueMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        publishedVersionId: true,
        chapterPublicId: true,
        scenePublicId: true,
        dialogueEntryPublicId: true,
        lastReadAt: true,
        updatedAt: true
      }
    });
  });

  it("upserts reading progress using runtime public ids", async () => {
    const lastReadAt = new Date("2026-03-13T10:00:00.000Z");
    readingProgressUpsertMock.mockResolvedValueOnce({ id: "progress-1" });
    const { upsertReadingProgress } = await import("@/lib/story/repository");

    await expect(
      upsertReadingProgress({
        userId: "user-1",
        publishedVersionId: "version-2",
        chapterPublicId: "chapter-public-1",
        scenePublicId: "scene-public-1",
        dialogueEntryPublicId: "entry-public-1",
        lastReadAt
      })
    ).resolves.toEqual({ id: "progress-1" });

    expect(readingProgressUpsertMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {
        publishedVersionId: "version-2",
        chapterPublicId: "chapter-public-1",
        scenePublicId: "scene-public-1",
        dialogueEntryPublicId: "entry-public-1",
        lastReadAt
      },
      create: {
        userId: "user-1",
        publishedVersionId: "version-2",
        chapterPublicId: "chapter-public-1",
        scenePublicId: "scene-public-1",
        dialogueEntryPublicId: "entry-public-1",
        lastReadAt
      }
    });
  });

  it("activates a published story version without recompiling", async () => {
    publishedStoryVersionUpdateManyMock.mockResolvedValueOnce({ count: 2 });
    publishedStoryVersionUpdateMock.mockResolvedValueOnce({
      id: "version-2",
      version: 2,
      isActive: true
    });
    const { activatePublishedStoryVersion } = await import(
      "@/lib/story/repository"
    );

    await expect(activatePublishedStoryVersion("version-2")).resolves.toEqual({
      id: "version-2",
      version: 2,
      isActive: true
    });

    expect(publishedStoryVersionUpdateManyMock).toHaveBeenCalledWith({
      data: { isActive: false }
    });
    expect(publishedStoryVersionUpdateMock).toHaveBeenCalledWith({
      where: { id: "version-2" },
      data: {
        isActive: true,
        activatedAt: expect.any(Date)
      }
    });
  });

  it("creates and activates a new published story version", async () => {
    publishedStoryVersionUpdateManyMock.mockResolvedValueOnce({ count: 1 });
    publishedStoryVersionCreateMock.mockResolvedValueOnce({
      id: "version-3",
      version: 3,
      isActive: true,
      manifestStoragePath: "runtime/story/v3/manifest.json",
      storagePrefix: "story/v3"
    });
    const { createPublishedStoryVersion } = await import(
      "@/lib/story/repository"
    );

    await expect(
      createPublishedStoryVersion({
        version: 3,
        manifestStoragePath: "runtime/story/v3/manifest.json",
        storagePrefix: "story/v3"
      })
    ).resolves.toEqual({
      id: "version-3",
      version: 3,
      isActive: true,
      manifestStoragePath: "runtime/story/v3/manifest.json",
      storagePrefix: "story/v3"
    });

    expect(publishedStoryVersionUpdateManyMock).toHaveBeenCalledWith({
      data: { isActive: false }
    });
    expect(publishedStoryVersionCreateMock).toHaveBeenCalledWith({
      data: {
        id: undefined,
        version: 3,
        isActive: true,
        manifestStoragePath: "runtime/story/v3/manifest.json",
        storagePrefix: "story/v3",
        activatedAt: expect.any(Date)
      }
    });
  });
});
