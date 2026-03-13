import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.fn(async () => undefined);
const getUserMock = vi.fn<
  () => Promise<{ data: { user: { email: string | null } } }>
>(async () => ({
  data: {
    user: {
      email: "player@example.com"
    }
  }
}));
const createServerSupabaseClientMock = vi.fn(async () => ({
  auth: {
    getUser: getUserMock
  }
}));
const createPlayerPromptResponseMock = vi.fn(async () => ({ id: "response-1" }));
const revalidatePathMock = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  requireRole: requireRoleMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

vi.mock("@/lib/story/repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/story/repository")>(
    "@/lib/story/repository"
  );

  return {
    ...actual,
    createPlayerPromptResponse: createPlayerPromptResponseMock
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock
}));

describe("submitPlayerPromptResponseAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces player role and saves response", async () => {
    const { submitPlayerPromptResponseAction } = await import(
      "@/app/(player)/play/actions"
    );
    const formData = new FormData();
    formData.set("dialogueEntryId", "entry-1");
    formData.set("sceneId", "scene-1");
    formData.set("chapterId", "chapter-1");
    formData.set("responseText", "hello");

    await expect(
      submitPlayerPromptResponseAction(
        {
          status: "idle",
          message: null,
          dialogueEntryId: null
        },
        formData
      )
    ).resolves.toEqual({
      status: "success",
      message: "Response saved.",
      dialogueEntryId: "entry-1"
    });

    expect(requireRoleMock).toHaveBeenCalledWith("player");
    expect(createPlayerPromptResponseMock).toHaveBeenCalledWith({
      dialogueEntryId: "entry-1",
      sceneId: "scene-1",
      chapterId: "chapter-1",
      userEmail: "player@example.com",
      responseText: "hello"
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("rejects empty trimmed responses", async () => {
    const { submitPlayerPromptResponseAction } = await import(
      "@/app/(player)/play/actions"
    );
    const formData = new FormData();
    formData.set("dialogueEntryId", "entry-1");
    formData.set("sceneId", "scene-1");
    formData.set("chapterId", "chapter-1");
    formData.set("responseText", "   ");

    await expect(
      submitPlayerPromptResponseAction(
        {
          status: "idle",
          message: null,
          dialogueEntryId: null
        },
        formData
      )
    ).resolves.toEqual({
      status: "error",
      message: "Response is required.",
      dialogueEntryId: "entry-1"
    });

    expect(createPlayerPromptResponseMock).not.toHaveBeenCalled();
  });

  it("rejects when player email is unavailable", async () => {
    getUserMock.mockResolvedValueOnce({
      data: {
        user: {
          email: null
        }
      }
    });
    const { submitPlayerPromptResponseAction } = await import(
      "@/app/(player)/play/actions"
    );
    const formData = new FormData();
    formData.set("dialogueEntryId", "entry-1");
    formData.set("sceneId", "scene-1");
    formData.set("chapterId", "chapter-1");
    formData.set("responseText", "hello");

    await expect(
      submitPlayerPromptResponseAction(
        {
          status: "idle",
          message: null,
          dialogueEntryId: null
        },
        formData
      )
    ).resolves.toEqual({
      status: "error",
      message: "Unable to resolve your account email for response capture.",
      dialogueEntryId: "entry-1"
    });
  });

  it("bubbles non-player access rejection", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("forbidden"));
    const { submitPlayerPromptResponseAction } = await import(
      "@/app/(player)/play/actions"
    );
    const formData = new FormData();
    formData.set("dialogueEntryId", "entry-1");
    formData.set("sceneId", "scene-1");
    formData.set("chapterId", "chapter-1");
    formData.set("responseText", "hello");

    await expect(
      submitPlayerPromptResponseAction(
        {
          status: "idle",
          message: null,
          dialogueEntryId: null
        },
        formData
      )
    ).rejects.toThrow("forbidden");
  });
});
