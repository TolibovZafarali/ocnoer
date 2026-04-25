export type NativeReaderPortraitLayoutSide = "left" | "right" | "center";

export type NativeReaderPortraitLayoutInput = {
  stageWidth: number;
  stageHeight: number;
  side: NativeReaderPortraitLayoutSide;
  assetWidth?: number | null;
  assetHeight?: number | null;
  wrapperWidth?: number | null;
  wrapperHeight?: number | null;
  safeInsets?: {
    left?: number;
    right?: number;
    bottom?: number;
    top?: number;
  };
  maxHeightRatio?: number;
  maxWidthRatio?: number;
  explicitBleed?: {
    horizontal?: number;
    bottom?: number;
  };
};

export type NativeReaderPortraitLayout = {
  width: number;
  height: number;
  bottom: number;
  left?: number;
  right?: number;
  bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  safeInsets: {
    left: number;
    right: number;
    bottom: number;
    top: number;
  };
  anchorInsets: {
    left: number;
    right: number;
    bottom: number;
  };
};

const FALLBACK_PORTRAIT_ASPECT_RATIO = 0.58;
const DEFAULT_MAX_HEIGHT_RATIO = 0.78;
const DEFAULT_SIDE_MAX_WIDTH_RATIO = 0.58;
const DEFAULT_CENTER_MAX_WIDTH_RATIO = 0.72;

function getPositiveDimension(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function getNativeReaderPortraitSafeInsets(input: {
  stageWidth: number;
  stageHeight: number;
}) {
  return {
    left: Math.max(16, input.stageWidth * 0.035),
    right: Math.max(16, input.stageWidth * 0.035),
    bottom: Math.max(6, input.stageHeight * 0.008),
    top: Math.max(16, input.stageHeight * 0.035)
  };
}

export function resolveNativeReaderPortraitLayout(
  input: NativeReaderPortraitLayoutInput
): NativeReaderPortraitLayout {
  const stageWidth = Math.max(1, input.stageWidth);
  const stageHeight = Math.max(1, input.stageHeight);
  const defaultInsets = getNativeReaderPortraitSafeInsets({
    stageWidth,
    stageHeight
  });
  const safeInsets = {
    left: input.safeInsets?.left ?? defaultInsets.left,
    right: input.safeInsets?.right ?? defaultInsets.right,
    bottom: input.safeInsets?.bottom ?? defaultInsets.bottom,
    top: input.safeInsets?.top ?? defaultInsets.top
  };
  const anchorInsets = {
    left: input.side === "left" ? 0 : safeInsets.left,
    right: input.side === "right" ? 0 : safeInsets.right,
    bottom: 0
  };
  const sourceWidth =
    getPositiveDimension(input.wrapperWidth) ??
    getPositiveDimension(input.assetWidth);
  const sourceHeight =
    getPositiveDimension(input.wrapperHeight) ??
    getPositiveDimension(input.assetHeight);
  const aspectRatio =
    sourceWidth && sourceHeight
      ? sourceWidth / sourceHeight
      : FALLBACK_PORTRAIT_ASPECT_RATIO;
  const maxHeight = Math.max(
    1,
    Math.min(
      stageHeight - safeInsets.top - anchorInsets.bottom,
      stageHeight * (input.maxHeightRatio ?? DEFAULT_MAX_HEIGHT_RATIO)
    )
  );
  const maxWidth = Math.max(
    1,
    Math.min(
      input.side === "left"
        ? stageWidth - anchorInsets.left - safeInsets.right
        : input.side === "right"
          ? stageWidth - safeInsets.left - anchorInsets.right
          : stageWidth - safeInsets.left - safeInsets.right,
      stageWidth *
        (input.maxWidthRatio ??
          (input.side === "center"
            ? DEFAULT_CENTER_MAX_WIDTH_RATIO
            : DEFAULT_SIDE_MAX_WIDTH_RATIO))
    )
  );
  let height = maxHeight;
  let width = height * aspectRatio;

  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspectRatio;
  }

  const horizontalBleed = input.explicitBleed?.horizontal ?? 0;
  const bottom = anchorInsets.bottom - (input.explicitBleed?.bottom ?? 0);
  const top = stageHeight - bottom - height;
  let left: number | undefined;
  let right: number | undefined;
  let resolvedLeft: number;

  if (input.side === "right") {
    right = anchorInsets.right - horizontalBleed;
    resolvedLeft = stageWidth - right - width;
  } else if (input.side === "center") {
    resolvedLeft = (stageWidth - width) / 2;
    left = resolvedLeft;
  } else {
    left = anchorInsets.left - horizontalBleed;
    resolvedLeft = left;
  }

  return {
    width,
    height,
    left,
    right,
    bottom,
    bounds: {
      left: resolvedLeft,
      right: resolvedLeft + width,
      top,
      bottom: top + height
    },
    safeInsets,
    anchorInsets
  };
}
