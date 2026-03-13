import {
  DialogueKind,
  Role,
  type MediaAssetType,
  type Prisma
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { validateDialogueRules } from "@/lib/story/validation";
import { slugify } from "@/lib/story/slug";

export class StoryRepositoryError extends Error {}

const MEDIA_ASSET_TYPES = ["background_image", "background_music"] as const;
const MEDIA_ASSET_TYPE = {
  background_image: MEDIA_ASSET_TYPES[0],
  background_music: MEDIA_ASSET_TYPES[1]
} as const;

async function ensureUniqueSlug(
  model: "chapter" | "character" | "house",
  value: string,
  excludeId?: string
) {
  const base = slugify(value);
  let suffix = 1;
  let candidate = base;

  while (true) {
    const exists = await (prisma[model] as unknown as {
      count: (args: { where: Record<string, unknown> }) => Promise<number>;
    }).count({
      where: excludeId
        ? {
            slug: candidate,
            NOT: { id: excludeId }
          }
        : {
            slug: candidate
          }
    });

    if (exists === 0) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

async function getNextChapterOrderIndex() {
  const chapter = await prisma.chapter.findFirst({
    orderBy: {
      orderIndex: "desc"
    },
    select: {
      orderIndex: true
    }
  });

  return (chapter?.orderIndex ?? 0) + 1;
}

async function ensureMediaAssetExists(
  mediaAssetId: string,
  expectedType: MediaAssetType,
  label: string
) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: {
      id: true,
      type: true
    }
  });

  if (!asset || asset.type !== expectedType) {
    throw new StoryRepositoryError(`${label} is invalid.`);
  }
}

export async function getAdminStoryGraph() {
  const [chapters, houses, mediaAssets] = await Promise.all([
    prisma.chapter.findMany({
      orderBy: { orderIndex: "asc" },
      include: {
        imageAsset: true,
        scenes: {
          orderBy: { orderIndex: "asc" },
          include: {
            backgroundImageAsset: true,
            backgroundMusicAsset: true,
            characterAppearances: {
              include: {
                character: {
                  select: {
                    id: true,
                    name: true,
                    slug: true
                  }
                },
                portrait: true
              }
            },
            dialogueEntries: {
              orderBy: { orderIndex: "asc" },
              include: {
                character: {
                  include: {
                    portraits: {
                      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                      take: 1
                    }
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.house.findMany({
      orderBy: { name: "asc" },
      include: {
        characters: {
          orderBy: { name: "asc" },
          include: {
            portraits: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
            }
          }
        }
      }
    }),
    prisma.mediaAsset.findMany({
      orderBy: [{ type: "asc" }, { createdAt: "asc" }]
    })
  ]);

  return {
    chapters,
    houses,
    mediaAssets
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
    portraitPath: string | null;
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
  imagePath: string | null;
  scenes: ReaderScene[];
};

function resolveCharacterPortraitPath(input: {
  characterId: string;
  appearanceMap: Map<string, string | null>;
  defaultPortraitPath: string | null;
}) {
  if (input.appearanceMap.has(input.characterId)) {
    return input.appearanceMap.get(input.characterId) ?? null;
  }

  return input.defaultPortraitPath;
}

export async function getFirstPlayableChapter(): Promise<ReaderChapter | null> {
  const chapter = await prisma.chapter.findFirst({
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

  if (!chapter) {
    return null;
  }

  return {
    id: chapter.id,
    title: chapter.title,
    slug: chapter.slug,
    orderIndex: chapter.orderIndex,
    imagePath: chapter.imageAsset.storagePath,
    scenes: chapter.scenes.map((scene) => {
      const appearanceMap = new Map(
        scene.characterAppearances.map((appearance) => [
          appearance.characterId,
          appearance.portrait?.storagePath ?? null
        ])
      );

      return {
        id: scene.id,
        title: scene.title,
        orderIndex: scene.orderIndex,
        media: {
          backgroundImagePath: scene.backgroundImageAsset.storagePath,
          backgroundMusicPath: scene.backgroundMusicAsset?.storagePath ?? null
        },
        entries: scene.dialogueEntries.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          orderIndex: entry.orderIndex,
          text: entry.text,
          promptLabel: entry.promptLabel,
          character: entry.character
            ? {
                id: entry.character.id,
                name: entry.character.name,
                slug: entry.character.slug,
                portraitPath: resolveCharacterPortraitPath({
                  characterId: entry.character.id,
                  appearanceMap,
                  defaultPortraitPath:
                    entry.character.portraits[0]?.storagePath ?? null
                })
              }
            : null
        }))
      };
    })
  };
}

export async function createChapter(input: {
  title: string;
  imageAssetId: string;
}) {
  await ensureMediaAssetExists(
    input.imageAssetId,
    MEDIA_ASSET_TYPE.background_image,
    "Chapter image asset"
  );

  const [slug, orderIndex] = await Promise.all([
    ensureUniqueSlug("chapter", input.title),
    getNextChapterOrderIndex()
  ]);

  try {
    return await prisma.chapter.create({
      data: {
        title: input.title,
        slug,
        orderIndex,
        imageAssetId: input.imageAssetId
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to create chapter.");
  }
}

export async function updateChapter(input: {
  chapterId: string;
  title: string;
  imageAssetId: string;
}) {
  await ensureMediaAssetExists(
    input.imageAssetId,
    MEDIA_ASSET_TYPE.background_image,
    "Chapter image asset"
  );

  const slug = await ensureUniqueSlug("chapter", input.title, input.chapterId);

  try {
    return await prisma.chapter.update({
      where: { id: input.chapterId },
      data: {
        title: input.title,
        slug,
        imageAssetId: input.imageAssetId
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
  backgroundImageAssetId: string;
  backgroundMusicAssetId: string | null;
}) {
  await ensureMediaAssetExists(
    input.backgroundImageAssetId,
    MEDIA_ASSET_TYPE.background_image,
    "Scene background image asset"
  );

  if (input.backgroundMusicAssetId) {
    await ensureMediaAssetExists(
      input.backgroundMusicAssetId,
      MEDIA_ASSET_TYPE.background_music,
      "Scene background music asset"
    );
  }

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
  backgroundImageAssetId: string;
  backgroundMusicAssetId: string | null;
}) {
  await ensureMediaAssetExists(
    input.backgroundImageAssetId,
    MEDIA_ASSET_TYPE.background_image,
    "Scene background image asset"
  );

  if (input.backgroundMusicAssetId) {
    await ensureMediaAssetExists(
      input.backgroundMusicAssetId,
      MEDIA_ASSET_TYPE.background_music,
      "Scene background music asset"
    );
  }

  try {
    return await prisma.scene.update({
      where: { id: input.sceneId },
      data: {
        chapterId: input.chapterId,
        title: input.title,
        orderIndex: input.orderIndex,
        backgroundImageAssetId: input.backgroundImageAssetId,
        backgroundMusicAssetId: input.backgroundMusicAssetId
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

export async function createHouse(input: {
  name: string;
  notes: string | null;
}) {
  const slug = await ensureUniqueSlug("house", input.name);

  try {
    return await prisma.house.create({
      data: {
        name: input.name,
        notes: input.notes,
        slug
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to create house.");
  }
}

export async function updateHouse(input: {
  houseId: string;
  name: string;
  notes: string | null;
}) {
  const slug = await ensureUniqueSlug("house", input.name, input.houseId);

  try {
    return await prisma.house.update({
      where: { id: input.houseId },
      data: {
        name: input.name,
        notes: input.notes,
        slug
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update house.");
  }
}

export async function deleteHouse(houseId: string) {
  try {
    await prisma.house.delete({
      where: { id: houseId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete house.");
  }
}

export async function createCharacter(input: {
  name: string;
  houseId: string;
  bio: string | null;
  notes: string | null;
}) {
  const [slug, house] = await Promise.all([
    ensureUniqueSlug("character", input.name),
    prisma.house.findUnique({
      where: { id: input.houseId },
      select: { id: true }
    })
  ]);

  if (!house) {
    throw new StoryRepositoryError("Character house is invalid.");
  }

  try {
    return await prisma.character.create({
      data: {
        name: input.name,
        slug,
        houseId: input.houseId,
        bio: input.bio,
        notes: input.notes
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to create character.");
  }
}

export async function updateCharacter(input: {
  characterId: string;
  name: string;
  houseId: string;
  bio: string | null;
  notes: string | null;
}) {
  const [slug, house] = await Promise.all([
    ensureUniqueSlug("character", input.name, input.characterId),
    prisma.house.findUnique({
      where: { id: input.houseId },
      select: { id: true }
    })
  ]);

  if (!house) {
    throw new StoryRepositoryError("Character house is invalid.");
  }

  try {
    return await prisma.character.update({
      where: { id: input.characterId },
      data: {
        name: input.name,
        slug,
        houseId: input.houseId,
        bio: input.bio,
        notes: input.notes
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

export async function createCharacterPortrait(input: {
  characterId: string;
  storagePath: string;
  label: string | null;
  sortOrder: number;
}) {
  try {
    return await prisma.characterPortrait.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to create character portrait.");
  }
}

export async function updateCharacterPortrait(input: {
  portraitId: string;
  characterId: string;
  storagePath: string;
  label: string | null;
  sortOrder: number;
}) {
  try {
    return await prisma.characterPortrait.update({
      where: { id: input.portraitId },
      data: {
        characterId: input.characterId,
        storagePath: input.storagePath,
        label: input.label,
        sortOrder: input.sortOrder
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update character portrait.");
  }
}

export async function deleteCharacterPortrait(portraitId: string) {
  try {
    await prisma.characterPortrait.delete({
      where: { id: portraitId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete character portrait.");
  }
}

export async function upsertSceneCharacterAppearance(input: {
  sceneId: string;
  characterId: string;
  portraitId: string | null;
}) {
  if (input.portraitId) {
    const portrait = await prisma.characterPortrait.findUnique({
      where: { id: input.portraitId },
      select: {
        id: true,
        characterId: true
      }
    });

    if (!portrait || portrait.characterId !== input.characterId) {
      throw new StoryRepositoryError(
        "Character appearance portrait must belong to selected character."
      );
    }
  }

  try {
    return await prisma.sceneCharacterAppearance.upsert({
      where: {
        sceneId_characterId: {
          sceneId: input.sceneId,
          characterId: input.characterId
        }
      },
      update: {
        portraitId: input.portraitId
      },
      create: {
        sceneId: input.sceneId,
        characterId: input.characterId,
        portraitId: input.portraitId
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to save scene character appearance.");
  }
}

export async function deleteSceneCharacterAppearance(input: {
  sceneId: string;
  characterId: string;
}) {
  try {
    await prisma.sceneCharacterAppearance.delete({
      where: {
        sceneId_characterId: {
          sceneId: input.sceneId,
          characterId: input.characterId
        }
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete scene character appearance.");
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

export async function createMediaAsset(input: {
  type: MediaAssetType;
  storagePath: string;
  altText: string | null;
  label: string | null;
}) {
  try {
    return await prisma.mediaAsset.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to create media asset.");
  }
}

export async function updateMediaAsset(input: {
  mediaAssetId: string;
  type: MediaAssetType;
  storagePath: string;
  altText: string | null;
  label: string | null;
}) {
  try {
    return await prisma.mediaAsset.update({
      where: { id: input.mediaAssetId },
      data: {
        type: input.type,
        storagePath: input.storagePath,
        altText: input.altText,
        label: input.label
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to update media asset.");
  }
}

export async function deleteMediaAsset(mediaAssetId: string) {
  try {
    await prisma.mediaAsset.delete({
      where: { id: mediaAssetId }
    });
  } catch {
    throw new StoryRepositoryError("Unable to delete media asset.");
  }
}

type PlayerUserRecord = {
  id: string;
  email: string;
  role: Role;
};

async function resolveOrUpsertPlayerUserByEmailInTx(
  tx: StoryTransactionClient,
  email: string
): Promise<PlayerUserRecord> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new StoryRepositoryError("Player email is required.");
  }

  const existingUser = await tx.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      role: true
    }
  });

  if (existingUser) {
    if (existingUser.role !== Role.player) {
      throw new StoryRepositoryError(
        "Signed-in account is not configured for player response capture."
      );
    }

    return existingUser;
  }

  return tx.user.create({
    data: {
      email: normalizedEmail,
      role: Role.player
    },
    select: {
      id: true,
      email: true,
      role: true
    }
  });
}

export async function resolveOrUpsertPlayerUserByEmail(email: string) {
  try {
    return await prisma.$transaction((tx) =>
      resolveOrUpsertPlayerUserByEmailInTx(tx, email)
    );
  } catch (error) {
    if (error instanceof StoryRepositoryError) {
      throw error;
    }

    throw new StoryRepositoryError("Unable to resolve player account.");
  }
}

export async function createPlayerResponse(input: {
  dialogueEntryId: string;
  sceneId: string;
  chapterId: string;
  userId: string;
  responseText: string;
}) {
  try {
    return await prisma.playerResponse.create({
      data: input
    });
  } catch {
    throw new StoryRepositoryError("Unable to save player response.");
  }
}

export async function createPlayerPromptResponse(input: {
  dialogueEntryId: string;
  sceneId: string;
  chapterId: string;
  userEmail: string;
  responseText: string;
}) {
  const responseText = input.responseText.trim();

  if (!responseText) {
    throw new StoryRepositoryError("Response text cannot be empty.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const promptEntry = await tx.dialogueEntry.findUnique({
        where: { id: input.dialogueEntryId },
        select: {
          id: true,
          kind: true,
          sceneId: true,
          scene: {
            select: {
              chapterId: true
            }
          }
        }
      });

      if (
        !promptEntry ||
        promptEntry.kind !== DialogueKind.player_prompt ||
        promptEntry.sceneId !== input.sceneId ||
        promptEntry.scene.chapterId !== input.chapterId
      ) {
        throw new StoryRepositoryError(
          "Prompt context is invalid or no longer available."
        );
      }

      const user = await resolveOrUpsertPlayerUserByEmailInTx(
        tx,
        input.userEmail
      );

      return tx.playerResponse.create({
        data: {
          dialogueEntryId: promptEntry.id,
          sceneId: promptEntry.sceneId,
          chapterId: promptEntry.scene.chapterId,
          userId: user.id,
          responseText
        }
      });
    });
  } catch (error) {
    if (error instanceof StoryRepositoryError) {
      throw error;
    }

    throw new StoryRepositoryError("Unable to save player response.");
  }
}

export type AdminPlayerResponse = {
  id: string;
  responseText: string;
  createdAt: Date;
  user: {
    email: string;
  };
  chapter: {
    id: string;
    title: string;
    orderIndex: number;
  };
  scene: {
    id: string;
    title: string | null;
    orderIndex: number;
  };
  dialogueEntry: {
    id: string;
    text: string;
    promptLabel: string | null;
  };
};

export async function getAdminPlayerResponses(
  limit = 50
): Promise<AdminPlayerResponse[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));

  try {
    return await prisma.playerResponse.findMany({
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      include: {
        user: {
          select: {
            email: true
          }
        },
        chapter: {
          select: {
            id: true,
            title: true,
            orderIndex: true
          }
        },
        scene: {
          select: {
            id: true,
            title: true,
            orderIndex: true
          }
        },
        dialogueEntry: {
          select: {
            id: true,
            text: true,
            promptLabel: true
          }
        }
      }
    });
  } catch {
    throw new StoryRepositoryError("Unable to load player responses.");
  }
}

export const StoryEnums = {
  dialogueKinds: Object.values(DialogueKind),
  mediaAssetTypes: MEDIA_ASSET_TYPES
} as const;

export type StoryGraph = Awaited<ReturnType<typeof getAdminStoryGraph>>;

export type StoryTransactionClient = Prisma.TransactionClient;
