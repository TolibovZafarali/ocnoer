#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const DEFAULT_OUTPUT_FORMAT = "png";

function parseArgs(argv) {
  const args = {
    inputs: [],
    manifestOut: null,
    outputDir: null,
    outputFormat: DEFAULT_OUTPUT_FORMAT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const nextValue = argv[index + 1];

    if (value === "--input" && nextValue) {
      args.inputs.push(nextValue);
      index += 1;
    } else if (value === "--output-dir" && nextValue) {
      args.outputDir = nextValue;
      index += 1;
    } else if (value === "--manifest-out" && nextValue) {
      args.manifestOut = nextValue;
      index += 1;
    } else if (value === "--format" && nextValue) {
      args.outputFormat = nextValue;
      index += 1;
    }
  }

  return args;
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isSvgPath(value) {
  return value.split(/[?#]/)[0]?.toLowerCase().endsWith(".svg");
}

async function collectSvgFiles(inputPath) {
  if (isRemoteUrl(inputPath)) {
    return [inputPath];
  }

  const entries = await readdir(inputPath, {
    withFileTypes: true
  }).catch(() => null);

  if (!entries) {
    return isSvgPath(inputPath) ? [inputPath] : [];
  }

  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(inputPath, entry.name);

      if (entry.isDirectory()) {
        return collectSvgFiles(entryPath);
      }

      return Promise.resolve(isSvgPath(entryPath) ? [entryPath] : []);
    })
  );

  return nested.flat();
}

async function readSvgInput(inputPath) {
  if (!isRemoteUrl(inputPath)) {
    return readFile(inputPath);
  }

  const response = await fetch(inputPath);

  if (!response.ok) {
    throw new Error(`Unable to fetch ${inputPath} (${response.status}).`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function getOutputFilePath(inputPath, outputDir, outputFormat) {
  const urlPath = isRemoteUrl(inputPath)
    ? new URL(inputPath).pathname
    : inputPath;
  const parsed = path.parse(urlPath);
  const baseName = `${parsed.name}.reader.${outputFormat}`;

  return path.join(outputDir, baseName);
}

async function renderDerivative(inputPath, outputDir, outputFormat) {
  const sourceBytes = await readSvgInput(inputPath);
  const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
  const outputFile = getOutputFilePath(inputPath, outputDir, outputFormat);
  const pipeline = sharp(sourceBytes, {
    density: 72
  }).ensureAlpha();
  const rendered =
    outputFormat === "webp"
      ? await pipeline.webp({ lossless: true }).toBuffer({
          resolveWithObject: true
        })
      : await pipeline.png().toBuffer({
          resolveWithObject: true
        });
  const derivativeHash = createHash("sha256")
    .update(rendered.data)
    .digest("hex");

  await mkdir(path.dirname(outputFile), {
    recursive: true
  });
  await writeFile(outputFile, rendered.data);

  return {
    derivativeOf: inputPath,
    sourceAssetId: path.parse(
      isRemoteUrl(inputPath) ? new URL(inputPath).pathname : inputPath
    ).name,
    sourceRenderKind: "svg",
    sourceStoragePath: inputPath,
    hash: derivativeHash,
    sourceHash,
    derivativeStoragePath: outputFile,
    derivativeUrl: null,
    outputFile,
    renderKind: "bitmap",
    targetPlatform: "ios",
    contentType: outputFormat === "webp" ? "image/webp" : "image/png",
    width: rendered.info.width,
    height: rendered.info.height,
    bytes: rendered.info.size
  };
}

const args = parseArgs(process.argv.slice(2));

if (args.inputs.length === 0 || !args.outputDir) {
  console.error(
    "Usage: node scripts/generate-reader-portrait-derivatives.mjs --input <svg-file|dir|url> --output-dir <dir> [--manifest-out manifest.json] [--format png|webp]"
  );
  process.exit(1);
}

if (!["png", "webp"].includes(args.outputFormat)) {
  console.error("--format must be png or webp.");
  process.exit(1);
}

const svgInputs = (
  await Promise.all(args.inputs.map((inputPath) => collectSvgFiles(inputPath)))
).flat();
const derivatives = [];

for (const svgInput of svgInputs) {
  derivatives.push(
    await renderDerivative(svgInput, args.outputDir, args.outputFormat)
  );
}

if (args.manifestOut) {
  await mkdir(path.dirname(args.manifestOut), {
    recursive: true
  });
  await writeFile(
    args.manifestOut,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        derivatives
      },
      null,
      2
    )}\n`
  );
}

console.info(
  `Generated ${derivatives.length} reader portrait derivative(s) in ${args.outputDir}.`
);
