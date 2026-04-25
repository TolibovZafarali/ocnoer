import { Image as ExpoImage } from "expo-image";
import { useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
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
  usePreloadedReaderImageRef,
  usePreloadedReaderSvgAst
} from "../imagePreload";
import { resolveNativeReaderPortraitLayout } from "../portraitLayout";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import {
  DirectionalSlideView,
  FadeInView,
  StageScrims
} from "./NativeCinematic";

function NativeCachedImage(props: {
  accessibilityLabel?: string;
  contentFit: "cover" | "contain" | "fill";
  contentPosition?: "left bottom" | "right bottom" | "center";
  imageUrl: string;
  imageRef?: ReturnType<typeof usePreloadedReaderImageRef>;
  style: StyleProp<ImageStyle>;
}) {
  const loadedImageRef = usePreloadedReaderImageRef(props.imageUrl);
  const source = createCachedReaderImageSource(props.imageUrl);

  if (!source) {
    return <View style={[props.style, styles.missingAsset]} />;
  }

  return (
    <ExpoImage
      accessibilityLabel={props.accessibilityLabel}
      accessible={Boolean(props.accessibilityLabel)}
      cachePolicy="memory-disk"
      contentFit={props.contentFit}
      contentPosition={props.contentPosition ?? "center"}
      priority="high"
      recyclingKey={props.imageUrl}
      source={props.imageRef ?? loadedImageRef ?? source}
      style={props.style}
      transition={0}
    />
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

function CachedPortraitAsset(props: {
  accessibilityLabel: string;
  imageUrl: string;
  imageRef: ReturnType<typeof usePreloadedReaderImageRef>;
  side: "left" | "right";
}) {
  const renderKind = getAssetRenderKind(props.imageUrl);
  const layoutMetrics = getAssetLayoutMetrics(props.imageUrl);
  const svgAst = usePreloadedReaderSvgAst(props.imageUrl);
  const preserveAspectRatio =
    props.side === "left" ? "xMinYMax meet" : "xMaxYMax meet";
  const svgProps = {
    height: "100%",
    preserveAspectRatio,
    width: "100%"
  };

  if (renderKind !== "svg-vector") {
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
            imageRef={props.imageRef}
            imageUrl={props.imageUrl}
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
          imageRef={props.imageRef}
          imageUrl={props.imageUrl}
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

function Portrait(props: {
  isExiting: boolean;
  portrait: NativeReaderPortrait | null;
  side: "left" | "right";
  stageSize: {
    height: number;
    width: number;
  } | null;
}) {
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

  if (!props.portrait || !layout) {
    return null;
  }

  const slotStyle: ViewStyle = {
    bottom: layout.bottom,
    height: layout.height,
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
  };

  return (
    <View pointerEvents="none" style={[styles.portraitSlot, slotStyle]}>
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
    </View>
  );
}

export function NativeReaderStage(props: {
  isLineExiting: boolean;
  presentation: NativeReaderPresentation;
}) {
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
  };

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
          isExiting={props.isLineExiting}
          portrait={props.presentation.leftPortrait}
          side="left"
          stageSize={stageSize}
        />
        <Portrait
          isExiting={props.isLineExiting}
          portrait={props.presentation.rightPortrait}
          side="right"
          stageSize={stageSize}
        />
      </View>
    </View>
  );
}

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
    overflow: "visible",
    position: "absolute",
    zIndex: 1
  },
  portraitFade: {
    height: "100%",
    width: "100%"
  },
  portraitAsset: {
    height: "100%",
    width: "100%"
  },
  portraitVirtualCanvas: {
    height: "100%",
    overflow: "hidden",
    width: "100%"
  },
  portraitBitmap: {
    height: "100%",
    width: "100%"
  },
  missingAsset: {
    backgroundColor: "transparent"
  }
});
