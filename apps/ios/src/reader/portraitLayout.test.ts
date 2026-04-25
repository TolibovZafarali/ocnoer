import { describe, expect, it } from "vitest";

import { resolveNativeReaderPortraitLayout } from "./portraitLayout";

const stage = {
  stageWidth: 390,
  stageHeight: 844
};

describe("resolveNativeReaderPortraitLayout", () => {
  it("keeps a left portrait flush left and inside the stage horizontally", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 900,
      assetHeight: 1600
    });

    expect(layout.left).toBe(0);
    expect(layout.bounds.left).toBe(0);
    expect(layout.bounds.right).toBeLessThanOrEqual(
      stage.stageWidth - layout.safeInsets.right
    );
  });

  it("keeps a right portrait flush right and inside the stage horizontally", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "right",
      assetWidth: 900,
      assetHeight: 1600
    });

    expect(layout.bounds.left).toBeGreaterThanOrEqual(layout.safeInsets.left);
    expect(layout.right).toBe(0);
    expect(layout.bounds.right).toBe(stage.stageWidth);
  });

  it("bottom anchors portraits flush to the stage bottom", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 900,
      assetHeight: 1600
    });

    expect(layout.bottom).toBe(0);
    expect(layout.bounds.bottom).toBe(stage.stageHeight);
  });

  it("keeps the opposite side inside a custom safe inset", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 900,
      assetHeight: 1600,
      safeInsets: {
        left: 42,
        right: 42,
        bottom: 12,
        top: 24
      }
    });

    expect(layout.bounds.left).toBe(0);
    expect(layout.bottom).toBe(0);
    expect(layout.bounds.right).toBeLessThanOrEqual(stage.stageWidth - 42);
  });

  it("scales a large tall portrait down instead of clipping vertically", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 1200,
      assetHeight: 3200
    });

    expect(layout.bounds.top).toBeGreaterThanOrEqual(layout.safeInsets.top);
    expect(layout.bounds.bottom).toBeLessThanOrEqual(stage.stageHeight);
  });

  it("scales a wide portrait down instead of clipping horizontally", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "right",
      assetWidth: 2400,
      assetHeight: 900
    });

    expect(layout.bounds.left).toBeGreaterThanOrEqual(layout.safeInsets.left);
    expect(layout.bounds.right).toBe(stage.stageWidth);
  });

  it("uses embedded-raster SVG wrapper dimensions before tight bitmap dimensions", () => {
    const wrapperLayout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 300,
      assetHeight: 900,
      wrapperWidth: 900,
      wrapperHeight: 900
    });
    const tightBitmapLayout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 300,
      assetHeight: 900
    });

    expect(wrapperLayout.width / wrapperLayout.height).toBeCloseTo(1);
    expect(tightBitmapLayout.width / tightBitmapLayout.height).toBeCloseTo(
      1 / 3
    );
  });

  it("allows explicit crop or bleed metadata to override default safe placement", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 900,
      assetHeight: 1600,
      safeInsets: {
        left: 16,
        right: 16,
        bottom: 8,
        top: 16
      },
      explicitBleed: {
        horizontal: 24,
        bottom: 12
      }
    });

    expect(layout.bounds.left).toBe(-24);
    expect(layout.bottom).toBe(-12);
  });

  it("places Ocnoer-style left placement flush left by default", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 768,
      assetHeight: 1344
    });

    expect(layout.bounds.left).toBe(0);
  });

  it("places Lucair-style right placement flush right by default", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "right",
      assetWidth: 768,
      assetHeight: 1344
    });

    expect(layout.bounds.right).toBe(stage.stageWidth);
  });

  it("keeps a portrait fully visible while corner-flush", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 900,
      assetHeight: 1600
    });

    expect(layout.bounds.left).toBe(0);
    expect(layout.bounds.bottom).toBe(stage.stageHeight);
    expect(layout.bounds.top).toBeGreaterThanOrEqual(layout.safeInsets.top);
    expect(layout.bounds.right).toBeLessThanOrEqual(
      stage.stageWidth - layout.safeInsets.right
    );
  });
});
