const {
  PrismaClient,
  DialogueKind,
  MediaAssetType,
  Role
} = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.playerResponse.deleteMany();
  await prisma.sceneCharacterAppearance.deleteMany();
  await prisma.dialogueEntry.deleteMany();
  await prisma.scene.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.characterPortrait.deleteMany();
  await prisma.character.deleteMany();
  await prisma.house.deleteMany();
  await prisma.mediaAsset.deleteMany();

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: Role.admin },
    create: {
      email: "admin@example.com",
      role: Role.admin
    }
  });

  const playerUser = await prisma.user.upsert({
    where: { email: "player@example.com" },
    update: { role: Role.player },
    create: {
      email: "player@example.com",
      role: Role.player
    }
  });

  const house = await prisma.house.create({
    data: {
      name: "House Valamere",
      slug: "house-valamere",
      notes: "Core household for early story chapters."
    }
  });

  const ocnoer = await prisma.character.create({
    data: {
      name: "Ocnoer",
      slug: "ocnoer",
      houseId: house.id,
      bio: "Primary point-of-view character."
    }
  });

  const alvyn = await prisma.character.create({
    data: {
      name: "Alvyn Rivers",
      slug: "alvyn-rivers",
      houseId: house.id,
      bio: "Conversation partner for player prompt moments."
    }
  });

  const ocnoerPortrait = await prisma.characterPortrait.create({
    data: {
      characterId: ocnoer.id,
      storagePath: "portraits/ocnoer/default.png",
      label: "Default",
      sortOrder: 0
    }
  });

  await prisma.characterPortrait.create({
    data: {
      characterId: alvyn.id,
      storagePath: "portraits/alvyn/default.png",
      label: "Default",
      sortOrder: 0
    }
  });

  const chapterImageAsset = await prisma.mediaAsset.create({
    data: {
      type: MediaAssetType.background_image,
      storagePath: "chapters/ch1/cover.jpg",
      label: "Chapter 1 cover"
    }
  });

  const sceneBackgroundAsset = await prisma.mediaAsset.create({
    data: {
      type: MediaAssetType.background_image,
      storagePath: "scenes/ch1/dockside-dawn.jpg",
      label: "Dockside dawn",
      altText: "Harbor at sunrise"
    }
  });

  const sceneMusicAsset = await prisma.mediaAsset.create({
    data: {
      type: MediaAssetType.background_music,
      storagePath: "music/ch1/quiet-tide.mp3",
      label: "Quiet tide"
    }
  });

  const chapter = await prisma.chapter.create({
    data: {
      title: "Chapter 1: First Echo",
      slug: "chapter-1-first-echo",
      orderIndex: 1,
      imageAssetId: chapterImageAsset.id
    }
  });

  const scene = await prisma.scene.create({
    data: {
      chapterId: chapter.id,
      title: "Dockside Dawn",
      orderIndex: 1,
      backgroundImageAssetId: sceneBackgroundAsset.id,
      backgroundMusicAssetId: sceneMusicAsset.id
    }
  });

  await prisma.sceneCharacterAppearance.create({
    data: {
      sceneId: scene.id,
      characterId: ocnoer.id,
      portraitId: ocnoerPortrait.id
    }
  });

  const narrator = await prisma.dialogueEntry.create({
    data: {
      sceneId: scene.id,
      kind: DialogueKind.narrator,
      orderIndex: 1,
      text: "Dawn spills over the water as the city wakes in hushed tones."
    }
  });

  await prisma.dialogueEntry.create({
    data: {
      sceneId: scene.id,
      kind: DialogueKind.speech,
      orderIndex: 2,
      text: "The tide sounds different today.",
      characterId: ocnoer.id
    }
  });

  const prompt = await prisma.dialogueEntry.create({
    data: {
      sceneId: scene.id,
      kind: DialogueKind.player_prompt,
      orderIndex: 3,
      text: "What do you want to ask Alvyn right now?",
      promptLabel: "Ask Alvyn"
    }
  });

  await prisma.dialogueEntry.create({
    data: {
      sceneId: scene.id,
      kind: DialogueKind.speech,
      orderIndex: 4,
      text: "Ask and I will answer what I can.",
      characterId: alvyn.id
    }
  });

  await prisma.playerResponse.create({
    data: {
      userId: playerUser.id,
      chapterId: chapter.id,
      sceneId: scene.id,
      dialogueEntryId: prompt.id,
      responseText: "Sample seeded response for review flow wiring."
    }
  });

  console.log(
    `Seeded chapter ${chapter.slug} with scene ${scene.id} and dialogue ${narrator.id}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
