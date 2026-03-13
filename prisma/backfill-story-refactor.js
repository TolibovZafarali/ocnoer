const { PrismaClient, MediaAssetType } = require("@prisma/client");

const prisma = new PrismaClient();

function toSlug(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return normalized || "untitled";
}

async function ensureMediaAsset(path, type) {
  const storagePath = (path || "").trim();

  if (!storagePath) {
    return null;
  }

  return prisma.mediaAsset.upsert({
    where: { storagePath },
    update: {
      type
    },
    create: {
      type,
      storagePath
    }
  });
}

async function main() {
  const defaultHouse = await prisma.house.upsert({
    where: { slug: "unassigned" },
    update: { name: "Unassigned" },
    create: {
      name: "Unassigned",
      slug: "unassigned"
    }
  });

  const characters = await prisma.$queryRaw`
    SELECT "id", "name", "slug", "houseId", "defaultPortraitPath"
    FROM "public"."Character"
    ORDER BY "createdAt" ASC
  `;

  for (const character of characters) {
    const baseSlug = toSlug(character.name);
    let slug = baseSlug;
    let suffix = 1;

    while (
      (await prisma.character.count({ where: { slug, NOT: { id: character.id } } })) > 0
    ) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    await prisma.$executeRaw`
      UPDATE "public"."Character"
      SET "slug" = ${slug}, "houseId" = ${character.houseId || defaultHouse.id}
      WHERE "id" = ${character.id}
    `;

    if (character.defaultPortraitPath) {
      await prisma.characterPortrait.create({
        data: {
          characterId: character.id,
          storagePath: character.defaultPortraitPath,
          sortOrder: 0,
          label: "Default"
        }
      });
    }
  }

  const scenes = await prisma.$queryRaw`
    SELECT "id", "backgroundImagePath", "backgroundMusicPath"
    FROM "public"."Scene"
    ORDER BY "createdAt" ASC
  `;

  const sceneAssets = await prisma.$queryRaw`
    SELECT "sceneId", "type", "storagePath", "createdAt"
    FROM "public"."SceneAsset"
    ORDER BY "createdAt" ASC
  `;

  const sceneAssetsByScene = new Map();
  for (const asset of sceneAssets) {
    if (!sceneAssetsByScene.has(asset.sceneId)) {
      sceneAssetsByScene.set(asset.sceneId, []);
    }
    sceneAssetsByScene.get(asset.sceneId).push(asset);
  }

  for (const scene of scenes) {
    const sceneAssetList = sceneAssetsByScene.get(scene.id) || [];
    const imagePath =
      scene.backgroundImagePath ||
      sceneAssetList.find((asset) => asset.type === "background_image")?.storagePath ||
      `placeholders/scenes/${scene.id}.jpg`;

    const musicPath =
      scene.backgroundMusicPath ||
      sceneAssetList.find((asset) => asset.type === "background_music")?.storagePath ||
      null;

    const imageAsset = await ensureMediaAsset(imagePath, MediaAssetType.background_image);
    const musicAsset = musicPath
      ? await ensureMediaAsset(musicPath, MediaAssetType.background_music)
      : null;

    await prisma.$executeRaw`
      UPDATE "public"."Scene"
      SET "backgroundImageAssetId" = ${imageAsset.id},
          "backgroundMusicAssetId" = ${musicAsset?.id || null}
      WHERE "id" = ${scene.id}
    `;
  }

  const chapters = await prisma.$queryRaw`
    SELECT "id", "title", "slug", "imageAssetId"
    FROM "public"."Chapter"
    ORDER BY "createdAt" ASC
  `;

  let chapterOrder = 1;
  for (const chapter of chapters) {
    const baseSlug = toSlug(chapter.title);
    let slug = baseSlug;
    let suffix = 1;

    while (
      (await prisma.chapter.count({ where: { slug, NOT: { id: chapter.id } } })) > 0
    ) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const firstSceneRows = await prisma.$queryRaw`
      SELECT "backgroundImageAssetId"
      FROM "public"."Scene"
      WHERE "chapterId" = ${chapter.id}
      ORDER BY "orderIndex" ASC
      LIMIT 1
    `;
    const firstScene = firstSceneRows[0];
    const imageAssetId =
      chapter.imageAssetId ||
      firstScene?.backgroundImageAssetId ||
      (
        await ensureMediaAsset(
          `placeholders/chapters/${slug}.jpg`,
          MediaAssetType.background_image
        )
      )?.id;

    await prisma.$executeRaw`
      UPDATE "public"."Chapter"
      SET "slug" = ${slug},
          "orderIndex" = ${chapterOrder},
          "imageAssetId" = ${imageAssetId}
      WHERE "id" = ${chapter.id}
    `;

    chapterOrder += 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
