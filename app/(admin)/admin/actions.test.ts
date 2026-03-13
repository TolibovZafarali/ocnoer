import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.fn(async () => undefined);
const revalidatePathMock = vi.fn();
const createChapterMock = vi.fn(async () => ({}));

vi.mock("@/lib/auth/guards", () => ({
  requireRole: requireRoleMock
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock
}));

vi.mock("@/lib/story/repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/story/repository")>(
    "@/lib/story/repository"
  );

  return {
    ...actual,
    createChapter: createChapterMock
  };
});

describe("createChapterAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces admin role and revalidates admin path", async () => {
    const { createChapterAction } = await import("@/app/(admin)/admin/actions");
    const formData = new FormData();
    formData.set("title", "Chapter");
    formData.set("imageAssetId", "asset-1");

    await createChapterAction(formData);

    expect(requireRoleMock).toHaveBeenCalledWith("admin");
    expect(createChapterMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });
});
