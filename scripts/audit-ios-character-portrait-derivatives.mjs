#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";

const ENV_FILES = [".env.local", "apps/ios/.env.local"];

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

function normalizeSupabaseUrl(value) {
  return value.replace(/\/+$/, "");
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

function getPathExtension(value) {
  const cleanPath = value?.split(/[?#]/)[0] ?? "";
  const fileName = cleanPath.split("/").pop() ?? "";
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);

  return match?.[1]?.toLowerCase() ?? null;
}

function isAlphaSafeBitmapDerivative(derivative) {
  const contentType = derivative?.contentType?.toLowerCase() ?? "";

  return (
    derivative?.renderKind === "bitmap" &&
    (derivative.targetPlatform == null ||
      derivative.targetPlatform === "ios") &&
    (contentType.includes("image/webp") || contentType.includes("image/png"))
  );
}

function isCompleteDerivativeMetadata(derivative) {
  return Boolean(
    isAlphaSafeBitmapDerivative(derivative) &&
    derivative.storagePath &&
    derivative.hash &&
    derivative.sourceHash &&
    derivative.sourceStoragePath &&
    derivative.derivativeOf === derivative.sourceStoragePath &&
    typeof derivative.renderVersion === "string" &&
    derivative.renderVersion.length > 0 &&
    typeof derivative.cacheVersion === "number" &&
    derivative.cacheVersion > 0 &&
    typeof derivative.width === "number" &&
    derivative.width > 0 &&
    typeof derivative.height === "number" &&
    derivative.height > 0 &&
    (derivative.compressedBytes == null ||
      (typeof derivative.compressedBytes === "number" &&
        derivative.compressedBytes > 0)) &&
    (derivative.decodedBytesEstimate == null ||
      (typeof derivative.decodedBytesEstimate === "number" &&
        derivative.decodedBytesEstimate > 0))
  );
}

function getPreferredDerivative(derivatives) {
  return (
    derivatives?.find(
      (derivative) =>
        isAlphaSafeBitmapDerivative(derivative) &&
        derivative.variantKey === "phone-3x"
    ) ??
    derivatives?.find(isAlphaSafeBitmapDerivative) ??
    null
  );
}

function getAlphaSafeDerivatives(derivatives) {
  return derivatives?.filter(isAlphaSafeBitmapDerivative) ?? [];
}

function getDecodedBytesEstimate(derivative) {
  return (
    derivative?.decodedBytesEstimate ??
    (typeof derivative?.width === "number" &&
    typeof derivative?.height === "number"
      ? derivative.width * derivative.height * 4
      : 0)
  );
}

function getCompressedBytes(derivative, networkStatus) {
  return derivative?.compressedBytes ?? networkStatus?.contentLength ?? 0;
}

function isOversizedForPhone3x(derivative) {
  if (!derivative?.width || !derivative?.height) {
    return false;
  }

  const targetWidth = Math.ceil(228 * 3 * 1.1);
  const targetHeight = Math.ceil(342 * 3 * 1.1);

  return (
    derivative.width > targetWidth * 1.15 ||
    derivative.height > targetHeight * 1.15
  );
}

function isSourceSvg(asset) {
  return (
    getPathExtension(asset.sourceStoragePath) === "svg" ||
    asset.derivatives?.some(
      (derivative) => derivative.sourceRenderKind === "svg"
    ) ||
    asset.derivatives?.some(
      (derivative) => getPathExtension(derivative.derivativeOf) === "svg"
    )
  );
}

function bytesLookLikeSvg(bytes) {
  const prefix = Buffer.from(bytes)
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

async function sourceLooksLikeSvg(input) {
  if (isSourceSvg(input.asset)) {
    return true;
  }

  if (getPathExtension(input.asset.sourceStoragePath) !== null) {
    return false;
  }

  const url = toPublicStorageUrl(
    input.supabaseUrl,
    input.asset.sourceStoragePath
  );

  if (!url) {
    return false;
  }

  try {
    const headResponse = await fetch(url, {
      method: "HEAD"
    });
    const contentType = headResponse.headers.get("content-type") ?? "";

    if (contentType.toLowerCase().includes("image/svg")) {
      return true;
    }

    if (
      contentType.toLowerCase().includes("image/png") ||
      contentType.toLowerCase().includes("image/jpeg") ||
      contentType.toLowerCase().includes("image/webp")
    ) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const response = await fetch(url, {
      headers: {
        Range: "bytes=0-2047"
      }
    });

    if (!response.ok) {
      return false;
    }

    return bytesLookLikeSvg(await response.arrayBuffer());
  } catch {
    return false;
  }
}

async function fetchJson(supabaseUrl, storagePath) {
  const url = toPublicStorageUrl(supabaseUrl, storagePath);

  if (!url) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${storagePath} (${response.status}).`);
  }

  const text = await response.text();

  return {
    hash: createHash("sha256").update(text).digest("hex"),
    json: JSON.parse(text)
  };
}

async function verifyUrl(url) {
  const startedAt = Date.now();

  try {
    let response = await fetch(url, {
      method: "HEAD"
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(url);
    }

    const contentLength = response.headers.get("content-length");

    const contentType = response.headers.get("content-type");
    const parsedContentLength = contentLength ? Number(contentLength) : null;
    const normalizedContentType = contentType?.toLowerCase() ?? "";
    const validContentType =
      normalizedContentType.includes("image/webp") ||
      normalizedContentType.includes("image/png");
    const validContentLength =
      typeof parsedContentLength === "number" && parsedContentLength > 0;

    return {
      ok: response.ok,
      status: response.status,
      contentType,
      contentLength: parsedContentLength,
      cacheControl: response.headers.get("cache-control"),
      downloadDurationMs: Date.now() - startedAt,
      validContentType,
      validContentLength,
      errorMessage:
        response.ok && validContentType && validContentLength
          ? null
          : "Derivative URL did not return a non-empty image/webp or image/png response."
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      contentType: null,
      contentLength: null,
      cacheControl: null,
      downloadDurationMs: Date.now() - startedAt,
      validContentType: false,
      validContentLength: false,
      errorMessage:
        error instanceof Error ? error.message : "Unable to verify URL."
    };
  }
}

function collectChapterPortraitAssets(chapterBundle) {
  const assetsByKey = new Map();

  chapterBundle.chapter.scenes.forEach((scene) => {
    scene.characterPool.forEach((character) => {
      const addAsset = (input) => {
        if (!input.sourceStoragePath) {
          return;
        }

        const key = `${chapterBundle.chapter.id}:${character.id}:${input.emotionKey ?? ""}:${input.dressKey ?? ""}:${input.sourceStoragePath}`;
        const existing = assetsByKey.get(key);
        const sceneRef = {
          chapterId: chapterBundle.chapter.id,
          sceneId: scene.id,
          sceneTitle: scene.title
        };

        if (existing) {
          existing.sceneReferences.push(sceneRef);
          return;
        }

        assetsByKey.set(key, {
          characterId: character.id,
          characterName: character.name,
          emotionKey: input.emotionKey,
          dressKey: input.dressKey,
          sourceStoragePath: input.sourceStoragePath,
          derivatives: input.derivatives ?? [],
          sceneReferences: [sceneRef]
        });
      };

      character.emotions.forEach((emotion) => {
        addAsset({
          emotionKey: emotion.key,
          dressKey: null,
          sourceStoragePath: emotion.imagePath,
          derivatives: emotion.imageDerivatives
        });
      });

      character.dresses.forEach((dress) => {
        dress.emotionOverrides.forEach((override) => {
          addAsset({
            emotionKey: override.emotionKey,
            dressKey: dress.key,
            sourceStoragePath: override.imagePath,
            derivatives: override.imageDerivatives
          });
        });
      });
    });
  });

  return Array.from(assetsByKey.values());
}

async function main() {
  for (const filePath of ENV_FILES) {
    await loadEnvFile(path.resolve(filePath));
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_OCNOER_SUPABASE_URL
    ? normalizeSupabaseUrl(process.env.EXPO_PUBLIC_OCNOER_SUPABASE_URL)
    : null;
  const manifestPath = process.env.EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH;

  if (!supabaseUrl || !manifestPath) {
    throw new Error(
      "Missing EXPO_PUBLIC_OCNOER_SUPABASE_URL or EXPO_PUBLIC_OCNOER_RUNTIME_MANIFEST_PATH."
    );
  }

  const manifestResult = await fetchJson(supabaseUrl, manifestPath);
  const manifest = manifestResult.json;
  const chapterBundles = await Promise.all(
    manifest.chapters.map((chapter) =>
      fetchJson(supabaseUrl, chapter.bundlePath)
    )
  );
  const assets = chapterBundles.flatMap((chapterBundle) =>
    collectChapterPortraitAssets(chapterBundle.json)
  );

  const sourceSvgFlags = await Promise.all(
    assets.map((asset) =>
      sourceLooksLikeSvg({
        supabaseUrl,
        asset
      })
    )
  );
  const sourceSvgAssets = assets.filter((_, index) => sourceSvgFlags[index]);
  const derivativeUrlStatuses = new Map();
  const missingDerivativeEntries = [];

  await Promise.all(
    sourceSvgAssets.map(async (asset) => {
      const derivatives = getAlphaSafeDerivatives(asset.derivatives);
      const derivative = getPreferredDerivative(asset.derivatives);
      const derivativeUrl = derivative
        ? toPublicStorageUrl(supabaseUrl, derivative.storagePath)
        : null;

      if (!isCompleteDerivativeMetadata(derivative) || !derivativeUrl) {
        missingDerivativeEntries.push({
          characterId: asset.characterId,
          characterName: asset.characterName,
          emotionKey: asset.emotionKey,
          dressKey: asset.dressKey,
          sourceStoragePath: asset.sourceStoragePath,
          sceneReferences: asset.sceneReferences
        });
        return;
      }

      await Promise.all(
        derivatives.map(async (candidateDerivative) => {
          const candidateUrl = toPublicStorageUrl(
            supabaseUrl,
            candidateDerivative.storagePath
          );

          if (!candidateUrl || derivativeUrlStatuses.has(candidateUrl)) {
            return;
          }

          derivativeUrlStatuses.set(
            candidateUrl,
            await verifyUrl(candidateUrl)
          );
        })
      );
    })
  );

  const derivativeStatuses = Array.from(derivativeUrlStatuses.entries()).map(
    ([url, status]) => ({
      url,
      ...status
    })
  );
  const derivativeUrlMissingOr404 = derivativeStatuses.filter(
    (status) => !status.ok || status.status === 404
  );
  const derivativeUrlFailedVerification = derivativeStatuses.filter(
    (status) =>
      !status.ok || !status.validContentType || !status.validContentLength
  );
  const staleRuntimeJson = chapterBundles.some(
    (bundle) => bundle.json.generatedAt !== manifest.generatedAt
  );
  const withDerivativeMetadata =
    sourceSvgAssets.length - missingDerivativeEntries.length;
  const derivativeSelectionSummary = sourceSvgAssets
    .filter(
      (asset) =>
        !missingDerivativeEntries.some(
          (entry) => entry.sourceStoragePath === asset.sourceStoragePath
        )
    )
    .map((asset) => {
      const derivatives = getAlphaSafeDerivatives(asset.derivatives);
      const selected = getPreferredDerivative(asset.derivatives);
      const full =
        derivatives.find((derivative) => derivative.variantKey === "full") ??
        derivatives[derivatives.length - 1] ??
        selected;
      const selectedUrl = selected
        ? toPublicStorageUrl(supabaseUrl, selected.storagePath)
        : null;
      const fullUrl = full
        ? toPublicStorageUrl(supabaseUrl, full.storagePath)
        : null;
      const selectedStatus = selectedUrl
        ? derivativeUrlStatuses.get(selectedUrl)
        : null;
      const fullStatus = fullUrl ? derivativeUrlStatuses.get(fullUrl) : null;

      return {
        characterId: asset.characterId,
        characterName: asset.characterName,
        emotionKey: asset.emotionKey,
        dressKey: asset.dressKey,
        sourceStoragePath: asset.sourceStoragePath,
        variantCount: derivatives.length,
        selectedVariantKey: selected?.variantKey ?? null,
        selectedWidth: selected?.width ?? null,
        selectedHeight: selected?.height ?? null,
        selectedCompressedBytes: getCompressedBytes(selected, selectedStatus),
        selectedDecodedBytesEstimate: getDecodedBytesEstimate(selected),
        fullVariantKey: full?.variantKey ?? null,
        fullWidth: full?.width ?? null,
        fullHeight: full?.height ?? null,
        fullCompressedBytes: getCompressedBytes(full, fullStatus),
        fullDecodedBytesEstimate: getDecodedBytesEstimate(full),
        oversizedBefore: isOversizedForPhone3x(full),
        oversizedAfter: isOversizedForPhone3x(selected)
      };
    });
  const derivativeSizeReport = derivativeSelectionSummary.reduce(
    (total, entry) => ({
      compressedBytesBefore:
        total.compressedBytesBefore + entry.fullCompressedBytes,
      compressedBytesAfter:
        total.compressedBytesAfter + entry.selectedCompressedBytes,
      decodedBytesBefore:
        total.decodedBytesBefore + entry.fullDecodedBytesEstimate,
      decodedBytesAfter:
        total.decodedBytesAfter + entry.selectedDecodedBytesEstimate,
      oversizedBefore: total.oversizedBefore + (entry.oversizedBefore ? 1 : 0),
      oversizedAfter: total.oversizedAfter + (entry.oversizedAfter ? 1 : 0)
    }),
    {
      compressedBytesBefore: 0,
      compressedBytesAfter: 0,
      decodedBytesBefore: 0,
      decodedBytesAfter: 0,
      oversizedBefore: 0,
      oversizedAfter: 0
    }
  );
  const report = {
    manifestPath,
    runtime: {
      id: manifestPath,
      version: manifest.generatedAt,
      hash: manifestResult.hash
    },
    manifestGeneratedAt: manifest.generatedAt,
    chapterCount: chapterBundles.length,
    chapters: manifest.chapters.map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title,
      version: chapterBundles[index]?.json.generatedAt ?? null,
      hash: chapterBundles[index]?.hash ?? null
    })),
    staleRuntimeJson,
    runtimeStale: staleRuntimeJson,
    totalCharacterPortraitAssets: assets.length,
    totalCharacterPortraits: assets.length,
    characterPortraitSourceSvgs: sourceSvgAssets.length,
    bitmapDerivative: withDerivativeMetadata,
    sourceSvgFallback: missingDerivativeEntries.length,
    withDerivativeMetadata,
    withoutDerivativeMetadata: missingDerivativeEntries.length,
    missingDerivativeMetadata: missingDerivativeEntries.length,
    derivativeSizeReport,
    derivativeSelectionSummary,
    derivativeUrlsMissingOr404: derivativeUrlMissingOr404.length,
    derivativeUrl404OrMissing: derivativeUrlMissingOr404.length,
    derivativeUrlsFailedVerification: derivativeUrlFailedVerification.length,
    missingDerivativeEntries,
    derivativeStatuses
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    report.withoutDerivativeMetadata > 0 ||
    report.derivativeUrlsFailedVerification > 0 ||
    report.staleRuntimeJson
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
