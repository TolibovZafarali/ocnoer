#!/usr/bin/env node
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const ENV_FILES = [".env.local", "apps/ios/.env.local"];
const IOS_PORTRAIT_DERIVATIVE_RENDER_VERSION = "ios-portrait-bitmap-v1";
const IOS_PORTRAIT_DERIVATIVE_CACHE_VERSION = 2;

async function loadEnvFile(filePath) {
  const content = await readFile(filePath, "utf8").catch(() => null);

  if (!content) {
    return;
  }

  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);

    if (!match?.[1] || process.env[match[1]] != null) {
      return;
    }

    process.env[match[1]] = (match[2] ?? "").replace(/^['"]|['"]$/g, "").trim();
  });
}

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }

  return value;
}

function normalizeSupabaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePathToken(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function toPublicStorageUrl(supabaseUrl, storagePath) {
  if (!storagePath) {
    return null;
  }

  if (/^https?:\/\//i.test(storagePath) || storagePath.startsWith("/")) {
    return storagePath;
  }

  const [bucket, ...rest] = storagePath.split("/");

  if (!bucket || rest.length === 0) {
    return null;
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${rest.join("/")}`;
}

function createStorageHelpers(runtimeBucket, supabaseUrl) {
  return {
    withBucketPath: (objectPath) => `${runtimeBucket}/${objectPath}`,
    toObjectPath: (storagePath) => {
      if (/^https?:\/\//i.test(storagePath)) {
        const url = new URL(storagePath);
        const marker = "/storage/v1/object/public/";
        const markerIndex = url.pathname.indexOf(marker);

        if (markerIndex >= 0) {
          const publicPath = decodeURIComponent(
            url.pathname.slice(markerIndex + marker.length)
          );
          const [bucket, ...rest] = publicPath.split("/");

          if (bucket === runtimeBucket && rest.length > 0) {
            return rest.join("/");
          }
        }
      }

      const bucketPrefix = `${runtimeBucket}/`;

      return storagePath.startsWith(bucketPrefix)
        ? storagePath.slice(bucketPrefix.length)
        : storagePath;
    },
    publicUrl: (storagePath) => toPublicStorageUrl(supabaseUrl, storagePath)
  };
}

async function fetchPublicJsonWithHash(supabaseUrl, storagePath) {
  const url = toPublicStorageUrl(supabaseUrl, storagePath);

  if (!url) {
    throw new Error(`Invalid runtime storage path: ${storagePath}`);
  }

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${storagePath} (${response.status}).`);
  }

  const text = await response.text();

  return {
    hash: sha256Hex(text),
    json: JSON.parse(text)
  };
}

async function downloadStorageObjectBytes(input) {
  const { data, error } = await input.supabase.storage
    .from(input.runtimeBucket)
    .download(input.objectPath);

  if (error) {
    throw new Error(`Unable to download ${input.objectPath}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Storage download returned no data: ${input.objectPath}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

async function uploadStorageObject(input) {
  const { error } = await input.supabase.storage
    .from(input.runtimeBucket)
    .upload(input.objectPath, input.body, {
      cacheControl: input.cacheControl,
      contentType: input.contentType,
      upsert: true
    });

  if (error) {
    throw new Error(`Unable to upload ${input.objectPath}: ${error.message}`);
  }
}

async function writeRuntimeJson(input) {
  await uploadStorageObject({
    ...input,
    body: Buffer.from(`${JSON.stringify(input.value, null, 2)}\n`, "utf8"),
    cacheControl: "0",
    contentType: "application/json; charset=utf-8"
  });
}

function bytesLookLikeSvg(bytes) {
  const prefix = bytes
    .subarray(0, 2048)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();

  return (
    prefix.startsWith("<svg") ||
    (prefix.startsWith("<?xml") && prefix.includes("<svg"))
  );
}

function getPortraitDerivativeObjectPath(input) {
  return `${input.runtimePrefix}/portrait-derivatives/${normalizePathToken(
    input.sourceAssetId
  )}/${input.sourceHash.slice(0, 16)}.reader.webp`;
}

function addPortraitSource(sourceByStoragePath, input) {
  if (!input.sourceStoragePath) {
    return;
  }

  if (sourceByStoragePath.has(input.sourceStoragePath)) {
    return;
  }

  sourceByStoragePath.set(input.sourceStoragePath, {
    sourceAssetId: input.sourceAssetId,
    sourceStoragePath: input.sourceStoragePath
  });
}

function collectChapterPortraitSources(chapterBundle) {
  const sourceByStoragePath = new Map();

  chapterBundle.chapter.scenes.forEach((scene) => {
    scene.characterPool.forEach((character) => {
      character.emotions.forEach((emotion) => {
        addPortraitSource(sourceByStoragePath, {
          sourceAssetId: `${character.id}:${emotion.key}:base`,
          sourceStoragePath: emotion.imagePath
        });
      });

      character.dresses.forEach((dress) => {
        dress.emotionOverrides.forEach((override) => {
          addPortraitSource(sourceByStoragePath, {
            sourceAssetId: `${character.id}:${dress.key}:${override.emotionKey}`,
            sourceStoragePath: override.imagePath
          });
        });
      });
    });

    scene.dialogue.forEach((entry) => {
      [entry.stage.left, entry.stage.right].forEach((stageCharacter) => {
        if (!stageCharacter) {
          return;
        }

        addPortraitSource(sourceByStoragePath, {
          sourceAssetId: `${stageCharacter.characterId}:${stageCharacter.emotionKey}:stage`,
          sourceStoragePath: stageCharacter.imagePath
        });
      });
    });
  });

  return Array.from(sourceByStoragePath.values());
}

async function createDerivative(input) {
  const sourceObjectPath = input.storage.toObjectPath(input.sourceStoragePath);
  const sourceBytes = await downloadStorageObjectBytes({
    objectPath: sourceObjectPath,
    runtimeBucket: input.runtimeBucket,
    supabase: input.supabase
  });

  if (!bytesLookLikeSvg(sourceBytes)) {
    return null;
  }

  const sourceHash = sha256Hex(sourceBytes);
  const rendered = await sharp(sourceBytes, {
    density: 72
  })
    .ensureAlpha()
    .webp({
      alphaQuality: 100,
      lossless: true
    })
    .toBuffer({
      resolveWithObject: true
    });
  const derivativeHash = sha256Hex(rendered.data);
  const derivativeObjectPath = getPortraitDerivativeObjectPath({
    runtimePrefix: input.runtimePrefix,
    sourceAssetId: input.sourceAssetId,
    sourceHash
  });

  await uploadStorageObject({
    body: rendered.data,
    cacheControl: "31536000",
    contentType: "image/webp",
    objectPath: derivativeObjectPath,
    runtimeBucket: input.runtimeBucket,
    supabase: input.supabase
  });

  return {
    storagePath: input.storage.withBucketPath(derivativeObjectPath),
    contentType: "image/webp",
    renderKind: "bitmap",
    targetPlatform: "ios",
    cacheVersion: IOS_PORTRAIT_DERIVATIVE_CACHE_VERSION,
    renderVersion: IOS_PORTRAIT_DERIVATIVE_RENDER_VERSION,
    width: rendered.info.width,
    height: rendered.info.height,
    hash: derivativeHash,
    sourceHash,
    sourceAssetId: input.sourceAssetId,
    sourceStoragePath: input.sourceStoragePath,
    sourceRenderKind: "svg",
    derivativeOf: input.sourceStoragePath
  };
}

function patchRuntimeCharacter(character, derivativesBySourcePath) {
  return {
    ...character,
    emotions: character.emotions.map((emotion) => ({
      ...emotion,
      imageDerivatives: derivativesBySourcePath.has(emotion.imagePath)
        ? [derivativesBySourcePath.get(emotion.imagePath)]
        : (emotion.imageDerivatives ?? [])
    })),
    dresses: character.dresses.map((dress) => ({
      ...dress,
      emotionOverrides: dress.emotionOverrides.map((override) => ({
        ...override,
        imageDerivatives: derivativesBySourcePath.has(override.imagePath)
          ? [derivativesBySourcePath.get(override.imagePath)]
          : (override.imageDerivatives ?? [])
      }))
    }))
  };
}

function patchStageCharacter(stageCharacter, derivativesBySourcePath) {
  if (!stageCharacter) {
    return null;
  }

  return {
    ...stageCharacter,
    imageDerivatives: derivativesBySourcePath.has(stageCharacter.imagePath)
      ? [derivativesBySourcePath.get(stageCharacter.imagePath)]
      : (stageCharacter.imageDerivatives ?? [])
  };
}

function patchChapterBundle(
  chapterBundle,
  derivativesBySourcePath,
  generatedAt
) {
  return {
    ...chapterBundle,
    generatedAt,
    chapter: {
      ...chapterBundle.chapter,
      scenes: chapterBundle.chapter.scenes.map((scene) => ({
        ...scene,
        characterPool: scene.characterPool.map((character) =>
          patchRuntimeCharacter(character, derivativesBySourcePath)
        ),
        dialogue: scene.dialogue.map((entry) => ({
          ...entry,
          stage: {
            left: patchStageCharacter(
              entry.stage.left,
              derivativesBySourcePath
            ),
            right: patchStageCharacter(
              entry.stage.right,
              derivativesBySourcePath
            )
          }
        }))
      }))
    }
  };
}

function patchCharactersManifest(
  charactersManifest,
  derivativesBySourcePath,
  generatedAt
) {
  return {
    ...charactersManifest,
    generatedAt,
    characters: charactersManifest.characters.map((character) =>
      patchRuntimeCharacter(character, derivativesBySourcePath)
    )
  };
}

function getRuntimePrefix(manifestObjectPath) {
  const prefix = dirname(manifestObjectPath);

  return prefix === "." ? "" : prefix;
}

async function main() {
  for (const filePath of ENV_FILES) {
    await loadEnvFile(filePath);
  }

  const runtimeBucket = requireEnv("SUPABASE_RUNTIME_BUCKET");
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.EXPO_PUBLIC_OCNOER_SUPABASE_URL?.trim() ||
      requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  );
  const manifestPath = requireEnv("EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH");
  const supabase = createClient(
    supabaseUrl,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  const storage = createStorageHelpers(runtimeBucket, supabaseUrl);
  const manifestObjectPath = storage.toObjectPath(manifestPath);
  const runtimePrefix = getRuntimePrefix(manifestObjectPath);
  const beforeManifest = await fetchPublicJsonWithHash(
    supabaseUrl,
    manifestPath
  );
  const beforeChapterBundles = await Promise.all(
    beforeManifest.json.chapters.map((chapter) =>
      fetchPublicJsonWithHash(supabaseUrl, chapter.bundlePath)
    )
  );
  const charactersManifest = await fetchPublicJsonWithHash(
    supabaseUrl,
    beforeManifest.json.charactersPath
  );
  const assetsManifest = await fetchPublicJsonWithHash(
    supabaseUrl,
    beforeManifest.json.assetsPath
  );
  const portraitSources = Array.from(
    new Map(
      beforeChapterBundles
        .flatMap((entry) => collectChapterPortraitSources(entry.json))
        .map((source) => [source.sourceStoragePath, source])
    ).values()
  );
  const derivativesBySourcePath = new Map();

  for (const source of portraitSources) {
    const derivative = await createDerivative({
      ...source,
      runtimeBucket,
      runtimePrefix,
      storage,
      supabase
    });

    if (derivative) {
      derivativesBySourcePath.set(source.sourceStoragePath, derivative);
    }
  }

  const generatedAt = new Date().toISOString();
  const nextManifest = {
    ...beforeManifest.json,
    generatedAt
  };
  const nextCharactersManifest = patchCharactersManifest(
    charactersManifest.json,
    derivativesBySourcePath,
    generatedAt
  );
  const nextAssetsManifest = {
    ...assetsManifest.json,
    generatedAt
  };
  const nextChapterBundles = beforeChapterBundles.map((entry) =>
    patchChapterBundle(entry.json, derivativesBySourcePath, generatedAt)
  );

  await writeRuntimeJson({
    objectPath: manifestObjectPath,
    runtimeBucket,
    supabase,
    value: nextManifest
  });
  await writeRuntimeJson({
    objectPath: storage.toObjectPath(nextManifest.charactersPath),
    runtimeBucket,
    supabase,
    value: nextCharactersManifest
  });
  await writeRuntimeJson({
    objectPath: storage.toObjectPath(nextManifest.assetsPath),
    runtimeBucket,
    supabase,
    value: nextAssetsManifest
  });
  await Promise.all(
    nextManifest.chapters.map((chapter, index) =>
      writeRuntimeJson({
        objectPath: storage.toObjectPath(chapter.bundlePath),
        runtimeBucket,
        supabase,
        value: nextChapterBundles[index]
      })
    )
  );

  const afterManifest = await fetchPublicJsonWithHash(
    supabaseUrl,
    manifestPath
  );
  const afterChapterBundles = await Promise.all(
    afterManifest.json.chapters.map((chapter) =>
      fetchPublicJsonWithHash(supabaseUrl, chapter.bundlePath)
    )
  );
  const report = {
    command: "corepack pnpm publish:runtime",
    manifestPath,
    runtime: {
      id: manifestPath,
      beforeVersion: beforeManifest.json.generatedAt,
      beforeHash: beforeManifest.hash,
      afterVersion: afterManifest.json.generatedAt,
      afterHash: afterManifest.hash
    },
    chapters: afterManifest.json.chapters.map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title,
      beforeVersion: beforeChapterBundles[index]?.json.generatedAt ?? null,
      beforeHash: beforeChapterBundles[index]?.hash ?? null,
      afterVersion: afterChapterBundles[index]?.json.generatedAt ?? null,
      afterHash: afterChapterBundles[index]?.hash ?? null
    })),
    totalCharacterPortraitSources: portraitSources.length,
    generatedBitmapDerivatives: derivativesBySourcePath.size,
    runtimeJsonStaleBefore: beforeChapterBundles.some(
      (entry) => entry.json.generatedAt !== beforeManifest.json.generatedAt
    ),
    runtimeJsonStaleAfter: afterChapterBundles.some(
      (entry) => entry.json.generatedAt !== afterManifest.json.generatedAt
    )
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    report.generatedBitmapDerivatives !==
      report.totalCharacterPortraitSources ||
    report.runtimeJsonStaleAfter
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
