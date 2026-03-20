import { describe, expect, it } from "vitest";

import {
  analyzeSceneLightingFromImageData,
  buildSceneOverlayBackground,
  buildStageCharacterFilter,
  deriveSceneLightingProfile,
  sampleRegionLuminance
} from "./player-scene-lighting";

function createPixelBuffer(input: {
  width: number;
  height: number;
  getColor: (x: number, y: number) => [number, number, number, number];
}) {
  const pixels = new Uint8ClampedArray(input.width * input.height * 4);

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const offset = (y * input.width + x) * 4;
      const [red, green, blue, alpha] = input.getColor(x, y);

      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = alpha;
    }
  }

  return pixels;
}

describe("player scene lighting helpers", () => {
  it("samples luminance from a bounded region", () => {
    const pixels = createPixelBuffer({
      width: 4,
      height: 2,
      getColor: (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])
    });

    expect(
      sampleRegionLuminance({
        pixels,
        width: 4,
        height: 2,
        region: {
          xStart: 0,
          xEnd: 0.5,
          yStart: 0,
          yEnd: 1
        }
      })
    ).toBe(0);

    expect(
      sampleRegionLuminance({
        pixels,
        width: 4,
        height: 2,
        region: {
          xStart: 0.5,
          xEnd: 1,
          yStart: 0,
          yEnd: 1
        }
      })
    ).toBeCloseTo(1, 10);
  });

  it("derives brighter character treatment for darker local backgrounds", () => {
    const lighting = deriveSceneLightingProfile({
      leftLuminance: 0.1,
      rightLuminance: 0.9,
      overallLuminance: 0.8
    });

    expect(lighting.left.brightness).toBeGreaterThan(lighting.right.brightness);
    expect(lighting.left.shadowOpacity).toBeLessThan(
      lighting.right.shadowOpacity
    );
    expect(lighting.overlayStrength).toBeGreaterThan(1);
  });

  it("analyzes left and right stage regions independently", () => {
    const pixels = createPixelBuffer({
      width: 100,
      height: 100,
      getColor: (x, y) => {
        if (y < 28) {
          return [128, 128, 128, 255];
        }

        return x < 50 ? [24, 24, 24, 255] : [240, 240, 240, 255];
      }
    });
    const lighting = analyzeSceneLightingFromImageData({
      pixels,
      width: 100,
      height: 100,
      sampleStep: 2
    });

    expect(lighting.left.backgroundLuminance).toBeLessThan(
      lighting.right.backgroundLuminance
    );
    expect(lighting.left.brightness).toBeGreaterThan(lighting.right.brightness);
  });

  it("builds a CSS filter string for stage portraits", () => {
    expect(
      buildStageCharacterFilter({
        brightness: 1.04,
        contrast: 1.1,
        saturate: 1.02,
        shadowOpacity: 0.42
      })
    ).toBe(
      "brightness(1.04) contrast(1.1) saturate(1.02) drop-shadow(0 20px 40px rgba(0,0,0,0.42))"
    );
  });

  it("builds a stronger scrim for brighter scenes", () => {
    expect(buildSceneOverlayBackground(1)).toBe(
      "linear-gradient(180deg,rgba(2,6,17,0.08) 0%,rgba(2,6,17,0.18) 22%,rgba(2,6,17,0.36) 54%,rgba(2,6,17,0.84) 100%)"
    );
    expect(buildSceneOverlayBackground(1.1)).toBe(
      "linear-gradient(180deg,rgba(2,6,17,0.088) 0%,rgba(2,6,17,0.198) 22%,rgba(2,6,17,0.396) 54%,rgba(2,6,17,0.924) 100%)"
    );
  });
});
