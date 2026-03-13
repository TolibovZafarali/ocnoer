const { PrismaClient, AssetType, DialogueKind, Role } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.playerResponse.deleteMany();
  await prisma.sceneAsset.deleteMany();
  await prisma.dialogueEntry.deleteMany();
  await prisma.scene.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.character.deleteMany();

  const adminUser = await prisma.user.upsert({
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

  const ocnoer = await prisma.character.create({
    data: {
      name: "Ocnoer",
      slug: "ocnoer",
      bio: "Primary point-of-view character.",
      defaultPortraitPath: "portraits/ocnoer/default.png"
    }
  });

  const alvyn = await prisma.character.create({
    data: {
      name: "Alvyn Rivers",
      slug: "alvyn-rivers",
      bio: "Conversation partner for player prompt moments.",
      defaultPortraitPath: "portraits/alvyn/default.png"
    }
  });

  const chapter = await prisma.chapter.create({
    data: {
      title: "Chapter 1: First Echo",
      slug: "chapter-1-first-echo",
      orderIndex: 1,
      isPublished: true
    }
  });

  const scene = await prisma.scene.create({
    data: {
      chapterId: chapter.id,
      title: "Dockside Dawn",
      orderIndex: 1,
      backgroundImagePath: "scenes/ch1/dockside-dawn.jpg",
      backgroundMusicPath: "music/ch1/quiet-tide.mp3"
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

  await prisma.sceneAsset.createMany({
    data: [
      {
        sceneId: scene.id,
        type: AssetType.background_image,
        storagePath: "scenes/ch1/dockside-dawn.jpg",
        altText: "Harbor at sunrise",
        label: "Scene background"
      },
      {
        sceneId: scene.id,
        type: AssetType.background_music,
        storagePath: "music/ch1/quiet-tide.mp3",
        label: "Scene BGM"
      }
    ]
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

  console.log(`Seeded chapter ${chapter.slug} with scene ${scene.id} and dialogue ${narrator.id}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
