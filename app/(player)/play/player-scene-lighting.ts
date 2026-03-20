export type ImageSampleRegion = {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
};

export type StageCharacterLighting = {
  backgroundLuminance: number;
  brightness: number;
  contrast: number;
  saturate: number;
  shadowOpacity: number;
};

export type SceneLightingProfile = {
  left: StageCharacterLighting;
  right: StageCharacterLighting;
  overlayStrength: number;
};

export const SCENE_LIGHTING_SAMPLE_REGIONS = {
  overall: {
    xStart: 0.1,
    xEnd: 0.9,
    yStart: 0.12,
    yEnd: 0.92
  },
  left: {
    xStart: 0.02,
    xEnd: 0.48,
    yStart: 0.28,
    yEnd: 0.95
  },
  right: {
    xStart: 0.52,
    xEnd: 0.98,
    yStart: 0.28,
    yEnd: 0.95
  }
} as const satisfies Record<string, ImageSampleRegion>;

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getPixelLuminance(red: number, green: number, blue: number) {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

export function sampleRegionLuminance(input: {
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  region: ImageSampleRegion;
  sampleStep?: number;
}) {
  const xStart = clamp(
    Math.floor(input.region.xStart * input.width),
    0,
    input.width - 1
  );
  const xEnd = clamp(
    Math.ceil(input.region.xEnd * input.width),
    xStart + 1,
    input.width
  );
  const yStart = clamp(
    Math.floor(input.region.yStart * input.height),
    0,
    input.height - 1
  );
  const yEnd = clamp(
    Math.ceil(input.region.yEnd * input.height),
    yStart + 1,
    input.height
  );
  const sampleStep = Math.max(1, Math.floor(input.sampleStep ?? 1));
  let totalLuminance = 0;
  let sampleCount = 0;

  for (let y = yStart; y < yEnd; y += sampleStep) {
    for (let x = xStart; x < xEnd; x += sampleStep) {
      const offset = (y * input.width + x) * 4;
      const red = Number(input.pixels[offset] ?? 0);
      const green = Number(input.pixels[offset + 1] ?? 0);
      const blue = Number(input.pixels[offset + 2] ?? 0);

      totalLuminance += getPixelLuminance(red, green, blue);
      sampleCount += 1;
    }
  }

  if (sampleCount === 0) {
    return 0.5;
  }

  return totalLuminance / sampleCount;
}

export function deriveStageCharacterLighting(
  backgroundLuminance: number
): StageCharacterLighting {
  const luminance = clamp(backgroundLuminance, 0, 1);

  return {
    backgroundLuminance: round(luminance),
    brightness: round(clamp(1 + (0.5 - luminance) * 0.18, 0.94, 1.1)),
    contrast: round(clamp(1.04 + Math.abs(luminance - 0.5) * 0.18, 1.04, 1.13)),
    saturate: round(
      clamp(1.01 + (0.4 - Math.abs(luminance - 0.5)) * 0.08, 1, 1.05)
    ),
    shadowOpacity: round(clamp(0.34 + luminance * 0.32, 0.28, 0.66))
  };
}

export function deriveSceneLightingProfile(input: {
  leftLuminance: number;
  rightLuminance: number;
  overallLuminance: number;
}): SceneLightingProfile {
  const overallLuminance = clamp(input.overallLuminance, 0, 1);

  return {
    left: deriveStageCharacterLighting(input.leftLuminance),
    right: deriveStageCharacterLighting(input.rightLuminance),
    overlayStrength: round(clamp(0.88 + overallLuminance * 0.24, 0.8, 1.12))
  };
}

export function analyzeSceneLightingFromImageData(input: {
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  sampleStep?: number;
}) {
  return deriveSceneLightingProfile({
    leftLuminance: sampleRegionLuminance({
      pixels: input.pixels,
      width: input.width,
      height: input.height,
      region: SCENE_LIGHTING_SAMPLE_REGIONS.left,
      sampleStep: input.sampleStep
    }),
    rightLuminance: sampleRegionLuminance({
      pixels: input.pixels,
      width: input.width,
      height: input.height,
      region: SCENE_LIGHTING_SAMPLE_REGIONS.right,
      sampleStep: input.sampleStep
    }),
    overallLuminance: sampleRegionLuminance({
      pixels: input.pixels,
      width: input.width,
      height: input.height,
      region: SCENE_LIGHTING_SAMPLE_REGIONS.overall,
      sampleStep: input.sampleStep
    })
  });
}

export function createDefaultSceneLightingProfile() {
  return deriveSceneLightingProfile({
    leftLuminance: 0.5,
    rightLuminance: 0.5,
    overallLuminance: 0.5
  });
}

export function buildStageCharacterFilter(
  lighting: Pick<
    StageCharacterLighting,
    "brightness" | "contrast" | "saturate" | "shadowOpacity"
  >
) {
  return `brightness(${lighting.brightness}) contrast(${lighting.contrast}) saturate(${lighting.saturate}) drop-shadow(0 20px 40px rgba(0,0,0,${lighting.shadowOpacity}))`;
}

export function buildSceneOverlayBackground(overlayStrength: number) {
  const strength = clamp(overlayStrength, 0.8, 1.12);

  return `linear-gradient(180deg,rgba(2,6,17,${round(0.08 * strength)}) 0%,rgba(2,6,17,${round(0.18 * strength)}) 22%,rgba(2,6,17,${round(0.36 * strength)}) 54%,rgba(2,6,17,${round(0.84 * strength)}) 100%)`;
}
