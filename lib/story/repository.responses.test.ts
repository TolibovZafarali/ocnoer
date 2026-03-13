import { DialogueKind, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const playerResponseCreateMock = vi.fn();
const playerResponseFindManyMock = vi.fn();
const dialogueEntryFindUniqueMock = vi.fn();
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
    dialogueEntry: {
      findUnique: dialogueEntryFindUniqueMock
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
      dialogueEntry: {
        findUnique: typeof dialogueEntryFindUniqueMock;
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
        dialogueEntry: {
          findUnique: dialogueEntryFindUniqueMock
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
    ).rejects.toThrow("Signed-in account is not configured for player response capture.");
  });

  it("validates prompt context before creating a response", async () => {
    dialogueEntryFindUniqueMock.mockResolvedValueOnce({
      id: "entry-1",
      kind: DialogueKind.player_prompt,
      sceneId: "scene-1",
      scene: {
        chapterId: "chapter-1"
      }
    });
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
        dialogueEntryId: "entry-1",
        sceneId: "scene-1",
        chapterId: "chapter-1",
        userEmail: "player@example.com",
        responseText: "  hello  "
      })
    ).resolves.toEqual({ id: "response-1" });

    expect(playerResponseCreateMock).toHaveBeenCalledWith({
      data: {
        dialogueEntryId: "entry-1",
        sceneId: "scene-1",
        chapterId: "chapter-1",
        userId: "user-1",
        responseText: "hello"
      }
    });
  });

  it("rejects empty trimmed response text", async () => {
    const { createPlayerPromptResponse } = await import("@/lib/story/repository");

    await expect(
      createPlayerPromptResponse({
        dialogueEntryId: "entry-1",
        sceneId: "scene-1",
        chapterId: "chapter-1",
        userEmail: "player@example.com",
        responseText: "   "
      })
    ).rejects.toThrow("Response text cannot be empty.");
  });

  it("rejects mismatched prompt context", async () => {
    dialogueEntryFindUniqueMock.mockResolvedValueOnce({
      id: "entry-1",
      kind: DialogueKind.player_prompt,
      sceneId: "scene-9",
      scene: {
        chapterId: "chapter-1"
      }
    });
    const { createPlayerPromptResponse } = await import("@/lib/story/repository");

    await expect(
      createPlayerPromptResponse({
        dialogueEntryId: "entry-1",
        sceneId: "scene-1",
        chapterId: "chapter-1",
        userEmail: "player@example.com",
        responseText: "valid"
      })
    ).rejects.toThrow("Prompt context is invalid or no longer available.");
  });

  it("loads admin responses ordered by newest first", async () => {
    playerResponseFindManyMock.mockResolvedValueOnce([
      {
        id: "response-1",
        responseText: "One",
        createdAt: new Date("2026-03-12T10:00:00.000Z"),
        user: { email: "player@example.com" },
        chapter: { id: "ch-1", title: "Chapter 1", orderIndex: 1 },
        scene: { id: "sc-1", title: "Scene 1", orderIndex: 1 },
        dialogueEntry: { id: "de-1", text: "Prompt text", promptLabel: "Ask" }
      }
    ]);
    const { getAdminPlayerResponses } = await import("@/lib/story/repository");

    await expect(getAdminPlayerResponses()).resolves.toHaveLength(1);
    expect(playerResponseFindManyMock).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { email: true } },
        chapter: { select: { id: true, title: true, orderIndex: true } },
        scene: { select: { id: true, title: true, orderIndex: true } },
        dialogueEntry: { select: { id: true, text: true, promptLabel: true } }
      }
    });
  });
});
