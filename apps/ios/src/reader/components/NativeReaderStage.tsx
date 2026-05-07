import { Image as ExpoImage } from "expo-image";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PixelRatio,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { SvgAst } from "react-native-svg";

import type {
  NativeReaderPortrait,
  NativeReaderPresentation
} from "../readerPresentation";
import {
  createCachedReaderImageSource,
  getAssetLayoutMetrics,
  getAssetRenderKind,
  getAssetRenderMode,
  getCachedAssetUri,
  getPreloadedReaderImageRef,
  getReaderAssetRenderDiagnostics,
  isReaderPerfDiagnosticsEnabled,
  recordReaderAssetVisibleTiming,
  setReaderStageMetrics,
  usePreloadedReaderImageRef,
  usePreloadedReaderSvgAst
} from "../imagePreload";
import {
  NATIVE_READER_CHARACTER_PORTRAIT_EMPTY_STYLE,
  NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND
} from "../nativeReaderStageStyle";
import { resolveNativeReaderPortraitLayout } from "../portraitLayout";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import {
  DirectionalSlideView,
  FadeInView,
  StageScrims
} from "./NativeCinematic";

export type NativeReaderPortraitExitState = {
  left: boolean;
  right: boolean;
};

function NativeCachedImage(props: {
  accessibilityLabel?: string;
  contentFit: "cover" | "contain" | "fill";
  contentPosition?: "left bottom" | "right bottom" | "center";
  debugLabel?: string;
  imageUrl: string;
  imageRef?: ReturnType<typeof usePreloadedReaderImageRef>;
  requireImageRef?: boolean;
  renderSurface?: "stage-portrait";
  style: StyleProp<ImageStyle>;
}) {
  const loadedImageRef = usePreloadedReaderImageRef(props.imageUrl);
  const source = createCachedReaderImageSource(props.imageUrl);
  const resolvedImageRef =
    props.imageRef ??
    loadedImageRef ??
    getPreloadedReaderImageRef(props.imageUrl);
  const mountedAtRef = useRef(Date.now());

  if (!source) {
    return (
      <View style={[props.style as StyleProp<ViewStyle>, styles.missingAsset]} />
    );
  }

  if (props.requireImageRef && !resolvedImageRef) {
    const details = {
      diagnostics: getReaderAssetRenderDiagnostics(props.imageUrl),
      imageUrl: props.imageUrl
    };

    if (globalThis.__OCNOER_READER_STRICT_BITMAP_DERIVATIVES) {
      throw new Error(
        `Strict bitmap derivative violation: missing ImageRef for ${props.imageUrl}`
      );
    }

    console.warn(
      "[reader-assets] bitmap derivative portrait is rendering without ImageRef",
      details
    );
  }

  const image = (
    <ExpoImage
      accessibilityLabel={props.accessibilityLabel}
      accessible={Boolean(props.accessibilityLabel)}
      cachePolicy="memory-disk"
      contentFit={props.contentFit}
      contentPosition={props.contentPosition ?? "center"}
      onDisplay={() => {
        if (!isReaderPerfDiagnosticsEnabled() || !props.debugLabel) {
          return;
        }

        recordReaderAssetVisibleTiming({
          durationMs: Date.now() - mountedAtRef.current,
          event: "onDisplay",
          imageUrl: props.imageUrl,
          label: props.debugLabel
        });
      }}
      onLoad={() => {
        if (!isReaderPerfDiagnosticsEnabled() || !props.debugLabel) {
          return;
        }

        recordReaderAssetVisibleTiming({
          durationMs: Date.now() - mountedAtRef.current,
          event: "onLoad",
          imageUrl: props.imageUrl,
          label: props.debugLabel
        });
      }}
      priority="high"
      recyclingKey={props.imageUrl}
      source={source}
      style={
        props.renderSurface === "stage-portrait"
          ? styles.cachedImageFill
          : props.style
      }
      transition={0}
    />
  );

  if (props.renderSurface !== "stage-portrait") {
    return image;
  }

  return (
    <View style={props.style as StyleProp<ViewStyle>}>
      {image}
    </View>
  );
}

function getEmbeddedImageStyle(input: {
  canvasWidth: number;
  canvasHeight: number;
  imageRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}): StyleProp<ImageStyle> {
  return {
    height: `${(input.imageRect.height / input.canvasHeight) * 100}%`,
    left: `${(input.imageRect.x / input.canvasWidth) * 100}%`,
    position: "absolute",
    top: `${(input.imageRect.y / input.canvasHeight) * 100}%`,
    width: `${(input.imageRect.width / input.canvasWidth) * 100}%`
  };
}

declare global {
  // Development probe for isolating portrait rendering from dialogue card/text.
  // eslint-disable-next-line no-var
  var __OCNOER_READER_DISABLE_PORTRAITS: boolean | undefined;
  // eslint-disable-next-line no-var
  var __OCNOER_READER_STRICT_BITMAP_DERIVATIVES: boolean | undefined;
}

function shouldDisablePortraitsForProbe() {
  return (
    isReaderPerfDiagnosticsEnabled() &&
    Boolean(globalThis.__OCNOER_READER_DISABLE_PORTRAITS)
  );
}

function isSvgRenderMode(renderMode: ReturnType<typeof getAssetRenderMode>) {
  return renderMode === "original-svg" || renderMode === "true-vector-svg";
}

function isUnexpectedPortraitRenderMode(
  renderMode: ReturnType<typeof getAssetRenderMode>
) {
  return (
    renderMode === "source-svg-image" ||
    renderMode === "original-svg" ||
    renderMode === "true-vector-svg"
  );
}

function CachedPortraitAsset(props: {
  accessibilityLabel: string;
  imageUrl: string;
  imageRef: ReturnType<typeof usePreloadedReaderImageRef>;
  side: "left" | "right";
}) {
  const renderKind = getAssetRenderKind(props.imageUrl);
  const renderMode = getAssetRenderMode(props.imageUrl);
  const layoutMetrics = getAssetLayoutMetrics(props.imageUrl);
  const svgAst = usePreloadedReaderSvgAst(props.imageUrl);
  const preserveAspectRatio =
    props.side === "left" ? "xMinYMax meet" : "xMaxYMax meet";
  const requireImageRef = renderMode === "bitmap-derivative";
  const svgProps = {
    height: "100%",
    preserveAspectRatio,
    width: "100%"
  };

  useEffect(() => {
    if (!isReaderPerfDiagnosticsEnabled()) {
      return;
    }

    const diagnostics = getReaderAssetRenderDiagnostics(props.imageUrl);

    console.info("[reader-assets] portrait render tree diagnostics", {
      ...diagnostics,
      COLD_RENDER_ON_VISIBLE_PATH:
        diagnostics?.COLD_RENDER_ON_VISIBLE_PATH ??
        (renderMode === "original-svg" || renderMode === "true-vector-svg"),
      PORTRAIT_RENDER_MODE: renderMode,
      cachedUri: getCachedAssetUri(props.imageUrl),
      imageBackgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
      imageUrl: props.imageUrl,
      renderKind,
      renderMode,
      side: props.side,
      wrapperBackgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND
    });

    if (isUnexpectedPortraitRenderMode(renderMode)) {
      const details = {
        ...diagnostics,
        imageUrl: props.imageUrl,
        renderMode,
        side: props.side
      };

      if (globalThis.__OCNOER_READER_STRICT_BITMAP_DERIVATIVES) {
        console.error(
          "[reader-assets] strict bitmap derivative violation",
          details
        );
        return;
      }

      console.warn(
        "[reader-assets] character portrait is rendering outside bitmap-derivative mode",
        details
      );
    }
  }, [props.imageUrl, props.side, renderKind, renderMode]);

  useEffect(() => {
    if (
      !isReaderPerfDiagnosticsEnabled() ||
      renderMode !== "bitmap-derivative"
    ) {
      return;
    }

    if (!props.imageRef) {
      console.warn(
        "[reader-assets] presentation ready but visible portrait has no ImageRef",
        {
          diagnostics: getReaderAssetRenderDiagnostics(props.imageUrl),
          imageUrl: props.imageUrl,
          side: props.side
        }
      );
    }
  }, [props.imageRef, props.imageUrl, props.side, renderMode]);

  if (!isSvgRenderMode(renderMode)) {
    if (renderMode === "source-svg-image") {
      return (
        <View
          accessibilityLabel={props.accessibilityLabel}
          accessible
          pointerEvents="none"
          style={styles.portraitAsset}
        >
          <NativeCachedImage
            accessibilityLabel={props.accessibilityLabel}
            contentFit="contain"
            contentPosition="center"
            debugLabel={`${props.side}:${props.accessibilityLabel}`}
            imageRef={props.imageRef}
            imageUrl={props.imageUrl}
            requireImageRef={requireImageRef}
            renderSurface="stage-portrait"
            style={styles.portraitBitmap}
          />
        </View>
      );
    }

    const svgWrapper = layoutMetrics?.svgWrapper ?? null;

    if (svgWrapper) {
      return (
        <View
          accessibilityLabel={props.accessibilityLabel}
          accessible
          pointerEvents="none"
          style={styles.portraitVirtualCanvas}
        >
          <NativeCachedImage
            accessibilityLabel={props.accessibilityLabel}
            contentFit="fill"
            debugLabel={`${props.side}:${props.accessibilityLabel}`}
            imageRef={props.imageRef}
            imageUrl={props.imageUrl}
            requireImageRef={requireImageRef}
            renderSurface="stage-portrait"
            style={
              svgWrapper.embeddedImage
                ? getEmbeddedImageStyle({
                    canvasWidth: svgWrapper.width,
                    canvasHeight: svgWrapper.height,
                    imageRect: svgWrapper.embeddedImage
                  })
                : styles.portraitBitmap
            }
          />
        </View>
      );
    }

    return (
      <View
        accessibilityLabel={props.accessibilityLabel}
        accessible
        pointerEvents="none"
        style={styles.portraitAsset}
      >
        <NativeCachedImage
          accessibilityLabel={props.accessibilityLabel}
          contentFit="contain"
          contentPosition="center"
          debugLabel={`${props.side}:${props.accessibilityLabel}`}
          imageRef={props.imageRef}
          imageUrl={props.imageUrl}
          requireImageRef={requireImageRef}
          renderSurface="stage-portrait"
          style={styles.portraitBitmap}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={props.accessibilityLabel}
      accessible
      pointerEvents="none"
      style={styles.portraitAsset}
    >
      {svgAst ? <SvgAst ast={svgAst} override={svgProps} /> : null}
    </View>
  );
}

const Portrait = memo(function Portrait(props: {
  isExiting: boolean;
  portrait: NativeReaderPortrait | null;
  side: "left" | "right";
  stageSize: {
    height: number;
    width: number;
  } | null;
}) {
  const renderCountRef = useRef(0);
  const imageUrl = props.portrait?.imageUrl ?? null;
  const imageRef = usePreloadedReaderImageRef(imageUrl);
  const layoutMetrics = imageUrl ? getAssetLayoutMetrics(imageUrl) : null;
  const svgWrapper = layoutMetrics?.svgWrapper ?? null;
  const layout = useMemo(() => {
    if (!props.stageSize || !imageUrl) {
      return null;
    }

    return resolveNativeReaderPortraitLayout({
      stageWidth: props.stageSize.width,
      stageHeight: props.stageSize.height,
      side: props.side,
      assetWidth: imageRef?.width ?? layoutMetrics?.naturalWidth,
      assetHeight: imageRef?.height ?? layoutMetrics?.naturalHeight,
      wrapperWidth: svgWrapper?.width,
      wrapperHeight: svgWrapper?.height
    });
  }, [
    imageUrl,
    imageRef?.height,
    imageRef?.width,
    layoutMetrics?.naturalHeight,
    layoutMetrics?.naturalWidth,
    props.side,
    props.stageSize,
    svgWrapper?.height,
    svgWrapper?.width
  ]);

  const portraitsDisabled = shouldDisablePortraitsForProbe();
  renderCountRef.current += 1;

  useEffect(() => {
    if (!isReaderPerfDiagnosticsEnabled()) {
      return;
    }

    console.info("[reader-perf] PORTRAIT_SLOT_RENDER_COUNT", {
      count: renderCountRef.current,
      imageUrl,
      side: props.side
    });
  });

  if (!props.portrait || !layout || portraitsDisabled) {
    if (props.portrait && shouldDisablePortraitsForProbe()) {
      console.info("[reader-assets] portrait disabled for probe", {
        imageUrl: props.portrait.imageUrl,
        side: props.side
      });
    }
  }

  const slotStyle: ViewStyle = layout
    ? {
        bottom: layout.bottom,
        height: layout.height,
        opacity: props.portrait && !portraitsDisabled ? 1 : 0,
        width: layout.width,
        ...(typeof layout.left === "number"
          ? {
              left: layout.left
            }
          : {}),
        ...(typeof layout.right === "number"
          ? {
              right: layout.right
            }
          : {})
      }
    : {
        bottom: 0,
        height: 1,
        ...(props.side === "left"
          ? {
              left: 0
            }
          : {
              right: 0
            }),
        opacity: 0,
        width: 1
      };

  return (
    <View pointerEvents="none" style={[styles.portraitSlot, slotStyle]}>
      {props.portrait && layout && !portraitsDisabled ? (
        <DirectionalSlideView
          animationKey={props.portrait.key}
          direction={props.side === "left" ? "from-left" : "from-right"}
          isExiting={props.isExiting}
          pointerEvents="none"
          style={styles.portraitFade}
        >
          <CachedPortraitAsset
            accessibilityLabel={props.portrait.label}
            imageRef={imageRef}
            imageUrl={props.portrait.imageUrl}
            side={props.side}
          />
        </DirectionalSlideView>
      ) : null}
    </View>
  );
});

export const NativeReaderStage = memo(function NativeReaderStage(props: {
  portraitExitState: NativeReaderPortraitExitState;
  presentation: NativeReaderPresentation;
}) {
  const renderCountRef = useRef(0);
  const [stageSize, setStageSize] = useState<{
    height: number;
    width: number;
  } | null>(null);
  const handleStageLayout = (event: LayoutChangeEvent) => {
    const nextStageSize = event.nativeEvent.layout;

    setStageSize((currentStageSize) =>
      currentStageSize?.height === nextStageSize.height &&
      currentStageSize.width === nextStageSize.width
        ? currentStageSize
        : {
            height: nextStageSize.height,
            width: nextStageSize.width
          }
    );
    setReaderStageMetrics({
      deviceScale: PixelRatio.get(),
      stageHeight: nextStageSize.height,
      stageWidth: nextStageSize.width
    });
  };
  renderCountRef.current += 1;

  useEffect(() => {
    if (!isReaderPerfDiagnosticsEnabled()) {
      return;
    }

    console.info("[reader-perf] STAGE_RENDER_COUNT", {
      count: renderCountRef.current,
      dialogueEntryId: props.presentation.dialogueEntryId
    });
  });

  return (
    <View style={styles.stage} onLayout={handleStageLayout}>
      {props.presentation.backgroundImageUrl ? (
        <FadeInView
          key={props.presentation.backgroundImageUrl}
          animationKey={props.presentation.backgroundImageUrl}
          durationMs={ocnoerTheme.motion.stageFadeMs}
          style={styles.stageBackgroundFade}
        >
          <NativeCachedImage
            contentFit="cover"
            imageUrl={props.presentation.backgroundImageUrl}
            style={styles.stageBackground}
          />
        </FadeInView>
      ) : (
        <View style={styles.emptyBackground} />
      )}
      <StageScrims />
      <View pointerEvents="none" style={styles.portraitLayer}>
        <Portrait
          isExiting={props.portraitExitState.left}
          portrait={props.presentation.leftPortrait}
          side="left"
          stageSize={stageSize}
        />
        <Portrait
          isExiting={props.portraitExitState.right}
          portrait={props.presentation.rightPortrait}
          side="right"
          stageSize={stageSize}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerWebPlayer.stage.backgroundColor,
    overflow: "hidden"
  },
  stageBackground: {
    ...StyleSheet.absoluteFillObject
  },
  stageBackgroundFade: {
    ...StyleSheet.absoluteFillObject
  },
  emptyBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black
  },
  portraitLayer: {
    ...StyleSheet.absoluteFillObject,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 8
  },
  portraitSlot: {
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
    overflow: "visible",
    position: "absolute",
    zIndex: 1
  },
  portraitFade: {
    height: "100%",
    width: "100%"
  },
  portraitAsset: {
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
    height: "100%",
    width: "100%"
  },
  portraitVirtualCanvas: {
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
    height: "100%",
    overflow: "hidden",
    width: "100%"
  },
  portraitBitmap: {
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND,
    height: "100%",
    width: "100%"
  },
  cachedImageFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: NATIVE_READER_TRANSPARENT_PORTRAIT_BACKGROUND
  },
  missingAsset: {
    ...NATIVE_READER_CHARACTER_PORTRAIT_EMPTY_STYLE
  }
});
