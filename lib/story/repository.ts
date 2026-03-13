import { AssetType, DialogueKind, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { validateDialogueRules } from "@/lib/story/validation";

export class StoryRepositoryError extends Error {}

export async function getAdminStoryGraph() {
  const [chapters, characters] = await Promise.all([
    prisma.chapter.findMany({
      orderBy: { orderIndex: "asc" },
      include: {
        scenes: {
          orderBy: { orderIndex: "asc" },
          include: {
            assets: {
              orderBy: { createdAt: "asc" }
            },
            dialogueEntries: {
              orderBy: { orderIndex: "asc" },
              include: {
                character: true
              }
            }
          }
        }
      }
    }),
    prisma.character.findMany({
      orderBy: { name: "asc" }
    })
  ]);

  return {
    chapters,
    characters
  };
}

export type ReaderEntry = {
  id: string;
  kind: DialogueKind;
  orderIndex: number;
  text: string;
  promptLabel: string | null;
  character: {
    id: string;
    name: string;
    slug: string;
    defaultPortraitPath: string | null;
  } | null;
};

export type ResolvedSceneMedia = {
  backgroundImagePath: string | null;
  backgroundMusicPath: string | null;
};

export type ReaderScene = {
  id: string;
  title: string | null;
  orderIndex: number;
  media: ResolvedSceneMedia;
  entries: ReaderEntry[];
};

export type ReaderChapter = {
  id: string;
  title: string;
  slug: string;
  orderIndex: number;
  scenes: ReaderScene[];
};

function resolveSceneMedia(scene: {
  backgroundImagePath: string | null;
  backgroundMusicPath: string | null;
  assets: Array<{
    type: AssetType;
    storagePath: string;
  }>;
}): ResolvedSceneMedia {
  const backgroundImageAsset = scene.assets.find(
    (asset) => asset.type === AssetType.background_image
  );
  const backgroundMusicAsset = scene.assets.find(
    (asset) => asset.type === AssetType.background_music
  );

  return {
    backgroundImagePath:
      scene.backgroundImagePath ?? backgroundImageAsset?.storagePath ?? null,
    backgroundMusicPath:
      scene.backgroundMusicPath ?? backgroundMusicAsset?.storagePath ?? null
  };
}

export async function getFirstPlayableChapter(): Promise<ReaderChapter | null> {
  const chapter = await prisma.chapter.findFirst({
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

  if (!chapter) {
    return null;
  }

  return {
    id: chapter.id,
    title: chapter.title,
    slug: chapter.slug,
    orderIndex: chapter.orderIndex,
    scenes: chapter.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      orderIndex: scene.orderIndex,
      media: resolveSceneMedia(scene),
      entries: scene.dialogueEntries.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        orderIndex: entry.orderIndex,
        text: entry.text,
        promptLabel: entry.promptLabel,
        character: entry.character
      }))
    }))
  };
}

export async function createChapter(input: {
  title: string;
  slug: string;
  orderIndex: number;
  isPublished: boolean;
}) {
  try {
    return await prisma.chapter.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to create chapter.");
  }
}

export async function updateChapter(input: {
  chapterId: string;
  title: string;
  slug: string;
  orderIndex: number;
  isPublished: boolean;
}) {
  try {
    return await prisma.chapter.update({
      where: { id: input.chapterId },
      data: {
        title: input.title,
        slug: input.slug,
        orderIndex: input.orderIndex,
        isPublished: input.isPublished
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update chapter.");
  }
}

export async function deleteChapter(chapterId: string) {
  try {
    await prisma.chapter.delete({
      where: { id: chapterId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete chapter.");
  }
}

export async function createScene(input: {
  chapterId: string;
  title: string | null;
  orderIndex: number;
  backgroundImagePath: string | null;
  backgroundMusicPath: string | null;
}) {
  try {
    return await prisma.scene.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to create scene.");
  }
}

export async function updateScene(input: {
  sceneId: string;
  chapterId: string;
  title: string | null;
  orderIndex: number;
  backgroundImagePath: string | null;
  backgroundMusicPath: string | null;
}) {
  try {
    return await prisma.scene.update({
      where: { id: input.sceneId },
      data: {
        chapterId: input.chapterId,
        title: input.title,
        orderIndex: input.orderIndex,
        backgroundImagePath: input.backgroundImagePath,
        backgroundMusicPath: input.backgroundMusicPath
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update scene.");
  }
}

export async function deleteScene(sceneId: string) {
  try {
    await prisma.scene.delete({
      where: { id: sceneId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete scene.");
  }
}

export async function createCharacter(input: {
  name: string;
  slug: string;
  bio: string | null;
  notes: string | null;
  defaultPortraitPath: string | null;
}) {
  try {
    return await prisma.character.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to create character.");
  }
}

export async function updateCharacter(input: {
  characterId: string;
  name: string;
  slug: string;
  bio: string | null;
  notes: string | null;
  defaultPortraitPath: string | null;
}) {
  try {
    return await prisma.character.update({
      where: { id: input.characterId },
      data: {
        name: input.name,
        slug: input.slug,
        bio: input.bio,
        notes: input.notes,
        defaultPortraitPath: input.defaultPortraitPath
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update character.");
  }
}

export async function deleteCharacter(characterId: string) {
  try {
    await prisma.character.delete({
      where: { id: characterId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete character.");
  }
}

async function ensureCharacterAssignment(
  kind: DialogueKind,
  characterId: string | null
) {
  const validation = validateDialogueRules({ kind, characterId });

  if (!validation.ok) {
    throw new StoryRepositoryError(validation.message);
  }

  if (characterId) {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true }
    });

    if (!character) {
      throw new StoryRepositoryError("Assigned character does not exist.");
    }
  }
}

export async function createDialogueEntry(input: {
  sceneId: string;
  kind: DialogueKind;
  orderIndex: number;
  text: string;
  promptLabel: string | null;
  characterId: string | null;
}) {
  await ensureCharacterAssignment(input.kind, input.characterId);

  try {
    return await prisma.dialogueEntry.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to create dialogue entry.");
  }
}

export async function updateDialogueEntry(input: {
  dialogueEntryId: string;
  sceneId: string;
  kind: DialogueKind;
  orderIndex: number;
  text: string;
  promptLabel: string | null;
  characterId: string | null;
}) {
  await ensureCharacterAssignment(input.kind, input.characterId);

  try {
    return await prisma.dialogueEntry.update({
      where: { id: input.dialogueEntryId },
      data: {
        sceneId: input.sceneId,
        kind: input.kind,
        orderIndex: input.orderIndex,
        text: input.text,
        promptLabel: input.promptLabel,
        characterId: input.characterId
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update dialogue entry.");
  }
}

export async function deleteDialogueEntry(dialogueEntryId: string) {
  try {
    await prisma.dialogueEntry.delete({
      where: { id: dialogueEntryId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete dialogue entry.");
  }
}

export async function createSceneAsset(input: {
  sceneId: string;
  type: AssetType;
  storagePath: string;
  altText: string | null;
  label: string | null;
}) {
  try {
    return await prisma.sceneAsset.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to create scene asset.");
  }
}

export async function updateSceneAsset(input: {
  sceneAssetId: string;
  sceneId: string;
  type: AssetType;
  storagePath: string;
  altText: string | null;
  label: string | null;
}) {
  try {
    return await prisma.sceneAsset.update({
      where: { id: input.sceneAssetId },
      data: {
        sceneId: input.sceneId,
        type: input.type,
        storagePath: input.storagePath,
        altText: input.altText,
        label: input.label
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update scene asset.");
  }
}

export async function deleteSceneAsset(sceneAssetId: string) {
  try {
    await prisma.sceneAsset.delete({
      where: { id: sceneAssetId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete scene asset.");
  }
}

export const StoryEnums = {
  dialogueKinds: Object.values(DialogueKind),
  assetTypes: Object.values(AssetType)
} as const;

export type StoryGraph = Awaited<ReturnType<typeof getAdminStoryGraph>>;

export type StoryTransactionClient = Prisma.TransactionClient;
