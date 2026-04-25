import { describe, expect, it } from "vitest";

import { resolveNativeReaderPortraitLayout } from "./portraitLayout";

const stage = {
  stageWidth: 390,
  stageHeight: 844
};

describe("resolveNativeReaderPortraitLayout", () => {
  it("keeps a left portrait fully inside the stage horizontally", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 900,
      assetHeight: 1600
    });

    expect(layout.bounds.left).toBeGreaterThanOrEqual(layout.safeInsets.left);
    expect(layout.bounds.right).toBeLessThanOrEqual(
      stage.stageWidth - layout.safeInsets.right
    );
  });

  it("keeps a right portrait fully inside the stage horizontally", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "right",
      assetWidth: 900,
      assetHeight: 1600
    });

    expect(layout.bounds.left).toBeGreaterThanOrEqual(layout.safeInsets.left);
    expect(layout.bounds.right).toBeLessThanOrEqual(
      stage.stageWidth - layout.safeInsets.right
    );
  });

  it("bottom anchors portraits without pushing them below the stage", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 900,
      assetHeight: 1600
    });

    expect(layout.bottom).toBeGreaterThanOrEqual(0);
    expect(layout.bounds.bottom).toBeLessThanOrEqual(stage.stageHeight);
  });

  it("respects a custom safe inset", () => {
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

    expect(layout.bounds.left).toBe(42);
    expect(layout.bottom).toBe(12);
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
    expect(layout.bounds.right).toBeLessThanOrEqual(
      stage.stageWidth - layout.safeInsets.right
    );
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

    expect(layout.bounds.left).toBe(-8);
    expect(layout.bottom).toBe(-4);
  });

  it("does not give Ocnoer-style left placement a negative left edge by default", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "left",
      assetWidth: 768,
      assetHeight: 1344
    });

    expect(layout.bounds.left).toBeGreaterThanOrEqual(0);
  });

  it("does not let Lucair-style right placement exceed stage width by default", () => {
    const layout = resolveNativeReaderPortraitLayout({
      ...stage,
      side: "right",
      assetWidth: 768,
      assetHeight: 1344
    });

    expect(layout.bounds.right).toBeLessThanOrEqual(stage.stageWidth);
  });
});
