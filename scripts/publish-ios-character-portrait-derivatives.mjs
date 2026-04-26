#!/usr/bin/env node
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const ENV_FILES = [".env.local", "apps/ios/.env.local"];
const IOS_PORTRAIT_DERIVATIVE_RENDER_VERSION = "ios-portrait-bitmap-v2";
const IOS_PORTRAIT_DERIVATIVE_CACHE_VERSION = 3;
const IOS_PORTRAIT_DISPLAY_MARGIN = 1.1;
const IOS_PORTRAIT_VARIANT_FORMAT =
  process.env.IOS_PORTRAIT_DERIVATIVE_FORMAT === "png" ? "png" : "webp";
const IOS_PORTRAIT_VARIANTS = [
  {
    key: "phone-2x",
    displayWidthDp: 228,
    displayHeightDp: 342,
    displayScale: 2
  },
  {
    key: "phone-3x",
    displayWidthDp: 228,
    displayHeightDp: 342,
    displayScale: 3
  },
  {
    key: "tablet-2x",
    displayWidthDp: 360,
    displayHeightDp: 540,
    displayScale: 2
  },
  {
    key: "full",
    displayWidthDp: null,
    displayHeightDp: null,
    displayScale: null
  }
];

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
  const variantToken = input.variantKey
    ? `.${normalizePathToken(input.variantKey)}`
    : "";
  const extension = input.format === "png" ? "png" : "webp";

  return `${input.runtimePrefix}/portrait-derivatives/${normalizePathToken(
    input.sourceAssetId
  )}/${input.sourceHash.slice(0, 16)}${variantToken}.reader.${extension}`;
}

function addPortraitSource(sourceByStoragePath, input) {
  if (!input.sourceStoragePath) {
    return;
  }

  if (sourceByStoragePath.has(input.sourceStoragePath)) {
    return;
  }

  sourceByStoragePath.set(input.sourceStoragePath, {
    existingDerivatives: input.existingDerivatives ?? [],
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
          existingDerivatives: emotion.imageDerivatives,
          sourceStoragePath: emotion.imagePath
        });
      });

      character.dresses.forEach((dress) => {
        dress.emotionOverrides.forEach((override) => {
          addPortraitSource(sourceByStoragePath, {
            sourceAssetId: `${character.id}:${dress.key}:${override.emotionKey}`,
            existingDerivatives: override.imageDerivatives,
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
          existingDerivatives: stageCharacter.imageDerivatives,
          sourceStoragePath: stageCharacter.imagePath
        });
      });
    });
  });

  return Array.from(sourceByStoragePath.values());
}

function getVariantResizeBounds(variant) {
  if (
    !variant.displayWidthDp ||
    !variant.displayHeightDp ||
    !variant.displayScale
  ) {
    return null;
  }

  return {
    width: Math.ceil(
      variant.displayWidthDp *
        variant.displayScale *
        IOS_PORTRAIT_DISPLAY_MARGIN
    ),
    height: Math.ceil(
      variant.displayHeightDp *
        variant.displayScale *
        IOS_PORTRAIT_DISPLAY_MARGIN
    )
  };
}

async function renderDerivativeVariant(sourceBytes, variant) {
  const resizeBounds = getVariantResizeBounds(variant);
  let pipeline = sharp(sourceBytes, {
    density: 72
  }).ensureAlpha();

  if (resizeBounds) {
    pipeline = pipeline.resize({
      width: resizeBounds.width,
      height: resizeBounds.height,
      fit: "inside",
      withoutEnlargement: true
    });
  }

  if (IOS_PORTRAIT_VARIANT_FORMAT === "png") {
    pipeline = pipeline.png({
      compressionLevel: 9
    });
  } else {
    pipeline = pipeline.webp({
      alphaQuality: 95,
      effort: 5,
      quality: 86,
      smartSubsample: true
    });
  }

  return pipeline.toBuffer({
    resolveWithObject: true
  });
}

function getDecodedBytesEstimate(info) {
  return Math.max(0, (info.width ?? 0) * (info.height ?? 0) * 4);
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
  const derivatives = [];

  for (const variant of IOS_PORTRAIT_VARIANTS) {
    const rendered = await renderDerivativeVariant(sourceBytes, variant);
    const derivativeHash = sha256Hex(rendered.data);
    const derivativeObjectPath = getPortraitDerivativeObjectPath({
      runtimePrefix: input.runtimePrefix,
      sourceAssetId: input.sourceAssetId,
      sourceHash,
      variantKey: variant.key,
      format: IOS_PORTRAIT_VARIANT_FORMAT
    });
    const contentType =
      IOS_PORTRAIT_VARIANT_FORMAT === "png" ? "image/png" : "image/webp";

    await uploadStorageObject({
      body: rendered.data,
      cacheControl: "31536000",
      contentType,
      objectPath: derivativeObjectPath,
      runtimeBucket: input.runtimeBucket,
      supabase: input.supabase
    });

    derivatives.push({
      storagePath: input.storage.withBucketPath(derivativeObjectPath),
      contentType,
      renderKind: "bitmap",
      targetPlatform: "ios",
      cacheVersion: IOS_PORTRAIT_DERIVATIVE_CACHE_VERSION,
      renderVersion: IOS_PORTRAIT_DERIVATIVE_RENDER_VERSION,
      variantKey: variant.key,
      displayWidthDp: variant.displayWidthDp,
      displayHeightDp: variant.displayHeightDp,
      displayScale: variant.displayScale,
      scaleMargin: variant.key === "full" ? null : IOS_PORTRAIT_DISPLAY_MARGIN,
      width: rendered.info.width,
      height: rendered.info.height,
      compressedBytes: rendered.data.byteLength,
      decodedBytesEstimate: getDecodedBytesEstimate(rendered.info),
      hash: derivativeHash,
      sourceHash,
      sourceAssetId: input.sourceAssetId,
      sourceStoragePath: input.sourceStoragePath,
      sourceRenderKind: "svg",
      derivativeOf: input.sourceStoragePath
    });
  }

  return derivatives;
}

function patchRuntimeCharacter(character, derivativesBySourcePath) {
  return {
    ...character,
    emotions: character.emotions.map((emotion) => ({
      ...emotion,
      imageDerivatives: derivativesBySourcePath.has(emotion.imagePath)
        ? derivativesBySourcePath.get(emotion.imagePath)
        : (emotion.imageDerivatives ?? [])
    })),
    dresses: character.dresses.map((dress) => ({
      ...dress,
      emotionOverrides: dress.emotionOverrides.map((override) => ({
        ...override,
        imageDerivatives: derivativesBySourcePath.has(override.imagePath)
          ? derivativesBySourcePath.get(override.imagePath)
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
      ? derivativesBySourcePath.get(stageCharacter.imagePath)
      : (stageCharacter.imageDerivatives ?? [])
  };
}

function getDerivativeDecodedBytes(derivative) {
  return (
    derivative?.decodedBytesEstimate ??
    (typeof derivative?.width === "number" &&
    typeof derivative?.height === "number"
      ? derivative.width * derivative.height * 4
      : 0)
  );
}

function getDerivativeCompressedBytes(derivative) {
  return derivative?.compressedBytes ?? 0;
}

function isOversizedForPhone3x(derivative) {
  if (!derivative?.width || !derivative?.height) {
    return false;
  }

  const targetWidth = Math.ceil(228 * 3 * IOS_PORTRAIT_DISPLAY_MARGIN);
  const targetHeight = Math.ceil(342 * 3 * IOS_PORTRAIT_DISPLAY_MARGIN);

  return (
    derivative.width > targetWidth * 1.15 ||
    derivative.height > targetHeight * 1.15
  );
}

function summarizeDerivativeSet(derivatives) {
  const selectedPhone3x =
    derivatives.find((derivative) => derivative.variantKey === "phone-3x") ??
    derivatives[0] ??
    null;
  const full =
    derivatives.find((derivative) => derivative.variantKey === "full") ??
    derivatives[derivatives.length - 1] ??
    null;

  return {
    full,
    selectedPhone3x,
    compressedBefore: getDerivativeCompressedBytes(full),
    compressedAfter: getDerivativeCompressedBytes(selectedPhone3x),
    decodedBefore: getDerivativeDecodedBytes(full),
    decodedAfter: getDerivativeDecodedBytes(selectedPhone3x),
    oversizedBefore: isOversizedForPhone3x(full) ? 1 : 0,
    oversizedAfter: isOversizedForPhone3x(selectedPhone3x) ? 1 : 0
  };
}

function getLargestExistingDerivative(derivatives) {
  return (
    (derivatives ?? [])
      .filter((derivative) => derivative?.renderKind === "bitmap")
      .sort(
        (left, right) =>
          (getDerivativeDecodedBytes(right) || 0) -
          (getDerivativeDecodedBytes(left) || 0)
      )[0] ?? null
  );
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
    const derivatives = await createDerivative({
      ...source,
      runtimeBucket,
      runtimePrefix,
      storage,
      supabase
    });

    if (derivatives?.length) {
      derivativesBySourcePath.set(source.sourceStoragePath, derivatives);
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
  const portraitSourceByPath = new Map(
    portraitSources.map((source) => [source.sourceStoragePath, source])
  );
  const derivativeSummaries = Array.from(derivativesBySourcePath.entries()).map(
    ([sourceStoragePath, derivatives]) => {
      const summary = summarizeDerivativeSet(derivatives);
      const previousPublishedDerivative = getLargestExistingDerivative(
        portraitSourceByPath.get(sourceStoragePath)?.existingDerivatives
      );

      return {
        sourceStoragePath,
        ...summary,
        previousPublishedDerivative,
        variants: derivatives.map((derivative) => ({
          variantKey: derivative.variantKey,
          storagePath: derivative.storagePath,
          width: derivative.width,
          height: derivative.height,
          compressedBytes: derivative.compressedBytes,
          decodedBytesEstimate: derivative.decodedBytesEstimate,
          contentType: derivative.contentType,
          hash: derivative.hash
        }))
      };
    }
  );
  const derivativeTotals = derivativeSummaries.reduce(
    (total, entry) => ({
      compressedBefore: total.compressedBefore + entry.compressedBefore,
      compressedAfter: total.compressedAfter + entry.compressedAfter,
      decodedBefore: total.decodedBefore + entry.decodedBefore,
      decodedAfter: total.decodedAfter + entry.decodedAfter,
      previousPublishedCompressedBytes:
        total.previousPublishedCompressedBytes +
        getDerivativeCompressedBytes(entry.previousPublishedDerivative),
      previousPublishedDecodedBytes:
        total.previousPublishedDecodedBytes +
        getDerivativeDecodedBytes(entry.previousPublishedDerivative),
      oversizedBefore: total.oversizedBefore + entry.oversizedBefore,
      oversizedAfter: total.oversizedAfter + entry.oversizedAfter
    }),
    {
      compressedBefore: 0,
      compressedAfter: 0,
      decodedBefore: 0,
      decodedAfter: 0,
      previousPublishedCompressedBytes: 0,
      previousPublishedDecodedBytes: 0,
      oversizedBefore: 0,
      oversizedAfter: 0
    }
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
    derivativeVariantFormat: IOS_PORTRAIT_VARIANT_FORMAT,
    derivativeVariantCount: derivativeSummaries.reduce(
      (count, entry) => count + entry.variants.length,
      0
    ),
    derivativeSizeReport: {
      selectedVariant: "phone-3x",
      compressedBytesBefore: derivativeTotals.compressedBefore,
      compressedBytesAfter: derivativeTotals.compressedAfter,
      decodedBytesBefore: derivativeTotals.decodedBefore,
      decodedBytesAfter: derivativeTotals.decodedAfter,
      previousPublishedCompressedBytes:
        derivativeTotals.previousPublishedCompressedBytes,
      previousPublishedDecodedBytes:
        derivativeTotals.previousPublishedDecodedBytes,
      oversizedBefore: derivativeTotals.oversizedBefore,
      oversizedAfter: derivativeTotals.oversizedAfter
    },
    derivativeVariants: derivativeSummaries.map((entry) => ({
      sourceStoragePath: entry.sourceStoragePath,
      previousPublishedDerivativeSize: entry.previousPublishedDerivative
        ? {
            variantKey: entry.previousPublishedDerivative.variantKey ?? null,
            width: entry.previousPublishedDerivative.width ?? null,
            height: entry.previousPublishedDerivative.height ?? null,
            compressedBytes:
              entry.previousPublishedDerivative.compressedBytes ?? null,
            decodedBytesEstimate: getDerivativeDecodedBytes(
              entry.previousPublishedDerivative
            )
          }
        : null,
      originalDerivativeSize: entry.full
        ? {
            variantKey: entry.full.variantKey,
            width: entry.full.width,
            height: entry.full.height,
            compressedBytes: entry.full.compressedBytes,
            decodedBytesEstimate: entry.full.decodedBytesEstimate
          }
        : null,
      selectedPhoneVariantSize: entry.selectedPhone3x
        ? {
            variantKey: entry.selectedPhone3x.variantKey,
            width: entry.selectedPhone3x.width,
            height: entry.selectedPhone3x.height,
            compressedBytes: entry.selectedPhone3x.compressedBytes,
            decodedBytesEstimate: entry.selectedPhone3x.decodedBytesEstimate
          }
        : null,
      variants: entry.variants
    })),
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
